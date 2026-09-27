import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue, useStore, getDefaultStore } from 'jotai';
import { appScreenAtom, multiplayerStateAtom, multiplayerRoleAtom, aiHostedPlayersAtom, multiplayerConnectionAtom, playersAtom, multiplayerPingAtom, gamePhaseAtom, turnCountAtom, gameConfigAtom, godStateAtom, logsAtom, lastSavedArchiveAtom, gameArchivesAtom, guestRoleInfoAtom, isPausedAtom, isAutoPlayAtom, addToastAtom } from '../atoms';
import { GamePhase } from '../types';
import { startMultiplayerGameAtom, setupMultiplayerGameAtom, exitGameAtom, toggleAIHostingAtom, hostExitGameAtom, applyGameStateAtom, applyHostGameStateAtom, actionAckStateAtom } from '../store';
import { MultiplayerLobby } from './MultiplayerLobby';
import { RoomWaitingView } from './RoomWaitingView';
import { RoomState, SseEvent } from './types';
import { setWsSend } from './wsClient';
import { setHostBroadcastWsSend } from './useHostBroadcast';
import { getRoomHttpBase, getRoomWsBase } from './endpoints';
import { evaluateGameStateSync } from './protocol';
import { useHostBroadcast } from './useHostBroadcast';
import { usePingTracker } from './usePingTracker';
import { useGameEngine } from '../hooks/useGameEngine';
import GameRoomView from '../components/GameRoomView';
import { DEFAULT_DISCONNECT_GRACE_MS, isTerminalWsCloseCode } from './constants';

const GuestDisconnectModal: React.FC<{
    nickname: string;
    timeLeft: number;
    onReconnect: () => void;
    onTimeout: () => void;
}> = ({ nickname, timeLeft, onReconnect, onTimeout }) => {
    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--voxel-paper)] rounded-none shadow-[3px_3px_0_var(--voxel-ink)] max-w-sm w-full overflow-hidden">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-[var(--voxel-torch)]/15 flex items-center justify-center rounded-none">
                        <svg className="w-8 h-8 text-[var(--voxel-ink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 11-12.728 0m12.728 0L12 12m6.364 6.364a9 9 0 01-12.728 0M12 12v6" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-th-fg mb-2">连接中断</h3>
                    <p className="text-sm text-[var(--voxel-ink-soft)] mb-4">你已断开连接</p>
                    <div className="bg-[var(--voxel-wood)] p-3 mb-4 rounded-none">
                        <p className="text-xs text-[var(--voxel-paper-dim)] mb-1">重连剩余时间</p>
                        <p className="text-2xl font-bold text-[var(--voxel-ink)]">{Math.max(0, Math.ceil(timeLeft / 1000))}s</p>
                    </div>
                    <p className="text-xs text-[var(--voxel-paper-dim)]">
                        {timeLeft <= 0 ? '超时，无法再返回对局' : '超时后将无法返回此对局'}
                    </p>
                </div>
                <div className="border-t border-th-border p-4 flex gap-3">
                    <button
                        onClick={onReconnect}
                        className="flex-1 py-2.5 bg-[var(--voxel-torch)] text-[var(--voxel-ink)] rounded-none border-[2px] border-[var(--voxel-ink)] font-semibold hover:bg-[var(--voxel-torch)] transition-colors"
                    >
                        尝试重连
                    </button>
                    <button
                        onClick={onTimeout}
                        className="flex-1 py-2.5 bg-[var(--voxel-wood)] text-[var(--voxel-paper)] rounded-none font-semibold hover:bg-[var(--voxel-wood)] transition-colors"
                    >
                        返回主页
                    </button>
                </div>
            </div>
        </div>
    );
};

const HostPlayerDisconnectModal: React.FC<{
    nickname: string;
    seatNumber: number;
    isHosting: boolean;
    onEnableHosting: () => void;
    onDisableHosting: () => void;
    onDismiss: () => void;
}> = ({ nickname, seatNumber, isHosting, onEnableHosting, onDisableHosting, onDismiss }) => {
    return (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-full mx-4">
            <div className="bg-[var(--voxel-paper)] rounded-none shadow-[3px_3px_0_var(--voxel-ink)] border-[3px] border-[var(--voxel-ink)] overflow-hidden">
                <div className="p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-[var(--voxel-torch)] rounded-none flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-[var(--voxel-ink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 11-12.728 0m12.728 0L12 12m6.364 6.364a9 9 0 01-12.728 0M12 12v6" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-[var(--voxel-ink)]">{seatNumber}号 {nickname} 断线</div>
                            {isHosting ? (
                                <div className="text-xs text-[var(--voxel-ink-soft)] mt-0.5">AI 托管中</div>
                            ) : (
                                <div className="text-xs text-[var(--voxel-ink-soft)] mt-0.5">等待重连或开启托管</div>
                            )}
                        </div>
                        <button onClick={onDismiss} className="text-[var(--voxel-paper-dim)] hover:text-[var(--voxel-ink)] shrink-0">
                            <svg className="w-5 h-5 text-[var(--voxel-ink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {!isHosting && (
                        <button
                            onClick={onEnableHosting}
                            className="mt-3 w-full py-2 bg-[var(--voxel-torch)] text-[var(--voxel-ink)] rounded-none border-[2px] border-[var(--voxel-ink)] text-sm font-semibold hover:bg-[var(--voxel-torch)] transition-colors"
                        >
                            开启 AI 托管
                        </button>
                    )}
                    {isHosting && (
                        <button
                            onClick={onDisableHosting}
                            className="mt-3 w-full py-2 bg-[var(--voxel-torch)] text-[var(--voxel-ink)] rounded-none border-[2px] border-[var(--voxel-ink)] text-sm font-semibold hover:bg-[var(--voxel-torch)] transition-colors"
                        >
                            关闭托管
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const HostExitModal: React.FC<{
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-th-card rounded-none shadow-[3px_3px_0_var(--voxel-ink)] max-w-sm w-full overflow-hidden">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-[var(--voxel-redstone)] rounded-none flex items-center justify-center">
                        <svg className="w-8 h-8 text-[var(--voxel-paper)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-[var(--voxel-ink)] mb-2">退出对局</h3>
                    <p className="text-sm text-[var(--voxel-ink-soft)] mb-4">
                        你是房主，退出后将<span className="text-th-accent2 font-semibold">取消整个对局</span>，所有玩家将被送回主页。
                    </p>
                </div>
                <div className="border-t border-th-border p-4 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 bg-[var(--voxel-wood)] text-[var(--voxel-paper)] rounded-none font-semibold hover:bg-[var(--voxel-wood)] transition-colors"
                    >
                        继续游戏
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 bg-[var(--voxel-redstone)] text-[var(--voxel-paper)] rounded-none border-[2px] border-[var(--voxel-ink)] font-semibold hover:bg-[var(--voxel-redstone)] transition-colors"
                    >
                        确认退出
                    </button>
                </div>
            </div>
        </div>
    );
};

const AIHostingModal: React.FC<{
    disconnectedPlayers: { seatNumber: number; nickname: string }[];
    onToggleHosting: (seatNumber: number, enabled: boolean) => void;
    aiHostedSeats: Set<number>;
    onClose: () => void;
}> = ({ disconnectedPlayers, onToggleHosting, aiHostedSeats, onClose }) => {
    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-th-card rounded-none shadow-[3px_3px_0_var(--voxel-ink)] max-w-sm w-full overflow-hidden">
                <div className="p-6">
                    <h3 className="text-lg font-bold text-[var(--voxel-ink)] mb-4">AI 托管管理</h3>
                    <p className="text-sm text-[var(--voxel-ink-soft)] mb-4">为断线玩家开启/关闭AI托管</p>
                    <div className="space-y-2 mb-4">
                        {disconnectedPlayers.map(dp => (
                            <div key={dp.seatNumber} className="flex items-center justify-between p-3 bg-[var(--voxel-wood)] rounded-none">
                                <div>
                                    <span className="font-semibold text-[var(--voxel-paper)]">{dp.seatNumber}号</span>
                                    <span className="text-sm text-[var(--voxel-paper-dim)] ml-2">{dp.nickname}</span>
                                    {aiHostedSeats.has(dp.seatNumber) && (
                                        <span className="ml-2 text-xs bg-[var(--voxel-torch)] text-[var(--voxel-ink)] border-[2px] border-[var(--voxel-ink)] px-2 py-0.5 rounded-none">AI托管中</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => onToggleHosting(dp.seatNumber, !aiHostedSeats.has(dp.seatNumber))}
                                    className={`px-3 py-1.5 rounded-none border-[2px] border-[var(--voxel-ink)] text-sm font-semibold transition-colors ${
                                        aiHostedSeats.has(dp.seatNumber)
                                            ? 'bg-[var(--voxel-redstone)] text-[var(--voxel-paper)] hover:bg-[var(--voxel-redstone)]'
                                            : 'bg-[var(--voxel-torch)] text-[var(--voxel-ink)] hover:bg-[var(--voxel-torch)]'
                                    }`}
                                >
                                    {aiHostedSeats.has(dp.seatNumber) ? '关闭托管' : '开启托管'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="border-t border-th-border p-4">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 bg-[var(--voxel-wood)] text-[var(--voxel-paper)] rounded-none font-semibold hover:bg-[var(--voxel-wood)] transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};

export const MultiplayerView: React.FC = () => {
    const [appScreen, setAppScreen] = useAtom(appScreenAtom);
    const [multiplayerState, setMultiplayerState] = useAtom(multiplayerStateAtom);
    const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
    const lastRoomJsonRef = useRef<string>('');
    const lastGameStateRef = useRef<string>('');
    const lastGameStateVersionRef = useRef<number>(0);
    const currentRoomRef = useRef<RoomState | null>(null);
    currentRoomRef.current = currentRoom;
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const gameStartedRef = useRef(false);
    const gameStartedAtRef = useRef<number>(0);
    const store = useStore();
    const storeRef = useRef(store);
    storeRef.current = store;
    const handleEnterRoomRef = useRef(false);
    const multiplayerStateRef = useRef(multiplayerState);
    multiplayerStateRef.current = multiplayerState;
    const startMultiplayerGame = useSetAtom(startMultiplayerGameAtom);
    const setupMultiplayerGame = useSetAtom(setupMultiplayerGameAtom);
    const exitGame = useSetAtom(exitGameAtom);
    const toggleAIHosting = useSetAtom(toggleAIHostingAtom);
    const applyGameState = useSetAtom(applyGameStateAtom);
    const applyHostGameState = useSetAtom(applyHostGameStateAtom);
    const hostExitGame = useSetAtom(hostExitGameAtom);
    const multiplayerRole = useAtomValue(multiplayerRoleAtom);
    const gamePhase = useAtomValue(gamePhaseAtom);
    const multiplayerRoleRef = useRef(multiplayerRole);
    multiplayerRoleRef.current = multiplayerRole;
    const players = useAtomValue(playersAtom);
    const [playerPings, setMultiplayerPing] = useAtom(multiplayerPingAtom);

    const [showHostExitModal, setShowHostExitModal] = useState(false);
    const [showAIHostingModal, setShowAIHostingModal] = useState(false);
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    const [disconnectedPlayer, setDisconnectedPlayer] = useState<{ nickname: string; disconnectTime: number } | null>(null);
    const [disconnectedPlayers, setDisconnectedPlayers] = useState<{ seatNumber: number; nickname: string }[]>([]);
    const [hostTemporarilyDisconnected, setHostTemporarilyDisconnected] = useState(false);
    const aiHostedPlayers = useAtomValue(aiHostedPlayersAtom);
    const connectionState = useAtomValue(multiplayerConnectionAtom);
    const setMultiplayerConnection = useSetAtom(multiplayerConnectionAtom);
    const disconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [disconnectTimeLeft, setDisconnectTimeLeft] = useState(DEFAULT_DISCONNECT_GRACE_MS);

    const lastSavedArchive = useAtomValue(lastSavedArchiveAtom);
    const setGameArchives = useSetAtom(gameArchivesAtom);
    const lastBroadcastArchiveIdRef = useRef<string | null>(null);

    const [reconnecting, setReconnecting] = useState(false);
    const reconnectAttemptRef = useRef(0);
    // 免费网络环境下 WiFi 闪断很常见：原 3 次/6 秒的重连预算太短，
    // 一旦用尽会静默解散整间房（与主动退出的强确认流程自相矛盾）
    const MAX_RECONNECT_ATTEMPTS = 6;
    const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 25000];
    const intentionalCloseRef = useRef(false);
    const pendingAutoReadyRef = useRef(false);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wsGenerationRef = useRef(0);
    const resetToLobbyRef = useRef<() => void>(() => {});

    const setMultiplayerRole = useSetAtom(multiplayerRoleAtom);
    const setGamePhase = useSetAtom(gamePhaseAtom);

    // GOD 主循环由 GameRoomView → useGameRoomState 挂载的引擎实例驱动；
    // 这里挂载仅为拿到 resolveHumanInput（其内部会回退到全局 atom 登记，
    // 消费等待中的另一个实例）。enabled 必须为 false，否则两个实例的
    // 主循环会同 tick 竞跑：阶段被处理两次、LLM 调用翻倍、日志重复。
    const { resolveHumanInput } = useGameEngine({
        enabled: false,
    });
    const resolveHumanInputRef = useRef(resolveHumanInput);
    resolveHumanInputRef.current = resolveHumanInput;

    const { syncState } = useHostBroadcast(
        multiplayerState.roomId || '',
        multiplayerState.playerId || ''
    );

    useEffect(() => {
        if (disconnectedPlayer) {
            const elapsed = Date.now() - disconnectedPlayer.disconnectTime;
            setDisconnectTimeLeft(connectionState.reconnectTimeout - elapsed);

            disconnectTimerRef.current = setInterval(() => {
                const newElapsed = Date.now() - disconnectedPlayer.disconnectTime;
                const remaining = connectionState.reconnectTimeout - newElapsed;
                setDisconnectTimeLeft(remaining);

                if (remaining <= 0) {
                    if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
                    setDisconnectedPlayer(null);
                }
            }, 100);
        }

        return () => {
            if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
        };
    }, [connectionState.reconnectTimeout, disconnectedPlayer]);

    const isMultiplayerActive = multiplayerState.status === 'WAITING' || multiplayerState.status === 'IN_GAME';
    const { playerPings: trackedPings } = usePingTracker({
        enabled: isMultiplayerActive,
        roomId: multiplayerState.roomId,
        myPlayerId: multiplayerState.playerId,
    });

    useEffect(() => {
        if (Object.keys(trackedPings).length > 0) {
            setMultiplayerPing(prev => ({ ...prev, ...trackedPings }));
        }
    }, [trackedPings, setMultiplayerPing]);

    useEffect(() => {
        if (!isMultiplayerActive) {
            setMultiplayerPing({});
        }
    }, [isMultiplayerActive, setMultiplayerPing]);

    const sendWs = useCallback((message: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const sessionToken = multiplayerStateRef.current.sessionToken;
            wsRef.current.send(JSON.stringify(
                sessionToken && message.type !== 'AUTH'
                    ? { ...message, sessionToken }
                    : message
            ));
            return true;
        }
        return false;
    }, []);

    const clearReconnectTimeout = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, []);

    const closeCurrentWs = useCallback(() => {
        const ws = wsRef.current;
        if (!ws) return;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        wsRef.current = null;
        ws.close();
    }, []);

    useEffect(() => {
        setHostBroadcastWsSend(sendWs);
        setWsSend(sendWs);
        return () => {
            setWsSend(null);
            setHostBroadcastWsSend(null);
        };
    }, [sendWs]);

    const handleWsMessage = useCallback(async (data: SseEvent) => {
        if (data.type === 'CONNECTED') {
            const isHost = data.isHost ?? false;
            const reconnectTimeout = data.disconnectGraceMs || DEFAULT_DISCONNECT_GRACE_MS;
            reconnectAttemptRef.current = 0;
            setReconnecting(false);
            setShowDisconnectModal(false);
            setDisconnectedPlayer(null);
            setMultiplayerConnection({
                isConnected: true,
                disconnectedAt: null,
                reconnectTimeout,
                disconnectedPlayerId: null,
                disconnectedPlayerNickname: null,
            });
            setMultiplayerState(prev => ({
                ...prev,
                isHost,
                hostPlayerId: data.hostPlayerId ?? prev.hostPlayerId,
            }));
            if (pendingAutoReadyRef.current && !isHost) {
                pendingAutoReadyRef.current = false;
                sendWs({ type: 'READY', ready: true });
            }
        } else if (data.type === 'STATE_UPDATE') {
            const roomState = data.room as RoomState;
            const roomJson = JSON.stringify(roomState);
            if (roomJson !== lastRoomJsonRef.current) {
                lastRoomJsonRef.current = roomJson;
                setCurrentRoom(roomState);
            }
            if (roomState.hostPlayerId) {
                setMultiplayerState(prev => ({
                    ...prev,
                    hostPlayerId: roomState.hostPlayerId,
                    isHost: prev.playerId === roomState.hostPlayerId,
                }));
            }
            if (multiplayerStateRef.current.isHost) {
                setDisconnectedPlayers(roomState.players
                    .filter(player => player.playerId !== multiplayerStateRef.current.playerId && player.isConnected === false)
                    .filter((player): player is typeof player & { seatNumber: number } => typeof player.seatNumber === 'number')
                    .map(player => ({ seatNumber: player.seatNumber, nickname: player.nickname })));
            } else {
                const hostPlayer = roomState.players.find(player => player.playerId === roomState.hostPlayerId);
                setHostTemporarilyDisconnected(hostPlayer?.isConnected === false);
            }
            if (roomState.status === 'IN_GAME' && !gameStartedRef.current) {
                const myId = multiplayerStateRef.current.playerId;
                if (multiplayerStateRef.current.isHost) {
                    console.log('[WS Client] Host recovered game state via cached sync');
                } else {
                    gameStartedRef.current = true;
                    gameStartedAtRef.current = Date.now();
                    setupMultiplayerGame({
                        presetKey: roomState.presetKey,
                        roomPlayers: roomState.players.map((p: any) => ({
                            seatNumber: p.seatNumber,
                            nickname: p.nickname,
                            playerId: p.playerId,
                            isHost: p.playerId === roomState.hostPlayerId
                        })),
                        isHost: false,
                        myPlayerId: myId || undefined
                    });
                }
            }
        } else if (data.type === 'GAME_START') {
            if (gameStartedRef.current) return;
            gameStartedRef.current = true;
            gameStartedAtRef.current = Date.now();
            setCurrentRoom(data.room as RoomState);
            const room = data.room as RoomState;

            if (multiplayerStateRef.current.isHost) {
                startMultiplayerGame({
                    presetKey: room.presetKey,
                    roomPlayers: room.players.map((p: any) => ({
                        seatNumber: p.seatNumber,
                        nickname: p.nickname,
                        playerId: p.playerId,
                        isHost: p.playerId === room.hostPlayerId
                    }))
                });
                setTimeout(() => {
                    const currentPlayers = storeRef.current.get(playersAtom);
                    const roleAssignments = currentPlayers
                        .filter((p: any) => p.roomPlayerId && p.roomPlayerId !== multiplayerStateRef.current.playerId)
                        .map((p: any) => ({
                            playerId: p.roomPlayerId,
                            role: p.role,
                            rolePrompt: p.rolePrompt,
                            seatNumber: p.seatNumber,
                            potions: p.potions
                        }));
                    if (roleAssignments.length > 0) {
                        sendWs({ type: 'ASSIGN_ROLES', roleAssignments });
                    }
                }, 500);
            } else {
                setupMultiplayerGame({
                    presetKey: room.presetKey,
                    roomPlayers: room.players.map((p: any) => ({
                        seatNumber: p.seatNumber,
                        nickname: p.nickname,
                        playerId: p.playerId,
                        isHost: p.playerId === room.hostPlayerId
                    })),
                    isHost: false,
                    myPlayerId: multiplayerStateRef.current.playerId || undefined
                });
            }
        } else if (data.type === 'GAME_STATE_SYNC') {
            const gs = (data as any).gameState;
            if (gs) {
                const decision = evaluateGameStateSync(gs, lastGameStateVersionRef.current, lastGameStateRef.current);
                if (decision.incomingVersion > lastGameStateVersionRef.current) {
                    lastGameStateVersionRef.current = decision.incomingVersion;
                }
                if (decision.shouldApply) {
                    lastGameStateRef.current = decision.fingerprint;
                    if (multiplayerStateRef.current.isHost || multiplayerRoleRef.current === 'host') {
                        gameStartedRef.current = true;
                        applyHostGameState(gs);
                    } else {
                        applyGameState(gs);
                    }
                }
            }
        } else if (data.type === 'PLAYER_ACTION') {
            const pa = data as Extract<SseEvent, { type: 'PLAYER_ACTION' }>;
            if (multiplayerStateRef.current.isHost && resolveHumanInputRef.current) {
                const players = storeRef.current.get(playersAtom);
                const actingPlayer = players.find(p => p.roomPlayerId === pa.playerId);
                // 按行动归属玩家路由输入：并发投票/夜间行动时多名人类同时
                // 等待，不能再用 currentSpeakerId（只认最后登记者）做准入
                if (actingPlayer && actingPlayer.isHuman) {
                    const consumed = resolveHumanInputRef.current(pa.actionData, actingPlayer.id);
                    sendWs({
                        type: 'ACTION_ACK',
                        targetPlayerId: pa.playerId,
                        actionId: pa.actionId,
                        actionType: pa.actionData?.action || pa.actionData?.phase || 'unknown',
                        success: consumed,
                    });
                } else {
                    sendWs({
                        type: 'ACTION_ACK',
                        targetPlayerId: pa.playerId,
                        actionId: pa.actionId,
                        actionType: pa.actionData?.action || 'unknown',
                        success: false,
                    });
                }
            } else if (multiplayerStateRef.current.isHost) {
                sendWs({
                    type: 'ACTION_ACK',
                    targetPlayerId: pa.playerId,
                    actionId: pa.actionId,
                    actionType: pa.actionData?.action || 'unknown',
                    success: false,
                });
            }
        } else if (data.type === 'ADVISOR_REQUEST') {
            const ar = data as SseEvent & { playerId: string; requestPayload: any };
            if (multiplayerStateRef.current.isHost) {
                import('../hooks/useHostAdvisor').then(async ({ generateAdvisorResult }) => {
                    const result = await generateAdvisorResult(ar.requestPayload, storeRef.current);
                    sendWs({ type: 'ADVISOR_RESULT', targetPlayerId: ar.playerId, result });
                }).catch(e => console.error('[WS Client] Advisor generation failed:', e));
            }
        } else if (data.type === 'ADVISOR_RESULT') {
            const ar = data as SseEvent & { playerId: string; result: any };
            if (ar.playerId === multiplayerStateRef.current.playerId) {
                window.dispatchEvent(new CustomEvent('advisor-result', { detail: ar.result }));
            }
        } else if (data.type === 'GAME_ARCHIVE') {
            const ga = data as SseEvent & { archive: any };
            if (ga.archive && multiplayerRoleRef.current === 'guest') {
                const archive = ga.archive;
                setGameArchives((prev: any) => {
                    const archives = Array.isArray(prev) ? prev : [];
                    if (archives.some((a: any) => a.id === archive.id)) return prev;
                    const allArchives = [...archives, archive];
                    const MAX_ARCHIVES = 100;
                    return allArchives.length > MAX_ARCHIVES ? allArchives.slice(allArchives.length - MAX_ARCHIVES) : allArchives;
                });
            }
        } else if (data.type === 'HOST_LEFT') {
            const hl = data as SseEvent & { reason: string };
            intentionalCloseRef.current = true;
            alert(`对局已取消：${hl.reason}`);
            if (wsRef.current) wsRef.current.close();
            exitGame();
        } else if (data.type === 'PLAYER_KICKED') {
            const pk = data as SseEvent & { reason: string };
            intentionalCloseRef.current = true;
            alert(`你已被踢出：${pk.reason}`);
            if (wsRef.current) wsRef.current.close();
            exitGame();
        } else if (data.type === 'YOUR_ROLE') {
            const yr = data as SseEvent & { role: string; rolePrompt: string; seatNumber: number; potions?: any };
            if (multiplayerRoleRef.current === 'guest') {
                const defaultStore = getDefaultStore();
                defaultStore.set(guestRoleInfoAtom, { role: yr.role, rolePrompt: yr.rolePrompt, seatNumber: yr.seatNumber, potions: yr.potions });
                const currentPlayers = defaultStore.get(playersAtom);
                const updatedPlayers = currentPlayers.map((p: any) =>
                    p.seatNumber === yr.seatNumber ? { ...p, role: yr.role, rolePrompt: yr.rolePrompt, potions: yr.potions } : p
                );
                defaultStore.set(playersAtom, updatedPlayers);
                sendWs({ type: 'ROLE_RECEIVED_ACK', seatNumber: yr.seatNumber });
            }
        } else if (data.type === 'ACTION_ACK') {
            const ack = data as Extract<SseEvent, { type: 'ACTION_ACK' }>;
            if (ack.playerId === multiplayerStateRef.current.playerId) {
                if (ack.pending) return;
                const s = getDefaultStore();
                s.set(actionAckStateAtom, { pending: false, actionType: ack.actionType, success: ack.success, timestamp: Date.now() });
                if (!ack.success) {
                    alert('行动没有送达房主，请检查连接后重试。');
                }
            }
        } else if (data.type === 'GAME_PAUSED') {
            if (multiplayerRoleRef.current === 'guest') {
                const s = getDefaultStore();
                s.set(isPausedAtom, true);
                s.set(isAutoPlayAtom, false);
            }
        } else if (data.type === 'GAME_RESUMED') {
            if (multiplayerRoleRef.current === 'guest') {
                const s = getDefaultStore();
                s.set(isPausedAtom, false);
                s.set(isAutoPlayAtom, true);
            }
        } else if (data.type === 'PLAYER_DISCONNECTED') {
            if (multiplayerRoleRef.current === 'host' && data.playerId !== multiplayerStateRef.current.playerId && data.seatNumber != null) {
                // 断线座位自动转 AI 托管（重连事件里已自动解除），避免引擎无限等待
                toggleAIHosting({ seatNumber: data.seatNumber, enabled: true });
                setDisconnectedPlayers(prev => [
                    ...prev.filter(player => player.seatNumber !== data.seatNumber),
                    { seatNumber: data.seatNumber as number, nickname: data.nickname },
                ]);
                setDisconnectedPlayer({ nickname: data.nickname, disconnectTime: Date.now() });
                setShowDisconnectModal(true);
            } else if (multiplayerRoleRef.current === 'guest' && data.playerId === multiplayerStateRef.current.hostPlayerId) {
                setHostTemporarilyDisconnected(true);
            }
        } else if (data.type === 'PLAYER_RECONNECTED') {
            if (data.seatNumber != null) {
                setDisconnectedPlayers(prev => prev.filter(player => player.seatNumber !== data.seatNumber));
                toggleAIHosting({ seatNumber: data.seatNumber, enabled: false });
            }
            setDisconnectedPlayer(prev => {
                if (prev?.nickname !== data.nickname) return prev;
                setShowDisconnectModal(false);
                return null;
            });
            if (data.playerId === multiplayerStateRef.current.hostPlayerId) {
                setHostTemporarilyDisconnected(false);
            }
        }
    }, [setMultiplayerState, setMultiplayerConnection, startMultiplayerGame, setupMultiplayerGame, applyGameState, applyHostGameState, sendWs, exitGame, setGameArchives, toggleAIHosting]);

    const handleEnterRoom = useCallback(async (roomId: string, playerId: string, nickname: string, sessionToken: string, autoReady = false, preserveRuntimeState = false) => {
        clearReconnectTimeout();
        wsGenerationRef.current += 1;
        const wsGeneration = wsGenerationRef.current;

        handleEnterRoomRef.current = true;
        pendingAutoReadyRef.current = autoReady;
        setError(null);
        if (!preserveRuntimeState) {
            setCurrentRoom(null);
            lastRoomJsonRef.current = '';
            lastGameStateRef.current = '';
            lastGameStateVersionRef.current = 0;
            gameStartedRef.current = false;

            setMultiplayerRole(null);
            setGamePhase(GamePhase.SETUP);
        }

        setMultiplayerState(prev => ({
            ...prev,
            roomId,
            playerId,
            nickname,
            sessionToken,
            status: prev.status === 'IN_GAME' ? 'IN_GAME' : 'WAITING',
        }));

        if (wsRef.current) {
            intentionalCloseRef.current = true;
            closeCurrentWs();
        }

        const wsBase = getRoomWsBase();
        const wsUrl = `${wsBase}?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(playerId)}&nickname=${encodeURIComponent(nickname)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        intentionalCloseRef.current = false;

        ws.onopen = () => {
            if (wsGeneration !== wsGenerationRef.current || wsRef.current !== ws) return;
            console.log('[WS Client] Connected to room server, sending AUTH');
            ws.send(JSON.stringify({ type: 'AUTH', sessionToken }));
        };

        ws.onmessage = (event) => {
            if (wsGeneration !== wsGenerationRef.current || wsRef.current !== ws) return;
            try {
                const data: SseEvent = JSON.parse(event.data);
                handleWsMessage(data);
            } catch (e) {
                console.error('WS parse error:', e);
            }
        };

        ws.onclose = (event) => {
            if (wsGeneration !== wsGenerationRef.current || wsRef.current !== ws) return;
            if (wsRef.current === ws) {
                wsRef.current = null;
            }
            if (intentionalCloseRef.current) return;
            if (multiplayerStateRef.current.status === 'LOBBY') return;
            if (isTerminalWsCloseCode(event.code)) {
                intentionalCloseRef.current = true;
                alert('房间不存在或登录凭证已失效，请重新加入房间。');
                resetToLobbyRef.current();
                return;
            }

            const disconnectedAt = Date.now();
            setMultiplayerConnection({
                isConnected: false,
                disconnectedAt,
                reconnectTimeout: connectionState.reconnectTimeout || DEFAULT_DISCONNECT_GRACE_MS,
                disconnectedPlayerId: multiplayerStateRef.current.playerId,
                disconnectedPlayerNickname: multiplayerStateRef.current.nickname,
            });
            if (multiplayerRoleRef.current === 'guest') {
                setDisconnectedPlayer({
                    nickname: multiplayerStateRef.current.nickname || '玩家',
                    disconnectTime: disconnectedAt,
                });
                setShowDisconnectModal(true);
            }

            const attempt = reconnectAttemptRef.current + 1;
            if (attempt <= MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptRef.current = attempt;
                setReconnecting(true);
                console.log(`[WS Client] Reconnecting attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}...`);
                clearReconnectTimeout();
                reconnectTimeoutRef.current = setTimeout(() => {
                    reconnectTimeoutRef.current = null;
                    if (wsGeneration !== wsGenerationRef.current || intentionalCloseRef.current || multiplayerStateRef.current.status === 'LOBBY') return;
                    const { roomId: rid, playerId: pid, nickname: nick, sessionToken: st } = multiplayerStateRef.current;
                    if (!rid || !pid || !st) return;
                    handleEnterRoom(rid, pid, nick || '', st, false, true);
                }, RECONNECT_DELAYS_MS[attempt - 1] ?? 1000 * attempt);
            } else {
                getDefaultStore().set(addToastAtom, '连接中断重试失败，已退回大厅；对局已由 AI 托管或解散。', 'error');
                resetToLobbyRef.current();
            }
        };

        ws.onerror = () => {
            if (wsGeneration !== wsGenerationRef.current || wsRef.current !== ws) return;
            console.error('[WS Client] WebSocket error');
        };

        try {
            const httpBase = getRoomHttpBase();
            const res = await fetch(`${httpBase}/rooms/${roomId}`);
            const data = await res.json();
            if (res.ok && data.room) {
                setCurrentRoom(data.room);
                lastRoomJsonRef.current = JSON.stringify(data.room);
                if (data.room.hostPlayerId) {
                    setMultiplayerState(prev => ({ ...prev, hostPlayerId: data.room.hostPlayerId }));
                }
                if (data.room.status === 'IN_GAME' && !gameStartedRef.current) {
                    const room = data.room as RoomState;
                    const isHost = playerId === room.hostPlayerId;
                    if (isHost) {
                        console.log('[WS Client] Host rejoining, waiting for cached state via WS');
                        setMultiplayerRole('host');
                    } else {
                        gameStartedRef.current = true;
                        gameStartedAtRef.current = Date.now();
                        setupMultiplayerGame({
                            presetKey: room.presetKey,
                            roomPlayers: room.players.map((p: any) => ({
                                seatNumber: p.seatNumber,
                                nickname: p.nickname,
                                playerId: p.playerId,
                                isHost: p.playerId === room.hostPlayerId
                            })),
                            isHost: false,
                            myPlayerId: playerId
                        });
                    }
                }
            } else {
                setError('无法获取房间信息');
            }
        } catch (e) {
            console.error('fetchRoom error:', e);
            setError('无法连接房间服务器');
        }
    }, [setMultiplayerState, setMultiplayerConnection, setupMultiplayerGame, handleWsMessage, clearReconnectTimeout, closeCurrentWs, connectionState.reconnectTimeout]);

    const resetToLobby = useCallback(async () => {
        const roomId = multiplayerState.roomId;
        const playerId = multiplayerState.playerId;

        if (roomId && playerId) {
            if (multiplayerStateRef.current.isHost) {
                sendWs({ type: 'HOST_EXIT' });
            } else {
                sendWs({ type: 'LEAVE' });
            }
        }

        intentionalCloseRef.current = true;
        wsGenerationRef.current += 1;
        clearReconnectTimeout();
        reconnectAttemptRef.current = 0;
        setReconnecting(false);

        closeCurrentWs();
        handleEnterRoomRef.current = false;
        gameStartedRef.current = false;
        setCurrentRoom(null);
        setError(null);
        setDisconnectedPlayer(null);
        setShowDisconnectModal(false);
        setDisconnectedPlayers([]);
        setHostTemporarilyDisconnected(false);
        setMultiplayerRole(null);
        setGamePhase(GamePhase.SETUP);
        setMultiplayerState(prev => ({
            ...prev,
            status: 'LOBBY',
            roomId: null,
            playerId: null,
            nickname: null,
            sessionToken: null,
        }));
    }, [multiplayerState.roomId, multiplayerState.playerId, setMultiplayerState, sendWs, clearReconnectTimeout, closeCurrentWs]);

    resetToLobbyRef.current = resetToLobby;

    useEffect(() => {
        const shouldReconnectRoom = (multiplayerState.status === 'WAITING' || multiplayerState.status === 'IN_GAME')
            && multiplayerState.roomId
            && multiplayerState.playerId
            && multiplayerState.sessionToken
            && !currentRoom
            && !handleEnterRoomRef.current;

        if (shouldReconnectRoom) {
            handleEnterRoomRef.current = true;
            handleEnterRoom(multiplayerState.roomId, multiplayerState.playerId, multiplayerState.nickname || '', multiplayerState.sessionToken);
        }
    }, [multiplayerState.status, multiplayerState.roomId, multiplayerState.playerId, multiplayerState.sessionToken, currentRoom, handleEnterRoom]);

    useEffect(() => {
        return () => {
            intentionalCloseRef.current = true;
            wsGenerationRef.current += 1;
            clearReconnectTimeout();
            closeCurrentWs();
        };
    }, [clearReconnectTimeout, closeCurrentWs]);

    useEffect(() => {
        if (!lastSavedArchive || !multiplayerState.isHost || !multiplayerState.roomId || !multiplayerState.playerId) return;
        if (lastBroadcastArchiveIdRef.current === lastSavedArchive.id) return;
        lastBroadcastArchiveIdRef.current = lastSavedArchive.id;
        sendWs({ type: 'GAME_ARCHIVE', archive: lastSavedArchive });
    }, [lastSavedArchive, multiplayerState.isHost, multiplayerState.roomId, multiplayerState.playerId, sendWs]);

    useEffect(() => {
        const onHostExit = () => setShowHostExitModal(true);
        const onGuestExit = async () => {
            await resetToLobby();
            exitGame();
        };
        window.addEventListener('multiplayer-host-exit', onHostExit);
        window.addEventListener('multiplayer-guest-exit', onGuestExit);
        return () => {
            window.removeEventListener('multiplayer-host-exit', onHostExit);
            window.removeEventListener('multiplayer-guest-exit', onGuestExit);
        };
    }, [resetToLobby]);

    const handleHostExit = useCallback(async () => {
        setShowHostExitModal(false);
        await hostExitGame({
            roomId: multiplayerState.roomId || '',
            playerId: multiplayerState.playerId || ''
        });
    }, [hostExitGame, multiplayerState.roomId, multiplayerState.playerId]);

    const handleReconnect = useCallback(async () => {
        const { roomId, playerId, nickname, sessionToken } = multiplayerStateRef.current;
        if (roomId && playerId && sessionToken) {
            handleEnterRoom(roomId, playerId, nickname || '', sessionToken, false, true);
            setShowDisconnectModal(false);
            setDisconnectedPlayer(null);
        }
    }, [handleEnterRoom]);

    const handleDisconnectTimeout = useCallback(async () => {
        setShowDisconnectModal(false);
        setDisconnectedPlayer(null);
        await resetToLobby();
        exitGame();
    }, [exitGame, resetToLobby]);

    const handleAIToggle = useCallback((seatNumber: number, enabled: boolean) => {
        toggleAIHosting({ seatNumber, enabled });
    }, [toggleAIHosting]);

    if ((multiplayerRole === 'host' || multiplayerRole === 'guest') && currentRoom && gamePhase !== 'SETUP') {
        return (
            <>
                <GameRoomView />
                {multiplayerRole === 'host' && disconnectedPlayers.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowAIHostingModal(true)}
                        className="fixed right-4 top-14 z-[70] border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-3 py-2 text-xs font-bold text-[var(--voxel-ink)] shadow-[3px_3px_0_var(--voxel-ink)]"
                    >
                        AI 托管管理 ({disconnectedPlayers.length})
                    </button>
                )}
                {showHostExitModal && (
                    <HostExitModal
                        onConfirm={handleHostExit}
                        onCancel={() => setShowHostExitModal(false)}
                    />
                )}

                {showDisconnectModal && disconnectedPlayer && (
                    multiplayerRole === 'guest' ? (
                        <GuestDisconnectModal
                            nickname={disconnectedPlayer.nickname}
                            timeLeft={disconnectTimeLeft}
                            onReconnect={handleReconnect}
                            onTimeout={handleDisconnectTimeout}
                        />
                    ) : (
                        <HostPlayerDisconnectModal
                            nickname={disconnectedPlayer.nickname}
                            seatNumber={disconnectedPlayers.find(p => p.nickname === disconnectedPlayer.nickname)?.seatNumber ?? 0}
                            isHosting={disconnectedPlayers.some(dp => !!aiHostedPlayers[dp.seatNumber] && dp.nickname === disconnectedPlayer.nickname)}
                            onEnableHosting={() => {
                                const dp = disconnectedPlayers.find(p => p.nickname === disconnectedPlayer.nickname);
                                if (dp) toggleAIHosting({ seatNumber: dp.seatNumber, enabled: true });
                            }}
                            onDisableHosting={() => {
                                const dp = disconnectedPlayers.find(p => p.nickname === disconnectedPlayer.nickname);
                                if (dp) toggleAIHosting({ seatNumber: dp.seatNumber, enabled: false });
                            }}
                            onDismiss={() => {
                                setShowDisconnectModal(false);
                                setDisconnectedPlayer(null);
                            }}
                        />
                    )
                )}

                {showAIHostingModal && (
                    <AIHostingModal
                        disconnectedPlayers={disconnectedPlayers}
                        onToggleHosting={handleAIToggle}
                        aiHostedSeats={new Set(Object.keys(aiHostedPlayers).map(Number))}
                        onClose={() => setShowAIHostingModal(false)}
                    />
                )}

                {reconnecting && (
                    <div className="fixed top-0 left-0 right-0 z-50 bg-th-accent2 text-white text-center py-2 text-sm font-bold shadow-lg">
                        连接中断，正在重连...
                    </div>
                )}
                {hostTemporarilyDisconnected && !reconnecting && (
                    <div role="status" className="fixed top-0 left-0 right-0 z-50 bg-th-accent2 text-white text-center py-2 text-sm font-bold shadow-lg">
                        房主连接中断，等待重连...
                    </div>
                )}
            </>
        );
    }

    if (multiplayerState.status === 'WAITING' && currentRoom && multiplayerState.playerId) {
        return (
            <>
                <RoomWaitingView
                    room={currentRoom}
                    playerId={multiplayerState.playerId}
                    nickname={multiplayerState.nickname || ''}
                    onBack={resetToLobby}
                />
                {reconnecting && (
                    <div className="fixed top-0 left-0 right-0 z-50 bg-th-accent2 text-white text-center py-2 text-sm font-bold shadow-lg">
                        连接中断，正在重连...
                    </div>
                )}
            </>
        );
    }

    if (multiplayerState.status === 'LOBBY') {
        return (
            <MultiplayerLobby
                onBack={() => { resetToLobby(); setAppScreen('HOME'); }}
                onEnterRoom={handleEnterRoom}
            />
        );
    }

    return (
        <div className="vw-settings w-full bg-th-bg flex flex-col relative overflow-hidden" style={{ height: '100dvh' }}>
            <div className="relative z-10 px-4 py-4 flex items-center gap-3 bg-[var(--voxel-wood)] border-b-[3px] border-[var(--voxel-ink)]">
                <button onClick={resetToLobby} className="p-2 hover:bg-th-bg2 rounded-xl transition-colors">
                    <svg className="w-5 h-5 text-[var(--voxel-paper)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="font-bold text-[var(--voxel-paper)] text-base">进入房间</div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-6">
                {error ? (
                    <>
                        <div className="text-4xl mb-4">⚠️</div>
                        <p className="text-th-accent2 font-medium mb-4">{error}</p>
                    </>
                ) : (
                    <>
                        <div className="animate-spin w-8 h-8 border-4 border-th-accent1 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-th-muted font-medium">正在进入房间...</p>
                    </>
                )}
                <button
                    onClick={resetToLobby}
                    className="mt-6 px-6 py-2.5 bg-[var(--voxel-paper)] hover:bg-[var(--voxel-wood)] text-[var(--voxel-ink)] hover:text-[var(--voxel-paper)] rounded-none font-bold border-[3px] border-[var(--voxel-ink)] shadow-[3px_3px_0_var(--voxel-ink)] transition-all active:scale-95"
                >
                    返回大厅
                </button>
            </div>

            {showHostExitModal && (
                <HostExitModal
                    onConfirm={handleHostExit}
                    onCancel={() => setShowHostExitModal(false)}
                />
            )}

            {showDisconnectModal && disconnectedPlayer && (
                multiplayerRole === 'guest' ? (
                    <GuestDisconnectModal
                        nickname={disconnectedPlayer.nickname}
                        timeLeft={disconnectTimeLeft}
                        onReconnect={handleReconnect}
                        onTimeout={handleDisconnectTimeout}
                    />
                ) : (
                    <HostPlayerDisconnectModal
                        nickname={disconnectedPlayer.nickname}
                        seatNumber={disconnectedPlayers.find(p => p.nickname === disconnectedPlayer.nickname)?.seatNumber ?? 0}
                        isHosting={disconnectedPlayers.some(dp => !!aiHostedPlayers[dp.seatNumber] && dp.nickname === disconnectedPlayer.nickname)}
                        onEnableHosting={() => {
                            const dp = disconnectedPlayers.find(p => p.nickname === disconnectedPlayer.nickname);
                            if (dp) toggleAIHosting({ seatNumber: dp.seatNumber, enabled: true });
                        }}
                        onDisableHosting={() => {
                            const dp = disconnectedPlayers.find(p => p.nickname === disconnectedPlayer.nickname);
                            if (dp) toggleAIHosting({ seatNumber: dp.seatNumber, enabled: false });
                        }}
                        onDismiss={() => {
                            setShowDisconnectModal(false);
                            setDisconnectedPlayer(null);
                        }}
                    />
                )
            )}

            {showAIHostingModal && (
                <AIHostingModal
                    disconnectedPlayers={disconnectedPlayers}
                    onToggleHosting={handleAIToggle}
                    aiHostedSeats={new Set(Object.keys(aiHostedPlayers).map(Number))}
                    onClose={() => setShowAIHostingModal(false)}
                />
            )}
        </div>
    );
};
