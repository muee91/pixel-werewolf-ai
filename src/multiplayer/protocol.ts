import type { RoomState, SyncedGameState } from './types';

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
