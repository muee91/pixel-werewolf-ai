/**
 * 引擎纯函数工具集：不依赖任何 hook 状态或 React 生命周期。
 * 从 useGameEngine.ts 提取，便于独立测试与复用。
 */
import { GamePhase, isWolfRole, type GameLog, type Player } from '../types';
import type { LLMResponse } from '../services/llm';
import type { UserInput } from '../types';

// ── 阵营判断 ──────────────────────────────────────────────

export const isPlayerWolf = (p: Player) => isWolfRole(p.role);

// ── 警徽流解析 ──────────────────────────────────────────────

// 警徽流只认"警徽"相关的明确表述：白天发言里的"这票给3号/投给3号"是投票表态，
// 若被当成警徽移交会直接送错警徽。具体移交意图通常出现在遗言阶段。
export const FLOW_PATTERNS = [
    /警徽流[传给给](\d+)/,
    /警徽传给(\d+)/,
    /警徽交给(\d+)/,
    /警徽给(\d+)/,
    /传警徽(?:给|传给)(\d+)/,
];

export const parseSheriffFlow = (sheriffId: number, logs: GameLog[], aliveCheck: (id: number) => boolean): number | null => {
    const sheriffLogs = logs.filter(l => l.speakerId === sheriffId && !l.isSystem &&
        [GamePhase.SHERIFF_ELECTION, GamePhase.DAY_DISCUSSION, GamePhase.DISCUSSION_ROUND_TWO, GamePhase.LAST_WORDS].includes(l.phase));
    // 倒序匹配：优先采信临死前的遗言，避免更早的随口提及覆盖移交意图
    for (const log of [...sheriffLogs].reverse()) {
        for (const pat of FLOW_PATTERNS) {
            const m = log.content.match(pat);
            if (m) {
                const tid = parseInt(m[1]);
                if (tid && tid !== sheriffId && aliveCheck(tid)) return tid;
            }
        }
    }
    return null;
};

// ── 日志滑动窗口 ──────────────────────────────────────────────

export const MAX_GAME_LOGS = 1000;
export const MAX_GAME_TRACES = 600;

export const appendLog = (prev: GameLog[], log: GameLog | GameLog[]): GameLog[] => {
    const next = prev.concat(log);
    return next.length > MAX_GAME_LOGS ? next.slice(next.length - MAX_GAME_LOGS) : next;
};

export const appendTrace = (prev: GameLog[], log: GameLog): GameLog[] => {
    const next = prev.concat(log);
    return next.length > MAX_GAME_TRACES ? next.slice(next.length - MAX_GAME_TRACES) : next;
};

// ── LLM 结果类型守卫 ──────────────────────────────────────────────

export const LLM_ABORTED_RESULT = { __aborted: true } as const;

export const createLlmFailedResult = (error: unknown) => ({
    __llmFailed: true,
    errorMessage: error instanceof Error ? error.message : 'LLM 思考失败。'
});

export const isLlmAbortedResult = (result: unknown): result is typeof LLM_ABORTED_RESULT =>
    typeof result === 'object' && result !== null && '__aborted' in result;

export const isLlmFailedResult = (result: unknown): result is ReturnType<typeof createLlmFailedResult> =>
    typeof result === 'object' && result !== null && '__llmFailed' in result;

export const getSpeechText = (result: LLMResponse | UserInput | null | undefined): string => {
    if (!result || typeof result !== 'object') return '';
    const candidate = (result as LLMResponse & { spell?: unknown }).speak
        || (result as LLMResponse & { spoke?: unknown }).spoke
        || (result as LLMResponse & { spell?: unknown }).speech
        || (result as LLMResponse & { spell?: unknown }).spell;
    return typeof candidate === 'string' ? candidate : '';
};

// ── 并发控制 ──────────────────────────────────────────────

/** 投票阶段 LLM 并发上限：全员 Promise.all 并发打 LLM 会触发云端 429 风暴 */
export const VOTE_LLM_CONCURRENCY = 3;

export const mapWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await task(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
};
