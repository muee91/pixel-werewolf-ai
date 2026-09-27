export interface RoomInfo {
    roomId: string;
    roomName: string;
    hostIp: string;
    playerCount: number;
    maxPlayers: number;
    presetKey: string;
    hasPassword: boolean;
}

export interface RoomPlayer {
    playerId: string;
    nickname: string;
    seatNumber: number | null;
    isReady: boolean;
    isConnected: boolean;
    hasUsedAISuggestion: boolean;
}

export interface RoomState {
    roomId: string;
    roomName: string;
    hostPlayerId: string;
    players: RoomPlayer[];
    maxPlayers: number;
    presetKey: string;
    status: 'WAITING' | 'IN_GAME' | 'FINISHED';
    hasPassword: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface SyncedGameState {
    syncType: 'full' | 'delta';
    stateVersion: number;
    players: any[];
    logs?: any[];
    phase: string;
    turnCount: number;
    godState: any;
    isAutoPlay: boolean;
    isPaused: boolean;
    currentSpeakerId: number | null;
    areRolesVisible: boolean;
    gameResult: any;
    gameEvaluation: any;
    syncedAt: number;
}

export type SseEvent =
    | { type: 'CONNECTED'; playerId: string; roomId: string; isHost: boolean; hostPlayerId: string; disconnectGraceMs: number }
    | { type: 'STATE_UPDATE'; room: RoomState }
    | { type: 'GAME_START'; room: RoomState }
    | { type: 'GAME_STATE_SYNC'; gameState: SyncedGameState }
    | { type: 'YOUR_ROLE'; role: string; rolePrompt: string; seatNumber: number; potions?: any }
    | { type: 'ROLE_RECEIVED_ACK'; seatNumber: number }
    | { type: 'PLAYER_ACTION'; playerId: string; actionId: string; clientSeq: number; ts: number; action: string; actionData: any }
    | { type: 'ACTION_ACK'; playerId: string; actionType: string; success: boolean; pending?: boolean; targetPlayerId?: string; actionId?: string }
    | { type: 'PLAYER_DISCONNECTED'; playerId: string; nickname: string; seatNumber: number | null; disconnectGraceMs: number }
    | { type: 'PLAYER_RECONNECTED'; playerId: string; nickname: string; seatNumber: number | null }
    | { type: 'PLAYER_KICKED'; reason: string }
    | { type: 'HOST_LEFT'; reason: string }
    | { type: 'ADVISOR_REQUEST'; playerId: string; requestPayload: any }
    | { type: 'ADVISOR_RESULT'; playerId: string; result: any }
    | { type: 'GAME_ARCHIVE'; archive: any }
    | { type: 'GAME_PAUSED'; pausedBy: string }
    | { type: 'GAME_RESUMED'; resumedBy: string }
    | { type: 'SPEECH_EVENT'; speakerId: string; text: string; audioUrl?: string; duration?: number; turnId: string; voice?: string }
    | { type: 'SPEECH_ACK'; playerId: string; turnId: string }
    | { type: 'START_PLAYBACK'; turnId: string }
    | { type: 'EVENT_APPEND'; event: any };
