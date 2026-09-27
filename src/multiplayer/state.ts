export interface MultiplayerViewState {
    type: 'LOBBY' | 'CREATE_ROOM' | 'JOIN_ROOM' | 'ROOM_WAITING' | 'IN_GAME';
    roomId?: string;
    playerId?: string;
    nickname?: string;
    roomName?: string;
}
