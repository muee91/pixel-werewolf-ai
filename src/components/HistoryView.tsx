
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import { McSpriteCanvas, PixelAvatarHead } from './game/voxel/primitives';
import {
    appScreenAtom,
    gameArchivesAtom,
    gameArchivesLoadableAtom,
    loadGameArchiveAtom,
    globalApiConfigAtom,
    actorProfilesAtom,
    ttsPresetsAtom,
    minimizedGameAtom,
} from '../store';
import { remoteServerConfigAtom } from '../atoms';
import { GameArchive, GameLog, ROLE_INFO, PHASE_LABELS, TTSPreset, WOLF_ROLES, Role } from '../types';
import { normalizeGameArchive } from '../utils/archive';
import { AudioService, PrefetchResult } from '../audio';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface PodcastGameArchive extends GameArchive {
    type: 'PODCAST';
    topic: string;
}



const getWinnerText = (winner: GameArchive['winner']) => winner === 'GOOD' ? '好人胜利' : winner === 'WOLF' ? '狼人胜利' : '未知结果';

const getWinnerClasses = (winner: GameArchive['winner']) => winner === 'GOOD'
    ? 'bg-th-accent1/10 text-th-accent1 border-th-accent1/20'
    : winner === 'WOLF'
        ? 'bg-th-accent2/10 text-th-accent2 border-th-accent2/20'
        : 'bg-th-bg2 text-th-muted border-th-border';

const getFallbackResultReason = (logs: GameLog[]) => {
    const settlementLog = logs.slice().reverse().find(log => log.content.includes('胜利原因：'));
    return settlementLog?.content.match(/胜利原因：(.+)/)?.[1] || '暂无结构化胜利原因';
};

const getKeyEvents = (game: GameArchive) => {
    if (game.keyEvents?.length) return game.keyEvents.slice(-8);
    return game.logs
        .filter(log => log.isSystem && (/游戏结算|死亡|出局|放逐|警长|平票|警徽|投票结果|猎人开枪|天亮|昨夜/.test(log.content) || log.debugType === 'VOTE_TALLY'))
        .slice(-8)
        .map(log => `Day ${log.turn} · ${log.content.split('\n')[0]}`);
};

const downloadJson = async (payload: unknown, filename: string) => {
    const isNative = Capacitor.isNativePlatform();
    if (isNative) {
        try {
            const content = JSON.stringify(payload, null, 2);
            const savedFile = await Filesystem.writeFile({
                path: filename,
                data: content,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
            });
            try {
                await Share.share({
                    title: filename,
                    text: '对局记录已保存到 Documents 目录，也可分享到其他应用',
                    url: savedFile.uri,
                    dialogTitle: '导出对局',
                });
            } catch {
                alert(`对局记录已保存到：${savedFile.uri}`);
            }
        } catch (error) {
            alert(`导出失败：${error}`);
        }
    } else {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }
};

const sanitizeShareLog = (log: GameLog) => {
    const { debugData, thought, strategySummary, modelName, durationMs, ...safeLog } = log;
    return safeLog;
};

const formatExportTimestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const handleExportArchive = async (archive: GameArchive, e: React.MouseEvent, mode: 'full' | 'share' = 'full') => {
    e.stopPropagation();
    const game = normalizeGameArchive(archive);
    const publicLogs = game.logs
        .filter(log => !log.visibleTo?.length && !log.debugType && !log.debugData)
        .map(sanitizeShareLog);
    const summary = {
        id: game.id,
        timestamp: game.timestamp,
        playerCount: game.playerCount,
        winner: game.winner,
        result: game.result ?? null,
        turnCount: game.turnCount,
        keyEvents: getKeyEvents(game),
        debugLogCount: game.debugLogCount ?? game.logs.filter(log => !!log.debugType || !!log.debugData).length,
        publicLogCount: game.publicLogCount ?? game.logs.filter(log => !log.visibleTo?.length && !log.debugType).length
    };
    const fullPlayers = game.players.map(player => ({
        id: player.id,
        seatNumber: player.seatNumber,
        role: player.role,
        roleLabel: ROLE_INFO[player.role]?.label || player.role,
        status: player.status,
        isHuman: !!player.isHuman
    }));

    if (mode === 'share') {
        const payload = {
            app: 'ai-werewolf-simulator',
            exportMode: 'share',
            exportedAt: new Date().toISOString(),
            summary: {
                ...summary,
                debugLogCount: undefined
            },
            players: fullPlayers,
            logs: publicLogs,
            timeline: game.timeline.map(event => ({
                id: event.id,
                type: event.type,
                speakerName: event.speakerName,
                text: event.text,
                timestamp: event.timestamp,
                isPrivate: !!event.isPrivate
            }))
        };
        await downloadJson(payload, `werewolf-分享对局-${formatExportTimestamp()}-${game.id}.json`);
        return;
    }

    const payload = {
        app: 'ai-werewolf-simulator',
        exportMode: 'full',
        exportedAt: new Date().toISOString(),
        summary,
        players: fullPlayers,
        logs: game.logs,
        timeline: game.timeline
    };
    await downloadJson(payload, `werewolf-完整对局记录-${formatExportTimestamp()}-${game.id}.json`);
};

const HistoryView = () => {
    const setScreen = useSetAtom(appScreenAtom);

    const archivesLoadable = useAtomValue(gameArchivesLoadableAtom);
    const setArchives = useSetAtom(gameArchivesAtom);
    const archivesData = archivesLoadable.state === 'hasData' ? archivesLoadable.data : null;
    // 必须 memo：normalizeGameArchive 会深拷贝并全量扫描 logs，
    // 若每次渲染重建数组，下面的 checkAllCoverage 依赖随之变化，
    // effect 每次渲染都重跑 → setAudioCoverage → 再渲染，形成无限循环。
    const archives = useMemo(
        () => archivesData ? archivesData.map(normalizeGameArchive) : [],
        [archivesData]
    );
    const isArchivesLoading = archivesLoadable.state === 'loading';

    const loadGame = useSetAtom(loadGameArchiveAtom);
    const minimizedGame = useAtomValue(minimizedGameAtom);
    // 有最小化进行中的对局时，任何进入回放的路径都要先确认覆盖
    const confirmLoadOverLiveGame = () =>
        !minimizedGame.enabled || window.confirm('当前有一局进行中（已最小化），回放将放弃该局。确定回放？');

    const globalConfig = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);

    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
    const [audioCoverage, setAudioCoverage] = useState<Record<string, number>>({});
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [activeAudioJobId, setActiveAudioJobId] = useState<string | null>(null);
    const [generatingStatus, setGeneratingStatus] = useState<string>("");
    const [currentPage, setCurrentPage] = useState(1);
    const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
    const PAGE_SIZE = 10;

    const checkAllCoverage = useCallback(async () => {
        if (archives.length === 0) return;
        const coverage: Record<string, number> = {};
        await Promise.all(archives.map(async (game) => {
            if (!game.timeline || game.timeline.length === 0) {
                coverage[game.id] = 0;
                return;
            }
            const keys = game.timeline.map(t => t.audioKey);
            const found = await AudioService.getInstance().checkCacheStatus(keys);
            coverage[game.id] = Math.floor((found / keys.length) * 100);
        }));
        setAudioCoverage(coverage);
    }, [archives]);

    useEffect(() => {
        checkAllCoverage();
    }, [checkAllCoverage]);

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        if (deleteConfirmId === id) {
            const newArchives = archives.filter(a => a.id !== id);
            setArchives(newArchives);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(id);
            setTimeout(() => {
                setDeleteConfirmId(prev => prev === id ? null : prev);
            }, 3000);
        }
    };

    const handleDownloadAudio = async (gameId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (activeAudioJobId) return;
        const game = archives.find(a => a.id === gameId);
        if (!game || !game.timeline || game.timeline.length === 0) return;

        setActiveAudioJobId(gameId);
        setDownloadProgress(prev => ({ ...prev, [gameId]: 0 }));

        const total = game.timeline.length;
        const timeline = game.timeline;
        const CONCURRENCY = 3;

        try {
            const processEvent = async (index: number) => {
                const event = timeline[index];

                setGeneratingStatus(`${index + 1}/${total}: ${event.speakerName}`);

                let ttsPresetToUse: TTSPreset;
                let voiceIdToUse: string;

                if (event.type === 'NARRATOR') {
                    const narratorActor = actors.find(a => a.id === globalConfig.narratorActorId) || actors[0];
                    const narratorTts = ttsPresets.find(p => p.id === narratorActor.ttsPresetId) || ttsPresets[0];

                    voiceIdToUse = narratorActor.voiceId;
                    ttsPresetToUse = narratorTts;
                } else {
                    const seatNumber = Number(event.speakerName?.match(/^(\d+)号/)?.[1]);
                    const player = game.players.find(p => p.seatNumber === seatNumber || p.id === seatNumber);
                    const actor = player ? actors.find(a => a.id === player.actorId) : null;
                    const actorTts = actor ? ttsPresets.find(p => p.id === actor.ttsPresetId) : null;

                    if (actor && actorTts) {
                        voiceIdToUse = actor.voiceId;
                        ttsPresetToUse = actorTts;
                    } else {
                        voiceIdToUse = event.voiceId;
                        ttsPresetToUse = {
                            id: 'temp-replay',
                            name: 'Temp Replay',
                            provider: event.ttsProvider,
                        };
                    }
                }

                let result: PrefetchResult = 'FAILED';
                let attempts = 0;

                while (result === 'FAILED' && attempts < 3) {
                    try {
                        result = await AudioService.getInstance().prefetch(
                            event.text,
                            voiceIdToUse,
                            event.audioKey,
                            ttsPresetToUse,
                            1.0,
                            remoteConfig
                        );
                    } catch (err) {
                        console.warn("Prefetch error", err);
                    }

                    if (result === 'FAILED') {
                        attempts++;
                        if (attempts < 3) await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                    }
                }
                return result;
            };

            for (let i = 0; i < total; i += CONCURRENCY) {
                const batchIndices = Array.from({ length: Math.min(CONCURRENCY, total - i) }, (_, k) => i + k);

                await Promise.all(batchIndices.map(idx => processEvent(idx)));

                const completedCount = Math.min(i + CONCURRENCY, total);
                setDownloadProgress(prev => ({ ...prev, [gameId]: Math.floor((completedCount / total) * 100) }));
            }

            await checkAllCoverage();

        } catch (error) {
            console.error("Batch download halted:", error);
            alert("生成过程中断，请重试。");
        } finally {
            setGeneratingStatus("");
            setActiveAudioJobId(null);
            setTimeout(() => {
                setDownloadProgress(prev => { const next = { ...prev }; delete next[gameId]; return next; });
            }, 1000);
        }
    };

    return (
        <div
            className="vw-settings w-full bg-th-bg flex flex-col relative overflow-hidden"
            style={{ height: '100dvh' }}
        >
            <div className={clsx(
                "flex items-center min-h-14 sm:min-h-16 bg-th-card/70 border-b-[3px] border-th-border sticky top-0 z-20 shadow-[3px_3px_0_var(--voxel-ink)]",
                "px-6"
            )}>
                <button onClick={() => setScreen('HOME')} className="flex items-center text-th-accent1 font-bold hover:text-th-accent1/80 transition-colors">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    主页
                </button>
                <div className="absolute left-1/2 transform -translate-x-1/2 text-lg font-black text-th-fg tracking-tight">历史对局</div>
            </div>

            <div className={clsx(
                "flex-1 min-h-0 overflow-y-auto custom-scrollbar relative z-10 max-w-4xl mx-auto w-full space-y-4 pb-[calc(6rem+var(--safe-area-inset-bottom))]",
                "p-4"
            )}>
                {isArchivesLoading ? (
                    <div className="flex flex-col items-center justify-center mt-20 gap-4">
                        <div className="w-10 h-10 border-4 border-th-accent1/20 border-t-th-accent1 rounded-full animate-spin"></div>
                        <p className="text-th-muted font-bold animate-pulse">加载历史记录中...</p>
                    </div>
                ) : archives.length === 0 ? (
                    <div className="text-center text-th-muted mt-20 flex flex-col items-center">
                        <div className="mb-4 opacity-50"><McSpriteCanvas name="book" px={5} /></div>
                        <p className="text-lg font-medium">暂无历史记录</p>
                        <p className="text-xs mt-2">完成一局游戏后会自动保存到这里</p>
                    </div>
                ) : (
                    (() => {
                        const reversed = archives.slice().reverse();
                        const totalPages = Math.ceil(reversed.length / PAGE_SIZE);
                        const paged = reversed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
                        return (
                            <>
                                {paged.map((game) => {
                                    const isCollapsed = collapsedCards.has(game.id);
                                    const isDownloading = downloadProgress[game.id] !== undefined;
                                    const coverage = audioCoverage[game.id] || 0;
                                    const isComplete = coverage === 100;
                                    const hasPartial = coverage > 0 && coverage < 100;
                                    const isPodcast = (game as PodcastGameArchive).type === 'PODCAST';
                                    const resultReason = game.result?.reasonText || getFallbackResultReason(game.logs);
                                    const alivePlayers = game.result ? game.players.filter(p => game.result?.alivePlayerIds.includes(p.id)) : game.players.filter(p => p.status === 'ALIVE');
                                    const deadPlayers = game.result ? game.players.filter(p => game.result?.deadPlayerIds.includes(p.id)) : game.players.filter(p => p.status !== 'ALIVE');
                                    const humanPlayer = game.players.find(p => p.isHuman);
                                    const sheriffPlayer = game.result?.sheriffId ? game.players.find(p => p.id === game.result?.sheriffId) : null;
                                    const keyEvents = getKeyEvents(game);
                                    const debugLogCount = game.debugLogCount ?? game.logs.filter(log => !!log.debugType || !!log.debugData).length;
                                    const publicLogCount = game.publicLogCount ?? game.logs.filter(log => !log.visibleTo?.length && !log.debugType).length;

                                    return (
                                        <div
                                            key={game.id}
                                            onClick={() => {
                                                if (isDownloading) return;
                                                if (!confirmLoadOverLiveGame()) return;
                                                loadGame(game);
                                            }}
                                            className={clsx(
                                                "bg-th-card/70 rounded-none border-[3px] border-th-border p-4 transition-all duration-300 group relative",
                                                isDownloading ? "cursor-wait opacity-90" : "cursor-pointer hover:bg-th-card/70 hover:shadow-[4px_4px_0_var(--voxel-ink)] hover:border-th-accent1/20"
                                            )}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <div className="text-xl font-black text-th-fg tracking-tight leading-none flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
                                                        <span>{isPodcast ? '🎙️ 播客节目' : new Date(game.timestamp).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                                        <span className="text-sm font-bold text-th-muted mb-0.5">{new Date(game.timestamp).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div className="text-th-muted text-xs font-bold flex flex-wrap items-center gap-2 font-th-mono">
                                                        {isPodcast ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="opacity-70">💬</span>
                                                                <span className="truncate max-w-[200px]">主题: {(game as PodcastGameArchive).topic}</span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-1"><span className="opacity-70">👤</span><span>{game.playerCount}人</span></div>
                                                                <div className="w-0.5 h-0.5 rounded-full bg-th-border"></div>
                                                                <div className="flex items-center gap-1"><span className="opacity-70">🔄</span><span>Day {game.turnCount}</span></div>
                                                                <div className="w-0.5 h-0.5 rounded-full bg-th-border"></div>
                                                                <div className="flex items-center gap-1"><span className="opacity-70">👑</span><span>{sheriffPlayer ? `${sheriffPlayer.seatNumber}号` : '无警长'}</span></div>
                                                            </>
                                                        )}
                                                        <div className="w-0.5 h-0.5 rounded-full bg-th-border"></div>
                                                        <div className="flex items-center gap-1"><span className="opacity-70">💬</span><span>{game.logs.length}条</span></div>
                                                        {!isPodcast && <div className="flex items-center gap-1 text-th-muted"><span>公开 {publicLogCount}</span><span>Debug {debugLogCount}</span></div>}
                                                    </div>
                                                    {!isPodcast && (
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                                                            {game.isMultiplayer && <span className="rounded-none bg-th-accent3/10 px-2 py-1 text-th-accent3">联机模式</span>}
                                                            <span className="rounded-none bg-th-bg2 px-2 py-1 text-th-fg">原因：{resultReason}</span>
                                                            <span className="rounded-none bg-th-god/10 px-2 py-1 text-th-god">存活 {alivePlayers.length}</span>
                                                            <span className="rounded-none bg-th-bg2 px-2 py-1 text-th-fg">死亡 {deadPlayers.length}</span>
                                                            {humanPlayer && <span className="rounded-none bg-th-accent1/10 px-2 py-1 text-th-accent1">你是 {humanPlayer.seatNumber}号 {ROLE_INFO[humanPlayer.role]?.label || humanPlayer.role}</span>}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col items-end gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                                        <span className={clsx("px-2 py-1.5 rounded-none text-[10px] font-bold border shadow-[3px_3px_0_var(--voxel-ink)] whitespace-nowrap",
                                                            isPodcast ? "bg-th-accent1/10 text-th-accent1 border-th-accent1/20" : getWinnerClasses(game.winner)
                                                        )}>
                                                            {isPodcast ? '播客对谈' : getWinnerText(game.winner)}
                                                        </span>
                                                        {!isPodcast && !isDownloading && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (!confirmLoadOverLiveGame()) return;
                                                                        loadGame(game);
                                                                    }}
                                                                                    className="px-2 py-1.5 rounded-none transition-all flex items-center gap-1 border text-[10px] font-bold shadow-[3px_3px_0_var(--voxel-ink)] whitespace-nowrap text-white bg-th-accent2 border-th-accent2/40 hover:bg-th-accent2/80" title="回放本局"
                                                                >▶ 回放</button>
                                                                <button onClick={async (e) => await handleExportArchive(game, e, 'share')} className="px-2 py-1.5 rounded-none transition-all flex items-center gap-1 border text-[10px] font-bold shadow-[3px_3px_0_var(--voxel-ink)] whitespace-nowrap text-th-god border-th-god/20 bg-th-god/10 hover:bg-th-god/20" title="导出分享版复盘 JSON">分享导出</button>
                                                                <button onClick={async (e) => await handleExportArchive(game, e, 'full')} className="px-2 py-1.5 rounded-none transition-all flex items-center gap-1 border text-[10px] font-bold shadow-[3px_3px_0_var(--voxel-ink)] whitespace-nowrap text-th-accent1 border-th-accent1/20 bg-th-accent1/10 hover:bg-th-accent1/20" title="导出完整复盘 JSON">完整排错导出</button>
                                                            </>
                                                        )}

                                                        {isDownloading ? (
                                                            <div className="flex items-center gap-1 bg-th-accent1/10 rounded-none px-2 py-1.5 text-[10px] text-th-accent1 font-bold border border-th-accent1/20 shadow-[3px_3px_0_var(--voxel-ink)]">
                                                                <div className="w-2.5 h-2.5 border-2 border-th-accent1 border-t-transparent rounded-full animate-spin"></div>
                                                                {downloadProgress[game.id]}%
                                                                <span className="ml-1 text-[9px] opacity-70 truncate max-w-[80px]">{generatingStatus}</span>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => handleDownloadAudio(game.id, e)}
                                                                className={clsx(
                                                                    "px-2 py-1.5 rounded-none transition-all flex items-center gap-1 border text-[10px] font-bold shadow-[3px_3px_0_var(--voxel-ink)] whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50",
                                                                    isComplete ? "text-th-god border-th-god/20 bg-th-god/10 hover:bg-th-god/20" :
                                                                        hasPartial ? "text-th-accent1 border-th-accent1/20 bg-th-accent1/10 hover:bg-th-accent1/20" :
                                                                            "text-th-fg border-th-border bg-th-card/70 hover:bg-th-bg2"
                                                                )}
                                                                disabled={!!activeAudioJobId && activeAudioJobId !== game.id}
                                                            >
                                                                {isComplete ? (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg><span>已生成</span></>) : hasPartial ? (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span>补全 {coverage}%</span></>) : (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><span>生成语音</span></>)}
                                                            </button>
                                                        )}

                                                        {!isDownloading && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setCollapsedCards(prev => { const next = new Set(prev); if (next.has(game.id)) next.delete(game.id); else next.add(game.id); return next; }); }}
                                                                className="text-th-border hover:text-th-muted transition-colors p-1"
                                                                title={isCollapsed ? "展开详情" : "折叠详情"}
                                                            >
                                                                <svg className={clsx("w-4 h-4 transition-transform", isCollapsed ? "" : "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                            </button>
                                                        )}

                                                        {!isDownloading && (
                                                            <button
                                                                onClick={(e) => handleDelete(game.id, e)}
                                                                className={clsx(
                                                                    "w-12 py-1.5 flex items-center justify-center rounded-none transition-all",
                                                                    deleteConfirmId === game.id ? "bg-th-accent2/10 text-th-accent2 text-[10px] font-bold" : "text-th-border hover:text-th-accent2 hover:bg-th-bg2"
                                                                )}
                                                            >
                                                                {deleteConfirmId === game.id ? "确认?" : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {!isCollapsed && (
                                                <div className="mt-3 pt-3 border-t-[3px] border-th-border">
                                                    {isPodcast ? (
                                                        <div className="text-[10px] font-bold text-th-muted">参与者: 主持人, 1号嘉宾, 2号嘉宾</div>
                                                    ) : (
                                                        <>
                                                            <div className="mb-3 grid gap-2 sm:grid-cols-2">
                                                                <div className="rounded-none bg-th-god/10 p-2">
                                                                    <div className="mb-1.5 text-[10px] font-black text-th-god">存活玩家</div>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {alivePlayers.length ? alivePlayers.map(p => <span key={p.id} className="rounded-none bg-th-card/80 px-2 py-1 text-[10px] font-bold text-th-god">{p.seatNumber}号 {ROLE_INFO[p.role]?.label || p.role}</span>) : <span className="text-[10px] text-th-muted">无</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="rounded-none bg-th-bg2 p-2">
                                                                    <div className="mb-1.5 text-[10px] font-black text-th-fg">死亡玩家</div>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {deadPlayers.length ? deadPlayers.map(p => <span key={p.id} className="rounded-none bg-th-card/80 px-2 py-1 text-[10px] font-bold text-th-fg">{p.seatNumber}号 {ROLE_INFO[p.role]?.label || p.role}</span>) : <span className="text-[10px] text-th-muted">无</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {keyEvents.length > 0 && (
                                                                <details className="mb-3 rounded-none bg-th-bg2 p-2 text-[11px] text-th-fg" onClick={(e) => e.stopPropagation()}>
                                                                    <summary className="cursor-pointer select-none font-black text-th-fg">关键事件时间线</summary>
                                                                    <div className="mt-2 space-y-1.5">
                                                                        {keyEvents.map((event, index) => <div key={`${game.id}-event-${index}`} className="rounded-none bg-th-card/80 px-2 py-1.5 font-bold">{event}</div>)}
                                                                    </div>
                                                                </details>
                                                            )}
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {game.players.map(p => (
                                                                    <div key={p.id} className="relative w-8 h-8 rounded-none overflow-hidden ring-2 ring-th-card shadow-[3px_3px_0_var(--voxel-ink)]" title={`${p.seatNumber}号 ${ROLE_INFO[p.role].label} ${p.status}`}>
                                                                        <PixelAvatarHead seed={p.avatarSeed} dead={p.status !== 'ALIVE'} className="w-full h-full" />
                                                                        <div className="absolute bottom-0 right-0 bg-th-bg/80 text-[8px] text-th-fg px-1 font-bold">{p.seatNumber}</div>
                                                                        {p.role === Role.WEREWOLF && <div className="absolute top-0 right-0 text-[8px] bg-th-wolf/80 p-0.5">🐺</div>}
                                                                        {p.status !== 'ALIVE' && <div className="absolute inset-0 bg-th-dead/45" />}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {!isDownloading && (
                                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                                    <div className="bg-th-accent1/90 text-white px-6 py-2 rounded-none font-bold shadow-[5px_5px_0_var(--voxel-ink)] flex items-center gap-2 transform scale-90 group-hover:scale-100 transition-transform">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                                                        回放对局
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {totalPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 pt-2 pb-4">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-2 rounded-none text-xs font-bold bg-th-card/70 border border-th-border text-th-fg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-th-bg2 transition-all"
                                        >
                                            ← 上一页
                                        </button>
                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                                .map((p, i, arr) => (
                                                    <React.Fragment key={p}>
                                                        {i > 0 && arr[i - 1] !== p - 1 && <span className="text-th-border text-xs px-1">...</span>}
                                                        <button
                                                            onClick={() => setCurrentPage(p)}
                                                            className={clsx(
                                                                "w-8 h-8 rounded-none text-xs font-bold transition-all",
                                                                p === currentPage ? "bg-th-accent1 text-white shadow-[3px_3px_0_var(--voxel-ink)]" : "bg-th-card/70 border border-th-border text-th-muted hover:bg-th-bg2"
                                                            )}
                                                        >
                                                            {p}
                                                        </button>
                                                    </React.Fragment>
                                                ))}
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-2 rounded-none text-xs font-bold bg-th-card/70 border border-th-border text-th-fg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-th-bg2 transition-all"
                                        >
                                            下一页 →
                                        </button>
                                    </div>
                                )}
                            </>
                        );
                    })()
                )}
            </div>
        </div>
    );
};

export default HistoryView;
