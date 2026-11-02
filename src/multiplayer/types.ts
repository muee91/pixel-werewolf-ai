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
    /** 房主侧可见性：房间服务最近一次收到该座位入站消息（含心跳 pong）的时刻 */
    lastSeenAt?: number | null;
    /** 房主侧可见性：静默时长已超过宽限期的一半，仅提示，不影响对局推进 */
    isUnstable?: boolean;
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
    | { type: 'MESSAGE_TOO_LARGE'; reason: string; receivedBytes: number; limitBytes: number }
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
