import React, { useRef, useEffect, useMemo, useState } from 'react';
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

// 系统行自带「上帝」小标时，去掉行首重复的「上帝:/上帝(私聊):」称呼；只动这一种前缀，其余原样保留
const stripGodPrefix = (text: string) => {
    const stripped = text.replace(/^上帝(?:\(私聊\))?\s*[：:]\s*/u, '').trim();
    return stripped || text;
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
        // 日志面板是深木底:狼名用暗面红变体(5.43:1),纯 --color-wolf 只有 2.97:1
        if (WOLF_ROLES.includes(player.role)) return 'var(--voxel-redstone-on-dark)';
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
            log.isSystem ? "my-1.5" : "",
        )}>
            {log.isSystem ? (
                // 系统/上帝播报：营火纸底上的窄横幅 + 「上帝」墨底小标，与玩家发言气泡明确区分。
                // inkSoft 文字在 paper-dim 底上 7.9:1；不透明度一律不用（craft floor 对比度红线）
                <div className="flex justify-center">
                    <div
                        className="flex max-w-[95%] items-start gap-1.5 border-2 px-2.5 py-1.5"
                        style={{
                            background: 'var(--voxel-paper-dim)',
                            borderColor: 'var(--voxel-ink)',
                        }}
                    >
                        <span
                            className="shrink-0 border-2 px-1 py-px text-xs font-black tracking-[0.1em]"
                            style={{ background: 'var(--voxel-ink)', color: 'var(--voxel-torch)', borderColor: 'var(--voxel-ink)' }}
                        >上帝</span>
                        <span
                            className="whitespace-pre-wrap break-words text-center text-xs font-bold leading-relaxed tracking-[0.05em]"
                            style={{ color: 'var(--voxel-ink-soft)' }}
                        >
                            {getPhaseIcon(log.phase)}{stripGodPrefix(finalContent)}
                        </span>
                    </div>
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
                        <PixelAvatarHead seed={avatarSeed} look={speakerPlayer?.look} className="w-full h-full" />
                    </div>
                    <div className={clsx(
                        "flex flex-col max-w-[92%]",
                        isSelf ? "items-end" : "items-start"
                    )}>
                        {!isSelf && (
                            <div
                                className={clsx(
                                    "flex items-center gap-1 leading-none",
                                    "text-xs"
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
    // 日志总是自动贴底，所以顶部那一行几乎永远是被横切一半的——不知道的人会以为渲染坏了。
    // 滚过 6px 就在顶部压一道 18px 渐隐，把「上面还有」讲清楚；滚回顶部自动收掉。
    const [fadeTop, setFadeTop] = useState(false);
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
            setFadeTop(el.scrollTop > 6);
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
            style={{
                touchAction: 'pan-y', overscrollBehavior: 'auto', WebkitOverflowScrolling: 'touch', scrollbarGutter: 'stable',
                ...(fadeTop ? { maskImage: 'linear-gradient(180deg, transparent 0, #000 18px)', WebkitMaskImage: 'linear-gradient(180deg, transparent 0, #000 18px)' } : null),
            }}
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
