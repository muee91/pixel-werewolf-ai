import { useState, useEffect, useRef, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { isInternalDebugLog } from '../utils/visibility';
import {
    gamePhaseAtom,
    playersAtom,
    logsAtom,
    exitGameAtom,
    isAutoPlayAtom,
    turnCountAtom,
    isTheaterModeAtom,
    isDaytimeAtom,
    replayPerspectiveAtom,
    isReplayModeAtom,
    minimizedGameAtom,
    appScreenAtom,
    llmThinkingAtom,
    debugGodViewAtom,
    gameResultAtom,
    gameEvaluationAtom,
    replayPausedAtom,
    humanInputPanelExpandedAtom,
    godStateAtom,
    globalApiConfigAtom,
    debugModeAtom,
    debugLogPanelOpenAtom,
    multiplayerRoleAtom,
    multiplayerStateAtom,
    currentSpeakerIdAtom,
    initGameAtom,
    actorProfilesAtom,
    ttsPresetsAtom,
    remoteServerConfigAtom,
} from '../store';
import { addToastAtom, isPausedAtom, uiConfigAtom } from '../atoms';
import { GamePhase, PHASE_LABELS, Role, ROLE_INFO, WOLF_ROLES, GAME_PRESETS, GameEvaluation } from '../types';
import { AudioService } from '../audio';
import { useGameEngine } from '../hooks/useGameEngine';
import { useTheaterEngine } from '../hooks/useTheaterEngine';
import { sendWsMessage } from '../multiplayer/wsClient';
import { createPauseStateMessage } from '../multiplayer/clientMessages';

const isEffectivelyAlive = (p: { status: string }) =>
    p.status === 'ALIVE' || p.status === 'IDIOT_REVEALED';

export const getRoleColor = (role: Role, wolfColor: string, godColor: string, villagerColor: string): string => {
    if (WOLF_ROLES.includes(role)) return wolfColor;
    if ([Role.SEER, Role.WITCH, Role.GUARD, Role.HUNTER, Role.IDIOT, Role.KNIGHT, Role.STONE_GHOST, Role.GRAVEKEEPER, Role.DEMON_HUNTER, Role.CUPID, Role.MIRACLE_MERCHANT].includes(role)) return godColor;
    return villagerColor;
};

export const toRoman = (n: number): string => {
    if (n <= 0) return String(n);
    const map: [number, string][] = [
        [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
    ];
    let result = '';
    for (const [val, sym] of map) {
        while (n >= val) { result += sym; n -= val; }
    }
    return result;
};

const CN_NUM: Record<number, string> = {
    1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
    6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
    11: '十一', 12: '十二',
};
export const toCnNum = (n: number): string => CN_NUM[n] || String(n);

export interface GameRoomState {
    players: ReturnType<typeof useAtomValue<typeof playersAtom>>;
    logs: ReturnType<typeof useAtomValue<typeof logsAtom>>;
    phase: GamePhase;
    isAuto: boolean;
    setIsAuto: (v: boolean | ((prev: boolean) => boolean)) => void;
    exitGame: () => void;
    turnCount: number;
    isTheater: boolean;
    isDay: boolean;
    perspective: string;
    setPerspective: (v: any) => void;
    replayPaused: boolean;
    setReplayPaused: (v: boolean | ((prev: boolean) => boolean)) => void;
    isReplayMode: boolean;
    setMinimizedGame: (v: any) => void;
    setScreen: (v: any) => void;
    llmThinking: typeof llmThinkingAtom.init;
    gameResult: any;
    gameEvaluation: GameEvaluation | null;
    debugGodView: boolean;
    humanInputPanelExpanded: boolean;
    godState: any;
    multiplayerRole: string | null;
    multiplayerState: any;
    isPaused: boolean;
    setIsPaused: (v: boolean | ((prev: boolean) => boolean)) => void;
    globalConfig: any;
    setGlobalConfig: (v: any) => void;
    ttsEnabled: boolean;
    ttsChecking: boolean;
    handleTtsToggle: () => Promise<void>;
    debugMode: boolean;
    setDebugLogOpen: (v: boolean) => void;
    currentSpeakerId: number | null;
    initGame: (presetKey: string) => void;
    uiConfig: any;

    humanPlayer: any;
    aliveResultPlayers: any[];
    deadResultPlayers: any[];
    sheriffPlayer: any;
    visibleLogs: any[];
    canSeeGodStateDetails: boolean;
    canSeeLoverInfo: boolean;
    humanProgressText: string;
    isNightPhase: boolean;
    isSetup: boolean;
    isGameOver: boolean;
    phaseLabel: string;

    showExitConfirm: boolean;
    setShowExitConfirm: (v: boolean | ((prev: boolean) => boolean)) => void;
    resultPanelMinimized: boolean;
    setResultPanelMinimized: (v: boolean | ((prev: boolean) => boolean)) => void;
    selectedPresetKey: string;
    setSelectedPresetKey: (v: any) => void;
    logExpanded: boolean;
    setLogExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
    isFullscreen: boolean;
    isLlmThinking: boolean;

    handleMinimize: () => void;
    handleConfirmExit: () => void;
    handleToggleFullscreen: () => void;
    handleAutoPlayToggle: () => void;

    showPhaseBanners: boolean;
    showGodViewHint: boolean;
}

export function useGameRoomState(): GameRoomState {
    const players = useAtomValue(playersAtom);
    const logs = useAtomValue(logsAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const [isAuto, setIsAuto] = useAtom(isAutoPlayAtom);
    const exitGame = useSetAtom(exitGameAtom);
    const turnCount = useAtomValue(turnCountAtom);
    const [isTheater] = useAtom(isTheaterModeAtom);
    const isDay = useAtomValue(isDaytimeAtom);
    const [perspective, setPerspective] = useAtom(replayPerspectiveAtom);
    const [replayPaused, setReplayPaused] = useAtom(replayPausedAtom);
    const isReplayMode = useAtomValue(isReplayModeAtom);
    const setMinimizedGame = useSetAtom(minimizedGameAtom);
    const setScreen = useSetAtom(appScreenAtom);
    const llmThinking = useAtomValue(llmThinkingAtom);
    const gameResult = useAtomValue(gameResultAtom);
    const gameEvaluation = useAtomValue(gameEvaluationAtom);
    const debugGodView = useAtomValue(debugGodViewAtom);
    const humanInputPanelExpanded = useAtomValue(humanInputPanelExpandedAtom);
    const godState = useAtomValue(godStateAtom);
    const multiplayerRole = useAtomValue(multiplayerRoleAtom);
    const multiplayerState = useAtomValue(multiplayerStateAtom);
    const [isPaused, setIsPaused] = useAtom(isPausedAtom);
    const [globalConfig, setGlobalConfig] = useAtom(globalApiConfigAtom);
    const ttsEnabled = globalConfig.enabled;
    const actors = useAtomValue(actorProfilesAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const addToast = useSetAtom(addToastAtom);
    const debugMode = useAtomValue(debugModeAtom);
    const setDebugLogOpen = useSetAtom(debugLogPanelOpenAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const initGame = useSetAtom(initGameAtom);
    const uiConfig = useAtomValue(uiConfigAtom);

    const isLlmThinking = llmThinking.status !== 'idle' && !!llmThinking.playerId;
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [resultPanelMinimized, setResultPanelMinimized] = useState(false);
    const [showGodViewHint, setShowGodViewHint] = useState(false);
    const [selectedPresetKey, setSelectedPresetKey] = useState(GAME_PRESETS[0]?.key || '');
    const [logExpanded, setLogExpanded] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [ttsChecking, setTtsChecking] = useState(false);

    const humanPlayer = players.find(p => p.isHuman);
    const aliveResultPlayers = gameResult ? players.filter(p => gameResult.alivePlayerIds.includes(p.id)) : [];
    const deadResultPlayers = gameResult ? players.filter(p => gameResult.deadPlayerIds.includes(p.id)) : [];
    const sheriffPlayer = gameResult?.sheriffId ? players.find(p => p.id === gameResult.sheriffId) : null;
    const isLocalAiSpectator = !humanPlayer && multiplayerRole === null && !isReplayMode && !isTheater;
    const canSeeGodStateDetails = isLocalAiSpectator || debugGodView || (isReplayMode && perspective === 'GOD') || phase === GamePhase.GAME_REVIEW || phase === GamePhase.GAME_OVER;
    const visibleLogs = (() => {
        // 上帝视角/结算复盘:公开全部日志(含狼人夜聊、夜间私聊等 visibleTo 限定内容)
        if (phase === GamePhase.GAME_REVIEW || canSeeGodStateDetails) {
            return logs.filter(log => !(log.isSystem && log.phase === GamePhase.GAME_REVIEW && log.content.includes('【游戏结算】')));
        }
        // 普通玩家:按可见范围过滤,并剔除内部调试追踪(EVENT_TRACE 状态变化等)
        const scoped = !humanPlayer
            ? logs.filter(l => !l.visibleTo)
            : logs.filter(l => !l.visibleTo || l.visibleTo.includes(humanPlayer.id));
        return debugGodView ? scoped : scoped.filter(l => !isInternalDebugLog(l));
    })();
    const canSeeLoverInfo = canSeeGodStateDetails || (!!humanPlayer && !!godState.lovers && (humanPlayer.role === Role.CUPID || godState.lovers.includes(humanPlayer.id)));

    const humanProgressText = humanPlayer ? (() => {
        switch (phase) {
            case GamePhase.NIGHT_START: return '天黑请闭眼，等待上帝指令。';
            case GamePhase.WEREWOLF_ACTION: return WOLF_ROLES.includes(humanPlayer.role) ? '狼人正在夜间讨论，你可以查看私聊进程。' : '夜间行动进行中，请稍候。';
            case GamePhase.SEER_ACTION: return humanPlayer.role === Role.SEER ? '轮到你查验身份，请在操作面板选择目标。' : '夜间行动进行中，请稍候。';
            case GamePhase.WITCH_ACTION: return humanPlayer.role === Role.WITCH ? '轮到你使用药水，请在操作面板选择行动。' : '夜间行动进行中，请稍候。';
            case GamePhase.GUARD_ACTION: return humanPlayer.role === Role.GUARD ? '轮到你守护玩家，请在操作面板选择目标。' : '夜间行动进行中，请稍候。';
            case GamePhase.STONE_GHOST_ACTION: return humanPlayer.role === Role.STONE_GHOST ? '轮到你查验身份，请在操作面板选择目标。' : '夜间行动进行中，请稍候。';
            case GamePhase.GRAVEKEEPER_ACTION: return humanPlayer.role === Role.GRAVEKEEPER ? '守墓人正在查验昨夜放逐玩家身份。' : '夜间行动进行中，请稍候。';
            case GamePhase.DEMON_HUNTER_ACTION: return humanPlayer.role === Role.DEMON_HUNTER ? '轮到你猎杀目标，请在操作面板选择。' : '夜间行动进行中，请稍候。';
            case GamePhase.CUPID_LINK: return humanPlayer.role === Role.CUPID ? '轮到你连结情侣，请选择两名玩家。' : '夜间行动进行中，请稍候。';
            case GamePhase.MERCHANT_ACTION: return humanPlayer.role === Role.MIRACLE_MERCHANT ? '轮到你发放技能，请选择目标和技能类型。' : '夜间行动进行中，请稍候。';
            case GamePhase.DAY_ANNOUNCE: return '天亮了，等待上帝公布昨夜信息。';
            case GamePhase.DAY_DISCUSSION: return '白天讨论阶段，轮到你时请发言。';
            case GamePhase.DISCUSSION_ROUND_TWO: return '第二轮讨论阶段，轮到你时请发言。';
            case GamePhase.SHERIFF_ELECTION: return '警长竞选阶段，竞选者依次发表竞选发言。';
            case GamePhase.SHERIFF_VOTING: return '警长投票阶段，请在候选人中投出警长。';
            case GamePhase.SHERIFF_WITHDRAW: return '退水环节，竞选者可选择退水。';
            case GamePhase.VOTING: return '投票阶段，轮到你时请选择放逐目标。';
            case GamePhase.KNIGHT_CHALLENGE: return humanPlayer.role === Role.KNIGHT ? '骑士决斗阶段，你可以选择一名玩家决斗或跳过。' : '骑士正在决斗，请稍候。';
            case GamePhase.WOLF_EXPLODE: return WOLF_ROLES.includes(humanPlayer.role) ? '狼人自爆阶段，你可以选择自爆并指刀。' : '有狼人自爆了！';
            case GamePhase.LAST_WORDS: return '遗言阶段，等待相关玩家发言。';
            case GamePhase.HUNTER_ACTION: return humanPlayer.role === Role.HUNTER ? '你被淘汰了，可以选择开枪带走一人。' : '猎人正在行动，请稍候。';
            case GamePhase.GAME_REVIEW:
            case GamePhase.GAME_OVER: return '游戏结束，查看复盘信息。';
            default: return PHASE_LABELS[phase];
        }
    })() : '';

    useGameEngine({
        enabled: multiplayerRole !== 'guest',
        paused: multiplayerRole === 'host' && isPaused,
    });
    useTheaterEngine();

    useEffect(() => {
        const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFsChange);
        window.scrollTo(0, 0);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    useEffect(() => {
        if (phase !== GamePhase.GAME_REVIEW) { setResultPanelMinimized(false); return; }
    }, [phase]);

    useEffect(() => {
        if (!debugGodView) { setShowGodViewHint(false); return; }
        setShowGodViewHint(true);
        const timer = window.setTimeout(() => setShowGodViewHint(false), 5000);
        return () => window.clearTimeout(timer);
    }, [debugGodView]);

    const handleMinimize = () => {
        AudioService.getInstance().stop();
        if (multiplayerRole !== 'guest') setIsAuto(false);
        setMinimizedGame({ enabled: true, phase, turnCount, aliveCount: players.filter(p => isEffectivelyAlive(p)).length, updatedAt: Date.now() });
        setScreen('HOME');
    };

    const handleConfirmExit = () => {
        AudioService.getInstance().stop();
        setShowExitConfirm(false);
        if (multiplayerRole === 'host' && multiplayerState?.roomId) {
            window.dispatchEvent(new CustomEvent('multiplayer-host-exit'));
        } else if (multiplayerRole === 'guest' && multiplayerState?.roomId) {
            window.dispatchEvent(new CustomEvent('multiplayer-guest-exit'));
        } else {
            exitGame();
        }
    };

    const handleToggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.error(e));
        } else {
            document.exitFullscreen().catch(e => console.error(e));
        }
    };

    const handleAutoPlayToggle = () => {
        const newAuto = !isAuto;
        setIsAuto(newAuto);
        if (multiplayerRole === 'host' && multiplayerState?.roomId) {
            setIsPaused(!newAuto);
            sendWsMessage(createPauseStateMessage(!newAuto));
        }
    };

    const handleTtsToggle = async () => {
        if (ttsChecking || multiplayerRole === 'guest') return;
        if (ttsEnabled) {
            AudioService.getInstance().stop();
            setGlobalConfig(previous => ({ ...previous, enabled: false }));
            addToast('语音播报已关闭', 'info');
            return;
        }

        setTtsChecking(true);
        try {
            const available = await AudioService.getInstance().checkAvailability(remoteConfig);
            if (!available) {
                setGlobalConfig(previous => ({ ...previous, enabled: false }));
                addToast('TTS 服务未启动，请检查 8000 端口的语音后端', 'error');
                return;
            }

            const narrator = actors.find(actor => actor.id === globalConfig.narratorActorId) ?? actors[0];
            const tts = ttsPresets.find(preset => preset.id === narrator?.ttsPresetId) ?? ttsPresets[0];
            if (!narrator || !tts) {
                addToast('没有可用的旁白语音配置', 'error');
                return;
            }

            setGlobalConfig(previous => ({ ...previous, enabled: true }));
            const played = await AudioService.getInstance().playOrGenerate(
                '语音播报已开启。',
                narrator.voiceId,
                `tts-toggle-${Date.now()}`,
                tts,
                undefined,
                undefined,
                globalConfig.ttsSpeed || 1,
                remoteConfig,
                narrator.fineTune,
            );
            if (played) {
                addToast('语音播报已开启', 'success');
            } else {
                setGlobalConfig(previous => ({ ...previous, enabled: false }));
                addToast('音频播放失败，请检查浏览器声音权限', 'error');
            }
        } finally {
            setTtsChecking(false);
        }
    };

    const isNightPhase = !isDay;
    const isSetup = phase === GamePhase.SETUP;
    const isGameOver = phase === GamePhase.GAME_OVER || phase === GamePhase.GAME_REVIEW;
    const phaseLabel = perspective === 'GOD' ? PHASE_LABELS[phase] : (isDay ? '白天' : '夜晚');

    const showPhaseBanners = phase === GamePhase.KNIGHT_CHALLENGE || phase === GamePhase.WOLF_EXPLODE || phase === GamePhase.SHERIFF_WITHDRAW || phase === GamePhase.CUPID_LINK || phase === GamePhase.MERCHANT_ACTION || (godState.bloodMoonSealed && canSeeGodStateDetails) || (godState.lovers && canSeeLoverInfo) || (humanPlayer && debugGodView && showGodViewHint && !isTheater && !isReplayMode);

    return {
        players, logs, phase, isAuto, setIsAuto, exitGame, turnCount, isTheater, isDay,
        perspective, setPerspective, replayPaused, setReplayPaused, isReplayMode,
        setMinimizedGame, setScreen, llmThinking, gameResult, gameEvaluation, debugGodView, humanInputPanelExpanded,
        godState, multiplayerRole, multiplayerState, isPaused, setIsPaused, globalConfig, setGlobalConfig,
        ttsEnabled, ttsChecking, handleTtsToggle, debugMode, setDebugLogOpen, currentSpeakerId, initGame, uiConfig,
        humanPlayer, aliveResultPlayers, deadResultPlayers, sheriffPlayer, visibleLogs,
        canSeeGodStateDetails, canSeeLoverInfo, humanProgressText, isNightPhase, isSetup, isGameOver,
        phaseLabel, showExitConfirm, setShowExitConfirm, resultPanelMinimized, setResultPanelMinimized,
        selectedPresetKey, setSelectedPresetKey, logExpanded, setLogExpanded, isFullscreen, isLlmThinking,
        handleMinimize, handleConfirmExit, handleToggleFullscreen, handleAutoPlayToggle,
        showPhaseBanners, showGodViewHint,
    };
}
