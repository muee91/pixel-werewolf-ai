import type { RoomPlayer, RoomState, SyncedGameState } from './types';

export interface GameStateSyncDecision {
    shouldApply: boolean;
    incomingVersion: number;
    fingerprint: string;
}

export function getGameStateFingerprint(gameState: Partial<SyncedGameState> | null | undefined): string {
    return JSON.stringify({
        p: gameState?.phase,
        t: gameState?.turnCount,
        s: gameState?.players?.length,
        l: gameState?.logs?.length,
        at: gameState?.syncedAt,
    });
}

export function evaluateGameStateSync(
    gameState: Partial<SyncedGameState> | null | undefined,
    lastAppliedVersion: number,
    lastFingerprint: string
): GameStateSyncDecision {
    const incomingVersion = Number(gameState?.stateVersion ?? 0);
    const fingerprint = getGameStateFingerprint(gameState);
    const hasNewerVersion = Number.isSafeInteger(incomingVersion) && incomingVersion > lastAppliedVersion;

    return {
        shouldApply: hasNewerVersion && fingerprint !== lastFingerprint,
        incomingVersion,
        fingerprint,
    };
}

export function createPlayerActionEnvelope(
    nextSeq: () => number,
    now: () => number = Date.now,
    random: () => number | string = Math.random
) {
    const clientSeq = nextSeq();
    const ts = now();
    const randomValue = random();
    const randomPart = typeof randomValue === 'number'
        ? randomValue.toString(36).slice(2)
        : randomValue;

    return {
        actionId: `action-${ts}-${clientSeq}-${randomPart}`,
        clientSeq,
        ts,
    };
}

export function getRoomLifecycleState(room: RoomState, playerId: string) {
    const isHost = room.hostPlayerId === playerId;
    const guestPlayers = room.players.filter(p => p.playerId !== room.hostPlayerId);
    const hasGuests = guestPlayers.length > 0;
    const guestsReady = guestPlayers.every(p => p.isReady);

    return {
        isHost,
        hasGuests,
        guestsReady,
        canStart: hasGuests && guestsReady,
    };
}

/**
 * 房主侧「连接不稳」的座位清单（纯函数，只读房间状态，不参与任何对局推进）。
 *
 * 阈值取服务端下发的 disconnectGraceMs 的一半（向下取整）：静默到这个时长，
 * 值得提醒房主「这位客人可能已经离线」，但真正断线仍走原有 PLAYER_DISCONNECTED 文案，
 * 所以这里过滤掉 isConnected === false 的座位，避免和断线提示重复。
 * 服务端已按同一阈值算好 isUnstable；lastSeenAt 的静默判断是给只发时间戳的
 * 旧服务端兜底用的，两者任一命中即提示。
 */
export function getUnstableGuests(
    players: RoomPlayer[],
    hostPlayerId: string,
    now: number,
    disconnectGraceMs: number
): RoomPlayer[] {
    const thresholdMs = Number.isFinite(disconnectGraceMs) && disconnectGraceMs > 0
        ? Math.floor(disconnectGraceMs / 2)
        : null;

    return players.filter(player => {
        if (player.playerId === hostPlayerId) return false;
        if (player.isConnected === false) return false;
        if (typeof player.seatNumber !== 'number') return false;
        if (player.isUnstable === true) return true;
        if (thresholdMs === null) return false;
        return typeof player.lastSeenAt === 'number' && now - player.lastSeenAt >= thresholdMs;
    });
}

/** 静默时长（毫秒），用于把「连接不稳」提示写得更具体；没有记录时返回 null */
export function getGuestSilenceMs(player: RoomPlayer, now: number): number | null {
    if (typeof player.lastSeenAt !== 'number') return null;
    return Math.max(0, now - player.lastSeenAt);
}
