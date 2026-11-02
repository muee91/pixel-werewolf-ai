/**
 * 决策预取：把"每一步串行等 LLM"改成"提前并发发起、按语义顺序消费"。
 *
 * 背景（2026-10-25 真实云模型整局实测，见 docs/audit/2026-10-24-company-and-player-audit.md 附录 C）：
 * 9 人局 57 次调用、单次中位 29.9 秒、p90 169.8 秒，而夜间 6 个神职决策、警长竞选 N 条发言
 * 此前是逐座位 await —— 总耗时是它们的**和**，不是最大值。倍速只压缩演出与推进等待，
 * 对"每条发言一次串行往返 + 撞限流退避"这条链路完全无效，并发才是唯一解。
 *
 * 设计约束（改动只在这里，业务侧只调 schedule / take）：
 * 1. 预取只改变"何时发起"，不改变"何时发言"：消费端仍按语义顺序取用，
 *    玩家看到的对话顺序、日志顺序、TTS 顺序都保持不变。
 * 2. 有限并发（默认与投票阶段一致的 VOTE_LLM_CONCURRENCY = 3）：
 *    全员 Promise.all 会把云端直接打成 429 风暴（实测出现过 3 次 503）。
 * 3. 幂等：同一 key 重复 schedule 不会重复花钱 —— GOD-loop 每 tick 重建 ctx，
 *    预取若不去重就会按 tick 刷额度。
 * 4. 绝不抛未处理拒绝：任务失败一律折成 { ok: false }，由消费端决定降级路径。
 */

export type PrefetchSuccess = { ok: true; text: string; modelName: string; durationMs?: number };
export type PrefetchOutcome = PrefetchSuccess | { ok: false; error: unknown };

// 手写类型守卫：本仓库 tsconfig 未开 strict，布尔字面量判别式在非 strict 下不会自动收窄
export const isPrefetchSuccess = (outcome: PrefetchOutcome): outcome is PrefetchSuccess => outcome.ok === true;

/**
 * 预取 key 必须带指令文本：同一阶段同一回合里，同一个玩家可能被两次不同的指令问话
 * （例：警长平票 PK 发言 vs 首轮竞选发言、商人发放的查验技能 vs 预言家本职查验）。
 * 只按 phase+turn+player 索引会把 A 指令的答案喂给 B 指令的回合。
 */
export const prefetchKey = (
    phase: string,
    turn: number,
    playerId: number,
    instruction?: string,
): string => `${phase}@T${turn}#${playerId}:${instruction ?? ''}`;

export class DecisionPrefetcher {
    private entries = new Map<string, Promise<PrefetchOutcome>>();
    private inFlight = 0;
    private waiters: Array<() => void> = [];

    constructor(private readonly limit: number = 3) {}

    get size(): number {
        return this.entries.size;
    }

    get inFlightCount(): number {
        return this.inFlight;
    }

    has(key: string): boolean {
        return this.entries.has(key);
    }

    /** 发起（或复用）一次预取。返回的 Promise 永远 resolve，不会 reject。 */
    schedule(key: string, task: () => Promise<PrefetchOutcome>): Promise<PrefetchOutcome> {
        const existing = this.entries.get(key);
        if (existing) return existing;
        const promise = this.runLimited(async () => {
            try {
                return await task();
            } catch (error) {
                return { ok: false as const, error };
            }
        });
        this.entries.set(key, promise);
        return promise;
    }

    /** 取用并移除：同一个结果只会被消费一次，防止同一句发言被两层逻辑重复上屏。 */
    take(key: string): Promise<PrefetchOutcome> | undefined {
        const promise = this.entries.get(key);
        if (!promise) return undefined;
        this.entries.delete(key);
        return promise;
    }

    /** 丢弃全部未消费结果（换回合/暂停/卸载）。在途请求由调用方自己的 AbortSignal 收尾。 */
    clear(): void {
        this.entries.clear();
    }

    private async runLimited<T>(task: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await task();
        } finally {
            this.release();
        }
    }

    private acquire(): Promise<void> {
        if (this.inFlight < this.limit) {
            this.inFlight += 1;
            return Promise.resolve();
        }
        // 槽位交接在 release 里完成（而不是等 waiter 醒来再自增），否则微任务窗口内
        // 新的 schedule 会插队，实际并发会超过 limit。
        return new Promise<void>(resolve => {
            this.waiters.push(() => {
                this.inFlight += 1;
                resolve();
            });
        });
    }

    private release(): void {
        this.inFlight -= 1;
        const next = this.waiters.shift();
        if (next) next();
    }
}
