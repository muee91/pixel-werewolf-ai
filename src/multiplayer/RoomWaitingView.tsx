import React, { useState } from 'react';
import { McIcon } from '../components/game/voxel/primitives';
import clsx from 'clsx';
import { useRoomService } from './useRoomService';
import { RoomState, RoomPlayer } from '../multiplayer/types';
import { GAME_PRESETS } from '../types';
import { PingIndicator } from './PingIndicator';
import { useAtom } from 'jotai';
import { multiplayerPingAtom } from '../atoms';
import { MultiplayerShell } from './MultiplayerShell';

interface RoomWaitingProps {
    room: RoomState;
    playerId: string;
    nickname: string;
    onBack: () => void;
}

export const RoomWaitingView: React.FC<RoomWaitingProps> = ({ room, playerId, nickname, onBack }) => {
    const { leaveRoom, setReady, startGame, kickPlayer, changePreset, changeSeat, addBot } = useRoomService();
    const isHost = room.hostPlayerId === playerId;
    const myPlayer = room.players.find(p => p.playerId === playerId);
    const guestsReady = room.players.filter(p => p.playerId !== room.hostPlayerId).every(p => p.isReady);
    const hasGuests = room.players.some(p => p.playerId !== room.hostPlayerId);
    const canStart = hasGuests && guestsReady;
    const [playerPings] = useAtom(multiplayerPingAtom);
    const [showPresetPicker, setShowPresetPicker] = useState(false);
    const [inviteCopied, setInviteCopied] = useState(false);

    // 一键复制“MCP Agent 邀请提示词”：粘到任意已注册 werewolf MCP 的会话即可让 agent 入局
    const handleInviteAgent = async () => {
        const prompt = `用 werewolf 的 MCP 工具 join_room 加入房间 ${room.roomId}（昵称随意），然后循环 wait_for_my_turn 和 submit_action 认真打完这局：发言要有逻辑和身份感，投票要有理由。`;
        try {
            await navigator.clipboard.writeText(prompt);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = prompt;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
    };

    const takenSeats = new Map<number, RoomPlayer>();
    for (const p of room.players) {
        if (p.seatNumber != null) takenSeats.set(p.seatNumber, p);
    }

    const handleLeave = () => {
        leaveRoom(room.roomId, playerId);
        onBack();
    };

    const handleKick = async (targetPlayerId: string, targetNickname: string) => {
        if (!confirm(`确定将 ${targetNickname} 踢出房间吗？`)) return;
        const result = await kickPlayer(room.roomId, playerId, targetPlayerId);
        if (!result.success) {
            alert(result.error || '踢人失败');
        }
    };

    const handleChangePreset = async (presetKey: string) => {
        const preset = GAME_PRESETS.find(p => p.key === presetKey);
        if (!preset) return;
        await changePreset(room.roomId, playerId, presetKey, preset.playerCount);
        setShowPresetPicker(false);
    };

    const handleChangeSeat = async (seatNumber: number) => {
        if (seatNumber === myPlayer?.seatNumber) return;
        await changeSeat(room.roomId, playerId, seatNumber);
    };

    const presetInfo = GAME_PRESETS.find(p => p.key === room.presetKey);

    return (
        <MultiplayerShell
            title={room.roomName}
            subtitle={isHost ? '房主负责切换板子、安排座位并在所有玩家就绪后启动游戏。' : '确认座位和准备状态，等待房主开局。'}
            onBack={handleLeave}
            backLabel="离开"
            right={
                <div className="text-right">
                    <div className="text-xs font-bold" style={{ color: 'var(--voxel-paper-dim)' }}>{room.players.length}/{room.maxPlayers} 玩家</div>
                    <div className="text-[11px] font-black" style={{ color: 'var(--voxel-torch)' }}>{room.maxPlayers}人局</div>
                </div>
            }
            footer={
                isHost ? (
                    <div className="space-y-2">
                        {room.players.length < room.maxPlayers && (
                            <>
                                <button
                                    onClick={() => addBot()}
                                    className="w-full border-[3px] py-2 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]"
                                    style={{ background: 'var(--voxel-wood)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)', boxShadow: '3px 3px 0 var(--voxel-ink)' }}
                                    title="加入一个内置 AI 玩家（规则大脑，无需配置 LLM）"
                                >
                                    🤖 添加 AI 玩家（离线）
                                </button>
                                <button
                                    onClick={handleInviteAgent}
                                    className="w-full border-[3px] py-2 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]"
                                    style={{ background: inviteCopied ? 'var(--voxel-emerald)' : 'var(--voxel-stone)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)', boxShadow: '3px 3px 0 var(--voxel-ink)' }}
                                    title="复制邀请提示词，粘到任意已注册 werewolf MCP 的会话即可让 agent 入局"
                                >
                                    {inviteCopied ? '✓ 邀请提示词已复制，去会话里粘贴发送' : '🤝 邀请 MCP Agent（外脑 AI）'}
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => startGame(room.roomId, playerId)}
                            disabled={!canStart}
                            className={clsx(
                                'w-full border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]',
                                canStart ? '' : 'cursor-not-allowed'
                            )}
                            style={canStart ? { background: 'var(--voxel-emerald)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' } : { background: 'var(--voxel-stone)', color: 'var(--voxel-stone-dark)', borderColor: 'var(--voxel-ink)' }}
                        >
                            {canStart ? '开始游戏' : hasGuests ? '等待所有玩家准备' : '等待玩家加入'}
                        </button>
                        {!canStart && hasGuests && (
                            <div className="text-center text-xs font-bold" style={{ color: 'var(--voxel-paper-dim)' }}>
                                {room.players.filter(p => p.playerId !== room.hostPlayerId && p.isReady).length}/{room.players.filter(p => p.playerId !== room.hostPlayerId).length} 玩家已准备
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => setReady(room.roomId, playerId, !myPlayer?.isReady)}
                        className="w-full border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]"
                        style={myPlayer?.isReady
                            ? { background: 'var(--voxel-redstone)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }
                            : { background: 'var(--voxel-emerald)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }}
                    >
                        {myPlayer?.isReady ? '取消准备' : '准备'}
                    </button>
                )
            }
        >
            <div className="max-w-3xl mx-auto w-full">
                <div
                    className={clsx(
                        'border-[3px] p-5 mb-4 shadow-[4px_4px_0_var(--voxel-ink)]',
                        isHost ? 'cursor-pointer' : ''
                    )}
                    style={{ background: 'var(--voxel-wood-dark)', borderColor: 'var(--voxel-ink)' }}
                    onClick={() => isHost && setShowPresetPicker(!showPresetPicker)}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-lg"><McIcon icon={presetInfo?.icon || 'mc:map'} px={1} /></span>
                            <span className="font-black" style={{ color: 'var(--voxel-paper)' }}>{presetInfo?.label || room.presetKey}</span>
                        </div>
                        {isHost && (
                            <span className="text-xs font-black" style={{ color: 'var(--voxel-torch)' }}>
                                {showPresetPicker ? '收起 ▲' : '切换板子 ▼'}
                            </span>
                        )}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--voxel-paper-dim)' }}>
                        {presetInfo?.description || `${room.maxPlayers}人局`}
                    </div>

                    {showPresetPicker && isHost && (
                        <div className="mt-3 pt-3 border-t-[3px] space-y-2" style={{ borderColor: 'var(--voxel-ink)' }}>
                            {GAME_PRESETS.map(preset => (
                                <button
                                    key={preset.key}
                                    onClick={(e) => { e.stopPropagation(); handleChangePreset(preset.key); }}
                                    className={clsx(
                                        'w-full flex items-center gap-3 px-3 py-2.5 border-[3px] transition-all text-left active:translate-x-[2px] active:translate-y-[2px]',
                                        preset.key === room.presetKey ? '' : 'opacity-70'
                                    )}
                                    style={{
                                        background: preset.key === room.presetKey ? 'var(--voxel-torch)' : 'var(--voxel-ink-soft)',
                                        borderColor: 'var(--voxel-ink)',
                                    }}
                                >
                                    <span className="text-base"><McIcon icon={preset.icon} px={1} /></span>
                                    <div className="flex-1">
                                        <div className="text-sm font-black" style={{ color: preset.key === room.presetKey ? 'var(--voxel-ink)' : 'var(--voxel-paper)' }}>
                                            {preset.label}
                                            {preset.key === room.presetKey && <span className="ml-1 text-[10px]">✓ 当前</span>}
                                        </div>
                                        <div className="text-[10px]" style={{ color: preset.key === room.presetKey ? 'var(--voxel-ink-soft)' : 'var(--voxel-paper-dim)' }}>{preset.playerCount}人 · {preset.description}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-[3px] p-4 mb-4 shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: 'var(--voxel-wood-dark)', borderColor: 'var(--voxel-ink)' }}>
                    <div className="text-xs font-black uppercase tracking-wide mb-3" style={{ color: 'var(--voxel-paper)' }}>
                        座位安排
                        {!isHost && <span className="ml-2 font-black normal-case" style={{ color: 'var(--voxel-torch)' }}>点击空位换座</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: room.maxPlayers }, (_, i) => {
                            const seatNum = i + 1;
                            const seatedPlayer = takenSeats.get(seatNum);
                            const isMe = seatedPlayer?.playerId === playerId;
                            const isHostPlayer = seatedPlayer?.playerId === room.hostPlayerId;
                            const isEmpty = !seatedPlayer;

                            const isDisconnected = seatedPlayer?.isConnected === false;

                            return (
                                <button
                                    type="button"
                                    key={seatNum}
                                    disabled={!isEmpty}
                                    aria-label={isEmpty ? `${seatNum}号空位` : `${seatNum}号 ${seatedPlayer.nickname}`}
                                    onClick={() => {
                                        if (isEmpty && !isHost) {
                                            handleChangeSeat(seatNum);
                                        } else if (isEmpty && isHost && myPlayer?.seatNumber !== seatNum) {
                                            handleChangeSeat(seatNum);
                                        }
                                    }}
                                    className={clsx(
                                        'relative flex flex-col items-center gap-1 px-2 py-3 border-[3px] transition-all',
                                        isEmpty ? 'cursor-pointer' : 'cursor-default',
                                        isMe
                                            ? 'shadow-[3px_3px_0_var(--voxel-ink)]'
                                            : isDisconnected
                                                ? 'opacity-70'
                                                : isEmpty
                                                    ? ''
                                                    : ''
                                    )}
                                    style={{
                                        background: isMe ? 'var(--voxel-torch)' : isDisconnected ? 'var(--voxel-redstone)' : isEmpty ? 'var(--voxel-wood)' : 'var(--voxel-ink-soft)',
                                        borderColor: 'var(--voxel-ink)',
                                        borderStyle: isEmpty && !isMe ? 'dashed' : 'solid',
                                    }}
                                >
                                    <div className="w-7 h-7 flex items-center justify-center text-xs font-black"
                                        style={{
                                            background: isMe ? 'var(--voxel-ink)' : isDisconnected ? 'var(--voxel-redstone)' : isHostPlayer ? 'var(--voxel-torch)' : isEmpty ? 'var(--voxel-stone)' : seatedPlayer?.isReady ? 'var(--voxel-emerald)' : 'var(--voxel-stone)',
                                            color: isMe ? 'var(--voxel-paper)' : isDisconnected ? 'var(--voxel-paper)' : isHostPlayer ? 'var(--voxel-ink)' : isEmpty ? 'var(--voxel-paper-dim)' : 'var(--voxel-paper)',
                                            boxShadow: '2px 2px 0 var(--voxel-ink)',
                                        }}>
                                        {seatNum}
                                    </div>
                                    <div className="text-[10px] font-medium text-center leading-tight truncate w-full" style={{ color: isDisconnected ? 'var(--voxel-paper)' : 'var(--voxel-paper)' }}>
                                        {seatedPlayer
                                            ? isMe
                                                ? `${seatedPlayer.nickname}`
                                                : seatedPlayer.nickname
                                            : '空位'
                                        }
                                    </div>
                                    {seatedPlayer && (
                                        <div className="text-[9px]" style={{ color: isDisconnected ? 'var(--voxel-paper)' : 'var(--voxel-paper-dim)' }}>
                                            {isDisconnected ? '已断线 ✕' : isHostPlayer ? '房主' : seatedPlayer.isReady ? '✓ 已准备' : '未准备'}
                                        </div>
                                    )}
                                    {seatedPlayer && seatedPlayer.playerId !== room.hostPlayerId && !(isHost && seatedPlayer.playerId === playerId) && (
                                        <PingIndicator
                                            ping={playerPings[seatedPlayer.playerId] ?? null}
                                            size="xs"
                                            variant="dot"
                                        />
                                    )}
                                    {isMe && !isHostPlayer && (
                                        <span className="text-[9px]" style={{ color: 'var(--voxel-torch)' }}>(自己)</span>
                                    )}
                                    {isHostPlayer && seatedPlayer && (
                                        <span className="text-[9px]" style={{ color: 'var(--voxel-torch)' }}>🖥️</span>
                                    )}
                                    {seatedPlayer && !isMe && isHost && !isHostPlayer && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleKick(seatedPlayer.playerId, seatedPlayer.nickname); }}
                                            className="absolute top-1 right-1 text-[9px] z-10 bg-black/40"
                                            style={{ color: 'var(--voxel-paper)' }}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </MultiplayerShell>
    );
};
