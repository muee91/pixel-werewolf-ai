import React, { useRef, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { useAtomValue } from 'jotai';
import { replayPerspectiveAtom, isTheaterModeAtom, playersAtom, debugGodViewAtom } from '../store';
import { GamePhase, GameLog, WOLF_ROLES } from '../types';
import { shouldShowLogForViewer } from '../utils/visibility';
import { PixelAvatarHead } from './game/voxel/primitives';

const cleanContent = (text: string) => {
    if (!text) return "";
    return text.replace(/[\(（][^\)）]*[\)）]/g, '').trim();
};

interface LogItemProps {
    log: GameLog;
    viewerId?: number;
}

const LogItemComponent: React.FC<LogItemProps> = ({ log, viewerId }) => {
    const perspective = useAtomValue(replayPerspectiveAtom);
    const isReplay = useAtomValue(isTheaterModeAtom);
    const players = useAtomValue(playersAtom);
    const debugGodView = useAtomValue(debugGodViewAtom);

    const humanPlayer = players.find(p => p.isHuman);
    const isVisible = shouldShowLogForViewer(log, {
        isReplay,
        perspective,
        players,
        humanPlayer,
        debugGodView,
        viewerId,
    });

    if (!isVisible) return null;

    const displayContent = cleanContent(log.content);
    const finalContent = displayContent || log.content;
    const speakerPlayer = log.speakerId ? players.find(p => p.id === log.speakerId) : null;
    const avatarSeed = speakerPlayer?.avatarSeed ?? (log.speakerId ? log.speakerId + 100 : 0);

    const isSelf = !log.isSystem && !!speakerPlayer && !!humanPlayer && speakerPlayer.id === humanPlayer.id;
    const speakerName = log.speakerName ? log.speakerName : `${log.speakerId}号玩家`;

    const getRoleColor = (role?: number) => {
        if (!role) return 'var(--color-muted)';
        const player = players.find(p => p.id === role);
        if (!player) return 'var(--color-muted)';
        if (WOLF_ROLES.includes(player.role)) return 'var(--color-wolf)';
        return 'var(--color-god)';
    };

    const getPhaseIcon = (phase: GamePhase) => {
        switch (phase) {
            case GamePhase.KNIGHT_CHALLENGE: return '⚔️ ';
            case GamePhase.WOLF_EXPLODE: return '💥 ';
            case GamePhase.SHERIFF_WITHDRAW: return '🏳️ ';
            case GamePhase.CUPID_LINK: return '💘 ';
            case GamePhase.MERCHANT_ACTION: return '✨ ';
            case GamePhase.STONE_GHOST_ACTION: return '🗿 ';
            case GamePhase.GRAVEKEEPER_ACTION: return '🪦 ';
            case GamePhase.DEMON_HUNTER_ACTION: return '🏹 ';
            case GamePhase.DISCUSSION_ROUND_TWO: return '🗣️ ';
            default: return '';
        }
    };

    return (
        <div className={clsx(
            "mb-2",
            log.isSystem ? "text-center my-1" : "",
        )}>
            {log.isSystem ? (
                <div
                    className={clsx(
                        "inline-block rounded-full font-bold tracking-wider whitespace-pre-wrap",
                        "px-2.5 py-0.5 text-[9px] sm:text-[10px]",
                    )}
                    style={{
                        background: 'var(--voxel-paper-dim)',
                        color: 'var(--voxel-ink)',
                        opacity: 0.8,
                    }}
                >
                    {getPhaseIcon(log.phase)}{finalContent}
                </div>
            ) : (
                <div className={clsx(
                    "flex gap-1.5",
                    isSelf ? "flex-row-reverse" : "flex-row",
                    "gap-1"
                )}>
                    <div
                        className="flex-none rounded-full overflow-hidden shrink-0"
                        style={{
                            width: 28,
                            height: 28,
                            border: `2px solid ${getRoleColor(log.speakerId)}`,
                        }}
                    >
                        <PixelAvatarHead seed={avatarSeed} className="w-full h-full" />
                    </div>
                    <div className={clsx(
                        "flex flex-col max-w-[92%]",
                        isSelf ? "items-end" : "items-start"
                    )}>
                        {!isSelf && (
                            <div
                                className={clsx(
                                    "flex items-center gap-1 leading-none",
                                    "text-[9px]"
                                )}
                                style={{ color: 'var(--voxel-paper-dim)' }}
                            >
                                <span style={{ color: getRoleColor(log.speakerId) }}>{speakerName}</span>
                                {log.visibleTo && <span style={{ color: 'var(--color-accent3)' }}>[私聊]</span>}
                            </div>
                        )}
                        <div
                            className={clsx(
                                "whitespace-pre-wrap leading-relaxed font-medium break-words",
"px-3 py-2.5 text-sm md:text-[15px]",
                            )}
                            style={{
                                borderRadius: isSelf
                                    ? 'var(--radius) var(--radius) 2px var(--radius)'
                                    : 'var(--radius) var(--radius) var(--radius) 2px',
                                background: isSelf
                                    ? 'var(--voxel-torch)'
                                    : 'var(--voxel-paper)',
                                color: 'var(--voxel-ink)',
                                border: isSelf ? 'none' : '2px solid var(--voxel-ink)',
                                borderLeft: log.visibleTo && !isSelf ? `3px solid var(--color-accent3)` : undefined,
                            }}
                        >
                            {finalContent}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const LogItem = React.memo(LogItemComponent);

export const AutoScrollLog = ({ logs, className, viewerId }: { logs: GameLog[], className?: string, viewerId?: number }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const isNearBottomRef = useRef(true);
    const autoFollowRef = useRef(true);
    // 日志流呈现全部内容（含玩家发言），只过滤事件流调试痕迹（兼容仍内嵌痕迹的旧存档）
    const feedLogs = useMemo(() => logs.filter(l => l.debugType !== 'EVENT_TRACE'), [logs]);
    const lastLog = feedLogs.length ? feedLogs[feedLogs.length - 1] : null;
    const lastLogId = lastLog?.id ?? 'empty';
    const lastLogContentLength = lastLog?.content?.length ?? 0;

    const checkNearBottom = () => {
        const el = scrollRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    };

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handleScroll = () => {
            const nearBottom = checkNearBottom();
            isNearBottomRef.current = nearBottom;
            autoFollowRef.current = nearBottom;
        };
        const pauseAutoFollow = () => {
            autoFollowRef.current = false;
        };

        el.addEventListener('scroll', handleScroll, { passive: true });
        el.addEventListener('pointerdown', pauseAutoFollow, { passive: true });
        el.addEventListener('wheel', pauseAutoFollow, { passive: true });
        el.addEventListener('touchstart', pauseAutoFollow, { passive: true });

        return () => {
            el.removeEventListener('scroll', handleScroll);
            el.removeEventListener('pointerdown', pauseAutoFollow);
            el.removeEventListener('wheel', pauseAutoFollow);
            el.removeEventListener('touchstart', pauseAutoFollow);
        };
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (!autoFollowRef.current && !isNearBottomRef.current) return;
        const scrollToLatest = () => {
            el.scrollTop = el.scrollHeight;
            isNearBottomRef.current = true;
            autoFollowRef.current = true;
        };
        const rafId = window.requestAnimationFrame(() => {
            scrollToLatest();
            window.requestAnimationFrame(scrollToLatest);
        });
        return () => window.cancelAnimationFrame(rafId);
    }, [feedLogs.length, lastLogId, lastLogContentLength]);

    return (
        <div
            ref={scrollRef}
            className={clsx("overflow-y-auto custom-scrollbar relative", className)}
            style={{ touchAction: 'pan-y', overscrollBehavior: 'auto', WebkitOverflowScrolling: 'touch', scrollbarGutter: 'stable' }}
        >
            {feedLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-50 text-xl" style={{ color: 'var(--voxel-paper-dim)' }}>
                    等待记录...
                </div>
            ) : (
                <div className="w-full py-1">
                    {feedLogs.map((log) => <LogItem key={log.id} log={log} viewerId={viewerId} />)}
                </div>
            )}
        </div>
    );
};
