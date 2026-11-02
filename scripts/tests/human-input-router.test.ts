import assert from 'node:assert/strict';
import test from 'node:test';
import {
    routeHumanInput,
    type HumanInputRouteContext,
} from '../../src/hooks/engine/humanInputRouter';

// 基础场景：座位 1 是攻击者（自己不等待），座位 2 是当前等待者
const ctx = (overrides: Partial<HumanInputRouteContext> = {}): HumanInputRouteContext => ({
    explicitPlayerId: undefined,
    currentSpeakerId: undefined,
    isWaiting: id => id === 2,
    localWaiterIds: [2],
    globalWaiterCount: 1,
    ...overrides,
});

test('联机提交命中自己的 waiter 时正常消费', () => {
    assert.equal(routeHumanInput(ctx({ explicitPlayerId: 2 })), 2);
});

test('P0-1：显式归属的攻击者不等待时拒绝，绝不落到当前等待者头上（审计回归）', () => {
    // 修复前：candidates=[1, 2]，1 无 waiter 会回退解析到 currentSpeaker 2
    assert.equal(routeHumanInput(ctx({ explicitPlayerId: 1, currentSpeakerId: 2 })), null);
});

test('P0-1：迟到提交（座位已无 waiter）时拒绝，即使存在唯一等待者', () => {
    // 修复前：唯一等待者兜底会把超时后抵达的提交消费给 2
    assert.equal(routeHumanInput(ctx({ explicitPlayerId: 1 })), null);
});

test('P0-1：显式归属 + 全局跨实例登记命中时按显式座位消费', () => {
    const waiting = new Set([2, 3]);
    assert.equal(routeHumanInput(ctx({
        explicitPlayerId: 3,
        currentSpeakerId: 2,
        isWaiting: id => waiting.has(id),
        localWaiterIds: [2],
        globalWaiterCount: 2,
    })), 3);
});

test('单机旧面板：未带归属时回退到有 waiter 的当前发言者', () => {
    assert.equal(routeHumanInput(ctx({ currentSpeakerId: 2 })), 2);
});

test('单机旧面板：发言者不等待时回退到唯一本地等待者', () => {
    assert.equal(routeHumanInput(ctx({ currentSpeakerId: 5, isWaiting: () => false })), 2);
});

test('单机旧面板：多处等待且无发言者时拒绝（保持原保守语义）', () => {
    assert.equal(routeHumanInput(ctx({
        currentSpeakerId: undefined,
        isWaiting: id => id === 2 || id === 3,
        localWaiterIds: [2, 3],
        globalWaiterCount: 2,
    })), null);
});

test('单机旧面板：本地唯一但全局登记多于 1 时禁用唯一等待者兜底', () => {
    assert.equal(routeHumanInput(ctx({
        currentSpeakerId: 9,
        isWaiting: () => false,
        localWaiterIds: [2],
        globalWaiterCount: 2,
    })), null);
});
