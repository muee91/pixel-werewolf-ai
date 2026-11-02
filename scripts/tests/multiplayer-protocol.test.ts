import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createPlayerActionEnvelope,
    evaluateGameStateSync,
    getGameStateFingerprint,
    getRoomLifecycleState,
} from '../../src/multiplayer/protocol';
import { sendWsMessage, setWsSend } from '../../src/multiplayer/wsClient';
import type { RoomPlayer, RoomState, SyncedGameState } from '../../src/multiplayer/types';

// ── 夹具 ──────────────────────────────────────────────────

const roomPlayer = (playerId: string, isReady: boolean): RoomPlayer => ({
    playerId,
    nickname: playerId,
    seatNumber: null,
    isReady,
    isConnected: true,
    hasUsedAISuggestion: false,
});

const makeRoom = (players: RoomPlayer[], hostPlayerId = 'host'): RoomState => ({
    roomId: 'r1',
    roomName: 'test-room',
    hostPlayerId,
    players,
    maxPlayers: 8,
    presetKey: 'standard',
    status: 'WAITING',
    hasPassword: false,
    createdAt: 0,
    updatedAt: 0,
});

// ── getGameStateFingerprint ───────────────────────────────

test('fingerprint: logically identical states produce the same fingerprint', () => {
    const a: Partial<SyncedGameState> = {
        stateVersion: 7,
        phase: 'NIGHT_START',
        turnCount: 3,
        players: [{ id: 1 }, { id: 2 }],
        logs: [{ id: 'x' }],
        syncedAt: 1000,
    };
    // 版本号、玩家内容、日志内容、无关字段变化均不影响指纹
    const b: Partial<SyncedGameState> = {
        stateVersion: 99,
        phase: 'NIGHT_START',
        turnCount: 3,
        players: [{ id: 9 }, { id: 8 }],
        logs: [{ id: 'y' }],
        syncedAt: 1000,
        isAutoPlay: true,
        godState: { lovers: [1, 2] },
    };
    assert.equal(getGameStateFingerprint(a), getGameStateFingerprint(b));
});

test('fingerprint: a change in any fingerprinted dimension yields a different fingerprint', () => {
    const base: Partial<SyncedGameState> = {
        phase: 'DAY_DISCUSSION',
        turnCount: 2,
        players: [{ id: 1 }, { id: 2 }],
        logs: [{ id: 'a' }],
        syncedAt: 5,
    };
    const baseFp = getGameStateFingerprint(base);

    const variants: Array<Partial<SyncedGameState>> = [
        { ...base, phase: 'NIGHT_START' },
        { ...base, turnCount: 3 },
        { ...base, players: [{ id: 1 }] },   // 长度变化
        { ...base, logs: [] },               // 长度变化
        { ...base, syncedAt: 6 },
    ];
    for (const variant of variants) {
        assert.notEqual(getGameStateFingerprint(variant), baseFp, JSON.stringify(variant));
    }
});

test('fingerprint: null / undefined / empty state are stable and equal', () => {
    const fromNull = getGameStateFingerprint(null);
    const fromUndefined = getGameStateFingerprint(undefined);
    const fromEmpty = getGameStateFingerprint({});

    assert.equal(fromNull, fromUndefined);
    assert.equal(fromNull, fromEmpty);
    // 稳定：重复调用结果一致，且为合法 JSON
    assert.equal(getGameStateFingerprint(null), fromNull);
    assert.equal(fromNull, '{}');
});

// ── evaluateGameStateSync ─────────────────────────────────

test('sync: newer version with a changed fingerprint is applied', () => {
    const incoming: Partial<SyncedGameState> = {
        stateVersion: 5,
        phase: 'NIGHT_START',
        turnCount: 4,
        players: [{}],
        logs: [{}],
        syncedAt: 11,
    };
    const decision = evaluateGameStateSync(incoming, 4, 'previous-fingerprint');

    assert.deepEqual(decision, {
        shouldApply: true,
        incomingVersion: 5,
        fingerprint: getGameStateFingerprint(incoming),
    });
});

test('sync: newer version with an identical fingerprint is deduped', () => {
    const incoming: Partial<SyncedGameState> = {
        stateVersion: 5,
        phase: 'NIGHT_START',
        turnCount: 4,
        players: [{}],
        syncedAt: 11,
    };
    const decision = evaluateGameStateSync(incoming, 4, getGameStateFingerprint(incoming));

    assert.equal(decision.shouldApply, false);
    assert.equal(decision.incomingVersion, 5);
    assert.equal(decision.fingerprint, getGameStateFingerprint(incoming));
});

test('sync: older or equal versions are never applied even with a changed fingerprint', () => {
    const older = evaluateGameStateSync({ stateVersion: 2, syncedAt: 1 }, 4, 'stale-fingerprint');
    assert.equal(older.shouldApply, false);
    assert.equal(older.incomingVersion, 2);

    const equal = evaluateGameStateSync({ stateVersion: 4, syncedAt: 1 }, 4, 'stale-fingerprint');
    assert.equal(equal.shouldApply, false);
    assert.equal(equal.incomingVersion, 4);
});

test('sync: missing / fractional / NaN stateVersion never applies (safe-integer guard)', () => {
    const missing = evaluateGameStateSync(undefined, 0, 'anything');
    assert.deepEqual(missing, {
        shouldApply: false,
        incomingVersion: 0,
        fingerprint: '{}',
    });
    // 相同指纹 + 版本未前进 → 去重
    const sameShape = evaluateGameStateSync({}, 0, '{}');
    assert.equal(sameShape.shouldApply, false);

    const fractional = evaluateGameStateSync({ stateVersion: 4.5 }, 4, 'stale');
    assert.equal(fractional.shouldApply, false);
    assert.equal(fractional.incomingVersion, 4.5);

    const notANumber = evaluateGameStateSync({ stateVersion: NaN }, -5, 'stale');
    assert.equal(notANumber.shouldApply, false);
    assert.equal(Number.isNaN(notANumber.incomingVersion), true);
});

// ── createPlayerActionEnvelope ────────────────────────────

test('envelope: clientSeq increments and all fields are complete', () => {
    let seq = 0;
    const next = () => ++seq;

    const first = createPlayerActionEnvelope(next, () => 1700000000000, () => 'r1');
    const second = createPlayerActionEnvelope(next, () => 1700000000001, () => 'r2');

    assert.equal(first.clientSeq, 1);
    assert.equal(second.clientSeq, 2);
    assert.equal(first.ts, 1700000000000);
    assert.equal(second.ts, 1700000000001);

    for (const envelope of [first, second]) {
        assert.equal(typeof envelope.actionId, 'string');
        assert.equal(typeof envelope.clientSeq, 'number');
        assert.equal(typeof envelope.ts, 'number');
        assert.ok(envelope.actionId.length > 0);
    }
});

test('envelope: actionId embeds ts, seq and the random part (string and number sources)', () => {
    const stringRandom = createPlayerActionEnvelope(() => 7, () => 42, () => 'r1');
    assert.equal(stringRandom.actionId, 'action-42-7-r1');

    const numberRandom = createPlayerActionEnvelope(() => 7, () => 42, () => 0.5);
    assert.equal(numberRandom.actionId, `action-42-7-${(0.5).toString(36).slice(2)}`);
    // 数字随机串经 base36 裁剪后不含 "0." 前缀
    assert.match(numberRandom.actionId, /^action-42-7-[0-9a-z]+$/);

    // 默认 now/random 时格式依旧完整
    const defaults = createPlayerActionEnvelope(() => 7);
    assert.equal(typeof defaults.ts, 'number');
    assert.ok(defaults.actionId.startsWith(`action-${defaults.ts}-7-`));
    assert.equal(defaults.clientSeq, 7);
});

// ── getRoomLifecycleState ─────────────────────────────────

test('room: host with all-ready guests can start; guests are never mistaken for the host', () => {
    // 房主本人未 ready 也不影响 canStart（只看 guests）
    const room = makeRoom([roomPlayer('host', false), roomPlayer('g1', true), roomPlayer('g2', true)]);

    assert.deepEqual(getRoomLifecycleState(room, 'host'), {
        isHost: true,
        hasGuests: true,
        guestsReady: true,
        canStart: true,
    });
    assert.deepEqual(getRoomLifecycleState(room, 'g1'), {
        isHost: false,
        hasGuests: true,
        guestsReady: true,
        canStart: true,
    });
    // 非房间成员视角：isHost false，其余分支与身份无关
    assert.deepEqual(getRoomLifecycleState(room, 'stranger'), {
        isHost: false,
        hasGuests: true,
        guestsReady: true,
        canStart: true,
    });
});

test('room: solo host cannot start (guestsReady is vacuously true without guests)', () => {
    const solo = makeRoom([roomPlayer('host', false)]);
    const state = getRoomLifecycleState(solo, 'host');

    assert.equal(state.isHost, true);
    assert.equal(state.hasGuests, false);
    assert.equal(state.guestsReady, true);  // 空集 every → true（现状锁定）
    assert.equal(state.canStart, false);    // 但 hasGuests 挡住了开局
});

test('room: one unready guest blocks start; host readiness is irrelevant', () => {
    const notReady = makeRoom([roomPlayer('host', true), roomPlayer('g1', false), roomPlayer('g2', true)]);
    assert.deepEqual(getRoomLifecycleState(notReady, 'host'), {
        isHost: true,
        hasGuests: true,
        guestsReady: false,
        canStart: false,
    });

    // 房主没 ready、客人全部 ready → 仍可开局
    const hostNotReady = makeRoom([roomPlayer('host', false), roomPlayer('g1', true)]);
    assert.equal(getRoomLifecycleState(hostNotReady, 'host').canStart, true);
});

// ── setWsSend / sendWsMessage ─────────────────────────────

test('wsClient: returns false when no send function is registered', () => {
    setWsSend(null);
    assert.equal(sendWsMessage({ type: 'PING' }), false);
    assert.equal(sendWsMessage('plain'), false);
});

test('wsClient: passes the message through and returns the send function result; reset restores false', () => {
    const seen: unknown[] = [];
    setWsSend((message) => {
        seen.push(message);
        return true;
    });
    const message = { type: 'PLAYER_ACTION', clientSeq: 1 };
    assert.equal(sendWsMessage(message), true);
    assert.deepEqual(seen, [message]);

    // 返回其真值/假值，而非恒 true（原样透传 sendFn 的返回值）
    setWsSend(() => false);
    assert.equal(sendWsMessage(message), false);
    setWsSend(() => 0 as unknown as boolean);
    assert.equal(sendWsMessage(message), 0);  // 原样透传，不做布尔强制转换
    setWsSend(() => 1 as unknown as boolean);
    assert.equal(sendWsMessage(message), 1);

    // 置 null 后恢复 false
    setWsSend(null);
    assert.equal(sendWsMessage(message), false);
});
