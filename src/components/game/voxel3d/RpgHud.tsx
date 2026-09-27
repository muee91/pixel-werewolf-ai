// RPG HUD overlay for the 3D voxel campfire council.
//
// Display-only: renders phase objective, day/alive counts, player roster
// (public info only — never roles), current speaker and a collapsible log.
// All submissions still flow through HumanInputPanel; this component does not
// create any input or submit path. World NPC clicks are handled separately
// via worldTargetAtom.
//
// Privacy: this component NEVER reads the full logsAtom. The caller must pass
// already-permission-cropped logs via `visibleLogs` (e.g. server-cropped for
// multiplayer guests, or viewer-filtered for local human mode so that
// `visibleTo`-restricted entries for other players are excluded).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import {
    playersAtom,
    currentSpeakerIdAtom,
    gamePhaseAtom,
    turnCountAtom,
    gameResultAtom,
    gameEvaluationAtom,
    exitGameAtom,
    isReplayModeAtom,
    replayPausedAtom,
    replayProgressAtom,
    humanInputResolverMapAtom,
    gameConfigAtom,
    uiConfigAtom,
} from '../../../store';
import { GamePhase, PlayerStatus, type GameLog, type Player } from '../../../types';

const PHASE_OBJECTIVE: Record<GamePhase, string> = {
    [GamePhase.SETUP]: '等待对局开始',
    [GamePhase.NIGHT_START]: '夜幕降临，请保持安静',
    [GamePhase.WEREWOLF_ACTION]: '狼人行动：选择刀杀目标',
    [GamePhase.SEER_ACTION]: '预言家行动：查验一名玩家',
    [GamePhase.WITCH_ACTION]: '女巫行动：使用解药或毒药',
    [GamePhase.GUARD_ACTION]: '守卫行动：选择守护目标',
    [GamePhase.DAY_ANNOUNCE]: '天亮了，公布昨夜情况',
    [GamePhase.HUNTER_ACTION]: '猎人开枪：选择带走目标',
    [GamePhase.LAST_WORDS]: '遗言环节',
    [GamePhase.DAY_DISCUSSION]: '白天讨论：自由发言',
    [GamePhase.SHERIFF_ELECTION]: '警长竞选：发表演讲',
    [GamePhase.SHERIFF_VOTING]: '警长投票：选择候选人',
    [GamePhase.VOTING]: '放逐投票：投出你的一票',
    [GamePhase.KNIGHT_CHALLENGE]: '骑士决斗：选择目标',
    [GamePhase.WOLF_EXPLODE]: '狼人自爆：可指刀一名玩家',
    [GamePhase.SHERIFF_WITHDRAW]: '警长退水：决定是否退出竞选',
    [GamePhase.DISCUSSION_ROUND_TWO]: '第二轮讨论：自由发言',
    [GamePhase.STONE_GHOST_ACTION]: '石像鬼行动：查验身份',
    [GamePhase.GRAVEKEEPER_ACTION]: '守墓人查验被放逐玩家',
    [GamePhase.DEMON_HUNTER_ACTION]: '猎魔人行动：选择猎杀目标',
    [GamePhase.CUPID_LINK]: '丘比特行动：连结两名情侣',
    [GamePhase.MERCHANT_ACTION]: '奇迹商人：发放技能',
    [GamePhase.GAME_OVER]: '对局结束',
    [GamePhase.GAME_REVIEW]: '对局复盘',
};

const PHASE_LABEL: Record<GamePhase, string> = {
    [GamePhase.SETUP]: '准备',
    [GamePhase.NIGHT_START]: '夜始',
    [GamePhase.WEREWOLF_ACTION]: '狼人',
    [GamePhase.SEER_ACTION]: '预言家',
    [GamePhase.WITCH_ACTION]: '女巫',
    [GamePhase.GUARD_ACTION]: '守卫',
    [GamePhase.DAY_ANNOUNCE]: '天亮',
    [GamePhase.HUNTER_ACTION]: '猎人',
    [GamePhase.LAST_WORDS]: '遗言',
    [GamePhase.DAY_DISCUSSION]: '讨论',
    [GamePhase.SHERIFF_ELECTION]: '竞选',
    [GamePhase.SHERIFF_VOTING]: '警长投票',
    [GamePhase.VOTING]: '投票',
    [GamePhase.KNIGHT_CHALLENGE]: '决斗',
    [GamePhase.WOLF_EXPLODE]: '自爆',
    [GamePhase.SHERIFF_WITHDRAW]: '退水',
    [GamePhase.DISCUSSION_ROUND_TWO]: '二轮讨论',
    [GamePhase.STONE_GHOST_ACTION]: '石像鬼',
    [GamePhase.GRAVEKEEPER_ACTION]: '守墓人',
    [GamePhase.DEMON_HUNTER_ACTION]: '猎魔人',
    [GamePhase.CUPID_LINK]: '丘比特',
    [GamePhase.MERCHANT_ACTION]: '商人',
    [GamePhase.GAME_OVER]: '结束',
    [GamePhase.GAME_REVIEW]: '复盘',
};

const isAlive = (p: Player) =>
    p.status === PlayerStatus.ALIVE || p.status === PlayerStatus.IDIOT_REVEALED;

interface RpgHudProps {
    // Already permission-cropped logs for the current viewer. The HUD does not
    // self-read logsAtom, so callers control exactly what is visible.
    visibleLogs: GameLog[];
    visibleRoleLabels: Record<number, string>;
    personaLabels?: Record<number, string>;
    onPlayerSelect?: (playerId: number) => void;
    ambientAudioEnabled: boolean;
    skillAudioEnabled: boolean;
    audioVolume: number;
    onAmbientAudioToggle: () => void;
    onSkillAudioToggle: () => void;
    onAudioVolumeChange: (volume: number) => void;
    dialogueActive?: boolean;
    concealSpeakerIdentity?: boolean;
    isNight?: boolean;
    /** 结算面板/回放退出统一走房间的退出分发（单机退出、联机 host/guest 分支） */
    onExitRequest?: () => void;
}

const RpgHud: React.FC<RpgHudProps> = ({
    visibleLogs,
    visibleRoleLabels,
    personaLabels = {},
    onPlayerSelect,
    ambientAudioEnabled,
    skillAudioEnabled,
    audioVolume,
    onAmbientAudioToggle,
    onSkillAudioToggle,
    onAudioVolumeChange,
    dialogueActive = false,
    concealSpeakerIdentity = false,
    isNight = false,
    onExitRequest,
}) => {
    const players = useAtomValue(playersAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const turnCount = useAtomValue(turnCountAtom);
    const gameResult = useAtomValue(gameResultAtom);
    const gameEvaluation = useAtomValue(gameEvaluationAtom);
    const setExitGame = useSetAtom(exitGameAtom);
    const isReplayMode = useAtomValue(isReplayModeAtom);
    const [replayPaused, setReplayPaused] = useAtom(replayPausedAtom);
    const replayProgress = useAtomValue(replayProgressAtom);
    const humanInputResolverMap = useAtomValue(humanInputResolverMapAtom);
    const gameConfig = useAtomValue(gameConfigAtom);
    const playerCardStyle = useAtomValue(uiConfigAtom).playerCardStyle;
    // 人类回合信号：被点名发言或引擎已登记等待本人输入（与 HumanInputPanel 的 isMyTurn 同口径）
    const humanPlayer = players.find(p => p.isHuman);
    const isHumanTurn = !!humanPlayer && (
        currentSpeakerId === humanPlayer.id || humanInputResolverMap[humanPlayer.id] != null
    );
    const [logOpen, setLogOpen] = useState(true);
    const [rosterOpen, setRosterOpen] = useState(false);
    // 结算面板：新对局结果出现时自动弹出，可收起回到场景，可从右下角再次打开
    const [settlementMinimized, setSettlementMinimized] = useState(false);
    const [settlementForEndedAt, setSettlementForEndedAt] = useState<number | null>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const followLatestLogRef = useRef(true);

    const aliveCount = useMemo(() => players.filter(isAlive).length, [players]);
    // 过程日志呈现全部内容（含玩家发言）——发言条目带 AI_THINKING 标记，只滤事件流痕迹（兼容旧存档）
    const displayLogs = useMemo(() => visibleLogs.filter(l => l.debugType !== 'EVENT_TRACE').slice(-80), [visibleLogs]);
    const speaker = useMemo(
        () => dialogueActive || concealSpeakerIdentity ? null : players.find(p => p.id === currentSpeakerId) ?? null,
        [concealSpeakerIdentity, dialogueActive, players, currentSpeakerId],
    );

    const objective = PHASE_OBJECTIVE[phase] ?? '';
    const phaseLabel = PHASE_LABEL[phase] ?? String(phase);

    // 快闪横幅：出局/自爆/警徽/夜晚死亡——移植 2D 的醒目反馈（3D 此前死亡播报零显著度）
    const flash = useMemo(() => {
        for (let i = visibleLogs.length - 1; i >= Math.max(0, visibleLogs.length - 4); i--) {
            const l = visibleLogs[i];
            if (!l.isSystem || Date.now() - l.timestamp > 3000) continue;
            let m = l.content.match(/(\d+)号 被投票出局/);
            if (m) return { id: l.id, text: `${m[1]}号 出局`, tone: '#c0392b' };
            m = l.content.match(/警徽传给 (\d+)号/);
            if (m) return { id: l.id, text: `警徽 → ${m[1]}号`, tone: '#b8860b' };
            m = l.content.match(/警徽流失/);
            if (m) return { id: l.id, text: '警徽流失', tone: '#b8860b' };
            m = l.content.match(/(\d+)号 自爆/);
            if (m) return { id: l.id, text: `${m[1]}号 自爆！`, tone: '#c0392b' };
            m = l.content.match(/昨晚 ([\d、]+号(?:、[\d、]+号)*) 死亡/);
            if (m) return { id: l.id, text: `${m[1]} 死亡`, tone: '#c0392b' };
        }
        return null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleLogs, turnCount]);
    const [flashVisible, setFlashVisible] = useState(true);
    useEffect(() => {
        if (flash) setFlashVisible(true);
    }, [flash?.id]);
    useEffect(() => {
        if (!flashVisible) return undefined;
        const timer = window.setTimeout(() => setFlashVisible(false), 2400);
        return () => window.clearTimeout(timer);
    }, [flashVisible, flash?.id]);

    useEffect(() => {
        if (gameResult && gameResult.endedAt !== settlementForEndedAt) {
            setSettlementForEndedAt(gameResult.endedAt);
            setSettlementMinimized(false);
        }
    }, [gameResult, settlementForEndedAt]);

    const aliveResultPlayers = useMemo(() => {
        return [...(gameResult?.alivePlayerIds ?? [])].sort((a, b) => a - b)
            .map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p);
    }, [gameResult, players]);
    const deadResultPlayers = useMemo(() => {
        return [...(gameResult?.deadPlayerIds ?? [])].sort((a, b) => a - b)
            .map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p);
    }, [gameResult, players]);
    const winnerMeta = !gameResult ? null : gameResult.winner === 'GOOD'
        ? { text: '好人阵营胜利', bg: 'var(--voxel-emerald)' }
        : gameResult.winner === 'WOLF'
            ? { text: '狼人阵营胜利', bg: 'var(--voxel-redstone)' }
            : { text: '第三方阵营胜利', bg: 'var(--voxel-torch)' };

    // 逐票开票板：投票阶段实时上榜（对齐 2D）；voteDetailPublic=false 时只显示计数不显示对应关系
    const voteBoard = useMemo(() => {
        if (phase !== GamePhase.VOTING) return null;
        const rows = visibleLogs
            .filter(l => l.turn === turnCount && l.phase === GamePhase.VOTING && l.debugType === 'VOTE_STRATEGY')
            .map(l => {
                const d = (l.debugData ?? {}) as { decision?: { target?: number | null }; target?: number | null };
                const target = d.decision?.target ?? d.target ?? null;
                return { id: l.id, voter: l.speakerId, target: target != null ? Number(target) : null };
            });
        return rows.length > 0 ? rows : null;
    }, [phase, visibleLogs, turnCount]);
    const voteDetailPublic = gameConfig.rules?.voteDetailPublic ?? false;

    useEffect(() => {
        const logElement = logRef.current;
        if (!logOpen || !logElement || !followLatestLogRef.current) return;
        logElement.scrollTop = logElement.scrollHeight;
    }, [displayLogs, logOpen]);

    const handleLogScroll = () => {
        const logElement = logRef.current;
        if (!logElement) return;
        followLatestLogRef.current = logElement.scrollHeight - logElement.scrollTop - logElement.clientHeight < 24;
    };

    const resumeLogFollow = () => {
        followLatestLogRef.current = true;
        const logElement = logRef.current;
        if (logElement) logElement.scrollTop = logElement.scrollHeight;
    };

    const toggleLog = () => {
        setLogOpen(open => {
            if (!open) followLatestLogRef.current = true;
            return !open;
        });
    };

    return (
        <div data-testid="rpg-hud" className="pointer-events-none absolute inset-0 z-[40] select-none" style={{ fontFamily: 'var(--voxel-font)' }}>
            {/* Top bar: phase objective + day + alive count */}
            <div className="absolute left-3 top-3 right-3 flex items-start justify-between gap-3">
                <div className="pointer-events-auto max-w-[62%] border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper-dim)] px-3 py-2 text-[var(--voxel-ink)] shadow-[4px_4px_0_var(--voxel-ink)]">
                    <div className="text-[9px] font-black tracking-[0.2em] text-[var(--voxel-wood-dark)]">主线任务</div>
                    <div className="flex items-center gap-2">
                        <span className="bg-[var(--voxel-grass-dark)] px-1.5 py-0.5 text-[10px] font-black tracking-wider text-[var(--voxel-paper)] uppercase">
                            {phaseLabel}
                        </span>
                        <span className="text-[11px] font-black">第 {turnCount} {isNight ? '夜' : '天'}</span>
                    </div>
                    <div className="mt-1 text-xs font-black leading-snug">{objective}</div>
                </div>
                <div className="pointer-events-auto border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-grass-dark)] px-3 py-2 text-right text-[var(--voxel-paper)] shadow-[4px_4px_0_var(--voxel-ink)]">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em]">队伍存活</div>
                    <div className="text-lg font-black leading-none">{aliveCount}<span className="text-xs opacity-70">/{players.length}</span></div>
                </div>
            </div>

            <button
                type="button"
                aria-expanded={rosterOpen}
                aria-controls="voxel-rpg-roster"
                onClick={() => setRosterOpen(value => !value)}
                className="pointer-events-auto absolute right-3 top-36 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 py-1.5 text-[10px] font-black tracking-widest text-[var(--voxel-torch)] shadow-[3px_3px_0_var(--voxel-ink)] sm:hidden"
            >
                {rosterOpen ? '收起队伍' : `队伍 ${aliveCount}/${players.length}`}
            </button>

            {/* Right: player roster (public info only — no roles). 桌面端不限高，全部玩家一屏展示；仅小屏保留滚动防溢出 */}
            <div
                id="voxel-rpg-roster"
                className={clsx(
                    // 常规高度不限高（全部玩家一屏展示）；仅在矮窗口下限内滚动防溢出
                    'pointer-events-auto absolute right-3 top-24 w-52 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-wood)] text-[var(--voxel-paper)] shadow-[4px_4px_0_var(--voxel-ink)] custom-scrollbar',
                    '[@media(max-height:860px)]:max-h-[calc(100dvh-9rem)] [@media(max-height:860px)]:overflow-y-auto',
                    'max-sm:top-44 max-sm:max-h-[calc(100dvh-14rem)] max-sm:w-36 max-sm:overflow-y-auto',
                    rosterOpen ? 'block' : 'max-sm:hidden',
                )}
            >
                <div className="sticky top-0 border-b-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-2 py-1.5 text-[10px] font-black tracking-widest text-[var(--voxel-torch)]">
                    冒险队伍
                </div>
                <ul className={clsx(
                    // 玩家卡片样式共用 2D 的 playerCardStyle 设置：名签=标准列表，徽章=双列徽章，热栏=紧凑单行
                    playerCardStyle === 'totem-badge' && 'grid grid-cols-2 gap-1 px-1.5 py-1',
                    playerCardStyle === 'hotbar-strip' && 'px-1 py-0.5',
                    playerCardStyle !== 'totem-badge' && playerCardStyle !== 'hotbar-strip' && 'py-1',
                )}>
                    {players.map(p => {
                        const alive = isAlive(p);
                        const speaking = !concealSpeakerIdentity && p.id === currentSpeakerId;
                        const roleLabel = visibleRoleLabels[p.id] ?? '未知职业';
                        const name = p.displayName ?? `${p.seatNumber}号`;
                        const persona = personaLabels[p.id];
                        const seatCls = clsx(
                            'inline-flex shrink-0 items-center justify-center font-black',
                            playerCardStyle === 'hotbar-strip' ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 rounded text-[10px]',
                            !alive
                                ? 'bg-th-dead/30 text-th-dead line-through'
                                : (speaking ? 'bg-th-accent1 text-white' : 'bg-th-bg2 text-th-fg'),
                        );
                        const nameCls = clsx('block truncate leading-tight', !alive && 'line-through opacity-60');

                        if (playerCardStyle === 'hotbar-strip') {
                            return (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        onClick={() => onPlayerSelect?.(p.id)}
                                        className={clsx('flex w-full items-center gap-1.5 px-1.5 py-0.5 text-left text-[10px] transition-colors hover:bg-[var(--voxel-paper)]/10', speaking && 'bg-th-accent1/10')}
                                    >
                                        <span className={seatCls}>{p.seatNumber}</span>
                                        <span className={clsx('min-w-0 flex-1 truncate', !alive && 'opacity-60')}>
                                            {name} · {roleLabel}
                                            {persona && <span className="ml-1 text-[8px] text-[var(--voxel-emerald)]">🎭{persona}</span>}
                                        </span>
                                    </button>
                                </li>
                            );
                        }

                        if (playerCardStyle === 'totem-badge') {
                            return (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        onClick={() => onPlayerSelect?.(p.id)}
                                        className={clsx('flex w-full flex-col items-center gap-0.5 border border-[var(--voxel-ink)] px-1 py-1.5 text-center transition-colors hover:bg-[var(--voxel-paper)]/10', speaking && 'bg-th-accent1/10')}
                                    >
                                        <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', !alive ? 'bg-th-dead/30 text-th-dead line-through' : 'bg-th-torch text-[var(--voxel-ink)]')}>{p.seatNumber}</span>
                                        <span className={clsx('w-full truncate text-[10px] font-black', nameCls)}>{name}</span>
                                        <span className={clsx('w-full truncate text-[8px] font-bold text-[var(--voxel-torch)]', !alive && 'line-through opacity-60')}>{roleLabel}</span>
                                        {persona && <span className="w-full truncate text-[8px] text-[var(--voxel-emerald)]">🎭{persona}</span>}
                                    </button>
                                </li>
                            );
                        }

                        return (
                            <li key={p.id}>
                                <button
                                type="button"
                                onClick={() => onPlayerSelect?.(p.id)}
                                className={clsx(
                                    'flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] transition-colors hover:bg-[var(--voxel-paper)]/10',
                                    speaking && 'bg-th-accent1/10',
                                )}
                            >
                                <span className={seatCls}>
                                    {p.seatNumber}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={nameCls}>
                                        {name}
                                    </span>
                                    <span className="block truncate text-[8px] font-black text-[var(--voxel-torch)]">
                                        {roleLabel}
                                    </span>
                                    {persona && (
                                        <span className="block truncate text-[8px] font-bold text-[var(--voxel-emerald)]">
                                            🎭 {persona}
                                        </span>
                                    )}
                                </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Current speaker badge */}
            {speaker && (
                <div className="pointer-events-none absolute left-3 top-36 max-w-[calc(100vw-11rem)] sm:left-1/2 sm:top-16 sm:max-w-none sm:-translate-x-1/2">
                    <div className="truncate border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-3 py-1 text-[11px] font-black text-[var(--voxel-ink)] shadow-[3px_3px_0_var(--voxel-ink)]">
                        发言中：{speaker.seatNumber}号 {speaker.displayName ?? ''}
                    </div>
                </div>
            )}

            {/* Bottom-left: readable live process log. 人类回合整体上移让位给底部输入面板（对齐 2D dockReserve 思路）。
                字幕播放期间不再完全隐藏：半透明+悬停恢复，兑现"丢条后可在日志查到"的承诺 */}
            <div data-testid="rpg-log-panel" className={clsx(
                'pointer-events-auto absolute left-3 w-[min(25rem,calc(100vw-1.5rem))] transition-all duration-200 sm:w-[25rem]',
                // 焦点原则：他人发言时只留字幕，日志隐藏；轮到本人操作时日志上移显示，供复盘决策
                isHumanTurn ? 'bottom-[23rem] max-w-[22rem]' : dialogueActive ? 'pointer-events-none opacity-0' : 'bottom-24 max-w-[min(25rem,calc(100vw-1.5rem))]',
            )}>
                <div data-testid="world-audio-controls" className="mb-2 flex items-center gap-1.5 text-[9px] font-black">
                    <button
                        type="button"
                        aria-pressed={ambientAudioEnabled}
                        onClick={onAmbientAudioToggle}
                        className="border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-2 py-1 text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)]"
                    >
                        环境声 {ambientAudioEnabled ? '开' : '关'}
                    </button>
                    <button
                        type="button"
                        aria-pressed={skillAudioEnabled}
                        onClick={onSkillAudioToggle}
                        className="border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-2 py-1 text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)]"
                    >
                        技能声 {skillAudioEnabled ? '开' : '关'}
                    </button>
                    <label className="flex min-w-0 items-center gap-1 border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-2 py-1 text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)] max-sm:hidden">
                        音量
                        <input
                            aria-label="世界音量"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={audioVolume}
                            onChange={event => onAudioVolumeChange(Number(event.target.value))}
                            className="w-16 accent-[var(--voxel-torch)]"
                        />
                    </label>
                </div>
                <button
                    onClick={toggleLog}
                    className="flex w-full items-center justify-between border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 py-2 text-left text-[11px] font-black tracking-widest text-[var(--voxel-paper)] shadow-[3px_3px_0_var(--voxel-ink)]"
                >
                    <span>{logOpen ? '▼ 过程日志' : '▶ 过程日志'}（{displayLogs.length}）</span>
                    <span className="text-[9px] tracking-normal text-[var(--voxel-torch)]">仅当前可见内容</span>
                </button>
                {logOpen && (
                    <>
                        <button
                            type="button"
                            onClick={resumeLogFollow}
                            className="mt-1 border-2 border-[var(--voxel-ink)] bg-[var(--voxel-paper-dim)] px-2 py-1 text-[9px] font-black text-[var(--voxel-ink)] shadow-[2px_2px_0_var(--voxel-ink)]"
                        >
                            跟随最新
                        </button>
                        <div
                            ref={logRef}
                            data-testid="rpg-live-log"
                            onScroll={handleLogScroll}
                            className="mt-1 max-h-60 overflow-y-auto border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] p-3 text-[13px] leading-relaxed text-[var(--voxel-ink)] shadow-[3px_3px_0_var(--voxel-ink)] custom-scrollbar max-sm:max-h-40 max-sm:text-[11px]"
                        >
                            {displayLogs.length === 0 ? (
                                <div className="text-th-muted">暂无日志</div>
                            ) : (
                                displayLogs.map(log => (
                                    <div key={log.id} className="mb-2 border-b border-[var(--voxel-wood)]/35 pb-2 last:border-0">
                                        {log.isSystem ? (
                                            <span className="font-black text-[var(--voxel-grass-dark)]">[系统] </span>
                                        ) : (
                                            <span className="font-black text-[var(--voxel-dead-stamp)]">[{log.speakerId ?? '?'}号] </span>
                                        )}
                                        <span className="whitespace-pre-wrap break-words">{log.content}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* 逐票开票板：投票阶段实时显示已投出的票 */}
            {voteBoard && (
                <div className="pointer-events-none absolute left-1/2 top-16 z-[45] max-w-[min(90vw,42rem)] -translate-x-1/2 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-3 py-1.5 shadow-[3px_3px_0_var(--voxel-ink)]">
                    <div className="text-[9px] font-black tracking-widest" style={{ color: 'var(--voxel-wood-dark)' }}>开票板</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                        {voteDetailPublic
                            ? voteBoard.map(row => (
                                <span key={row.id} className="border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood)] px-1.5 py-0.5 text-[10px] font-black text-[var(--voxel-paper)]">
                                    {row.voter}号 → {row.target ? `${row.target}号` : '弃票'}
                                </span>
                            ))
                            : <span className="text-[10px] font-black" style={{ color: 'var(--voxel-ink)' }}>已投出 {voteBoard.length} 票（明细不公开）</span>}
                    </div>
                </div>
            )}

            {/* 快闪横幅：出局/自爆/警徽/死亡，独立于字幕与日志的显性反馈 */}
            {flash && flashVisible && (
                <div key={flash.id} className="vw-flash pointer-events-none absolute left-1/2 top-[15%] z-[75] -translate-x-1/2">
                    <div className="border-4 border-[var(--voxel-ink)] px-5 py-2 text-xl font-black text-white shadow-[5px_5px_0_var(--voxel-ink)]" style={{ background: flash.tone }}>
                        {flash.text}
                    </div>
                </div>
            )}

            {/* 回放控制条 / 结算面板：createPortal 到 body 层（z-85），脱离本组件 z-40 的
                stacking context——否则会被工具栏(z-60)与输入面板(z-100)压住 */}
            {createPortal(
                <>
            {isReplayMode && (
                <div className="pointer-events-auto fixed left-1/2 top-3 z-[85] flex -translate-x-1/2 items-center gap-2 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-3 py-1.5 text-[11px] font-black shadow-[3px_3px_0_var(--voxel-ink)]" style={{ color: 'var(--voxel-ink)' }}>
                    <span>回放 {replayProgress.current}/{replayProgress.total}</span>
                    <button
                        type="button"
                        onClick={() => setReplayPaused(value => !value)}
                        className="border-2 border-[var(--voxel-ink)] px-2 py-0.5"
                    >
                        {replayPaused ? '▶ 继续' : '⏸ 暂停'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setExitGame()}
                        className="border-2 border-[var(--voxel-ink)] px-2 py-0.5"
                    >
                        退出回放
                    </button>
                </div>
            )}

            {/* 结算面板：游戏结束自动弹出（对齐 2D 模式的战利品箱） */}
            {gameResult && winnerMeta && settlementForEndedAt === gameResult.endedAt && !settlementMinimized && (
                <div className="pointer-events-auto fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4">
                    <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto custom-scrollbar border-[4px] border-[var(--voxel-ink)] shadow-[8px_8px_0_var(--voxel-ink)]" style={{ background: 'var(--voxel-paper-dim)', color: 'var(--voxel-ink)' }}>
                        <div className="border-b-[4px] border-[var(--voxel-ink)] p-5 text-white" style={{ background: winnerMeta.bg }}>
                            <div className="text-[11px] font-black tracking-[0.2em]">游戏结算</div>
                            <div className="mt-2 text-3xl font-black">{winnerMeta.text}</div>
                            <div className="mt-1 text-sm font-black">{gameResult.reasonText}</div>
                        </div>
                        <div className="grid gap-3 p-4 sm:grid-cols-2">
                            <div className="border-[3px] border-[var(--voxel-ink)] p-3" style={{ background: 'var(--voxel-paper)' }}>
                                <div className="text-xs font-black">存活玩家</div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {aliveResultPlayers.length === 0 && <span className="text-[10px] opacity-60">无</span>}
                                    {aliveResultPlayers.map(p => (
                                        <span key={p.id} className="px-2 py-1 text-[10px] font-black text-white" style={{ background: 'var(--voxel-grass-dark)' }}>
                                            {p.seatNumber}号 · {visibleRoleLabels[p.id] ?? '未知职业'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="border-[3px] border-[var(--voxel-ink)] p-3" style={{ background: 'var(--voxel-paper)' }}>
                                <div className="text-xs font-black">出局玩家</div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {deadResultPlayers.length === 0 && <span className="text-[10px] opacity-60">无</span>}
                                    {deadResultPlayers.map(p => (
                                        <span key={p.id} className="px-2 py-1 text-[10px] font-black text-white" style={{ background: 'var(--voxel-redstone)' }}>
                                            {p.seatNumber}号 · {visibleRoleLabels[p.id] ?? '未知职业'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {(gameEvaluation?.scores?.length ?? 0) > 0 && (
                            <div className="border-t-[4px] border-[var(--voxel-ink)] p-4">
                                <div className="text-xs font-black">本局评分（MVP=胜方最高分 · SVP=败方最高分）</div>
                                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                                    {gameEvaluation!.scores.map(ps => {
                                        const p = players.find(pl => pl.id === ps.playerId);
                                        return (
                                            <div key={ps.playerId} className="flex items-center justify-between gap-1 border-[2px] border-[var(--voxel-ink)] px-2 py-1 text-[10px] font-black" style={{ background: 'var(--voxel-paper)' }}>
                                                <span>{p ? `${p.seatNumber}号` : `${ps.playerId}号`}</span>
                                                <span className="flex items-center gap-1">
                                                    {ps.isMvp && <span className="px-1 py-0.5 text-[9px] text-white" style={{ background: 'var(--voxel-grass-dark)' }}>MVP</span>}
                                                    {ps.isSvp && <span className="px-1 py-0.5 text-[9px] text-white" style={{ background: 'var(--voxel-water, #3b6ea5)' }}>SVP</span>}
                                                    <span>{ps.score}分</span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-3 border-t-[4px] border-[var(--voxel-ink)] p-4">
                            <span className="text-xs font-black">
                                DAY {gameResult.turn} · 警长 {gameResult.sheriffId ? `${gameResult.sheriffId}号` : '无'} · 存活 {aliveResultPlayers.length}/{players.length}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSettlementMinimized(true)}
                                    className="border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-3 py-1.5 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]"
                                >
                                    收起面板
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        // 统一走房间退出分发：单机直接退出，联机按 host/guest 分支通知对端
                                        if (onExitRequest) { onExitRequest(); return; }
                                        if (window.confirm('返回主页？对局已自动存档，可在「历史」中回顾。')) setExitGame();
                                    }}
                                    className="border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 py-1.5 text-xs font-black text-[var(--voxel-paper)] shadow-[3px_3px_0_var(--voxel-ink)]"
                                >
                                    返回主页
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {gameResult && settlementForEndedAt === gameResult.endedAt && settlementMinimized && (
                <button
                    type="button"
                    onClick={() => setSettlementMinimized(false)}
                    className="pointer-events-auto fixed bottom-3 right-3 z-[85] border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 py-1.5 text-[10px] font-black tracking-widest text-[var(--voxel-torch)] shadow-[3px_3px_0_var(--voxel-ink)]"
                >
                    查看结算
                </button>
            )}
                </>
                , document.body)}
        </div>
    );
};

export default RpgHud;
