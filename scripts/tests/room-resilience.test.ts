import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_DISCONNECT_GRACE_MS,
    MAX_DISCONNECT_GRACE_MS,
    MAX_INBOUND_MESSAGE_BYTES,
    MIN_DISCONNECT_GRACE_MS,
    RoomManager,
    createMessageTooLargeReply,
    resolveDisconnectGraceMs,
    resolveUnstableAfterMs,
} from '../../server/room-manager';
import { getGuestSilenceMs, getUnstableGuests } from '../../src/multiplayer/protocol';
import { DEFAULT_DISCONNECT_GRACE_MS as CLIENT_DEFAULT_DISCONNECT_GRACE_MS } from '../../src/multiplayer/constants';
import type { RoomPlayer } from '../../src/multiplayer/types';

// ── 断线宽限：ROOM_DISCONNECT_GRACE_MS ─────────────────────

test('disconnect grace defaults to 60s, long enough for the client reconnect plan', () => {
    assert.equal(DEFAULT_DISCONNECT_GRACE_MS, 60_000);
    // 客户端重连计划 1s/2s/4s/8s/15s/25s 合计 55 秒，宽限必须盖住它
    assert.ok(DEFAULT_DISCONNECT_GRACE_MS >= 55_000);
    assert.equal(resolveDisconnectGraceMs(undefined), DEFAULT_DISCONNECT_GRACE_MS);
    assert.equal(resolveDisconnectGraceMs(null), DEFAULT_DISCONNECT_GRACE_MS);
    assert.equal(resolveDisconnectGraceMs(''), DEFAULT_DISCONNECT_GRACE_MS);
    assert.equal(resolveDisconnectGraceMs('   '), DEFAULT_DISCONNECT_GRACE_MS);
});

test('disconnect grace accepts a sane integer from the environment', () => {
    assert.equal(resolveDisconnectGraceMs('90000'), 90_000);
    assert.equal(resolveDisconnectGraceMs('  45000  '), 45_000);
    assert.equal(resolveDisconnectGraceMs(String(MIN_DISCONNECT_GRACE_MS)), MIN_DISCONNECT_GRACE_MS);
    assert.equal(resolveDisconnectGraceMs(String(MAX_DISCONNECT_GRACE_MS)), MAX_DISCONNECT_GRACE_MS);
    // 1e5 是合法数字字面量，落在区间内也接受
    assert.equal(resolveDisconnectGraceMs('1e5'), 100_000);
});

test('disconnect grace falls back to the default on illegal values', () => {
    const illegal = [
        'abc',          // 非数字
        '60_000',       // JS 数字字面量里的下划线不是数字
        'NaN',
        'Infinity',
        '0',            // 关掉宽限
        '-1000',        // 负数
        '1500.5',       // 非整数
        '',             // 空
        '   ',          // 只有空白
        String(MIN_DISCONNECT_GRACE_MS - 1),  // 下界之外
        String(MAX_DISCONNECT_GRACE_MS + 1),  // 上界之外
        '999999999',
    ];
    for (const raw of illegal) {
        assert.equal(resolveDisconnectGraceMs(raw), DEFAULT_DISCONNECT_GRACE_MS, `raw=${JSON.stringify(raw)}`);
    }
});

test('room server and client agree on the fallback disconnect grace', () => {
    // 服务端没下发 disconnectGraceMs 时，客户端默认值必须和同一套配置一致
    assert.equal(CLIENT_DEFAULT_DISCONNECT_GRACE_MS, DEFAULT_DISCONNECT_GRACE_MS);
});

test('the unstable threshold is half the grace period, floored', () => {
    assert.equal(resolveUnstableAfterMs(60_000), 30_000);
    assert.equal(resolveUnstableAfterMs(1), 0);
    assert.equal(resolveUnstableAfterMs(45_001), 22_500);   // 取整
    // 阈值由默认宽限推出，正好等于心跳周期：静默到一半就提示，比 close 早一个周期
    assert.equal(resolveUnstableAfterMs(resolveDisconnectGraceMs(undefined)), 30_000);
});

// ── 超限消息：必须回信，不能静默丢弃 ───────────────────────

test('inbound message cap stays at 1MB', () => {
    assert.equal(MAX_INBOUND_MESSAGE_BYTES, 1024 * 1024);
});

test('oversized messages get a structured reply in the existing envelope shape', () => {
    const reply = createMessageTooLargeReply(2 * 1024 * 1024);

    assert.equal(reply.type, 'MESSAGE_TOO_LARGE');
    assert.equal(reply.limitBytes, MAX_INBOUND_MESSAGE_BYTES);
    assert.equal(reply.receivedBytes, 2 * 1024 * 1024);
    assert.ok(reply.reason.length > 0);
    // 信封只有 type + payload：不带 sessionToken，也不带多余的嵌套层
    assert.deepEqual(Object.keys(reply).sort(), ['limitBytes', 'reason', 'receivedBytes', 'type']);
    assert.equal(JSON.parse(JSON.stringify(reply)).type, 'MESSAGE_TOO_LARGE');
});

test('the oversized reply is JSON serialisable and never echoes the payload', () => {
    const reply = createMessageTooLargeReply(MAX_INBOUND_MESSAGE_BYTES + 1);
    const serialized = JSON.stringify(reply);

    assert.ok(serialized.length < 512);
    assert.equal(serialized.includes('sessionToken'), false);
});

// ── 房主侧「连接不稳」可见性（纯函数） ─────────────────────

const guest = (playerId: string, overrides: Partial<RoomPlayer> = {}): RoomPlayer => ({
    playerId,
    nickname: playerId,
    seatNumber: 2,
    isReady: true,
    isConnected: true,
    hasUsedAISuggestion: false,
    ...overrides,
});

test('unstable guests come from the server flag, and the host is never flagged', () => {
    const players = [
        guest('host', { playerId: 'host', seatNumber: 1, isUnstable: true }),
        guest('g1', { isUnstable: true }),
        guest('g2', { isUnstable: false }),
    ];

    const unstable = getUnstableGuests(players, 'host', 1_000_000, 60_000);
    assert.deepEqual(unstable.map(p => p.playerId), ['g1']);
});

test('unstable guests fall back to lastSeenAt silence against half the grace period', () => {
    const now = 100_000;
    const players = [
        guest('host', { playerId: 'host', seatNumber: 1, lastSeenAt: now - 99_999 }),
        guest('idle', { lastSeenAt: now - 30_000 }),   // 刚好到阈值 → 提示
        guest('active', { lastSeenAt: now - 29_999 }), // 差一点 → 不提示
        guest('unknown', { lastSeenAt: null }),        // 没有记录 → 不提示
    ];

    assert.deepEqual(
        getUnstableGuests(players, 'host', now, 60_000).map(p => p.playerId),
        ['idle'],
    );
    // 宽限期是奇数时阈值向下取整
    assert.deepEqual(
        getUnstableGuests(players, 'host', now, 60_001).map(p => p.playerId),
        ['idle'],
    );
});

test('a seat that is already disconnected keeps the original disconnect copy instead', () => {
    const now = 100_000;
    const players = [
        guest('gone', { isConnected: false, isUnstable: true, lastSeenAt: now - 500_000 }),
        guest('unseated', { seatNumber: null, isUnstable: true }),
        guest('live', { isUnstable: true }),
    ];

    assert.deepEqual(
        getUnstableGuests(players, 'host', now, 60_000).map(p => p.playerId),
        ['live'],
    );
});

test('an unusable grace period disables the timestamp fallback but keeps the server flag', () => {
    const now = 100_000;
    const players = [
        guest('old', { lastSeenAt: now - 500_000 }),
        guest('flagged', { lastSeenAt: now, isUnstable: true }),
    ];

    for (const graceMs of [0, -1, NaN]) {
        assert.deepEqual(
            getUnstableGuests(players, 'host', now, graceMs).map(p => p.playerId),
            ['flagged'],
            `graceMs=${graceMs}`,
        );
    }
    assert.deepEqual(getUnstableGuests([], 'host', now, 60_000), []);
});

test('silence duration is reported for the seat the host is looking at', () => {
    const now = 100_000;

    assert.equal(getGuestSilenceMs(guest('g1', { lastSeenAt: 40_000 }), now), 60_000);
    assert.equal(getGuestSilenceMs(guest('g1', { lastSeenAt: now + 5_000 }), now), 0);   // 时钟抖动不留负数
    assert.equal(getGuestSilenceMs(guest('g1', { lastSeenAt: undefined }), now), null);
    assert.equal(getGuestSilenceMs(guest('g1', { lastSeenAt: null }), now), null);
});

// ── 房间状态里的可见性字段 ─────────────────────────────────

test('room players carry the liveness record the host UI consumes', () => {
    const roomManager = new RoomManager();
    const created = roomManager.createRoom('127.0.0.1', '韧性测试', '房主');
    assert.ok(!('error' in created));
    const room = created.room;
    const joined = roomManager.joinRoom(room.roomId, '客人');

    const host = room.players.get(room.hostPlayerId)!;
    assert.equal(typeof host.lastSeenAt, 'number');
    assert.equal(host.isUnstable, false);

    assert.ok(joined && !('error' in joined));
    const guestPlayer = (joined as { player: RoomPlayer }).player;
    assert.equal(typeof guestPlayer.lastSeenAt, 'number');
    assert.equal(guestPlayer.isUnstable, false);
    assert.ok(guestPlayer.lastSeenAt! >= host.lastSeenAt!);
});
