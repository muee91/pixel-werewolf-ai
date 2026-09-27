import { useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import {
    applyGameStateAtom,
    multiplayerRoleAtom,
    multiplayerConnectionAtom,
} from '../store';
import type { SyncedGameState } from './types';

interface UseGuestSyncOptions {
    roomId: string;
    playerId: string;
}

export function useGuestSync(options: UseGuestSyncOptions) {
    const { roomId, playerId } = options;
    const applyGameState = useSetAtom(applyGameStateAtom);
    const role = useAtomValue(multiplayerRoleAtom);
    const connectionState = useAtomValue(multiplayerConnectionAtom);

    const applySync = useCallback((gameState: SyncedGameState) => {
        applyGameState(gameState);
    }, [applyGameState]);

    return {
        applySync,
        disconnectTracker: connectionState
    };
}
