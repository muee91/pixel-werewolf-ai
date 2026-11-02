import assert from 'node:assert/strict';
import test from 'node:test';
import { DecisionPrefetcher, isPrefetchSuccess, prefetchKey } from '../../src/hooks/engine/prefetch';

// 决策预取的调度契约：这一层只负责"什么时候发起、什么时候交出结果"，
// 业务侧靠它把"逐座位串行等待"变成"并发批次 + 顺序消费"。
// 背景数字见 docs/audit/2026-10-24-company-and-player-audit.md 附录 C：
// 真实云模型单次中位 29.9 秒、p90 169.8 秒，串行 6 个神职决策就是 6 倍这段等待。

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const ok = (text: string) => ({ ok: true as const, text, modelName: 'test-model', durationMs: 1 });

test('prefetch key distinguishes phase, turn, seat and instruction', () => {
    const base = prefetchKey('SEER_ACTION', 2, 5, '请选择查验对象。');
    assert.notEqual(base, prefetchKey('SEER_ACTION', 3, 5, '请选择查验对象。'), '换回合必须换 key');
    assert.notEqual(base, prefetchKey('SEER_ACTION', 2, 6, '请选择查验对象。'), '换座位必须换 key');
    assert.notEqual(base, prefetchKey('GUARD_ACTION', 2, 5, '请选择查验对象。'), '换阶段必须换 key');
    // 同一阶段同一座位可能被两句不同指令问话（警长 PK 发言、商人发放的技能），
    // 不带指令就会把 A 的答案喂给 B
    assert.notEqual(base, prefetchKey('SEER_ACTION', 2, 5, '请选择今晚守护对象。'), '换指令必须换 key');
    assert.equal(base, prefetchKey('SEER_ACTION', 2, 5, '请选择查验对象。'));
});

test('same key is only requested once (GOD-loop rebuilds ctx every tick)', async () => {
    const prefetcher = new DecisionPrefetcher(3);
    let calls = 0;
    const task = async () => { calls += 1; await delay(10); return ok('x'); };
    const key = prefetchKey('SEER_ACTION', 1, 5, 'a');
    const first = prefetcher.schedule(key, task);
    const second = prefetcher.schedule(key, task);
    const third = prefetcher.schedule(key, task);
    assert.equal(first, second, '重复 schedule 必须复用同一个 Promise');
    assert.equal(second, third);
    await Promise.all([first, second, third]);
    assert.equal(calls, 1, '重复登记不能让玩家多花三次模型钱');
});

test('consume-once: take removes the entry so one answer is never spoken twice', async () => {
    const prefetcher = new DecisionPrefetcher(3);
    const key = prefetchKey('DAY_DISCUSSION', 1, 3, '');
    prefetcher.schedule(key, async () => ok('我说完了'));
    const firstTake = prefetcher.take(key);
    assert.ok(firstTake, '第一次取用应拿到结果');
    assert.equal(prefetcher.take(key), undefined, '第二次取用必须为空');
    assert.equal(prefetcher.has(key), false);
    const outcome = await firstTake!;
    assert.equal(isPrefetchSuccess(outcome) && outcome.text, '我说完了');
});

test('concurrency limit caps simultaneous requests and still beats serial wall clock', async () => {
    const limit = 3;
    const perTaskMs = 40;
    const total = 9;
    const prefetcher = new DecisionPrefetcher(limit);
    let active = 0;
    let peak = 0;

    const startedAt = Date.now();
    const keys: string[] = [];
    for (let i = 0; i < total; i += 1) {
        const key = prefetchKey('SHERIFF_ELECTION', 1, i + 1, '竞选');
        keys.push(key);
        prefetcher.schedule(key, async () => {
            active += 1;
            peak = Math.max(peak, active);
            await delay(perTaskMs);
            active -= 1;
            return ok(`seat-${i + 1}`);
        });
    }
    // 按"上屏顺序"消费：结果先后完成也不影响取用顺序
    const texts: string[] = [];
    for (const key of keys) {
        const taken = prefetcher.take(key)!;
        const outcome = await taken;
        texts.push(isPrefetchSuccess(outcome) ? outcome.text : 'FAILED');
    }
    const elapsed = Date.now() - startedAt;
    const serialMs = total * perTaskMs;

    assert.ok(peak <= limit, `并发峰值 ${peak} 超过上限 ${limit}`);
    assert.ok(peak >= 2, `并发峰值只有 ${peak}，预取没有真的并行`);
    assert.ok(elapsed < serialMs * 0.75, `9 条 × ${perTaskMs}ms 串行约 ${serialMs}ms，实际 ${elapsed}ms，没有收益`);
    assert.deepEqual(texts, Array.from({ length: total }, (_, i) => `seat-${i + 1}`), '消费顺序必须等于队列顺序');
});

test('a failing prefetch resolves as { ok: false } instead of an unhandled rejection', async () => {
    const prefetcher = new DecisionPrefetcher(2);
    const key = prefetchKey('SEER_ACTION', 1, 7, '请选择查验对象。');
    prefetcher.schedule(key, async () => { throw new Error('网关 503'); });
    const outcome = await prefetcher.take(key)!;
    assert.equal(outcome.ok, false);
    assert.equal(isPrefetchSuccess(outcome), false);
    assert.match(String((outcome as { error: unknown }).error), /网关 503/);
});

test('clear drops unconsumed results but lets in-flight work settle quietly', async () => {
    const prefetcher = new DecisionPrefetcher(2);
    let finished = 0;
    const key = prefetchKey('WITCH_ACTION', 1, 4, '女巫行动。');
    prefetcher.schedule(key, async () => { await delay(15); finished += 1; return ok('毒药'); });
    prefetcher.clear();
    assert.equal(prefetcher.take(key), undefined, '清空后不得再交出结果');
    await delay(30);
    assert.equal(finished, 1, '在途请求仍会自己跑完，不产生未处理拒绝');
});
