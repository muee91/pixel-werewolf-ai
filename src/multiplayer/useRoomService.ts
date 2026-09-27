import { useState, useCallback } from 'react';
import { RoomState, RoomInfo } from './types';
import { sendWsMessage } from './wsClient';
import { getRoomHttpBase } from './endpoints';

export function useRoomService() {
    const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
    const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);

    const fetchRooms = useCallback(async (): Promise<{ rooms: RoomInfo[]; error?: string }> => {
        try {
            const baseUrl = getRoomHttpBase();
            const res = await fetch(`${baseUrl}/rooms`);
            if (!res.ok) {
                return { rooms: [], error: `房间服务器响应异常（${res.status}）` };
            }
            const data = await res.json();
            return { rooms: data.rooms || [] };
        } catch (e) {
            console.error('Failed to fetch rooms:', e);
            return { rooms: [], error: '无法连接房间服务器，请检查房间服务（默认 3001 端口）是否已启动' };
        }
    }, []);

    const createRoom = useCallback(async (roomName: string, nickname: string, presetKey: string = '8-standard', maxPlayers: number = 12, password?: string): Promise<{ roomId: string; playerId: string; nickname: string; sessionToken: string } | { error: string } | null> => {
        try {
            const baseUrl = getRoomHttpBase();
            const res = await fetch(`${baseUrl}/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName, nickname, presetKey, maxPlayers, password }),
            });
            const data = await res.json();
            if (res.ok) {
                setMyPlayerId(data.playerId);
                return data;
            }
            return { error: data.error || '创建房间失败' };
        } catch (e) {
            console.error('Failed to create room:', e);
            return { error: '无法连接房间服务器，请检查房间服务器地址或确认本地 3001 房间服务正在运行。' };
        }
    }, []);

    const joinRoom = useCallback(async (roomId: string, nickname: string, seatNumber?: number, password?: string): Promise<{ roomId: string; playerId: string; nickname: string; seatNumber: number; sessionToken: string } | { error: string } | null> => {
        try {
            const baseUrl = getRoomHttpBase();
            const res = await fetch(`${baseUrl}/rooms/${roomId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname, seatNumber, password }),
            });
            const data = await res.json();
            if (res.ok) {
                setMyPlayerId(data.playerId);
                return data;
            }
            return { error: data.error || '加入房间失败' };
        } catch (e) {
            console.error('Failed to join room:', e);
            return { error: '无法连接服务器' };
        }
    }, []);

    const leaveRoom = useCallback(async (_roomId: string, _playerId: string) => {
        sendWsMessage({ type: 'LEAVE' });
        setMyPlayerId(null);
        setCurrentRoom(null);
    }, []);

    const kickPlayer = useCallback(async (_roomId: string, _myPlayerId: string, targetPlayerId: string): Promise<{ success: boolean; error?: string }> => {
        const sent = sendWsMessage({ type: 'KICK_PLAYER', targetPlayerId });
        return { success: sent };
    }, []);

    const setReady = useCallback(async (_roomId: string, _playerId: string, ready: boolean): Promise<boolean> => {
        return sendWsMessage({ type: 'READY', ready });
    }, []);

    const startGame = useCallback(async (_roomId: string, _playerId: string): Promise<boolean> => {
        return sendWsMessage({ type: 'START_GAME' });
    }, []);

    const changePreset = useCallback(async (_roomId: string, _playerId: string, presetKey: string, maxPlayers: number): Promise<boolean> => {
        return sendWsMessage({ type: 'CHANGE_PRESET', presetKey, maxPlayers });
    }, []);

    const changeSeat = useCallback(async (_roomId: string, _playerId: string, seatNumber: number): Promise<boolean> => {
        return sendWsMessage({ type: 'CHANGE_SEAT', seatNumber });
    }, []);

    const fetchRoom = useCallback(async (roomId: string): Promise<RoomState | null> => {
        try {
            const baseUrl = getRoomHttpBase();
            const res = await fetch(`${baseUrl}/rooms/${roomId}`);
            const data = await res.json();
            return data.room || null;
        } catch (e) {
            console.error('Failed to fetch room:', e);
            return null;
        }
    }, []);

    const markAIUsed = useCallback(async (_roomId: string, _playerId: string) => {
        sendWsMessage({ type: 'AI_USED' });
    }, []);

    const addBot = useCallback(async (): Promise<boolean> => {
        // 房主请求服务端加入一个内置 AI 玩家（规则大脑，不走 LLM）
        return sendWsMessage({ type: 'ADD_BOT' });
    }, []);

    return {
        myPlayerId,
        currentRoom,
        setCurrentRoom,
        fetchRooms,
        createRoom,
        joinRoom,
        leaveRoom,
        kickPlayer,
        setReady,
        startGame,
        changePreset,
        changeSeat,
        fetchRoom,
        markAIUsed,
        addBot,
    };
}
