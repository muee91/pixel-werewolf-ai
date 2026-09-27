import React, { useCallback, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import {
    appScreenAtom,
    debugGodViewAtom,
    debugLogPanelOpenAtom,
    debugModeAtom,
    gamePhaseAtom,
    logsAtom,
    gameTracesAtom,
    playersAtom,
    turnCountAtom,
    isReplayModeAtom,
    globalApiConfigAtom
} from '../store';
import { PHASE_LABELS, ROLE_INFO } from '../types';

type DebugLogFilter = 'ALL' | 'EVENT' | 'AI' | 'SYSTEM' | 'PRIVATE' | 'DECISION';

const FILTER_LABELS: Record<DebugLogFilter, string> = {
    ALL: '全部',
    EVENT: '事件流',
    AI: '模型过程',
    SYSTEM: '系统',
    PRIVATE: '私聊',
    DECISION: '决策'
};

const STRATEGY_DEBUG_TYPES = new Set(['VOTE_STRATEGY', 'VOTE_TALLY', 'WOLF_EXPLODE_STRATEGY', 'KNIGHT_CHALLENGE_STRATEGY', 'SHERIFF_WITHDRAW_STRATEGY']);

const formatDuration = (durationMs?: number) => {
    if (typeof durationMs !== 'number') return null;
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
};

const DebugLogOverlay: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(debugLogPanelOpenAtom);
    const [debugMode, setDebugMode] = useAtom(debugModeAtom);
    const [godView, setGodView] = useAtom(debugGodViewAtom);
    const logs = useAtomValue(logsAtom);
    const traces = useAtomValue(gameTracesAtom);
    const players = useAtomValue(playersAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const turn = useAtomValue(turnCountAtom);
    const appScreen = useAtomValue(appScreenAtom);
    const isReplayMode = useAtomValue(isReplayModeAtom);
    const [globalConfig, setGlobalConfig] = useAtom(globalApiConfigAtom);
    const [logFilter, setLogFilter] = useState<DebugLogFilter>('ALL');
    const [playersCollapsed, setPlayersCollapsed] = useState(true);
    // 内容日志与事件流痕迹在此合并成完整调试视图；痕迹平时不混入过程日志/AI 上下文/存档
    const allLogs = useMemo(() => [...logs, ...traces].sort((a, b) => a.timestamp - b.timestamp), [logs, traces]);
    const filteredLogs = useMemo(() => {
        switch (logFilter) {
            case 'EVENT':
                return allLogs.filter(log => log.debugType === 'EVENT_TRACE');
            case 'AI':
                return allLogs.filter(log => log.debugType === 'AI_THINKING' || STRATEGY_DEBUG_TYPES.has(log.debugType || ''));
            case 'SYSTEM':
                return allLogs.filter(log => log.isSystem && !log.debugType);
            case 'PRIVATE':
                return allLogs.filter(log => !!log.visibleTo?.length);
            case 'DECISION':
                return allLogs.filter(log => STRATEGY_DEBUG_TYPES.has(log.debugType || ''));
            default:
                return allLogs;
        }
    }, [logFilter, allLogs]);
    const filterCounts = useMemo<Record<DebugLogFilter, number>>(() => ({
        ALL: allLogs.length,
        EVENT: traces.length,
        AI: allLogs.filter(log => log.debugType === 'AI_THINKING' || STRATEGY_DEBUG_TYPES.has(log.debugType || '')).length,
        SYSTEM: allLogs.filter(log => log.isSystem && !log.debugType).length,
        PRIVATE: allLogs.filter(log => !!log.visibleTo?.length).length,
        DECISION: allLogs.filter(log => STRATEGY_DEBUG_TYPES.has(log.debugType || '')).length
    }), [allLogs, traces.length]);

    const handleExportLogs = useCallback(() => {
        const exportedAt = new Date().toISOString();
        const exportPayload = {
            app: 'ai-werewolf-simulator',
            exportedAt,
            turn,
            phase,
            phaseLabel: PHASE_LABELS[phase] || phase,
            logFilter,
            logFilterLabel: FILTER_LABELS[logFilter],
            totalLogCount: allLogs.length,
            filteredLogCount: filteredLogs.length,
            players: players.map(player => ({
                id: player.id,
                seatNumber: player.seatNumber,
                role: player.role,
                roleLabel: ROLE_INFO[player.role]?.label || player.role,
                status: player.status,
                isHuman: !!player.isHuman,
                actorId: player.actorId
            })),
            // 「全部」视图下 filteredLogs 与 allLogs 完全相同，省略以避免导出体积翻倍
            ...(logFilter === 'ALL' ? {} : { filteredLogs }),
            allLogs
        };

        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `werewolf-调试日志-第${turn}天-${Date.now()}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [allLogs, filteredLogs, logFilter, phase, players, turn]);

    if (appScreen !== 'GAME') return null;

    if (!debugMode) return null;

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 z-[130] pointer-events-none">
                    <div className="absolute inset-0 bg-black/72 pointer-events-auto" onClick={() => setIsOpen(false)} />
                    <aside className="absolute right-3 top-3 bottom-16 w-[min(38rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-th-border/30 text-th-fg shadow-2xl pointer-events-auto flex flex-col" style={{ background: 'color-mix(in srgb, var(--color-bg) 96%, black)' }}>
                        <header className="flex-none border-b border-th-border/10 p-3 sm:p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-black tracking-widest text-th-accent1">调试日志</div>
                                    <div className="mt-1 truncate text-xs text-th-muted">Day {turn} · {PHASE_LABELS[phase]} · {players.length} seats</div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="shrink-0 rounded-full bg-th-border/10 p-2 text-th-muted hover:bg-th-border/20 hover:text-th-fg"
                                    title="关闭"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setGodView(!godView)}
                                    className={clsx(
                                        "rounded-xl px-2 py-1.5 text-[11px] font-bold transition-colors sm:px-3 sm:py-2 sm:text-xs",
                                        godView ? "bg-th-accent1 text-white" : "bg-th-border/10 text-th-muted hover:bg-th-border/15"
                                    )}
                                >
                                    上帝 {godView ? '开' : '关'}
                                </button>
                                <button
                                    onClick={handleExportLogs}
                                    className="rounded-xl bg-th-god/20 px-2 py-1.5 text-[11px] font-bold text-th-god hover:bg-th-god/30 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2 sm:text-xs"
                                    disabled={logs.length === 0}
                                    title="导出全量日志和当前筛选日志"
                                >
                                    导出
                                </button>
                                <button
                                    onClick={() => { setIsOpen(false); setGodView(false); setDebugMode(false); }}
                                    className="rounded-xl bg-th-border/10 px-2 py-1.5 text-[11px] font-bold text-th-muted hover:bg-th-border/15 sm:px-3 sm:py-2 sm:text-xs"
                                >
                                    关 Debug
                                </button>
                            </div>
                            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide sm:mt-3">
                                {(Object.keys(FILTER_LABELS) as DebugLogFilter[]).map(filter => (
                                    <button
                                        key={filter}
                                        onClick={() => setLogFilter(filter)}
                                        className={clsx(
                                            "shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition-colors sm:px-3",
                                            logFilter === filter
                                                ? "bg-th-accent1 text-white shadow-lg shadow-th-accent1/30"
                                                : "bg-th-border/10 text-th-muted hover:bg-th-border/15"
                                        )}
                                    >
                                        {FILTER_LABELS[filter]} <span className="opacity-70">{filterCounts[filter]}</span>
                                    </button>
                                ))}
                            </div>
                        </header>

                        <section className="flex-none border-b border-th-border/10 p-3 sm:p-4">
                            <button
                                onClick={() => setPlayersCollapsed(prev => !prev)}
                                className="flex w-full items-center justify-between gap-2 text-left"
                            >
                                <div className="min-w-0">
                                    <div className="text-xs font-black text-th-muted">玩家身份</div>
                                    <div className="mt-1 truncate text-[11px] text-th-muted">
                                        {players.length ? `存活 ${players.filter(p => p.status === 'ALIVE').length} / ${players.length}，点击${playersCollapsed ? '展开' : '收起'}` : '暂无对局玩家'}
                                    </div>
                                </div>
                                <span className="shrink-0 rounded-full bg-th-border/10 px-2 py-1 text-[10px] font-black text-th-muted">
                                    {playersCollapsed ? '展开' : '收起'}
                                </span>
                            </button>
                            {!playersCollapsed && (
                                <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                                    {players.length === 0 ? (
                                        <div className="col-span-2 text-th-muted">暂无对局玩家</div>
                                    ) : players.map(player => (
                                        <div key={player.id} className="rounded-xl bg-th-border/5 px-2 py-1.5 sm:px-3 sm:py-2">
                                            <span className="font-bold text-th-fg">{player.seatNumber}号</span>
                                            <span className="ml-1.5 text-th-accent1">{ROLE_INFO[player.role]?.label || player.role}</span>
                                            <span className="ml-1.5 text-th-muted">{player.status}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar sm:p-4" style={{ background: 'color-mix(in srgb, var(--color-bg) 97%, black)' }}>
                            {filteredLogs.length === 0 ? (
                                <div className="flex h-full items-center justify-center text-sm text-th-muted">当前筛选暂无日志</div>
                            ) : filteredLogs.slice().reverse().map(log => {
                                const durationText = formatDuration(log.durationMs);
                                const isEventTrace = log.debugType === 'EVENT_TRACE';
                                const eventKind = isEventTrace && log.debugData && typeof log.debugData.eventKind === 'string'
                                    ? log.debugData.eventKind
                                    : null;
                                const isAiFocus = logFilter === 'AI' && (log.debugType === 'AI_THINKING' || STRATEGY_DEBUG_TYPES.has(log.debugType || ''));
                                const isStrategyType = STRATEGY_DEBUG_TYPES.has(log.debugType || '');
                                const speakerRoleLabel = godView && log.speakerId ? ROLE_INFO[players.find(p => p.id === log.speakerId)?.role!]?.label : undefined;
                                return (
                                    <article
                                        key={log.id}
                                        className={clsx(
                                            "mb-2 rounded-2xl p-2.5 text-xs leading-relaxed ring-1 sm:mb-3 sm:p-3",
                                            isEventTrace
                                                ? "ring-th-god/35"
                                                : log.debugType === 'AI_THINKING' || isStrategyType
                                                    ? "ring-th-accent1/25"
                                                    : "ring-th-border/15"
                                        )}
                                        style={{
                                            background: isEventTrace
                                                ? 'color-mix(in srgb, var(--color-god) 12%, var(--color-card))'
                                                : (log.debugType === 'AI_THINKING' || isStrategyType)
                                                    ? 'color-mix(in srgb, var(--color-accent1) 10%, var(--color-card))'
                                                    : 'var(--color-card)',
                                        }}
                                    >
                                        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-th-muted">
                                            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            <span>Day {log.turn}</span>
                                            <span>{PHASE_LABELS[log.phase] || log.phase}</span>
                                            {isEventTrace && <span className="rounded bg-th-god/25 px-1.5 py-0.5 text-th-god">事件流</span>}
                                            {eventKind && <span className="rounded bg-th-border/20 px-1.5 py-0.5 text-th-fg/80">{eventKind}</span>}
                                            {log.debugType === 'AI_THINKING' && <span className="rounded bg-th-accent1/25 px-1.5 py-0.5 text-th-accent1">模型过程</span>}
                                            {log.debugType === 'VOTE_STRATEGY' && <span className="rounded bg-th-accent3/25 px-1.5 py-0.5 text-th-accent3">投票策略</span>}
                                            {log.debugType === 'VOTE_TALLY' && <span className="rounded bg-th-accent1/25 px-1.5 py-0.5 text-th-accent1">投票统计</span>}
                                            {log.debugType === 'WOLF_EXPLODE_STRATEGY' && <span className="rounded bg-th-accent2/25 px-1.5 py-0.5 text-th-accent2">自爆决策</span>}
                                            {log.debugType === 'KNIGHT_CHALLENGE_STRATEGY' && <span className="rounded bg-th-accent1/25 px-1.5 py-0.5 text-th-accent1">决斗决策</span>}
                                            {log.debugType === 'SHERIFF_WITHDRAW_STRATEGY' && <span className="rounded bg-th-accent1/25 px-1.5 py-0.5 text-th-accent1">退水决策</span>}
                                            {durationText && <span className="rounded bg-th-god/20 px-1.5 py-0.5 text-th-god">耗时 {durationText}</span>}
                                            {log.modelName && <span className="rounded bg-th-border/20 px-1.5 py-0.5 text-th-muted">{log.modelName}</span>}
                                            {log.isSystem && <span className="rounded bg-th-accent1/20 px-1.5 py-0.5 text-th-accent1">系统</span>}
                                            {godView && log.visibleTo && <span className="rounded bg-th-accent3/20 px-1.5 py-0.5 text-th-accent3">visibleTo: {log.visibleTo.join(',')}</span>}
                                        </div>
                                        <div className="font-bold text-th-fg">
                                            {log.speakerName || (log.speakerId ? `${log.speakerId}号玩家` : '上帝')}
                                            {speakerRoleLabel ? <span className="ml-1 rounded bg-th-border/30 px-1.5 py-0.5 text-th-muted text-[11px] font-medium">{speakerRoleLabel}</span> : null}
                                        </div>
                                        {isAiFocus && (
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                                <div className="rounded-xl p-2" style={{ background: 'color-mix(in srgb, var(--color-bg) 82%, var(--color-card))' }}>
                                                    <div className="text-th-muted">模型</div>
                                                    <div className="mt-0.5 break-words font-bold text-th-fg">{log.modelName || '未知'}</div>
                                                </div>
                                                <div className="rounded-xl p-2" style={{ background: 'color-mix(in srgb, var(--color-bg) 82%, var(--color-card))' }}>
                                                    <div className="text-th-muted">耗时</div>
                                                    <div className="mt-0.5 font-bold text-th-god">{durationText || '未记录'}</div>
                                                </div>
                                            </div>
                                        )}
                                        <div className={clsx(
                                            "mt-2 whitespace-pre-wrap break-words rounded-xl border px-3 py-2.5 text-[12px] leading-6",
                                            isEventTrace ? "border-th-god/25 text-th-fg" : "border-th-border/10 text-th-fg/92"
                                        )} style={{ background: 'color-mix(in srgb, var(--color-bg) 86%, black)' }}>
                                            {log.content}
                                        </div>
                                        {godView && log.strategySummary ? (
                                            <div className="mt-2 rounded-xl p-2 text-[11px] text-th-accent1 ring-1 ring-th-accent1/10" style={{ background: 'color-mix(in srgb, var(--color-accent1) 12%, var(--color-bg))' }}>
                                                <span className="font-bold text-th-accent1">公开摘要：</span>
                                                <span className="whitespace-pre-wrap break-words">{log.strategySummary}</span>
                                            </div>
                                        ) : (godView && (log.debugType === 'AI_THINKING' || isStrategyType)) ? (
                                            <div className="mt-2 rounded-xl p-2 text-[11px] text-th-accent1 ring-1 ring-th-accent1/10" style={{ background: 'color-mix(in srgb, var(--color-accent1) 12%, var(--color-bg))' }}>
                                                未返回公开摘要，可检查 `strategySummary` 输出约束。
                                            </div>
                                        ) : null}
                                        {godView && log.thought && <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-th-accent1/15 p-3 font-sans text-[11px] leading-5 text-th-accent1" style={{ background: 'color-mix(in srgb, var(--color-bg) 88%, var(--color-accent1))' }}>内部过程：{log.thought}</pre>}
                                        {log.debugData && (
                                            <details className={clsx(
                                                "mt-2 rounded-xl p-2 text-[11px] text-th-muted",
                                                isEventTrace ? "open:ring-1 open:ring-th-god/30" : "open:ring-1 open:ring-th-accent1/20"
                                            )} style={{ background: 'color-mix(in srgb, var(--color-bg) 82%, var(--color-card))' }}>
                                                <summary className={clsx(
                                                    "cursor-pointer select-none font-black",
                                                    isEventTrace ? "text-th-god" : "text-th-accent1"
                                                )}>
                                                    调试详情
                                                </summary>
                                                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 font-th-mono text-[10px] leading-5 text-th-fg custom-scrollbar" style={{ background: 'color-mix(in srgb, var(--color-bg) 94%, black)' }}>{JSON.stringify(log.debugData, null, 2)}</pre>
                                            </details>
                                        )}
                                    </article>
                                );
                            })}
                        </section>
                    </aside>
                </div>
            )}
        </>
    );
};

export default DebugLogOverlay;
