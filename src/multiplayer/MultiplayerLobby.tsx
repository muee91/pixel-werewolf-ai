import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAtom } from 'jotai';
import clsx from 'clsx';
import { McIcon } from '../components/game/voxel/primitives';
import { useRoomService } from './useRoomService';
import { RoomInfo, RoomState } from './types';
import { GAME_PRESETS } from '../types';
import { multiplayerNicknameAtom } from '../atoms';
import { randomVillagerName } from '../utils/randomName';
import { MultiplayerShell } from './MultiplayerShell';

interface MultiplayerLobbyProps {
    onBack: () => void;
    onEnterRoom: (roomId: string, playerId: string, nickname: string, sessionToken: string, autoReady?: boolean) => void;
}

const fieldLabelClass = 'block text-[11px] font-black uppercase tracking-[0.22em] mb-2';
const fieldClass = 'w-full px-3 py-3 text-sm outline-none transition-all';
const fieldStyle = {
    background: 'var(--voxel-paper)',
    border: '3px solid var(--voxel-ink)',
    color: 'var(--voxel-ink)',
} as const;
const fieldHintStyle = { color: 'var(--voxel-paper-dim)' } as const;
const panelStyle = {
    background: 'var(--voxel-wood-dark)',
    border: '3px solid var(--voxel-ink)',
    boxShadow: '6px 6px 0 var(--voxel-ink)',
} as const;
const secondaryButtonStyle = {
    color: 'var(--voxel-paper)',
    borderColor: 'var(--voxel-ink)',
    background: 'var(--voxel-wood)',
} as const;

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({ onBack, onEnterRoom }) => {
    const [view, setView] = useState<'LIST' | 'CREATE' | 'JOIN' | 'SEAT_SELECT'>('LIST');
    const [nickname, setNickname] = useAtom(multiplayerNicknameAtom);
    const [roomName, setRoomName] = useState('');
    const roomNameManuallyEdited = useRef(false);
    const [selectedPreset, setSelectedPreset] = useState('8-standard');
    const [targetRoomId, setTargetRoomId] = useState('');
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [roomsError, setRoomsError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [roomDetail, setRoomDetail] = useState<RoomState | null>(null);
    const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
    const [loadingRoom, setLoadingRoom] = useState(false);
    const [roomPassword, setRoomPassword] = useState('');
    const [joinPassword, setJoinPassword] = useState('');

    const { createRoom, joinRoom, fetchRooms, fetchRoom } = useRoomService();

    const handleNicknameChange = (value: string) => {
        setNickname(value);
        if (view === 'CREATE' && !roomNameManuallyEdited.current) {
            setRoomName(value ? `${value}的房间` : '');
        }
    };

    const handleRoomNameChange = (value: string) => {
        setRoomName(value);
        roomNameManuallyEdited.current = true;
    };

    const handleEnterCreate = () => {
        roomNameManuallyEdited.current = false;
        setRoomName(nickname ? `${nickname}的房间` : '');
        setView('CREATE');
    };

    const loadRooms = useCallback(async () => {
        setIsRefreshing(true);
        const result = await fetchRooms();
        setRooms(result.rooms);
        setRoomsError(result.error ?? null);
        setIsRefreshing(false);
    }, [fetchRooms]);

    useEffect(() => {
        if (view === 'LIST') {
            loadRooms();
            const interval = setInterval(loadRooms, 5000);
            return () => clearInterval(interval);
        }
    }, [view, loadRooms]);

    const handleCreate = async () => {
        if (!nickname || !roomName) return;
        const preset = GAME_PRESETS.find(p => p.key === selectedPreset);
        const maxPlayers = preset?.playerCount || 12;
        const result = await createRoom(roomName, nickname, selectedPreset, maxPlayers, roomPassword || undefined);
        if (result && 'roomId' in result) {
            setJoinError(null);
            onEnterRoom(result.roomId, result.playerId, result.nickname, result.sessionToken);
        } else {
            // 创建失败必须给出反馈（房间服务器未启动/网络异常），与加入流程的错误条保持一致
            const message = result && 'error' in result ? result.error : null;
            setJoinError(message || '创建房间失败，请检查房间服务器是否已启动');
        }
    };

    const handleLoadRoomDetail = async (roomId: string) => {
        if (!nickname) {
            setJoinError('请先输入昵称');
            return;
        }
        setJoinError(null);
        setLoadingRoom(true);
        const room = await fetchRoom(roomId);
        if (!room) {
            setJoinError('房间不存在');
            setLoadingRoom(false);
            return;
        }
        if (room.status !== 'WAITING') {
            setJoinError('游戏已开始，无法加入');
            setLoadingRoom(false);
            return;
        }
        if (room.players.length >= room.maxPlayers) {
            setJoinError('房间已满');
            setLoadingRoom(false);
            return;
        }
        setRoomDetail(room);
        setSelectedSeat(null);
        setView('SEAT_SELECT');
        setLoadingRoom(false);
    };

    const handleJoinWithSeat = async () => {
        if (!nickname || !targetRoomId) return;
        setJoinError(null);
        const result = await joinRoom(targetRoomId, nickname, selectedSeat ?? undefined, joinPassword || undefined);
        if (result && 'error' in result) {
            setJoinError(result.error);
        } else if (result && 'roomId' in result) {
            onEnterRoom(result.roomId, result.playerId, result.nickname, result.sessionToken, true);
        }
    };

    const handleQuickJoin = async () => {
        if (!nickname || !targetRoomId) return;
        setJoinError(null);
        setLoadingRoom(true);
        const room = await fetchRoom(targetRoomId);
        if (!room) {
            setJoinError('房间不存在');
            setLoadingRoom(false);
            return;
        }
        if (room.status !== 'WAITING') {
            setJoinError('游戏已开始，无法加入');
            setLoadingRoom(false);
            return;
        }
        if (room.players.length >= room.maxPlayers) {
            setJoinError('房间已满');
            setLoadingRoom(false);
            return;
        }
        const result = await joinRoom(targetRoomId, nickname, undefined, joinPassword || undefined);
        if (result && 'error' in result) {
            setJoinError(result.error);
        } else if (result && 'roomId' in result) {
            onEnterRoom(result.roomId, result.playerId, result.nickname, result.sessionToken, true);
        }
        setLoadingRoom(false);
    };

    const takenSeats = new Map<number, { nickname: string; isHost: boolean }>();
    if (roomDetail) {
        for (const p of roomDetail.players) {
            if (p.seatNumber != null) {
                takenSeats.set(p.seatNumber, { nickname: p.nickname, isHost: p.playerId === roomDetail.hostPlayerId });
            }
        }
    }

    return (
        <MultiplayerShell
            title={view === 'LIST' ? '联机大厅' : view === 'CREATE' ? '创建房间' : view === 'SEAT_SELECT' ? '选择座位' : '加入房间'}
            subtitle={view === 'LIST' ? '发现房间、创建房间，或直接通过房间 ID 加入。' : view === 'SEAT_SELECT' ? '先确认房间状态，再占用座位进入等待区。' : '联机流程保持轻量，信息密度优先。'}
            onBack={view === 'LIST' ? onBack : () => { setView(view === 'SEAT_SELECT' ? 'JOIN' : 'LIST'); setJoinError(null); setRoomDetail(null); }}
            backLabel={view === 'LIST' ? '主页' : '返回'}
            right={view === 'LIST' ? (
                <button
                    onClick={loadRooms}
                    className={clsx('border-[3px] px-3 py-2 text-xs font-black transition-all active:translate-x-[2px] active:translate-y-[2px]', isRefreshing && 'animate-pulse')}
                    style={{ borderColor: 'var(--voxel-ink)', color: 'var(--voxel-ink)', background: 'var(--voxel-paper)', boxShadow: '3px 3px 0 var(--voxel-ink)' }}
                >
                    刷新列表
                </button>
            ) : null}
        >
            <div className="max-w-3xl mx-auto w-full">
                {view === 'LIST' && (
                    <>
                        <div className="border-[3px] p-4 mb-4 shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: 'var(--voxel-wood-dark)', borderColor: 'var(--voxel-ink)' }}>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label htmlFor="lobby-nickname" className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: 'var(--voxel-paper-dim)' }}>我的昵称</label>
                                    <input
                                        id="lobby-nickname"
                                        type="text"
                                        value={nickname}
                                        onChange={e => handleNicknameChange(e.target.value)}
                                        placeholder="输入昵称（最多5个字）"
                                        className="w-full px-3 py-2.5 text-sm outline-none"
                                        style={{ background: 'var(--voxel-paper)', border: '3px solid var(--voxel-ink)', color: 'var(--voxel-ink)' }}
                                        maxLength={5}
                                    />
                                </div>
                                <button onClick={() => handleNicknameChange(randomVillagerName(nickname))} title="随机起名"
                                    className="mt-6 shrink-0 w-9 h-9 rounded-none border-[3px] text-base transition-all active:scale-95"
                                    style={{ background: 'var(--voxel-wood)', borderColor: 'var(--voxel-ink)', color: 'var(--voxel-paper)' }}>🎲</button>
                                <div className="text-xs mt-6 font-bold" style={{ color: 'var(--voxel-paper-dim)' }}>{nickname.length}/5</div>
                            </div>
                        </div>

                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={handleEnterCreate}
                                className="flex-1 border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]"
                                style={{ background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }}
                            >
                                + 创建房间
                            </button>
                            <button
                                onClick={() => setView('JOIN')}
                                className="flex-1 border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]"
                                style={{ background: 'var(--voxel-wood)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }}
                            >
                                加入房间
                            </button>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--voxel-paper-dim)' }}>
                                可用房间 ({rooms.length})
                            </span>
                            <span className="text-[11px] font-bold" style={{ color: 'var(--voxel-torch)' }}>
                                5 秒自动刷新
                            </span>
                        </div>

                        {roomsError ? (
                            <div className="border-[3px] p-6 text-center shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: 'var(--voxel-wood-dark)', borderColor: 'var(--voxel-redstone)' }}>
                                <p className="text-sm font-black" style={{ color: 'var(--voxel-torch)' }}>⚠ {roomsError}</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--voxel-paper-dim)' }}>可点击上方刷新按钮重试</p>
                            </div>
                        ) : rooms.length === 0 ? (
                            <div className="border-[3px] p-8 text-center shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: 'var(--voxel-wood-dark)', borderColor: 'var(--voxel-ink)' }}>
                                <div className="mb-3"><McIcon icon="mc:door" px={4} /></div>
                                <p className="text-sm" style={{ color: 'var(--voxel-paper)' }}>暂无可用房间</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--voxel-paper-dim)' }}>点击上方按钮创建或加入房间</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {rooms.map(room => (
                                    <button
                                        type="button"
                                        key={room.roomId}
                                        onClick={() => { setTargetRoomId(room.roomId); setView('JOIN'); }}
                                        className="w-full border-[3px] p-4 cursor-pointer text-left transition-all hover:-translate-y-0.5 shadow-[3px_3px_0_var(--voxel-ink)]"
                                        style={{ background: 'var(--voxel-wood-dark)', borderColor: 'var(--voxel-ink)' }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-black" style={{ color: 'var(--voxel-paper)' }}>{room.roomName}{room.hasPassword && <span className="text-xs ml-1">🔒</span>}</div>
                                                <div className="text-xs mt-0.5" style={{ color: 'var(--voxel-paper-dim)' }}>
                                                    局域网 · {room.presetKey}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-black" style={{ color: 'var(--voxel-torch)' }}>
                                                    {room.playerCount}/{room.maxPlayers}
                                                </div>
                                                <div className="text-[10px]" style={{ color: 'var(--voxel-paper-dim)' }}>玩家</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {view === 'CREATE' && (
                    <div className="space-y-4">
                        <div className="border-[3px] p-5 space-y-5 shadow-[6px_6px_0_var(--voxel-ink)]" style={panelStyle}>
                            <div className="grid gap-3 border-[3px] p-4 sm:grid-cols-3" style={{ background: 'var(--voxel-ink-soft)', borderColor: 'var(--voxel-ink)' }}>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>流程</div>
                                    <div className="mt-1 text-sm font-black" style={{ color: 'var(--voxel-paper)' }}>1. 填信息</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>配置</div>
                                    <div className="mt-1 text-sm font-black" style={{ color: 'var(--voxel-paper)' }}>2. 选板子</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>进入</div>
                                    <div className="mt-1 text-sm font-black" style={{ color: 'var(--voxel-paper)' }}>3. 直接进房</div>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between">
                                    <label htmlFor="create-nickname" className={fieldLabelClass} style={fieldHintStyle}>你的昵称</label>
                                    <button onClick={() => handleNicknameChange(randomVillagerName(nickname))} title="随机起名"
                                        className="text-xs px-2 py-0.5 rounded-none border-2 transition-all active:scale-95"
                                        style={{ borderColor: 'var(--voxel-ink)', background: 'var(--voxel-wood)', color: 'var(--voxel-paper)' }}>🎲 随机</button>
                                </div>
                                <input
                                    id="create-nickname"
                                    type="text"
                                    value={nickname}
                                    onChange={e => handleNicknameChange(e.target.value)}
                                    placeholder="输入昵称（最多5个字）"
                                    className={fieldClass}
                                    style={fieldStyle}
                                    maxLength={5}
                                />
                                <div className="mt-1 text-right text-[10px]" style={fieldHintStyle}>{nickname.length}/5</div>
                            </div>
                            <div>
                                <label htmlFor="create-room-name" className={fieldLabelClass} style={fieldHintStyle}>房间名称</label>
                                <input
                                    id="create-room-name"
                                    type="text"
                                    value={roomName}
                                    onChange={e => handleRoomNameChange(e.target.value)}
                                    placeholder="输入房间名（最多20个字）"
                                    className={fieldClass}
                                    style={fieldStyle}
                                    maxLength={20}
                                />
                                <div className="mt-1 text-right text-[10px]" style={fieldHintStyle}>{roomName.length}/20</div>
                            </div>
                            <div>
                                <label htmlFor="create-room-password" className={fieldLabelClass} style={fieldHintStyle}>房间密码（可选）</label>
                                <input
                                    id="create-room-password"
                                    type="password"
                                    value={roomPassword}
                                    onChange={e => setRoomPassword(e.target.value)}
                                    placeholder="留空则无密码"
                                    className={fieldClass}
                                    style={fieldStyle}
                                    maxLength={20}
                                />
                            </div>
                            <div>
                                <label htmlFor="create-preset" className={fieldLabelClass} style={fieldHintStyle}>板子配置</label>
                                <select
                                    id="create-preset"
                                    value={selectedPreset}
                                    onChange={e => setSelectedPreset(e.target.value)}
                                    className={fieldClass}
                                    style={fieldStyle}
                                >
                                    {GAME_PRESETS.map(preset => (
                                        <option key={preset.key} value={preset.key}>
                                            {preset.playerCount}人 - {preset.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="mt-2 text-xs leading-relaxed" style={fieldHintStyle}>
                                    房主创建后会直接进入等待区，后续由房主控制开局。
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleCreate}
                            disabled={!nickname || !roomName}
                            className={clsx(
                                'w-full border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]',
                                !(nickname && roomName) && 'cursor-not-allowed'
                            )}
                            style={nickname && roomName
                                ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }
                                : { background: 'var(--voxel-stone)', color: 'var(--voxel-stone-dark)', borderColor: 'var(--voxel-ink)' }}
                        >
                            创建并进入房间
                        </button>
                    </div>
                )}

                {view === 'JOIN' && (
                    <div className="space-y-4">
                        <div className="border-[3px] p-5 space-y-5 shadow-[6px_6px_0_var(--voxel-ink)]" style={panelStyle}>
                            <div className="grid gap-3 border-[3px] p-4 sm:grid-cols-2" style={{ background: 'var(--voxel-ink-soft)', borderColor: 'var(--voxel-ink)' }}>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>精确加入</div>
                                    <div className="mt-1 text-sm" style={{ color: 'var(--voxel-paper)' }}>先看房间状态，再选座位</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>快速加入</div>
                                    <div className="mt-1 text-sm" style={{ color: 'var(--voxel-paper)' }}>直接自动分配空位</div>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="join-nickname" className={fieldLabelClass} style={fieldHintStyle}>你的昵称</label>
                                <input
                                    id="join-nickname"
                                    type="text"
                                    value={nickname}
                                    onChange={e => handleNicknameChange(e.target.value)}
                                    placeholder="输入昵称（最多5个字）"
                                    className={fieldClass}
                                    style={fieldStyle}
                                    maxLength={5}
                                />
                                <div className="mt-1 text-right text-[10px]" style={fieldHintStyle}>{nickname.length}/5</div>
                            </div>
                            <div>
                                <label htmlFor="join-room-id" className={fieldLabelClass} style={fieldHintStyle}>房间 ID</label>
                                <input
                                    id="join-room-id"
                                    type="text"
                                    value={targetRoomId}
                                    onChange={e => setTargetRoomId(e.target.value)}
                                    placeholder="输入房间ID或选择上方房间"
                                    className={clsx(fieldClass, 'font-mono')}
                                    style={fieldStyle}
                                />
                            </div>
                            <div>
                                <label htmlFor="join-room-password" className={fieldLabelClass} style={fieldHintStyle}>房间密码（如有）</label>
                                <input
                                    id="join-room-password"
                                    type="password"
                                    value={joinPassword}
                                    onChange={e => setJoinPassword(e.target.value)}
                                    placeholder="房间无密码可留空"
                                    className={fieldClass}
                                    style={fieldStyle}
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => handleLoadRoomDetail(targetRoomId)}
                            disabled={!nickname || !targetRoomId || loadingRoom}
                            className={clsx(
                                'w-full border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]',
                                !(nickname && targetRoomId) && 'cursor-not-allowed'
                            )}
                            style={nickname && targetRoomId
                                ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }
                                : { background: 'var(--voxel-stone)', color: 'var(--voxel-stone-dark)', borderColor: 'var(--voxel-ink)' }}
                        >
                            {loadingRoom ? '加载中...' : '选择座位并加入'}
                        </button>
                        <button
                            onClick={handleQuickJoin}
                            disabled={!nickname || !targetRoomId || loadingRoom}
                            className="w-full py-2.5 border-[3px] font-medium text-sm transition-all active:translate-x-[2px] active:translate-y-[2px]"
                            style={secondaryButtonStyle}
                        >
                            {loadingRoom ? '加入中...' : '快速加入（自动分配座位）'}
                        </button>
                        {joinError && (
                            <div className="text-center text-xs font-black border-[3px] px-3 py-2" style={{ color: 'var(--voxel-paper)', background: 'var(--voxel-redstone)', borderColor: 'var(--voxel-ink)' }}>
                                {joinError}
                            </div>
                        )}
                    </div>
                )}

                {view === 'SEAT_SELECT' && roomDetail && (
                    <div className="space-y-4">
                        <div className="border-[3px] p-5 shadow-[6px_6px_0_var(--voxel-ink)]" style={panelStyle}>
                            <div className="flex items-center justify-between gap-3 mb-1">
                                <div className="font-black" style={{ color: 'var(--voxel-paper)' }}>{roomDetail.roomName}</div>
                                <div className="border-[3px] px-2.5 py-1 text-[11px] font-black" style={{ color: 'var(--voxel-ink)', background: 'var(--voxel-torch)', borderColor: 'var(--voxel-ink)' }}>{roomDetail.maxPlayers}人局</div>
                            </div>
                            <div className="text-[10px] font-mono mb-4" style={fieldHintStyle}>{roomDetail.roomId.slice(0, 8)}</div>

                            <div className="grid gap-3 border-[3px] p-4 mb-4 sm:grid-cols-3" style={{ background: 'var(--voxel-ink-soft)', borderColor: 'var(--voxel-ink)' }}>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>已入座</div>
                                    <div className="mt-1 text-base font-black" style={{ color: 'var(--voxel-paper)' }}>{roomDetail.players.length}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>空位</div>
                                    <div className="mt-1 text-base font-black" style={{ color: 'var(--voxel-paper)' }}>{Math.max(0, roomDetail.maxPlayers - roomDetail.players.length)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={fieldHintStyle}>房主</div>
                                    <div className="mt-1 text-base font-black truncate" style={{ color: 'var(--voxel-paper)' }}>{roomDetail.players.find(p => p.playerId === roomDetail.hostPlayerId)?.nickname || '未识别'}</div>
                                </div>
                            </div>

                            <div className="text-[11px] font-black uppercase tracking-[0.22em] mb-3" style={fieldHintStyle}>
                                选择你的座位
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {Array.from({ length: roomDetail.maxPlayers }, (_, i) => {
                                    const seatNum = i + 1;
                                    const seatedPlayer = takenSeats.get(seatNum);
                                    const isEmpty = !seatedPlayer;
                                    const isSelected = selectedSeat === seatNum;

                                    return (
                                        <button
                                            key={seatNum}
                                            onClick={() => isEmpty && setSelectedSeat(seatNum)}
                                            disabled={!isEmpty}
                                            className={clsx(
                                                'flex flex-col items-center gap-1 px-2 py-3 border-[3px] transition-all',
                                                isSelected
                                                    ? ''
                                                    : isEmpty
                                                        ? 'cursor-pointer'
                                                        : 'cursor-default'
                                            )}
                                            style={isSelected
                                                ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '3px 3px 0 var(--voxel-ink)' }
                                                : isEmpty
                                                    ? { background: 'var(--voxel-wood)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)', borderStyle: 'dashed' }
                                                    : seatedPlayer?.isHost
                                                        ? { background: 'var(--voxel-stone)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)' }
                                                        : { background: 'var(--voxel-ink-soft)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)' }}
                                        >
                                            <div
                                                className={clsx(
                                                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black',
                                                )}
                                                style={isSelected
                                                    ? { background: 'var(--voxel-ink)', color: 'var(--voxel-paper)' }
                                                    : isEmpty
                                                        ? { background: 'rgba(255,255,255,0.12)', color: 'var(--voxel-paper)' }
                                                        : seatedPlayer?.isHost
                                                            ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)' }
                                                            : { background: 'rgba(255,255,255,0.12)', color: 'var(--voxel-paper-dim)' }}>
                                                {seatNum}
                                            </div>
                                            <div className={clsx(
                                                'text-[10px] font-medium text-center leading-tight truncate w-full',
                                            )}>
                                                {seatedPlayer ? seatedPlayer.nickname : isSelected ? nickname : '空位'}
                                            </div>
                                            {seatedPlayer && !isSelected && (
                                                <div className="text-[9px]" style={fieldHintStyle}>
                                                    {seatedPlayer.isHost ? '房主' : '已占用'}
                                                </div>
                                            )}
                                            {isSelected && (
                                                <div className="text-[9px]" style={{ color: 'var(--voxel-ink)' }}>✓ 你的座位</div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <button
                            onClick={handleJoinWithSeat}
                            disabled={selectedSeat === null}
                            className={clsx(
                                'w-full border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]',
                                selectedSeat !== null
                                    ? ''
                                    : 'cursor-not-allowed'
                            )}
                            style={selectedSeat !== null
                                ? { background: 'var(--voxel-emerald)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }
                                : { background: 'var(--voxel-stone)', color: 'var(--voxel-stone-dark)', borderColor: 'var(--voxel-ink)' }}
                        >
                            {selectedSeat !== null ? `加入 ${selectedSeat}号座位` : '请先选择一个空位'}
                        </button>

                        <button
                            onClick={handleQuickJoin}
                            disabled={loadingRoom}
                            className="w-full py-2.5 border-[3px] font-medium text-sm transition-all active:translate-x-[2px] active:translate-y-[2px]"
                            style={secondaryButtonStyle}
                        >
                            {loadingRoom ? '加入中...' : '快速加入（自动分配座位）'}
                        </button>

                        {joinError && (
                            <div className="text-center text-xs font-black border-[3px] px-3 py-2" style={{ color: 'var(--voxel-paper)', background: 'var(--voxel-redstone)', borderColor: 'var(--voxel-ink)' }}>
                                {joinError}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </MultiplayerShell>
    );
};
