import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttemptLimiter, generateShareCode, isValidShareCode, maskShareCode, SHARE_CODE_LENGTH } from '../../server/share-guard';

// ── 口令生成与校验 ─────────────────────────────────────────

test('share code is fixed-length lowercase hex and rotates per call', () => {
    const a = generateShareCode();
    const b = generateShareCode();
    assert.match(a, /^[0-9a-f]{10}$/);
    assert.match(b, /^[0-9a-f]{10}$/);
    assert.equal(a.length, SHARE_CODE_LENGTH);
    assert.notEqual(a, b);
});

test('share code validation rejects wrong shapes', () => {
    assert.equal(isValidShareCode('deadbeef01'), true);
    assert.equal(isValidShareCode('12345'), false);
    assert.equal(isValidShareCode('123456789'), false);
    assert.equal(isValidShareCode('12345678901'), false);
    assert.equal(isValidShareCode('zzzzzzzzzz'), false);
    assert.equal(isValidShareCode(undefined), false);
    assert.equal(isValidShareCode(null), false);
    assert.equal(isValidShareCode(1234567890), false);
});

test('maskShareCode only exposes a fragment safe for logs', () => {
    assert.equal(maskShareCode('ab12cd34ef'), 'ab…ef');
    assert.equal(maskShareCode('ab'), '****');
});

// ── 按 IP 尝试限速 ─────────────────────────────────────────

test('attempt limiter locks after max failures and unlocks after the window', async () => {
    const limiter = createAttemptLimiter(3, 30);
    assert.equal(limiter.lockRemainingMs('ip1'), 0);
    limiter.recordFailure('ip1');
    limiter.recordFailure('ip1');
    assert.equal(limiter.lockRemainingMs('ip1'), 0);
    assert.ok(limiter.recordFailure('ip1') !== null, '第三次失败应触发锁定');
    assert.ok(limiter.lockRemainingMs('ip1') > 0);

    limiter.clear('ip1');
    assert.equal(limiter.lockRemainingMs('ip1'), 0);

    // 过期后自动解锁
    limiter.recordFailure('ip2');
    limiter.recordFailure('ip2');
    limiter.recordFailure('ip2');
    assert.ok(limiter.lockRemainingMs('ip2') > 0);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(limiter.lockRemainingMs('ip2'), 0);
});
