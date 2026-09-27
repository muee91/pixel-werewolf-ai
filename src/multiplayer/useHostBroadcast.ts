import { useEffect, useRef, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import {
    playersAtom,
    logsAtom,
    gamePhaseAtom,
    turnCountAtom,
    godStateAtom,
    isAutoPlayAtom,
    currentSpeakerIdAtom,
    areRolesVisibleAtom,
    multiplayerRoleAtom,
    gameResultAtom,
    gameEvaluationAtom
} from '../store';
import { isPausedAtom } from '../atoms';
import type { SyncedGameState } from './types';

const SYNC_INTERVAL = 1000;

let globalWsSend: ((message: any) => boolean) | null = null;

export function setHostBroadcastWsSend(sendFn: ((message: any) => boolean) | null) {
    globalWsSend = sendFn;
}

export function useHostBroadcast(roomId: string, playerId: string) {
    const role = useAtomValue(multiplayerRoleAtom);
    const players = useAtomValue(playersAtom);
    const logs = useAtomValue(logsAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const turnCount = useAtomValue(turnCountAtom);
    const godState = useAtomValue(godStateAtom);
    const isAutoPlay = useAtomValue(isAutoPlayAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const areRolesVisible = useAtomValue(areRolesVisibleAtom);
    const gameResult = useAtomValue(gameResultAtom);
    const gameEvaluation = useAtomValue(gameEvaluationAtom);
    const isPaused = useAtomValue(isPausedAtom);

    const stateRef = useRef({ players, logs, phase, turnCount, godState, isAutoPlay, currentSpeakerId, areRolesVisible, gameResult, gameEvaluation, isPaused });
    stateRef.current = { players, logs, phase, turnCount, godState, isAutoPlay, currentSpeakerId, areRolesVisible, gameResult, gameEvaluation, isPaused };

    const lastSyncRef = useRef<number>(0);
    const stateVersionRef = useRef<number>(0);

    const syncState = useCallback(async (force = false) => {
        if (role !== 'host' || !roomId || !playerId) return;

        const now = Date.now();
        if (!force && now - lastSyncRef.current < SYNC_INTERVAL) return;

        const s = stateRef.current;

        const gameState: SyncedGameState = {
            syncType: 'full',
            stateVersion: ++stateVersionRef.current,
            players: s.players,
            logs: s.logs,
            phase: s.phase,
            turnCount: s.turnCount,
            godState: s.godState,
            isAutoPlay: s.isAutoPlay,
            isPaused: s.isPaused,
            currentSpeakerId: s.currentSpeakerId,
            areRolesVisible: s.areRolesVisible,
            gameResult: s.gameResult,
            gameEvaluation: s.gameEvaluation,
            syncedAt: now
        };

        lastSyncRef.current = now;

        if (globalWsSend) {
            globalWsSend({ type: 'GAME_STATE_SYNC', gameState });
        }
    }, [role, roomId, playerId]);

    useEffect(() => {
        if (role !== 'host' || !roomId) return;

        const timer = setInterval(syncState, SYNC_INTERVAL);
        return () => clearInterval(timer);
    }, [role, roomId, syncState]);

    useEffect(() => {
        if (role !== 'host' || !roomId) return;
        syncState(true);
    }, [
        role,
        roomId,
        players,
        logs,
        phase,
        turnCount,
        godState,
        isAutoPlay,
        isPaused,
        currentSpeakerId,
        areRolesVisible,
        gameResult,
        gameEvaluation,
        syncState
    ]);

    return { syncState };
}
