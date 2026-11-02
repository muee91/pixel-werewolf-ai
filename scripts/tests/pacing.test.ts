import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateSpectatorHold2d, PACE_LEVELS, pacedWait, scaleWait, setPace, getPace } from '../../src/hooks/engine/pacing';

// 观战节奏：倍速只应压缩演出与推进等待，且任何档位都不能把时间压成负数或 NaN。
test('pace scaling keeps waits non-negative and proportional', () => {
    setPace(1);
    assert.equal(scaleWait(2000), 2000);
    setPace(2);
    assert.equal(scaleWait(2000), 1000);
    setPace(4);
    assert.equal(scaleWait(2000), 500);
    assert.equal(scaleWait(0), 0);
    assert.equal(scaleWait(-5), 0);
    assert.equal(scaleWait(Number.NaN), 0);
});

test('pace value is clamped to legal levels and invalid input falls back to 1x', () => {
    setPace(0);
    assert.equal(getPace(), 1);
    setPace(-3);
    assert.equal(getPace(), 1);
    setPace(Number.NaN);
    assert.equal(getPace(), 1);
    setPace(999);
    assert.equal(getPace(), 8);          // 上限保护：不许把对局压成瞬间闪完
    assert.ok(PACE_LEVELS.every(level => level >= 1 && level <= 8));
    setPace(1);
});

test('2D subtitle hold has a floor and a ceiling', () => {
    assert.equal(estimateSpectatorHold2d(''), 0);
    assert.equal(estimateSpectatorHold2d('   '), 0);
    const short = estimateSpectatorHold2d('我保留意见。');
    const long = estimateSpectatorHold2d('这'.repeat(400));
    assert.ok(short >= 1600, `短句至少要给人读完的时间，实际 ${short}ms`);
    assert.ok(long <= 14000, `长文不能把一局拖死，实际 ${long}ms`);
    assert.ok(long > short);
});

test('pacedWait resolves without a timer when the pace zeroes the wait', async () => {
    setPace(8);
    const started = Date.now();
    await pacedWait(100);
    assert.ok(Date.now() - started < 60, '倍速下已归零的等待不应再挂 setTimeout');
    setPace(1);
    const t2 = Date.now();
    await pacedWait(40);
    assert.ok(Date.now() - t2 >= 30, '1× 时必须真的等够时间');
});
