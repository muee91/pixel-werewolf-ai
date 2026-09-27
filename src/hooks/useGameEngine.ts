import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    isDaytimeAtom,
    saveSnapshotAtom,
    saveGameArchiveAtom,
} from '../store';
import {
    gamePhaseAtom,
    playersAtom,
    logsAtom,
    gameTracesAtom,
    isAutoPlayAtom,
    currentSpeakerIdAtom,
    isProcessingAtom,
    gameConfigAtom,
    isReplayModeAtom,
    godStateAtom,
    speakingQueueAtom,
    turnCountAtom,
    timelineAtom,
    globalApiConfigAtom,
    actorProfilesAtom,
    llmPresetsAtom,
    ttsPresetsAtom,
    llmProvidersAtom,
    isPlayingAudioAtom,
    isTheaterModeAtom,
    areRolesVisibleAtom,
    userInputAtom,
    humanInputResolverMapAtom,
    llmThinkingAtom,
    gameResultAtom,
    gameEvaluationAtom,
    remoteServerConfigAtom,
    aiHostedPlayersAtom,
    uiConfigAtom,
} from '../atoms';
import { GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS, Role, Player, WOLF_ROLES, isImmuneToVote, isWolfRole, GameEvaluation, PlayerScore, GameLog, UserInput } from '../types';
import {
    appendLog as appendLogFn,
    appendTrace as appendTraceFn,
    createLlmFailedResult,
    getSpeechText as getSpeechTextFn,
    isLlmAbortedResult,
    isLlmFailedResult,
    LLM_ABORTED_RESULT,
    mapWithConcurrency,
    parseSheriffFlow,
    VOTE_LLM_CONCURRENCY,
} from './engineHelpers';import { AudioService } from '../audio';
import { generateText, parseLLMResponse, type LLMResponse } from '../services/llm';
import { requestMcpDecision, isBridgeAlive, notifyBridgeGameOver, notifyBridgeGameNew } from '../services/mcpBrain';
import { werewolfSkillInstance } from '../services/skills/werewolf/WerewolfSkill';
import { fallbackDecide, fallbackNightAction } from '../services/fallbackBrain';
import { BUILTIN_LLM_PRESET_ID, builtinGenerate, isBuiltinLlmReady } from '../services/builtinLlm';
import { HUMAN_INPUT_TIMEOUT_MS, SINGLE_PLAYER_HUMAN_INPUT_TIMEOUT_MS } from '../multiplayer/constants';
import { probeLocalLlm } from '../utils/localLlmProbe';
import { isProviderConfiguredForRuntime } from '../utils/llmConfig';
import { extractWolfChatTarget } from '../utils/wolfChatTarget';
import { PHASE_HANDLERS } from './engine/phases';
import type { PhaseHandlerContext, VoteDecision } from './engine/phaseContext';
import { addToastAtom } from '../atoms';
import { getDialogueDurationMs } from '../components/game/voxel3d/dialogueModel';
import { getDefaultStore } from 'jotai';
import {
    appendPendingDeathActionIds,
    canWolfSelfExplode,
    checkWinCondition as evaluateWinCondition,
    enforcePkVoteTarget,
    getExileVoterIds,
    getPendingDeathActionIds,
    isEffectivelyAlive,
    isCrossFactionLoverPair,
    isSheriffElectionEnabled,
    normalizeMerchantSkillType,
    resolveExileVote,
    shouldOfferWolfExplosion,
    type WinResult,
} from '../game/rules';



// 纯函数已提取到 engineHelpers.ts，此处仅做别名桥接
const appendLog = appendLogFn;
const appendTrace = appendTraceFn;
const getSpeechText = getSpeechTextFn;
const jotaiStore = getDefaultStore();
const werewolfSkill = werewolfSkillInstance;

type WaiterEntry = {
    resolve: (value: UserInput) => void;
    reject: (reason?: unknown) => void;
    timer?: ReturnType<typeof setTimeout>;
};

export interface GameEngineOptions {
    enabled?: boolean;
    paused?: boolean;
}

export const useGameEngine = (options: GameEngineOptions = {}) => {
    const { enabled = true, paused = false } = options;
    const [phase, setPhase] = useAtom(gamePhaseAtom);
    const [players, setPlayers] = useAtom(playersAtom);
    const [logs, setLogs] = useAtom(logsAtom);
    const [, setGameTraces] = useAtom(gameTracesAtom);
    const [isAuto, setIsAuto] = useAtom(isAutoPlayAtom);
    const [isProcessing, setIsProcessing] = useAtom(isProcessingAtom);
    const setSpeaker = useSetAtom(currentSpeakerIdAtom);
    const saveSnapshot = useSetAtom(saveSnapshotAtom);
    const [godState, setGodState] = useAtom(godStateAtom);
    const [speakingQueue, setSpeakingQueue] = useAtom(speakingQueueAtom);
    const [turnCount, setTurnCount] = useAtom(turnCountAtom);
    const isReplay = useAtomValue(isReplayModeAtom);
    const config = useAtomValue(gameConfigAtom);
    const aiHostedPlayers = useAtomValue(aiHostedPlayersAtom);

    const saveGameArchive = useSetAtom(saveGameArchiveAtom);
    const setAreRolesVisible = useSetAtom(areRolesVisibleAtom);
    const setGameResult = useSetAtom(gameResultAtom);
    const setGameEvaluation = useSetAtom(gameEvaluationAtom);

    // Audio & Actors
    const [timeline, setTimeline] = useAtom(timelineAtom);
    const globalConfig = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const [isPlayingAudio, setIsPlayingAudio] = useAtom(isPlayingAudioAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const isTheater = useAtomValue(isTheaterModeAtom);
    const isDaytime = useAtomValue(isDaytimeAtom);
    const uiConfig = useAtomValue(uiConfigAtom);

    const [userInput, setUserInput] = useAtom(userInputAtom);
    const setLlmThinking = useSetAtom(llmThinkingAtom);
    const userInputRef = useRef(userInput);
    const isAutoRef = useRef(isAuto);
    const phaseRef = useRef(phase);
    const lastEventTraceKeyRef = useRef<string | null>(null);
    const previousPhaseTraceRef = useRef<GamePhase>(phase);
    const previousPlayersTraceRef = useRef(players);
    const previousGodStateTraceRef = useRef(godState);
    const previousSpeakingQueueTraceRef = useRef(speakingQueue);
    const previousGameResultTraceRef = useRef<unknown>(null);
    const announcedResultRef = useRef<string | null>(null);
    const engineStepInFlightRef = useRef(false);
    const llmAbortControllersRef = useRef<Set<AbortController>>(new Set());
    const isUnmountedRef = useRef(false);
    const clearLlmThinking = useCallback(() => {
        setLlmThinking({ playerId: null, actorName: '', modelName: '', phase: null, attempt: 0, maxAttempts: 0, startedAt: null, status: 'idle' });
    }, [setLlmThinking]);

    useEffect(() => { userInputRef.current = userInput; }, [userInput]);
    useEffect(() => { isAutoRef.current = isAuto; }, [isAuto]);
    useEffect(() => { phaseRef.current = phase; }, [phase]);

    useEffect(() => {
        if (!isAuto && llmAbortControllersRef.current.size > 0) {
            llmAbortControllersRef.current.forEach(controller => controller.abort());
            llmAbortControllersRef.current.clear();
            engineStepInFlightRef.current = false;
            clearLlmThinking();
            setSpeaker(null);
            setIsProcessing(false);
        }
    }, [isAuto, clearLlmThinking, setIsProcessing, setSpeaker]);

    // 卸载守卫：卸载时中止在途 LLM 请求。GOD 循环的在途步骤在 abort 后
    // 会沿既有检查点（signal.aborted）快速收敛，避免退出对局后
    // 继续向全局 atoms 写入状态、污染下一局。
    useEffect(() => {
        isUnmountedRef.current = false;
        notifyBridgeGameNew(); // 清掉上一局的结束标记,否则第二局 MCP 全部静默回退
        return () => {
            isUnmountedRef.current = true;
            notifyBridgeGameOver();
            llmAbortControllersRef.current.forEach(controller => {
                try { controller.abort(); } catch { /* noop */ }
            });
            llmAbortControllersRef.current.clear();
        };
    }, []);

    const addEventTrace = useCallback((content: string, debugData?: Record<string, unknown>) => {
        const traceKey = `${turnCount}:${phase}:${content}:${JSON.stringify(debugData ?? {})}`;
        if (lastEventTraceKeyRef.current === traceKey) return;
        lastEventTraceKeyRef.current = traceKey;

        // 事件流痕迹只进调试池，不进内容日志：避免挤占过程日志窗口、混入 AI 上下文与存档
        setGameTraces(prev => appendTrace(prev, {
            id: `evt-T${turnCount}-${phase}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            turn: turnCount,
            phase,
            speakerName: 'Runtime',
            content,
            timestamp: Date.now(),
            isSystem: true,
            debugType: 'EVENT_TRACE',
            debugData,
        }));    }, [phase, setGameTraces, turnCount]);

    const trackGodStateDiff = useCallback((prevState: typeof godState, nextState: typeof godState) => {
        const trackedKeys: (keyof typeof godState)[] = [
            'wolfTarget',
            'seerCheck',
            'witchSave',
            'witchPoison',
            'guardProtect',
            'lastGuardProtect',
            'merchantGuardProtect',
            'deathsTonight',
            'sheriffId',
            'sheriffCandidates',
            'sheriffTieCandidates',
            'sheriffVoteRound',
            'voteTieCandidates',
            'voteTieRound',
            'pendingDeathActionIds',
            'deathActionResume',
            'pendingNightDeathIds',
            'poisonedTonight',
            'knightChallenged',
            'knightChallengeTarget',
            'bloodMoonSealed',
            'lovers',
            'cupidIsThirdParty',
            'merchantSkillTarget',
            'merchantSkillType',
            'merchantSkillUsed',
            'wolfExplodeTarget',
            'explodedWolves',
            'lastExiledPlayerId',
            'demonHunterKills',
        ];

        trackedKeys.forEach((key) => {
            const before = prevState[key];
            const after = nextState[key];
            if (JSON.stringify(before) === JSON.stringify(after)) return;
            addEventTrace(`状态变化：${String(key)}`, {
                eventKind: 'STATE_MUTATION',
                entity: 'godState',
                field: key,
                before,
                after,
            });
        });
    }, [addEventTrace, godState]);

    useEffect(() => {
        // enabled=false 的实例（如 MultiplayerView 仅取 resolveHumanInput 的挂载）
        // 不做被动 diff 追踪，避免与主循环实例重复写入调试日志
        if (!enabled) {
            previousPlayersTraceRef.current = players;
            return;
        }
        if (isReplay || isTheater) {
            previousPlayersTraceRef.current = players;
            return;
        }

        const prevPlayers = previousPlayersTraceRef.current;
        players.forEach((player) => {
            const prevPlayer = prevPlayers.find(p => p.id === player.id);
            if (!prevPlayer) {
                addEventTrace(`玩家加入：${player.seatNumber}号`, {
                    eventKind: 'STATE_MUTATION',
                    entity: 'player',
                    playerId: player.id,
                    seatNumber: player.seatNumber,
                    status: player.status,
                    role: player.role,
                });
                return;
            }

            if (prevPlayer.status !== player.status) {
                addEventTrace(`玩家状态变化：${player.seatNumber}号 ${prevPlayer.status} -> ${player.status}`, {
                    eventKind: 'STATE_MUTATION',
                    entity: 'player',
                    playerId: player.id,
                    seatNumber: player.seatNumber,
                    field: 'status',
                    before: prevPlayer.status,
                    after: player.status,
                    role: player.role,
                });
            }

            if (prevPlayer.isSpeaking !== player.isSpeaking) {
                addEventTrace(`发言状态：${player.seatNumber}号 ${player.isSpeaking ? '开始发言' : '结束发言'}`, {
                    eventKind: 'STATE_MUTATION',
                    entity: 'player',
                    playerId: player.id,
                    seatNumber: player.seatNumber,
                    field: 'isSpeaking',
                    before: prevPlayer.isSpeaking,
                    after: player.isSpeaking,
                });
            }
        });

        previousPlayersTraceRef.current = players;
    }, [addEventTrace, enabled, isReplay, isTheater, players]);

    useEffect(() => {
        if (!enabled) {
            previousGodStateTraceRef.current = godState;
            return;
        }
        if (isReplay || isTheater) {
            previousGodStateTraceRef.current = godState;
            return;
        }

        trackGodStateDiff(previousGodStateTraceRef.current, godState);
        previousGodStateTraceRef.current = godState;
    }, [enabled, godState, isReplay, isTheater, trackGodStateDiff]);

    useEffect(() => {
        if (!enabled) {
            previousSpeakingQueueTraceRef.current = speakingQueue;
            return;
        }
        if (isReplay || isTheater) {
            previousSpeakingQueueTraceRef.current = speakingQueue;
            return;
        }

        const prevQueue = previousSpeakingQueueTraceRef.current;
        if (JSON.stringify(prevQueue) !== JSON.stringify(speakingQueue)) {
            addEventTrace(`发言队列更新：${speakingQueue.length ? speakingQueue.map(id => `${id}号`).join(' -> ') : '空'}`, {
                eventKind: 'STATE_MUTATION',
                entity: 'speakingQueue',
                before: prevQueue,
                after: speakingQueue,
            });
            previousSpeakingQueueTraceRef.current = speakingQueue;
        }
    }, [addEventTrace, enabled, isReplay, isTheater, speakingQueue]);

    useEffect(() => {
        if (!enabled) {
            previousGameResultTraceRef.current = jotaiStore.get(gameResultAtom);
            return;
        }
        if (isReplay || isTheater) {
            previousGameResultTraceRef.current = null;
            return;
        }

        const prevResult = previousGameResultTraceRef.current;
        const currentResult = jotaiStore.get(gameResultAtom);
        if (currentResult && JSON.stringify(prevResult) !== JSON.stringify(currentResult)) {
            addEventTrace(`结算生成：${currentResult.winner}`, {
                eventKind: 'RESOLUTION',
                winner: currentResult.winner,
                turn: currentResult.turn,
                sheriffId: currentResult.sheriffId,
                mvp: currentResult.mvp,
                svp: currentResult.svp,
            });
        }
        previousGameResultTraceRef.current = currentResult;
    }, [addEventTrace, enabled, isReplay, isTheater, phase]);

    useEffect(() => {
        if (!enabled) {
            previousPhaseTraceRef.current = phase;
            return;
        }
        if (isReplay || isTheater) {
            previousPhaseTraceRef.current = phase;
            return;
        }

        const prevPhase = previousPhaseTraceRef.current;
        const alivePlayers = players.filter(isEffectivelyAlive);
        const deadPlayers = players.filter(p => !isEffectivelyAlive(p));

        if (prevPhase !== phase) {
            addEventTrace(
                `阶段切换：${PHASE_LABELS[prevPhase] || prevPhase} -> ${PHASE_LABELS[phase] || phase}`,
                {
                    fromPhase: prevPhase,
                    toPhase: phase,
                    turnCount,
                    aliveSeats: alivePlayers.map(p => p.seatNumber),
                    deadSeats: deadPlayers.map(p => p.seatNumber),
                    queue: speakingQueue,
                    sheriffId: godState.sheriffId ?? null,
                    isAuto,
                    isProcessing,
                }
            );
            previousPhaseTraceRef.current = phase;
        }
    }, [addEventTrace, enabled, godState.sheriffId, isAuto, isProcessing, isReplay, isTheater, phase, players, speakingQueue, turnCount]);

    // Monotonic counter to ensure absolute uniqueness for logs within a session
    const logIdCounter = useRef(0);

    // Helper: Resolve Actor Config
    const getActorConfig = useCallback((actorId: string) => {
        const actor = actors.find(a => a.id === actorId) || actors[0];
        const llm = llmPresets.find(p => p.id === actor.llmPresetId) || llmPresets[0];
        const provider = llmProviders.find(p => p.id === llm.providerId) || llmProviders[0];
        const tts = ttsPresets.find(p => p.id === actor.ttsPresetId) || ttsPresets[0];
        return { actor, llm, provider, tts };
    }, [actors, llmPresets, llmProviders, ttsPresets]);

    const getAlivePlayers = useCallback((sourcePlayers: Player[]) => sourcePlayers.filter(isEffectivelyAlive), []);

    const getRule = useCallback(<K extends keyof typeof config.rules>(key: K): typeof config.rules[K] => config.rules[key], [config.rules]);
    // 离线大脑:未配置任何可用模型且本机无 Ollama/LM Studio 时,由内置规则引擎驱动 AI,
    // 保证任何一台电脑零配置可玩完整对局(决策较简单;配置云端 Key 或本机模型即自动切换真 LLM)。
    const [offlineBrainActive, setOfflineBrainActive] = useState(false);
    useEffect(() => {
        // 联机屏的 disabled 辅助实例（MultiplayerView，仅借用 resolveHumanInput）不参与探测
        if (!enabled) return;
        let cancelled = false;
        (async () => {
            const anyConfigured = llmPresets.some(p =>
                isProviderConfiguredForRuntime(llmProviders.find(x => x.id === p.providerId), remoteConfig));
            if (anyConfigured) {
                if (!cancelled) setOfflineBrainActive(false);
                return;
            }
            const local = await probeLocalLlm();
            if (!cancelled) setOfflineBrainActive(!local);
        })();
        return () => { cancelled = true; };
    }, [enabled, llmPresets, llmProviders, remoteConfig]);

    const sheriffEnabled = isSheriffElectionEnabled(config);
    // 狼人自爆统一判断入口：仅由 wolfExplodeEnabled 控制（旧字段 wolfSelfExplode 已彻底移除）
    const isWolfExplodeEnabled = useCallback(() => !!config.rules.wolfExplodeEnabled, [config.rules.wolfExplodeEnabled]);

    const shouldSynchronizeSpectatorDialogue = useCallback(() =>
        uiConfig.gameViewMode === '3d' &&
        !players.some(candidate => candidate.isHuman) &&
        !isReplay &&
        !isTheater,
    [isReplay, isTheater, players, uiConfig.gameViewMode]);

    const waitForSpectatorDialogue = useCallback(async (content: string, startedAt: number) => {
        if (!shouldSynchronizeSpectatorDialogue()) return;
        const remainingPresentationMs = getDialogueDurationMs(content) - (Date.now() - startedAt);
        if (remainingPresentationMs > 0) {
            await new Promise(resolve => window.setTimeout(resolve, remainingPresentationMs));
        }
    }, [shouldSynchronizeSpectatorDialogue]);

    // --- Win Condition Checker (Slaughter the Side / 屠边 + 第三方) ---
    const checkWinCondition = useCallback((currentPlayers: Player[]): WinResult | null => {
        return evaluateWinCondition(currentPlayers, {
            thirdPartyEnabled: getRule('thirdPartyEnabled'),
            cupidIsThirdParty: godState.cupidIsThirdParty,
            lovers: godState.lovers,
        });
    }, [godState.cupidIsThirdParty, godState.lovers, getRule]);

    // Helper: System Log & TTS
    const addSystemLog = useCallback(async (
        content: string,
        visibleTo?: number[],
        audioOverride?: string,
        phaseOverride?: GamePhase
    ) => {
        // Use a combination of timestamp, monotonic counter, and random string to ensure uniqueness
        // preventing "Duplicate Audio" issues caused by ID collisions in Timeline.
        const uniqueSuffix = `${Date.now()}-${logIdCounter.current++}-${Math.random().toString(36).slice(2)}`;

        const sharedId = `sys-T${turnCount}-${phase}-${uniqueSuffix}`;
        addEventTrace(`系统播报：${content.split('\n')[0]}`, {
            eventKind: 'ACTION',
            action: 'SYSTEM_LOG',
            phase: phaseOverride !== undefined ? phaseOverride : phase,
            visibleTo: visibleTo || null,
            audioText: audioOverride ?? null,
        });

        setLogs(prev => appendLog(prev, [{
            id: sharedId,
            turn: turnCount,
            phase: phaseOverride !== undefined ? phaseOverride : phase,
            content: content,
            timestamp: Date.now(),
            isSystem: true,
            visibleTo
        }]));
        // Get narrator config
        const { actor, tts } = getActorConfig(globalConfig.narratorActorId);

        // Logic to strip prefixes for audio
        let textForAudio = audioOverride !== undefined ? audioOverride : content;
        // Regex to remove "上帝(私聊):", "上帝:", "旁白:" etc.
        textForAudio = textForAudio.replace(/^(上帝|旁白|系统)(?:[(（].*?[)）])?[:：]\s*/, '');

        if (!textForAudio.trim()) return; // If empty audio text, skip timeline/TTS

        // Add to timeline
        const audioKey = `audio_sys_${sharedId}`;

        // --- 核心修改：针对上帝旁白，不再记录具体的 VoiceID 和 TTS 配置 ---
        // 这样存档文件会更小，且不包含 Narrator 的 API Key。
        // 回放时，TheaterEngine 会看到 type='NARRATOR' 从而直接读取当前的全局设置。

        setTimeline(prev => [...prev, {
            id: sharedId,
            type: 'NARRATOR',
            speakerName: '上帝',
            text: textForAudio,

            // 使用占位符，不记录真实配置
            voiceId: "GLOBAL_NARRATOR",
            ttsProvider: "GLOBAL_NARRATOR",
            ttsModel: "",
            ttsBaseUrl: "",
            ttsApiKey: "",

            audioKey: audioKey,
            timestamp: Date.now(),
            isPrivate: !!visibleTo?.length
        }]);

        // Play TTS if live game and enabled
        if (!isReplay && !isTheater && globalConfig.enabled) {
            const isPrivateSystemLog = !!visibleTo?.length;
            const isPublicPhaseCue = /(请睁眼|请闭眼|天黑请闭眼)/.test(textForAudio);
            const humanPlayer = players.find(p => p.isHuman);
            const isPrivateAudibleToHuman = !!humanPlayer && !!visibleTo?.includes(humanPlayer.id);
            const shouldPlayClearAudio = isPublicPhaseCue || !isPrivateSystemLog || !humanPlayer || isPrivateAudibleToHuman;

            setIsPlayingAudio(true);
            try {
                if (shouldPlayClearAudio) {
                    // 注意：实时播放依然使用获取到的真实 actor 和 tts 对象
                    await AudioService.getInstance().playOrGenerate(
                        textForAudio,
                        actor.voiceId,
                        audioKey,
                        tts,
                        undefined,
                        undefined,
                        globalConfig.ttsSpeed || 1.0,
                        remoteConfig,
                        actor.fineTune
                    );
                } else {
                    await new Promise(r => setTimeout(r, 800));
                }
            } finally {
                setIsPlayingAudio(false);
            }
        }
    }, [addEventTrace, phase, turnCount, players, setLogs, setTimeline, globalConfig, isReplay, isTheater, setIsPlayingAudio, getActorConfig]);

    const calcScore = useCallback((p: Player, winner: string, allPlayers: Player[]): PlayerScore => {
        let survivalBonus = 0;
        let winBonus = 0;
        let voteAccuracyBonus = 0;
        let skillBonus = 0;
        let speechBonus = 0;

        // 存活 +10
        if (isEffectivelyAlive(p)) survivalBonus += 10;

        // 胜利阵营 +20
        const isWolfWin = winner === 'WOLF';
        const isGoodWin = winner === 'GOOD';
        const isThirdPartyWin = winner === 'THIRD_PARTY';
        const isPlayerWolfTeam = isWolfRole(p.role);
        const isPlayerGoodTeam = !isPlayerWolfTeam;
        const isPlayerThirdParty = isThirdPartyWin && godState.cupidIsThirdParty && godState.lovers &&
            (p.role === Role.CUPID || godState.lovers.includes(p.id));

        if ((isGoodWin && isPlayerGoodTeam) || (isWolfWin && isPlayerWolfTeam) || isPlayerThirdParty) {
            winBonus += 20;
        }

        // 投票准确率：好人投狼人、狼人投好人视为正确投票。
        const voteStrategyLogs = logs.filter(l => l.speakerId === p.id && l.phase === GamePhase.VOTING && l.debugType === 'VOTE_STRATEGY');
        if (voteStrategyLogs.length > 0) {
            let correctVotes = 0;
            for (const vLog of voteStrategyLogs) {
                const votedTarget = vLog.debugData?.target;
                if (votedTarget == null) continue; // 弃票不计
                const targetPlayer = allPlayers.find(fp => fp.id === votedTarget);
                if (!targetPlayer) continue;
                // 好人投狼人 = 正确；狼人投好人 = 正确（策略性）
                if (isPlayerGoodTeam && isWolfRole(targetPlayer.role)) correctVotes++;
                else if (isPlayerWolfTeam && !isWolfRole(targetPlayer.role)) correctVotes++;
            }
            const accuracy = correctVotes / voteStrategyLogs.length;
            voteAccuracyBonus += Math.round(accuracy * 10);
        }

        // 技能使用 +3~5/次
        const skillLogs = logs.filter(l => l.speakerId === p.id && !l.isSystem &&
            [GamePhase.SEER_ACTION, GamePhase.WITCH_ACTION, GamePhase.GUARD_ACTION,
             GamePhase.STONE_GHOST_ACTION, GamePhase.GRAVEKEEPER_ACTION, GamePhase.DEMON_HUNTER_ACTION,
             GamePhase.CUPID_LINK, GamePhase.MERCHANT_ACTION, GamePhase.HUNTER_ACTION,
             GamePhase.KNIGHT_CHALLENGE].includes(l.phase));
        skillBonus += skillLogs.length * 4;

        // 发言活跃度 +1/次
        const speeches = logs.filter(l => l.speakerId === p.id && !l.isSystem &&
            [GamePhase.DAY_DISCUSSION, GamePhase.DISCUSSION_ROUND_TWO, GamePhase.SHERIFF_ELECTION,
             GamePhase.LAST_WORDS].includes(l.phase));
        speechBonus += speeches.length;

        const total = survivalBonus + winBonus + voteAccuracyBonus + skillBonus + speechBonus;

        return {
            playerId: p.id,
            score: total,
            isMvp: false,
            isSvp: false,
            details: { survivalBonus, winBonus, voteAccuracyBonus, skillBonus, speechBonus }
        };
    }, [godState, logs, players]);

    // 静默本机回退显性化:llm.ts 改用本机模型时派发事件,这里写一条对局日志。
    // 该事件在无 Key 时按每次 LLM 调用触发（含投票并发），需冷却+按局去重，避免日志刷屏与 TTS 重复播报。
    const localFallbackNoticeAtRef = useRef(0);
    useEffect(() => {
        if (!enabled) return;
        const onLocalFallback = (e: Event) => {
            const used = (e as CustomEvent<{ used?: string }>).detail?.used;
            const now = Date.now();
            if (now - localFallbackNoticeAtRef.current < 5 * 60_000) return;
            localFallbackNoticeAtRef.current = now;
            // logs 每局重置且跨重挂载持久，扫描已有日志即可挡住 hook 重挂载带来的重复提示
            if (jotaiStore.get(logsAtom).some(l => l.isSystem && l.content.startsWith('未检测到可用模型 Key'))) return;
            void addSystemLog(`未检测到可用模型 Key，已自动改用本机模型（${used ?? '本地端点'}）发言。`);
        };
        window.addEventListener('llm-local-fallback', onLocalFallback);
        return () => window.removeEventListener('llm-local-fallback', onLocalFallback);
    }, [addSystemLog, enabled]);

    useEffect(() => {
        if (!enabled) return;
        if (!offlineBrainActive) return;
        if (jotaiStore.get(gamePhaseAtom) === GamePhase.SETUP) return;
        // 每局只提示一次：logs 跨重挂载持久，重挂载/探测抖动不会重复写入；新对局会重新提示
        if (jotaiStore.get(logsAtom).some(l => l.isSystem && l.content.startsWith('未检测到模型配置'))) return;
        void addSystemLog('未检测到模型配置，本局由内置离线大脑驱动（决策较简单）。配置云端 API Key 或本机 Ollama 可获得完整 AI 体验。');
    }, [offlineBrainActive, enabled, addSystemLog]);

    const finishGame = useCallback(async (winState: WinResult, finalPlayers: Player[]) => {
        const alivePlayers = finalPlayers.filter(isEffectivelyAlive);
        const deadPlayers = finalPlayers.filter(p => p.status !== PlayerStatus.ALIVE && p.status !== PlayerStatus.IDIOT_REVEALED);
        // 实时快照:结算前同一 tick 内常有 setGodState(警徽流失/殉情等),
        // 闭包里的渲染时快照是旧值,必须从 store 取最终状态
        const finalGodState = jotaiStore.get(godStateAtom);

        // 计算所有玩家评分
        const allScores = finalPlayers.map(p => calcScore(p, winState.winner, finalPlayers));

        // MVP（胜方最高分）和 SVP（败方最高分）
        let mvpScore: PlayerScore | null = null;
        let svpScore: PlayerScore | null = null;
        for (const ps of allScores) {
            const p = finalPlayers.find(fp => fp.id === ps.playerId)!;
            const isWolfWin = winState.winner === 'WOLF';
            const isGoodWin = winState.winner === 'GOOD';
            const isThirdPartyWin = winState.winner === 'THIRD_PARTY';
            const isPlayerWolfTeam = isWolfRole(p.role);
            const isPlayerGoodTeam = !isPlayerWolfTeam;
            const isPlayerThirdParty = isThirdPartyWin && finalGodState.cupidIsThirdParty && finalGodState.lovers &&
                (p.role === Role.CUPID || finalGodState.lovers.includes(p.id));

            const isWinner = (isGoodWin && isPlayerGoodTeam) || (isWolfWin && isPlayerWolfTeam) || isPlayerThirdParty;

            if (isWinner) {
                if (!mvpScore || ps.score > mvpScore.score) { mvpScore = { ...ps, isMvp: true }; }
            } else {
                if (!svpScore || ps.score > svpScore.score) { svpScore = { ...ps, isSvp: true }; }
            }
        }

        // 标记 MVP/SVP
        const finalScores = allScores.map(ps => ({
            ...ps,
            isMvp: mvpScore?.playerId === ps.playerId,
            isSvp: svpScore?.playerId === ps.playerId
        }));

        const mvp = mvpScore ? finalPlayers.find(p => p.id === mvpScore.playerId) : null;
        const svp = svpScore ? finalPlayers.find(p => p.id === svpScore.playerId) : null;

        // 构建评估数据
        const evaluation: GameEvaluation = {
            scores: finalScores,
            metrics: {
                roleIdentificationAccuracy: 0,
                deceptionSuccessRate: 0,
                voteAccuracy: finalScores.reduce((sum, ps) => sum + ps.details.voteAccuracyBonus, 0) / Math.max(finalScores.length, 1),
                communicationEffectiveness: finalScores.reduce((sum, ps) => sum + ps.details.speechBonus, 0) / Math.max(finalScores.length, 1),
                survivalRate: alivePlayers.length / Math.max(finalPlayers.length, 1),
                skillUsageAccuracy: finalScores.reduce((sum, ps) => sum + ps.details.skillBonus, 0) / Math.max(finalScores.length, 1)
            }
        };

        const result = {
            winner: winState.winner,
            reason: winState.reason,
            reasonText: winState.reasonText,
            turn: turnCount,
            endedAt: Date.now(),
            alivePlayerIds: alivePlayers.map(p => p.id),
            deadPlayerIds: deadPlayers.map(p => p.id),
            sheriffId: finalGodState.sheriffId ?? null,
            mvp: mvp ? { id: mvp.id, seat: mvp.seatNumber, role: mvp.role, score: mvpScore?.score ?? 0 } : null,
            svp: svp ? { id: svp.id, seat: svp.seatNumber, role: svp.role, score: svpScore?.score ?? 0 } : null,
            evaluation,
            thirdParty: finalGodState.cupidIsThirdParty && finalGodState.lovers ? {
                type: 'lovers' as const,
                members: [...finalGodState.lovers, finalPlayers.find(p => p.role === Role.CUPID)?.id].filter(Boolean) as number[],
                winCondition: '丘比特与情侣全部存活'
            } : null,
            lovers: finalGodState.lovers ? { players: finalGodState.lovers, bothAlive: alivePlayers.some(p => p.id === finalGodState.lovers![0]) && alivePlayers.some(p => p.id === finalGodState.lovers![1]) } : null
        };
        const roleLine = (p: Player) => `${p.seatNumber}号 ${ROLE_INFO[p.role]?.label || p.role}${p.isHuman ? '（你）' : ''} ${p.status}`;
        const settlementLog = [
            '【游戏结算】',
            `胜利阵营：${winState.winner === 'GOOD' ? '好人阵营' : winState.winner === 'WOLF' ? '狼人阵营' : '第三方阵营'}`,
            `胜利原因：${winState.reasonText}`,
            `当前天数：Day ${turnCount}`,
            `警长：${finalGodState.sheriffId ? `${finalGodState.sheriffId}号` : '无'}`,
            '',
            mvp ? `🏆 MVP（胜方最佳）：${mvp.seatNumber}号 ${ROLE_INFO[mvp.role]?.label || mvp.role}（${mvpScore?.score}分）` : '',
            svp ? `🥈 SVP（败方最佳）：${svp.seatNumber}号 ${ROLE_INFO[svp.role]?.label || svp.role}（${svpScore?.score}分）` : '',
            '',
            `存活玩家：\n${alivePlayers.map(roleLine).join('\n') || '无'}`,
            '',
            `死亡玩家：\n${deadPlayers.map(roleLine).join('\n') || '无'}`
        ].filter(Boolean).join('\n');

        setGameResult(result);
        setGameEvaluation(evaluation);

        const winnerAnnouncement = winState.winner === 'GOOD'
            ? '本局结束，好人阵营胜利。'
            : winState.winner === 'WOLF'
                ? '本局结束，狼人阵营胜利。'
                : '本局结束，第三方阵营胜利。';
        const resultAnnouncementKey = `${turnCount}:${winState.winner}:${alivePlayers.length}:${deadPlayers.length}`;
        if (!isReplay && !isTheater && globalConfig.enabled && announcedResultRef.current !== resultAnnouncementKey) {
            announcedResultRef.current = resultAnnouncementKey;
            const { actor, tts } = getActorConfig(globalConfig.narratorActorId);
            const audioKey = `audio_result_${Date.now()}_${winState.winner}`;
            setIsPlayingAudio(true);
            try {
                await AudioService.getInstance().playOrGenerate(
                    winnerAnnouncement,
                    actor.voiceId,
                    audioKey,
                    tts,
                    undefined,
                    undefined,
                    globalConfig.ttsSpeed || 1.0,
                    remoteConfig,
                    actor.fineTune
                );
            } finally {
                setIsPlayingAudio(false);
            }
        }

        await addSystemLog(settlementLog, undefined, winState.reasonText, GamePhase.GAME_REVIEW);
        setPhase(GamePhase.GAME_REVIEW);
        setAreRolesVisible(true);
        saveGameArchive(winState.winner);
    }, [addSystemLog, calcScore, getActorConfig, globalConfig.enabled, globalConfig.narratorActorId, globalConfig.ttsSpeed, isReplay, isTheater, remoteConfig, saveGameArchive, setAreRolesVisible, setGameEvaluation, setGameResult, setIsPlayingAudio, setPhase, turnCount]);


    // --- 辅助：获取板子配置描述 ---
    const getRoleConfigStr = useCallback(() => {
        const count = config.playerCount;
        // 把每一个角色都列出来，不要统计数量
        const roleList = config.roles.map(r => ROLE_INFO[r].label).join('，');
        return `${count}人局：${roleList}。`;
    }, [config]);

    // --- AI 可见上下文：只给当前玩家应该知道的信息 ---
    const getVisibleLogsForPlayer = useCallback((player: Player) => {
        return logs.filter(l => l.turn <= turnCount && (!l.visibleTo || l.visibleTo.includes(player.id)));
    }, [logs, turnCount]);

    const getVisiblePlayersForPlayer = useCallback((player: Player) => {
        return players.map(p => {
            const canKnowRole = p.id === player.id
                || (isWolfRole(player.role) && isWolfRole(p.role))
                || (godState.lovers && godState.lovers.includes(player.id) && godState.lovers.includes(p.id));
            return canKnowRole ? p : { ...p, role: Role.VILLAGER, potions: undefined, rolePrompt: '' };
        });
    }, [players, godState.lovers]);

    const getVisibleGodStateForPlayer = useCallback((player: Player) => {
        const merchantSkillInfo = godState.merchantSkillTarget === player.id && !godState.merchantSkillUsed
            ? {
                merchantSkillTarget: godState.merchantSkillTarget,
                merchantSkillType: godState.merchantSkillType,
                merchantSkillUsed: godState.merchantSkillUsed,
                bloodMoonSealed: godState.bloodMoonSealed
            }
            : {};

        if (player.role === Role.WITCH) {
            // 与 WITCH_ACTION 结算同一公式：让女巫 AI 决策时就知道解药今晚
            // 是否可用（自救限制），避免"以为用了药实际被拒"的静默失败
            const witchDyingId = godState.wolfTarget;
            const canUseCure = !!player.potions?.cure
                && !!witchDyingId
                && (getRule('witchSelfSave') === true
                    || (getRule('witchSelfSave') === 'FIRST_NIGHT' && turnCount === 1)
                    || witchDyingId !== player.id);
            return {
                ...merchantSkillInfo,
                wolfTarget: godState.wolfTarget,
                witchSave: godState.witchSave,
                witchPoison: godState.witchPoison,
                canUseCure,
                bloodMoonSealed: godState.bloodMoonSealed
            };
        }
        if (player.role === Role.GUARD) {
            return {
                ...merchantSkillInfo,
                guardProtect: godState.guardProtect,
                lastGuardProtect: godState.lastGuardProtect,
                merchantGuardProtect: godState.merchantGuardProtect,
                bloodMoonSealed: godState.bloodMoonSealed
            };
        }
        if (isWolfRole(player.role)) {
            return {
                ...merchantSkillInfo,
                wolfTarget: godState.wolfTarget,
                wolfExplodeTarget: godState.wolfExplodeTarget
            };
        }
        if (player.role === Role.SEER) {
            return {
                ...merchantSkillInfo,
                seerCheck: godState.seerCheck,
                bloodMoonSealed: godState.bloodMoonSealed
            };
        }
        if (player.role === Role.GRAVEKEEPER) {
            return {
                ...merchantSkillInfo,
                lastExiledPlayerId: godState.lastExiledPlayerId,
                bloodMoonSealed: godState.bloodMoonSealed
            };
        }
        if (player.role === Role.CUPID) {
            return {
                ...merchantSkillInfo,
                lovers: godState.lovers,
                cupidIsThirdParty: godState.cupidIsThirdParty
            };
        }
        if (player.role === Role.DEMON_HUNTER) {
            return {
                ...merchantSkillInfo,
                demonHunterKills: godState.demonHunterKills,
                bloodMoonSealed: godState.bloodMoonSealed
            };
        }
        if (player.role === Role.KNIGHT) {
            return {
                ...merchantSkillInfo,
                knightChallenged: godState.knightChallenged,
                knightChallengeTarget: godState.knightChallengeTarget
            };
        }
        if (player.role === Role.MIRACLE_MERCHANT) {
            return {
                ...merchantSkillInfo,
                merchantSkillTarget: godState.merchantSkillTarget,
                merchantSkillType: godState.merchantSkillType,
                merchantSkillUsed: godState.merchantSkillUsed,
                bloodMoonSealed: godState.bloodMoonSealed
            };
        }
        // Lovers (non-Cupid players who are part of a lover pair)
        if (godState.lovers && godState.lovers.includes(player.id)) {
            return {
                ...merchantSkillInfo,
                lovers: godState.lovers,
                cupidIsThirdParty: godState.cupidIsThirdParty
            };
        }
        return merchantSkillInfo;
    }, [godState, getRule, turnCount]);

    const buildSkillContext = useCallback((player: Player, contextPhase: GamePhase) => {
        const visibleLogs = getVisibleLogsForPlayer(player);
        const visiblePlayers = getVisiblePlayersForPlayer(player);
        const visibleAlivePlayers = visiblePlayers.filter(isEffectivelyAlive);
        const currentTurnLogs = visibleLogs.filter(l => l.turn === turnCount && l.phase === contextPhase);
        const isAIHosted = !!aiHostedPlayers[player.seatNumber];

        // AI 托管玩家：补充对局记忆。必须沿用该座位的可见视角——
        // 托管 AI 不能看到被接管玩家本身也看不到的私密信息，否则等于开天眼作弊。
        // 该座位合法掌握的信息（自己的查验结果、队友私聊等）都在 visibleLogs 里，不会丢失。
        const aiHostedContext = isAIHosted ? {
            gameMemory: visibleLogs.filter(l => !l.isSystem).slice(-20),
            fullPlayerList: players.map(p => ({ id: p.id, seatNumber: p.seatNumber, displayName: p.displayName, status: p.status })),
            isAIHosted: true as const
        } : undefined;

        return {
            phase: contextPhase,
            turnCount,
            players: visiblePlayers,
            logs: visibleLogs,
            roleConfigStr: getRoleConfigStr(),
            roles: config.roles,
            rules: config.rules,
            godState: getVisibleGodStateForPlayer(player),
            sheriffId: godState.sheriffId ?? null,
            sheriffCandidates: godState.sheriffCandidates ?? [],
            sheriffEnabled,
            alivePlayers: visibleAlivePlayers,
            currentTurnLogs,
            ...aiHostedContext
        };
    }, [config.rules, config.roles, sheriffEnabled, getRoleConfigStr, getVisibleGodStateForPlayer, getVisibleLogsForPlayer, getVisiblePlayersForPlayer, godState.sheriffCandidates, godState.sheriffId, turnCount, logs, players, aiHostedPlayers]);

    // 按 playerId 登记等待者：多人局并发投票/夜间行动时可能同时有多名
    // 人类玩家等待输入，单一 resolver 会被后注册者覆盖，先登记的 Promise
    // 永远无人 resolve，整局卡死在投票阶段（G-1 死锁根因）。
    const humanInputWaitersRef = useRef<Map<number, WaiterEntry>>(new Map());
    // MCP 外脑提示去重:每局只提示一次桥状态;已宣告过认领成功的分身名
    const mcpBridgeHintShownRef = useRef(false);
    const mcpAnnouncedRef = useRef<Set<string>>(new Set());
    const addToast = useSetAtom(addToastAtom);

    // 有 MCP 分身时轮询枢纽认领名单:会话认领成功 → 系统日志 + toast
    useEffect(() => {
        const timer = setInterval(async () => {
            if (isUnmountedRef.current) return;
            const mcpNames = players
                .map(p => getActorConfig(p.actorId))
                .filter(({ actor }) => actor?.brain === 'mcp')
                .map(({ actor }) => actor.name);
            if (!mcpNames.length) return;
            try {
                const res = await fetch('http://localhost:3015/health', { signal: AbortSignal.timeout(1500) });
                const data = await res.json();
                const claimed: string[] = data.claimed || [];
                for (const name of mcpNames) {
                    if (claimed.includes(name) && !mcpAnnouncedRef.current.has(name)) {
                        mcpAnnouncedRef.current.add(name);
                        await addSystemLog(`「${name}」的外脑会话已接入 ✓（轮到即由外部 AI 决策）`);
                        addToast(`「${name}」的外脑会话已接入`, 'success');
                    }
                }
            } catch { /* 桥未运行,静默 */ }
        }, 4000);
        return () => clearInterval(timer);
    }, [players, addSystemLog, addToast]);
    const addToastAtomSafe = (message: string, type: 'warning' | 'info' | 'error' | 'success') => {
        try { addToast(message, type); } catch { /* 引擎卸载中 */ }
    };
    // 全局 atom 中登记的等待者表：等待输入的可能是另一个引擎实例
    // （联机房主的主循环在 useGameRoomState 挂载的实例上），
    // resolveHumanInput 必须能跨实例回退到这个登记。
    const globalResolverMapRef = useRef<Record<number, (input: UserInput) => void>>({});
    globalResolverMapRef.current = useAtomValue(humanInputResolverMapAtom);
    const setHumanInputResolverMap = useSetAtom(humanInputResolverMapAtom);

    const waitForHumanInput = useCallback((playerId: number, timeoutMs = 0): Promise<UserInput> => {
        // 面板在引擎登记前先落 userInputAtom 的竞态兜底：按归属玩家认领
        const pending = userInputRef.current;
        if (pending && pending._playerId === playerId) {
            setUserInput(null);
            return Promise.resolve(pending);
        }
        return new Promise<UserInput>((resolve, reject) => {
            const entry: WaiterEntry = { resolve: () => {}, reject: () => {}, timer: null };
            const cleanup = () => {
                if (entry.timer) clearTimeout(entry.timer);
                humanInputWaitersRef.current.delete(playerId);
                setHumanInputResolverMap(prev => {
                    if (!(playerId in prev)) return prev;
                    const next = { ...prev };
                    delete next[playerId];
                    return next;
                });
            };
            // 统一封装 resolve/reject：无论触发方是本实例 ref、全局 atom
            // （HumanInputPanel）还是跨实例回退（MultiplayerView），
            // 触发时都同步清理两处登记，防止陈旧 resolver 被再次消费。
            entry.resolve = (value: UserInput) => {
                cleanup();
                resolve(value);
            };
            entry.reject = (reason?: unknown) => {
                cleanup();
                reject(reason);
            };
            humanInputWaitersRef.current.set(playerId, entry);
            setHumanInputResolverMap(prev => ({ ...prev, [playerId]: entry.resolve }));
            if (timeoutMs > 0) {
                entry.timer = setTimeout(() => {
                    entry.reject(new DOMException('Human input timeout', 'TimeoutError'));
                }, timeoutMs);
            }
        });
    }, [setUserInput, setHumanInputResolverMap]);

    const resolveHumanInput = useCallback((input: UserInput, playerId?: number) => {
        // 路由优先级：显式归属玩家（联机按房主查到的 actingPlayer.id）→
        // 当前发言者（单机面板）→ 唯一等待者兜底（旧面板未带归属时）
        const candidates: Array<number | undefined> = [playerId, jotaiStore.get(currentSpeakerIdAtom) ?? undefined];
        for (const candidate of candidates) {
            if (candidate == null) continue;
            const localWaiter = humanInputWaitersRef.current.get(candidate);
            const resolver = localWaiter ? localWaiter.resolve : globalResolverMapRef.current[candidate];
            if (resolver) {
                addEventTrace('人类提交输入', {
                    eventKind: 'ACTION',
                    action: 'HUMAN_INPUT_RESOLVED',
                    inputKeys: Object.keys(input || {}),
                    inputAction: input?.action ?? null,
                    actionTarget: input?.actionTarget ?? input?.target ?? null,
                    routedPlayerId: candidate,
                });
                resolver(input);
                return true;
            }
        }
        const localIds = [...humanInputWaitersRef.current.keys()];
        if (localIds.length === 1 && Object.keys(globalResolverMapRef.current).length <= 1) {
            const localWaiter = humanInputWaitersRef.current.get(localIds[0]);
            if (localWaiter) {
                addEventTrace('人类提交输入', {
                    eventKind: 'ACTION',
                    action: 'HUMAN_INPUT_RESOLVED',
                    inputKeys: Object.keys(input || {}),
                    inputAction: input?.action ?? null,
                    actionTarget: input?.actionTarget ?? input?.target ?? null,
                    routedPlayerId: localIds[0],
                });
                localWaiter.resolve(input);
                return true;
            }
        }
        return false;
    }, [addEventTrace]);

    const rejectHumanInput = useCallback(() => {
        const waiters = [...humanInputWaitersRef.current.values()];
        if (waiters.length === 0 && Object.keys(globalResolverMapRef.current).length === 0) return;
        addEventTrace('人类输入取消', {
            eventKind: 'ACTION',
            action: 'HUMAN_INPUT_REJECTED',
            waiterCount: waiters.length,
        });
        waiters.forEach(waiter => waiter.reject(new DOMException('Human input cancelled', 'AbortError')));
        // 全局登记里可能残留跨实例 resolver（闭包在另一实例无法 reject），清表防陈旧消费
        setHumanInputResolverMap({});
    }, [addEventTrace, setHumanInputResolverMap]);

    // AI 托管开启时立即放行该座位的等待中输入：断线/手动托管即时生效，
    // 等待者以 TimeoutError 拒绝，调用方落入 AI 决策路径（重连后解除托管恢复手动）。
    useEffect(() => {
        for (const [waiterId, waiter] of humanInputWaitersRef.current) {
            const player = players.find(p => p.id === waiterId);
            if (player && aiHostedPlayers[player.seatNumber]) {
                waiter.reject(new DOMException('Human input timeout', 'TimeoutError'));
            }
        }
    }, [aiHostedPlayers, players]);

    const getDecisionTarget = useCallback((result: LLMResponse | UserInput | null, validTargets: number[]) => {
        const rawTarget = result?.actionTarget ?? result?.target ?? result?.target1 ?? result?.cupidTarget1;
        const target = Number(rawTarget);
        return Number.isFinite(target) && validTargets.includes(target) ? target : null;
    }, []);

    const MAX_LLM_RETRY = 2;

    // 远端 LLM 临时不可用（免费 API 常有波动）时的本地兜底：仅接管当前轮次，不暂停整个流程。
    // 内置小模型优先，未下载则用规则离线大脑；后续每轮仍先请求远端，服务恢复后自动接回。
    const llmDegradedRef = useRef(false);
    const llmFallbackNoticeAtRef = useRef(0);

    const runLocalFallbackTurn = useCallback(async (
        player: Player,
        turnPhase: GamePhase,
        actionInstruction?: string,
        skipBuiltin: boolean = false
    ): Promise<{ result: LLMResponse; responseText: string; modelName: string }> => {
        const context = buildSkillContext(player, turnPhase);
        const messages = await werewolfSkill.generatePrompts(player, context, actionInstruction);
        if (!skipBuiltin && isBuiltinLlmReady()) {
            try {
                const text = await builtinGenerate(messages, { maxTokens: 200 });
                const parsed = parseLLMResponse(text) as LLMResponse;
                return { result: parsed, responseText: text, modelName: '内置小模型(降级)' };
            } catch { /* 内置模型失败 → 规则大脑 */ }
        }
        const isNightSkill = [GamePhase.WEREWOLF_ACTION, GamePhase.SEER_ACTION, GamePhase.WITCH_ACTION, GamePhase.GUARD_ACTION].includes(turnPhase);
        const fbCtx = {
            player,
            phase: turnPhase,
            turnCount,
            alivePlayers: getAlivePlayers(players),
            wolfTeammates: isWolfRole(player.role) ? players.filter(p => isEffectivelyAlive(p) && isWolfRole(p.role) && p.id !== player.id).map(p => p.id) : undefined,
            sheriffId: godState.sheriffId ?? null,
        };
        const fb = (isNightSkill ? fallbackNightAction(fbCtx) : fallbackDecide(fbCtx)) as LLMResponse;
        return { result: fb, responseText: JSON.stringify(fb), modelName: '规则大脑(降级)' };
    }, [buildSkillContext, getAlivePlayers, godState.sheriffId, players, turnCount]);

    const notifyLlmDegraded = useCallback(async (seatNumber: number, remoteModelName: string, error: unknown) => {
        llmDegradedRef.current = true;
        const now = Date.now();
        if (now - llmFallbackNoticeAtRef.current < 5 * 60_000) return;
        llmFallbackNoticeAtRef.current = now;
        const detail = error instanceof Error ? error.message : String(error ?? '未知错误');
        await addSystemLog(`${seatNumber}号 (${remoteModelName}) 请求失败，本轮降级本地模型接管；后续轮次仍优先远端，恢复后自动接回。错误：${detail}`);
        jotaiStore.set(addToastAtom, `${seatNumber}号 模型暂不可用，已降级本地模型`, 'warning');
    }, [addSystemLog]);

    const notifyLlmRecovered = useCallback(async (remoteModelName: string) => {
        if (!llmDegradedRef.current) return;
        llmDegradedRef.current = false;
        llmFallbackNoticeAtRef.current = 0;
        await addSystemLog(`远端模型 ${remoteModelName} 已恢复，后续行动切回远端。`);
    }, [addSystemLog]);

    const getTargetDecision = useCallback(async (
        player: Player,
        validTargets: number[],
        contextPhase: GamePhase,
        actionInstruction: string,
        fallbackSummary: string
    ): Promise<VoteDecision> => {
        // 检查是否被 AI 托管（联机断线后房主操作）
        const isAIHosted = !!aiHostedPlayers[player.seatNumber];
        const shouldUseLLM = !player.isHuman || isAIHosted;

        if (player.isHuman && !isAIHosted) {
            setSpeaker(player.id);
            // 单机等待无超时：在过程日志留一条仅本人可见的标记，说明游戏正停在这里等谁
            if (!player.roomPlayerId) {
                setLogs(prev => appendLog(prev, [{
                    id: `wait-human-T${contextPhase}-${turnCount}-${player.id}-${Date.now()}-${logIdCounter.current++}`,
                    turn: turnCount,
                    phase: contextPhase,
                    content: `等待 ${player.seatNumber}号（你）操作…（${Math.round(SINGLE_PLAYER_HUMAN_INPUT_TIMEOUT_MS / 1000)} 秒后将由 AI 托管）`,
                    timestamp: Date.now(),
                    isSystem: true,
                    visibleTo: [player.id],
                }]));
            }
            // 联机座位等待有上限：断线/挂机的客人超时后本轮落入 AI 托管路径
            const inputTimeoutMs = player.roomPlayerId ? HUMAN_INPUT_TIMEOUT_MS : SINGLE_PLAYER_HUMAN_INPUT_TIMEOUT_MS;
            let humanInput: UserInput | null = null;
            let humanTimedOut = false;
            try {
                humanInput = await waitForHumanInput(player.id, inputTimeoutMs);
            } catch (e) {
                if (e instanceof DOMException && e.name === 'TimeoutError') {
                    humanTimedOut = true;
                    addToastAtomSafe(`${player.seatNumber}号 玩家未及时行动，本轮由 AI 托管`, 'warning');
                    await addSystemLog(`${player.seatNumber}号 玩家输入超时，本轮由 AI 托管决策`);
                } else {
                    setSpeaker(null);
                    throw e;
                }
            }
            setSpeaker(null);
            if (!humanTimedOut && humanInput) {
                const target = getDecisionTarget(humanInput, validTargets);
                addEventTrace(`目标决策：${player.seatNumber}号 -> ${target ?? '无'}`, {
                    eventKind: 'ACTION',
                    action: 'TARGET_DECISION',
                    playerId: player.id,
                    seatNumber: player.seatNumber,
                    phase: contextPhase,
                    validTargets,
                    chosenTarget: target,
                    isHuman: true,
                });
                return {
                    target,
                    speak: humanInput.speak || '',
                    strategySummary: humanInput.strategySummary || fallbackSummary,
                    modelName: 'HUMAN',
                    rawResult: humanInput,
                    isHuman: true
                };
            }
        }

        // 手动选择内置小模型作为基础模型:优先于自动离线回退
        const actorCfg = actors.find(a => a.id === player.actorId);
        if (actorCfg?.llmPresetId === BUILTIN_LLM_PRESET_ID) {
            setLlmThinking({
                playerId: player.id, actorName: actorCfg.name, modelName: '内置小模型',
                phase: contextPhase, attempt: 1, maxAttempts: 1, startedAt: Date.now(), status: 'thinking' as const,
            });
            try {
                const context = buildSkillContext(player, contextPhase);
                const messages = await werewolfSkill.generatePrompts(player, context, actionInstruction);
                const text = await builtinGenerate(messages, { maxTokens: 160 });
                const parsed = parseLLMResponse(text);
                clearLlmThinking();
                return {
                    target: getDecisionTarget(parsed, validTargets),
                    speak: parsed.speak,
                    strategySummary: parsed.strategySummary || fallbackSummary,
                    modelName: '内置小模型',
                };
            } catch (e) {
                clearLlmThinking();
                // 内置小模型失败:离线模式下落回规则离线大脑;否则走原 LLM 路径(失败会提示用户检查配置)
                if (offlineBrainActive) {
                    const decision = fallbackDecide({
                        player, phase: contextPhase, turnCount, validTargets,
                        alivePlayers: getAlivePlayers(players),
                        wolfTeammates: isWolfRole(player.role) ? players.filter(p => isEffectivelyAlive(p) && isWolfRole(p.role) && p.id !== player.id).map(p => p.id) : undefined,
                        sheriffId: godState.sheriffId ?? null,
                    });
                    return {
                        target: decision.target,
                        speak: decision.speak,
                        strategySummary: decision.summary || fallbackSummary,
                        modelName: '规则离线大脑',
                    };
                }
            }
        }

        // 离线大脑:零配置机器的兜底决策(规则型,尊重信息边界)。MCP 外脑优先于离线大脑
        if (offlineBrainActive && actorCfg?.brain !== 'mcp' && actorCfg?.llmPresetId !== BUILTIN_LLM_PRESET_ID) {
            const decision = fallbackDecide({
                player,
                phase: contextPhase,
                turnCount,
                validTargets,
                alivePlayers: getAlivePlayers(players),
                wolfTeammates: isWolfRole(player.role) ? players.filter(p => isEffectivelyAlive(p) && isWolfRole(p.role) && p.id !== player.id).map(p => p.id) : undefined,
                sheriffId: godState.sheriffId ?? null,
            });
            return {
                target: decision.target,
                speak: decision.speak,
                strategySummary: decision.summary || fallbackSummary,
                modelName: '内置离线大脑',
            };
        }

        const { llm, provider, actor } = getActorConfig(player.actorId);
        let lastError: Error | null = null;

        // MCP 外脑:决策交给外部 AI,失败/超时回退该分身的 LLM
        if (actor?.brain === 'mcp') {
            if (!mcpBridgeHintShownRef.current) {
                mcpBridgeHintShownRef.current = true;
                const alive = await isBridgeAlive();
                if (alive) {
                    await addSystemLog(`MCP 外脑桥已连接，${player.seatNumber}号（${actor.name}）由外部 AI 接管`);
                } else {
                    addToastAtomSafe('MCP 外脑桥未运行，相关分身将回退 LLM（可运行 npm run mcp-bridge）', 'warning');
                }
            }
            const context = buildSkillContext(player, contextPhase);
            const messages = await werewolfSkill.generatePrompts(player, context, actionInstruction);
            const startedAt = Date.now();
            setLlmThinking({
                playerId: player.id, actorName: actor.name, modelName: 'MCP 外脑',
                phase: contextPhase, attempt: 1, maxAttempts: 1, startedAt, status: 'thinking' as const,
            });
            const mcpController = new AbortController();
            llmAbortControllersRef.current.add(mcpController);
            const mcpResult = await requestMcpDecision({
                seat: player.seatNumber, name: actor.name, role: player.role,
                phase: contextPhase, turnCount, actionInstruction, messages, validTargets,
                signal: mcpController.signal,
            });
            llmAbortControllersRef.current.delete(mcpController);
            clearLlmThinking();
            if (mcpResult.ok && mcpResult.action) {
                const pseudo = parseLLMResponse(JSON.stringify(mcpResult.action));
                const target = getDecisionTarget(pseudo, validTargets);
                addEventTrace(`目标决策(MCP 外脑)：${player.seatNumber}号 -> ${target ?? '无'}`, {
                    eventKind: 'ACTION', action: 'TARGET_DECISION',
                    playerId: player.id, seatNumber: player.seatNumber,
                    phase: contextPhase, validTargets, chosenTarget: target, isHuman: false,
                });
                return {
                    target,
                    speak: pseudo.speak || '',
                    strategySummary: pseudo.strategySummary || fallbackSummary,
                    modelName: 'MCP 外脑',
                    durationMs: Date.now() - startedAt,
                    rawResult: pseudo,
                };
            }
            await addSystemLog(`${player.seatNumber}号 MCP 外脑不可用（${mcpResult.error || '未知'}），本次回退 LLM`);
        }

        for (let attempt = 0; attempt <= MAX_LLM_RETRY; attempt++) {
            const abortController = new AbortController();
            llmAbortControllersRef.current.add(abortController);
            try {
                if (attempt > 0) {
                    await addSystemLog(`${player.id}号 LLM 目标选择重试 (${attempt}/${MAX_LLM_RETRY})...`);
                    await new Promise(r => setTimeout(r, 1500 * attempt));
                }
                const context = buildSkillContext(player, contextPhase);
                const messages = await werewolfSkill.generatePrompts(player, context, actionInstruction);
                const startedAt = Date.now();
                const { actor } = getActorConfig(player.actorId);
                const responseText = await generateText(messages, llm, provider, ({ attempt, maxAttempts, status }) => {
                    setLlmThinking({
                        playerId: player.id,
                        actorName: actor.name,
                        modelName: llm.name || llm.modelId,
                        phase: contextPhase,
                        attempt,
                        maxAttempts,
                        startedAt,
                        status
                    });
                }, abortController.signal, remoteConfig.llmProxyEnabled ? remoteConfig.llmProxyUrl : undefined);
                const durationMs = Date.now() - startedAt;
                llmAbortControllersRef.current.delete(abortController);
                clearLlmThinking();
                if (abortController.signal.aborted || !isAutoRef.current) {
                    return { target: null, speak: '', strategySummary: '目标选择被中止。', modelName: llm.name || llm.modelId, durationMs };
                }
                const result = parseLLMResponse(responseText || "{}");
                // 怀疑表捕获（投票决策路径，详见 generateTurn 同名逻辑）
                if (!player.isHuman && contextPhase === GamePhase.VOTING) {
                    const suspicionText = typeof (result as { suspicion?: unknown } | null)?.suspicion === 'string' ? ((result as { suspicion?: string }).suspicion ?? '').trim() : '';
                    if (suspicionText) {
                        setGodState(prev => ({ ...prev, agentSuspicion: { ...(prev.agentSuspicion ?? {}), [player.id]: suspicionText.slice(0, 300) } }));
                    }
                }
                const target = getDecisionTarget(result, validTargets);
                addEventTrace(`目标决策：${player.seatNumber}号 -> ${target ?? '无'}`, {
                    eventKind: 'ACTION',
                    action: 'TARGET_DECISION',
                    playerId: player.id,
                    seatNumber: player.seatNumber,
                    phase: contextPhase,
                    validTargets,
                    chosenTarget: target,
                    isHuman: false,
                    durationMs,
                    strategySummary: result?.strategySummary || result?.summary || null,
                });

                const isEmptyResponse = !responseText?.trim() && !result?.speak && target === null;
                if (isEmptyResponse && attempt < MAX_LLM_RETRY) {
                    lastError = new Error('Empty response from LLM');
                    continue;
                }

                if (llmDegradedRef.current) await notifyLlmRecovered(llm.name || llm.modelId);
                return {
                    target,
                    speak: result?.speak || '',
                    strategySummary: result?.strategySummary || result?.summary || '',
                    modelName: llm.name || llm.modelId,
                    durationMs,
                    rawResult: result,
                    rawResponse: responseText
                };
            } catch (e) {
                // 只有我们自己 abort（用户停止/重开）才按中止处理；
                // 部分供应商的超时也以 AbortError 形态出现，需按普通失败走重试与本地兜底
                if (e instanceof DOMException && e.name === 'AbortError' && abortController.signal.aborted) {
                    return { target: null, speak: '', strategySummary: '目标选择被中止。', modelName: 'UNKNOWN' };
                }
                lastError = e instanceof Error ? e : new Error(String(e));
                console.warn(`AI Target Decision attempt ${attempt} failed:`, e);
                if (attempt < MAX_LLM_RETRY) continue;
            }
        }

        const modelName = llm?.name || llm?.modelId || 'UNKNOWN';
        const isTimeout = lastError?.message?.includes('fetch') || lastError?.message?.includes('timeout') || lastError?.message?.includes('Timeout') || lastError?.message?.includes('abort') || lastError?.message?.includes('ECONNREFUSED');
        const errorType = isTimeout ? '请求超时/网络错误' : 'API错误';
        console.error(`AI Target Decision Error after retries [${player.id}号/${modelName}]`, lastError);
        clearLlmThinking();
        setSpeaker(null);
        // 重试耗尽：先降级本地模型完成本轮（免费 API 波动时保持对局连续），下一轮仍优先远端
        try {
            const fallback = await runLocalFallbackTurn(player, contextPhase, actionInstruction);
            await notifyLlmDegraded(player.seatNumber, modelName, lastError);
            return {
                target: getDecisionTarget(fallback.result, validTargets),
                speak: fallback.result.speak || '',
                strategySummary: fallback.result.strategySummary || fallbackSummary,
                modelName: fallback.modelName,
                rawResult: fallback.result,
                rawResponse: fallback.responseText,
            };
        } catch (fallbackError) {
            console.error('目标决策本地兜底失败，回退暂停流程', fallbackError);
        }
        setIsAuto(false);
        await addSystemLog(
            `${player.id}号 (${modelName}) LLM ${errorType}（已重试${MAX_LLM_RETRY}次），且本地兜底不可用，已暂停自动流程。请检查该模型配置或更换模型后继续。错误：${lastError?.message || '未知错误'}`,
            undefined,
            `${player.id}号 ${errorType}，自动流程已暂停。请检查模型配置后继续。`
        );
        jotaiStore.set(addToastAtom, `${player.id}号 ${errorType}，请检查模型配置`, 'error');
        return { target: null, speak: '', strategySummary: `目标选择失败：${lastError?.message || '未知错误'}`, modelName };
    }, [addEventTrace, addSystemLog, buildSkillContext, clearLlmThinking, getActorConfig, getDecisionTarget, setIsAuto, setSpeaker, waitForHumanInput]);

    // --- Vote Logic ---
    const getAiVote = useCallback(async (player: Player, validTargets: number[]): Promise<VoteDecision> => {
        return getTargetDecision(player, validTargets, GamePhase.VOTING, 'Vote for a player to exile.', '人类玩家手动投票。');
    }, [getTargetDecision]);

    const generateTurn = useCallback(async (
        player: Player,
        actionInstruction?: string,
        visibleTo?: number[],
        skipIsProcessingFlag: boolean = false
    ): Promise<LLMResponse | UserInput | typeof LLM_ABORTED_RESULT | ReturnType<typeof createLlmFailedResult> | null> => {
        if (!skipIsProcessingFlag && (isProcessing || isReplay || isTheater)) return null;
        if (!skipIsProcessingFlag) setIsProcessing(true);
        const turnPhase = phase;

        // 检查是否被 AI 托管
        const isAIHosted = !!aiHostedPlayers[player.seatNumber];
        const shouldUseLLM = !player.isHuman || isAIHosted;

        try {
            const { actor, tts, llm, provider } = getActorConfig(player.actorId);
            let effectiveModelName = llm.name || llm.modelId;
            let result: LLMResponse | UserInput | null = null;
            let responseText = '';
            let llmStartedAt = 0;
            let llmFinishedAt = 0;

        const waitForHuman = player.isHuman && !isAIHosted;
        let humanTimedOut = false;
        if (waitForHuman) {
            // Wait for human
            addEventTrace(`等待人类输入：${player.seatNumber}号`, {
                eventKind: 'ACTION',
                action: 'WAIT_HUMAN_INPUT',
                playerId: player.id,
                seatNumber: player.seatNumber,
                phase: turnPhase,
                actionInstruction: actionInstruction || null,
            });
            setSpeaker(player.id);
            // 单机等待无超时：在过程日志留一条仅本人可见的标记，说明游戏正停在这里等谁
            if (!player.roomPlayerId) {
                setLogs(prev => appendLog(prev, [{
                    id: `wait-human-T${turnCount}-${player.id}-${Date.now()}-${logIdCounter.current++}`,
                    turn: turnCount,
                    phase: turnPhase,
                    content: `等待 ${player.seatNumber}号（你）操作…（${Math.round(SINGLE_PLAYER_HUMAN_INPUT_TIMEOUT_MS / 1000)} 秒后将由 AI 托管）`,
                    timestamp: Date.now(),
                    isSystem: true,
                    visibleTo: [player.id],
                }]));
            }
            // 联机座位等待有上限：断线/挂机的客人超时后本轮落入 AI 托管路径
            const inputTimeoutMs = player.roomPlayerId ? HUMAN_INPUT_TIMEOUT_MS : SINGLE_PLAYER_HUMAN_INPUT_TIMEOUT_MS;
            try {
                result = await waitForHumanInput(player.id, inputTimeoutMs);
            } catch (e) {
                if (e instanceof DOMException && e.name === 'TimeoutError') {
                    humanTimedOut = true;
                    result = null;
                    setSpeaker(null);
                    addToastAtomSafe(`${player.seatNumber}号 玩家未及时行动，本轮由 AI 托管`, 'warning');
                    await addSystemLog(`${player.seatNumber}号 玩家输入超时，本轮由 AI 托管决策`);
                } else {
                    setSpeaker(null);
                    throw e;
                }
            }
            // 等待期间组件可能已卸载（退出对局/切屏），立即停止后续写状态
            if (!humanTimedOut && isUnmountedRef.current) return null;
        }
        if (!waitForHuman || humanTimedOut) {
                addEventTrace(`AI 行动开始：${player.seatNumber}号`, {
                    eventKind: 'ACTION',
                    action: 'GENERATE_TURN',
                    playerId: player.id,
                    seatNumber: player.seatNumber,
                    phase: turnPhase,
                    visibleTo: visibleTo || null,
                    actionInstruction: actionInstruction || null,
                    modelName: llm.name || llm.modelId,
                });
                const context = buildSkillContext(player, turnPhase);
                const messages = await werewolfSkill.generatePrompts(player, context, actionInstruction);

                // 内置离线大脑:零配置兜底,直接产出决策,不调用外部 LLM。MCP 外脑优先
                if (offlineBrainActive && actor?.brain !== 'mcp') {
                    const fbCtx = {
                        player,
                        phase: turnPhase,
                        turnCount,
                        alivePlayers: getAlivePlayers(players),
                        wolfTeammates: isWolfRole(player.role) ? players.filter(p => isEffectivelyAlive(p) && isWolfRole(p.role) && p.id !== player.id).map(p => p.id) : undefined,
                        sheriffId: godState.sheriffId ?? null,
                    };
                    // 已下载内置小模型时:真 LLM 生成发言(0.5B 级,质量有限但会"思考")
                    if (isBuiltinLlmReady()) {
                        try {
                            llmStartedAt = Date.now();
                            const builtinText = await builtinGenerate(messages, { maxTokens: 160 });
                            llmFinishedAt = Date.now();
                            if (isUnmountedRef.current) return null;
                            result = parseLLMResponse(builtinText);
                            responseText = builtinText;
                            effectiveModelName = '内置小模型';
                        } catch { /* 小模型失败:落回规则模板 */ }
                    }
                    // 只有内置小模型失败时才走规则大脑；成功结果不能被无条件覆盖。
                    if (!result) {
                        const isNightSkill = [GamePhase.WEREWOLF_ACTION, GamePhase.SEER_ACTION, GamePhase.WITCH_ACTION, GamePhase.GUARD_ACTION].includes(turnPhase);
                        const fb = (isNightSkill ? fallbackNightAction(fbCtx) : fallbackDecide(fbCtx)) as LLMResponse;
                        llmStartedAt = Date.now();
                        await new Promise(r => setTimeout(r, 900 + Math.random() * 1600));
                        llmFinishedAt = Date.now();
                        result = fb;
                        responseText = JSON.stringify(fb);
                        effectiveModelName = '内置离线大脑';
                    }
                    clearLlmThinking();
                    if (isUnmountedRef.current) return null;
                }

                // 手动选择内置小模型作为基础模型:直接小模型生成,失败按离线/在线分别处理
                else if (actor.llmPresetId === BUILTIN_LLM_PRESET_ID) {
                    llmStartedAt = Date.now();
                    setLlmThinking({
                        playerId: player.id, actorName: actor.name, modelName: '内置小模型',
                        phase: turnPhase, attempt: 1, maxAttempts: 1, startedAt: llmStartedAt,
                        status: 'thinking' as const,
                    });
                    try {
                        const builtinText = await builtinGenerate(messages, { maxTokens: 160 });
                        llmFinishedAt = Date.now();
                        if (isUnmountedRef.current) return null;
                        result = parseLLMResponse(builtinText);
                        responseText = builtinText;
                    } catch (e) {
                        llmFinishedAt = Date.now();
                        if (offlineBrainActive) {
                            const fbCtx = {
                                player, phase: turnPhase, turnCount,
                                alivePlayers: getAlivePlayers(players),
                                wolfTeammates: isWolfRole(player.role) ? players.filter(p => isEffectivelyAlive(p) && isWolfRole(p.role) && p.id !== player.id).map(p => p.id) : undefined,
                                sheriffId: godState.sheriffId ?? null,
                            };
                            const isNightSkill = [GamePhase.WEREWOLF_ACTION, GamePhase.SEER_ACTION, GamePhase.WITCH_ACTION, GamePhase.GUARD_ACTION].includes(turnPhase);
                            result = (isNightSkill ? fallbackNightAction(fbCtx) : fallbackDecide(fbCtx)) as LLMResponse;
                        } else {
                            // 内置模型本轮失败：降级规则大脑，不暂停流程；下一轮仍先试内置模型
                            try {
                                const fallback = await runLocalFallbackTurn(player, turnPhase, actionInstruction, true);
                                await notifyLlmDegraded(player.seatNumber, '内置小模型', e);
                                result = fallback.result;
                                responseText = fallback.responseText;
                                effectiveModelName = fallback.modelName;
                            } catch (fallbackError) {
                                console.error('内置模型本地兜底失败', fallbackError);
                                throw e;
                            }
                        }
                    } finally {
                        clearLlmThinking();
                    }
                }

                // MCP 外脑:发言/行动决策交给外部 AI,失败/超时回退 LLM
                else if (actor?.brain === 'mcp') {
                    if (!mcpBridgeHintShownRef.current) {
                        mcpBridgeHintShownRef.current = true;
                        const alive = await isBridgeAlive();
                        if (alive) {
                            await addSystemLog(`MCP 外脑桥已连接，${player.seatNumber}号（${actor.name}）由外部 AI 接管`);
                        } else {
                            addToastAtomSafe('MCP 外脑桥未运行，相关分身将回退 LLM（可运行 npm run mcp-bridge）', 'warning');
                        }
                    }
                    llmStartedAt = Date.now();
                    setLlmThinking({
                        playerId: player.id, actorName: actor.name, modelName: 'MCP 外脑',
                        phase: turnPhase, attempt: 1, maxAttempts: 1, startedAt: llmStartedAt,
                        status: 'thinking' as const,
                    });
                    const mcpController = new AbortController();
                    llmAbortControllersRef.current.add(mcpController);
                    const mcpResult = await requestMcpDecision({
                        seat: player.seatNumber, name: actor.name, role: player.role,
                        phase: turnPhase, turnCount, actionInstruction, messages,
                        signal: mcpController.signal,
                    });
                    llmAbortControllersRef.current.delete(mcpController);
                    llmFinishedAt = Date.now();
                    clearLlmThinking();
                    if (isUnmountedRef.current) return null;
                    if (mcpResult.ok && mcpResult.action) {
                        // 透传完整 action:外脑可提交 useCure/poisonTarget/cupidTarget1/2/shouldExplode 等全部协议字段
                        result = parseLLMResponse(JSON.stringify(mcpResult.action)) as LLMResponse;
                        responseText = JSON.stringify(result);
                    } else {
                        await addSystemLog(`${player.seatNumber}号 MCP 外脑不可用（${mcpResult.error || '未知'}），本次回退 LLM`);
                    }
                }

                if (!result) {
                const abortController = new AbortController();
                llmAbortControllersRef.current.add(abortController);
                llmStartedAt = Date.now();
                let usedFallbackModel = false;
                try {
                    responseText = await generateText(messages, llm, provider, ({ attempt, maxAttempts, status }) => {
                        setLlmThinking({
                            playerId: player.id,
                            actorName: actor.name,
                            modelName: llm.name || llm.modelId,
                            phase: turnPhase,
                            attempt,
                            maxAttempts,
                            startedAt: llmStartedAt,
                            status
                        });
                    }, abortController.signal, remoteConfig.llmProxyEnabled ? remoteConfig.llmProxyUrl : undefined);
                } catch (e) {
                    // 远端不可用（免费 API 波动常见）：本轮降级本地模型，不暂停流程；下一轮仍优先远端，恢复后自动接回
                    // 供应商侧超时同样以 AbortError 形态出现，只有我们自己 abort 的才走中止语义
                    if (e instanceof DOMException && e.name === 'AbortError' && abortController.signal.aborted) throw e;
                    llmAbortControllersRef.current.delete(abortController);
                    clearLlmThinking();
                    const fallback = await runLocalFallbackTurn(player, turnPhase, actionInstruction);
                    await notifyLlmDegraded(player.seatNumber, llm.name || llm.modelId, e);
                    result = fallback.result;
                    responseText = fallback.responseText;
                    effectiveModelName = fallback.modelName;
                    llmFinishedAt = Date.now();
                    usedFallbackModel = true;
                }
                if (!usedFallbackModel) {
                    if (llmDegradedRef.current) await notifyLlmRecovered(llm.name || llm.modelId);
                }
                llmFinishedAt = llmFinishedAt || Date.now();
                llmAbortControllersRef.current.delete(abortController);
                if (abortController.signal.aborted || !isAutoRef.current) return LLM_ABORTED_RESULT;
                result = result ?? parseLLMResponse(responseText || "{}");
                }
            }

            // 怀疑表（agent 自维护）：公开发言阶段 AI 可在 JSON 中附带 suspicion 字段，
            // 引擎代为存储，并在该玩家后续提示词中回注（见 WerewolfSkill.buildHistory）
            if (!player.isHuman && [GamePhase.DAY_DISCUSSION, GamePhase.SHERIFF_ELECTION, GamePhase.VOTING, GamePhase.DISCUSSION_ROUND_TWO, GamePhase.LAST_WORDS].includes(turnPhase)) {
                const suspicionText = typeof (result as { suspicion?: unknown } | null)?.suspicion === 'string' ? ((result as { suspicion?: string }).suspicion ?? '').trim() : '';
                if (suspicionText) {
                    setGodState(prev => ({ ...prev, agentSuspicion: { ...(prev.agentSuspicion ?? {}), [player.id]: suspicionText.slice(0, 300) } }));
                }
            }

            let speech = getSpeechText(result) || "...";

            // --- 发言质量验证：过短发言要求重新生成 ---
            const isPublicSpeech = turnPhase === GamePhase.DAY_DISCUSSION ||
                turnPhase === GamePhase.DISCUSSION_ROUND_TWO ||
                turnPhase === GamePhase.SHERIFF_ELECTION ||
                turnPhase === GamePhase.LAST_WORDS;
            if (isPublicSpeech && !shouldUseLLM && !offlineBrainActive && speech.length < 20 && actor?.brain !== 'mcp') {
                // 公开发言过短，追加提示重新生成
                const retryInstruction = "你的发言太短了，请发表至少50字的有实质内容的发言。分析局势、表达观点、指出可疑之处。";
                try {
                    const context2 = buildSkillContext(player, turnPhase);
                    const messages2 = await werewolfSkill.generatePrompts(player, context2, retryInstruction);
                    const abortCtrl2 = new AbortController();
                    llmAbortControllersRef.current.add(abortCtrl2);
                    const retryResponse = await generateText(messages2, llm, provider, () => {}, abortCtrl2.signal, remoteConfig.llmProxyEnabled ? remoteConfig.llmProxyUrl : undefined);
                    llmAbortControllersRef.current.delete(abortCtrl2);
                    if (!abortCtrl2.signal.aborted && isAutoRef.current) {
                        const retryResult = parseLLMResponse(retryResponse || "{}");
                        const retrySpeech = getSpeechText(retryResult);
                        if (retrySpeech && retrySpeech.length > speech.length) {
                            speech = retrySpeech;
                            result = retryResult;
                            responseText = retryResponse;
                        }
                    }
                } catch {
                    // 重试失败则保留原始发言
                }
            }
            const strategySummary = typeof result?.strategySummary === 'string'
                ? result.strategySummary.trim()
                : (typeof result?.summary === 'string' ? result.summary.trim() : '');
            const llmDurationMs = llmStartedAt && llmFinishedAt ? llmFinishedAt - llmStartedAt : undefined;
            addEventTrace(`行动完成：${player.seatNumber}号`, {
                eventKind: 'ACTION',
                action: 'TURN_COMPLETED',
                playerId: player.id,
                seatNumber: player.seatNumber,
                phase: turnPhase,
                isHuman: !!player.isHuman && !isAIHosted,
                durationMs: llmDurationMs,
                hasSpeech: !!speech?.trim(),
                visibleTo: visibleTo || null,
                strategySummary: strategySummary || null,
            });

            // FIX: Generate Shared ID with stronger UUID and monotonic counter
            const uniqueSuffix = `${Date.now()}-${logIdCounter.current++}-${Math.random().toString(36).slice(2)}`;
            const sharedId = `msg-T${turnCount}-${turnPhase}-${player.id}-${uniqueSuffix}`;

            // 提前生成 audioKey 并并行预取 TTS 音频（与 setLogs/setTimeline 同时进行）
            const audioKey = `audio_game_${sharedId}`;
            const ttsSpeed = globalConfig.ttsSpeed || 1.0;
            const ttsPrefetchPromise = globalConfig.enabled
                ? AudioService.getInstance().prefetch(speech, actor.voiceId, audioKey, tts, ttsSpeed, remoteConfig)
                : Promise.resolve('FAILED' as const);

            // AI 在真正产出公开/私有发言内容后，才进入“当前发言人”状态，避免思考阶段提前暴露身份。
            setSpeaker(player.id);

            // Add Log
            setLogs(prev => appendLog(prev, [{
                id: sharedId,
                turn: turnCount,
                phase: turnPhase,
                speakerId: player.id,
                content: speech,
                timestamp: Date.now(),
                isSystem: false,
                visibleTo: visibleTo,
                ...(!player.isHuman ? {
                    debugType: 'AI_THINKING' as const,
                    durationMs: llmDurationMs,
                    strategySummary,
                    modelName: effectiveModelName,
                    debugData: {
                        rawResult: result,
                        rawResponse: responseText,
                        promptContext: {
                            phase: turnPhase,
                            turnCount,
                            visibleTo,
                            actionInstruction: actionInstruction || null
                        }
                    }
                } : (result as UserInput)?._advisorDebugData ? {
                    debugType: 'AI_THINKING' as const,
                    durationMs: (result as UserInput)._advisorDebugData!.durationMs,
                    strategySummary: (result as UserInput)._advisorDebugData!.strategySummary,
                    modelName: (result as UserInput)._advisorDebugData!.modelName,
                    debugData: {
                        rawResult: (result as UserInput)._advisorDebugData!.rawResult,
                        rawResponse: (result as UserInput)._advisorDebugData!.rawResponse,
                        promptContext: (result as UserInput)._advisorDebugData!.promptContext
                    }
                } : {})
            }]));
            const isPrivateTurn = !!visibleTo?.length;
            const humanPlayer = players.find(p => p.isHuman);
            const isPrivateAudibleToHuman = !!humanPlayer && !!visibleTo?.includes(humanPlayer.id);
            const shouldPlayClearAudio = !isPrivateTurn || !humanPlayer || isPrivateAudibleToHuman;

            // Add to Timeline
            setTimeline(prev => [...prev, {
                id: sharedId, // Matching ID
                type: 'PLAYER',
                speakerName: `${player.id}号`,
                text: speech,
                voiceId: actor.voiceId,
                ttsProvider: tts.provider,
                ttsModel: '',
                ttsBaseUrl: '',
                ttsApiKey: '',
                audioKey: audioKey,
                timestamp: Date.now(),
                isPrivate: isPrivateTurn
            }]);

            // Play TTS
            setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, isSpeaking: true } : p));
            setIsPlayingAudio(true);
            const presentationStartedAt = Date.now();

            try {
                // TTS Call: private chats are only clear for visible recipients; others are silent.
                if (globalConfig.enabled && shouldPlayClearAudio) {
                    await ttsPrefetchPromise;
                    await AudioService.getInstance().playOrGenerate(
                        speech,
                        actor.voiceId,
                        audioKey,
                        tts,
                        undefined,
                        undefined,
                        ttsSpeed,
                        remoteConfig,
                        actor.fineTune
                    );
                } else if (!globalConfig.enabled) {
                    await new Promise(r => setTimeout(r, 200));
                } else {
                    await new Promise(r => setTimeout(r, isPrivateTurn ? 800 : 1500));
                }
                await waitForSpectatorDialogue(speech, presentationStartedAt);
            } finally {
                setIsPlayingAudio(false);
            }
            llmAbortControllersRef.current.clear();
            clearLlmThinking();
            setPlayers(prev => prev.map(p => ({ ...p, isSpeaking: false })));
            setSpeaker(null);
            saveSnapshot();
            return result;

        } catch (e) {
            const isAbortError = e instanceof DOMException && e.name === 'AbortError';
            if (!isAbortError) console.error("AI Error", e);
            llmAbortControllersRef.current.clear();
            clearLlmThinking();
            setIsPlayingAudio(false);
            setPlayers(prev => prev.map(p => ({ ...p, isSpeaking: false })));
            setSpeaker(null);

            setIsAuto(false);

            if (!isAbortError) {
                const message = e instanceof Error ? e.message : '未知错误';
                const isTimeout = message.includes('fetch') || message.includes('timeout') || message.includes('Timeout') || message.includes('abort') || message.includes('ECONNREFUSED');
                const errorType = isTimeout ? '请求超时/网络错误' : 'API错误';
                const actorConfig = getActorConfig(player.actorId);
                const modelName = actorConfig?.llm?.name || actorConfig?.llm?.modelId || 'UNKNOWN';
                await addSystemLog(
                    `${player.id}号 (${modelName}) LLM ${errorType}，已暂停自动流程，当前玩家发言机会已保留。请检查该模型配置或更换模型后继续，或由人类手动接管当前操作。错误：${message}`,
                    undefined,
                    `${player.id}号 ${errorType}，自动流程已暂停。请检查模型配置后继续。`
                );
                jotaiStore.set(addToastAtom, `${player.id}号 ${errorType}，请检查模型配置`, 'error');
            }

            setIsProcessing(false);
            return isAbortError ? LLM_ABORTED_RESULT : createLlmFailedResult(e);
        } finally {
            if (!skipIsProcessingFlag) setIsProcessing(false);
        }
    }, [addEventTrace, phase, isProcessing, isReplay, players, turnCount, globalConfig, isTheater, uiConfig.gameViewMode, setLogs, setTimeline, setPlayers, setSpeaker, saveSnapshot, setIsPlayingAudio, clearLlmThinking, getActorConfig, buildSkillContext, waitForHumanInput, waitForSpectatorDialogue]);


    // --- Helper: Handle Lover Martyrdom ---
    // 人类玩家死亡即时反馈：此前死亡只有全局播报，本人零感知，容易误以为游戏无响应
    const notifyHumanDeath = useCallback((deadPlayerId: number, cause: string) => {
        const target = players.find(p => p.id === deadPlayerId);
        if (!target?.isHuman) return;
        jotaiStore.set(addToastAtom, `你已出局：${cause}`, 'error');
    }, [players]);

    const handleLoverMartyrdom = useCallback(async (deadPlayerId: number, currentPlayers: Player[], deathStatus: PlayerStatus = PlayerStatus.DEAD_NIGHT) => {
        if (!godState.lovers) return currentPlayers;
        const [l1, l2] = godState.lovers;
        if (deadPlayerId !== l1 && deadPlayerId !== l2) return currentPlayers;
        const loverId = deadPlayerId === l1 ? l2 : l1;
        const loverPlayer = currentPlayers.find(p => p.id === loverId);
        if (loverPlayer && isEffectivelyAlive(loverPlayer)) {
            await addSystemLog(`${loverId}号 殉情死亡！`);
            notifyHumanDeath(loverId, '殉情');
            const newPlayers = currentPlayers.map(p => p.id === loverId ? { ...p, status: deathStatus } : p);
            setPlayers(newPlayers);
            if (godState.sheriffId === loverId) {
                const flowTarget = parseSheriffFlow(loverId, logs, (tid) => !!newPlayers.find(p => p.id === tid && isEffectivelyAlive(p)));
                if (flowTarget) {
                    setGodState(prev => ({ ...prev, sheriffId: flowTarget }));
                    await addSystemLog(`${loverId}号警长殉情死亡，警徽传给 ${flowTarget}号。`);
                } else {
                    setGodState(prev => ({ ...prev, sheriffId: null }));
                    await addSystemLog(`${loverId}号警长殉情死亡，无有效警徽流，警徽流失。`);
                }
            }
            return newPlayers;
        }
        return currentPlayers;
    }, [godState.lovers, godState.sheriffId, addSystemLog, notifyHumanDeath]);

    const continueDayFlow = useCallback(async (currentPlayers: Player[], nightDeathIds: number[] = []) => {
        const alive = getAlivePlayers(currentPlayers);
        setGodState(prev => ({
            ...prev,
            pendingDeathActionIds: [],
            deathActionResume: undefined,
            pendingNightDeathIds: [],
        }));
        setSpeakingQueue([]);

        if (turnCount === 1 && nightDeathIds.length > 0 && getRule('firstNightLastWords')) {
            await addSystemLog("请死者发表遗言。");
            setGodState(prev => ({ ...prev, lastWordsFromNight: true }));
            setSpeakingQueue([...new Set(nightDeathIds)]);
            setPhase(GamePhase.LAST_WORDS);
            saveSnapshot();
            return;
        }

        if (sheriffEnabled && turnCount === 1 && !godState.sheriffElectionDone) {
            const candidates = alive.map(player => player.id);
            setGodState(prev => ({
                ...prev,
                sheriffCandidates: candidates,
                sheriffElectionDone: true,
                sheriffVoteRound: 1,
                sheriffTieCandidates: [],
            }));
            setSpeakingQueue(candidates);
            await addSystemLog(`进入警长竞选阶段。候选人：${candidates.map(id => `${id}号`).join('、')}。`);
            setPhase(GamePhase.SHERIFF_ELECTION);
            saveSnapshot();
            return;
        }

        const knight = alive.find(player => player.role === Role.KNIGHT);
        if (knight && !godState.knightChallenged && getRule('knightChallengeEnabled')) {
            setPhase(GamePhase.KNIGHT_CHALLENGE);
            await addSystemLog("骑士可以选择是否发起决斗。");
            saveSnapshot();
            return;
        }

        if (shouldOfferWolfExplosion(
            isWolfExplodeEnabled(),
            turnCount,
            godState.wolfExplodeCheckedTurn,
            currentPlayers
        )) {
            const startIdx = Math.floor(Math.random() * alive.length);
            const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(player => player.id);
            setSpeakingQueue(queue);
            setPhase(GamePhase.WOLF_EXPLODE);
            await addSystemLog("狼人可以选择自爆。");
            saveSnapshot();
            return;
        }

        if (alive.length === 0) return;
        const startIdx = Math.floor(Math.random() * alive.length);
        const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(player => player.id);
        setSpeakingQueue(queue);
        await addSystemLog(`从 ${alive[startIdx].id}号 开始发言。`);
        setPhase(GamePhase.DAY_DISCUSSION);
        saveSnapshot();
    }, [
        addSystemLog,
        getAlivePlayers,
        getRule,
        godState.knightChallenged,
        godState.sheriffElectionDone,
        godState.wolfExplodeCheckedTurn,
        isWolfExplodeEnabled,
        saveSnapshot,
        setGodState,
        setPhase,
        setSpeakingQueue,
        sheriffEnabled,
        turnCount,
    ]);

    const beginDeathActions = useCallback(async (
        currentPlayers: Player[],
        candidateIds: number[],
        resume: 'DAY_FLOW' | 'NIGHT_START',
        nightDeathIds: number[] = []
    ) => {
        const pendingIds = getPendingDeathActionIds(
            currentPlayers,
            candidateIds,
            godState.poisonedTonight ?? [],
            getRule('hunterCanShootWhenPoisoned'),
            getRule('wolfKingCanShootWhenPoisoned')
        );
        if (pendingIds.length === 0) return false;

        setGodState(prev => ({
            ...prev,
            pendingDeathActionIds: pendingIds,
            deathActionResume: resume,
            pendingNightDeathIds: nightDeathIds,
        }));
        setSpeakingQueue(pendingIds);
        setPhase(GamePhase.HUNTER_ACTION);
        const labels = pendingIds.map(id => {
            const player = currentPlayers.find(candidate => candidate.id === id);
            return `${player?.role === Role.WOLF_KING ? '狼王' : '猎人'} ${id}号`;
        });
        await addSystemLog(`${labels.join('、')} 倒牌，依次处理死亡技能。`);
        saveSnapshot();
        return true;
    }, [
        addSystemLog,
        getRule,
        godState.poisonedTonight,
        saveSnapshot,
        setGodState,
        setPhase,
        setSpeakingQueue,
    ]);

    const completeDeathActions = useCallback(async (
        currentPlayers: Player[],
        remainingIds: number[]
    ) => {
        if (remainingIds.length > 0) {
            setGodState(prev => ({ ...prev, pendingDeathActionIds: remainingIds }));
            setSpeakingQueue(remainingIds);
            setPhase(GamePhase.HUNTER_ACTION);
            saveSnapshot();
            return;
        }

        const resume = godState.deathActionResume ?? 'DAY_FLOW';
        const nightDeathIds = godState.pendingNightDeathIds ?? [];
        setGodState(prev => ({
            ...prev,
            pendingDeathActionIds: [],
            deathActionResume: undefined,
            pendingNightDeathIds: [],
        }));
        setSpeakingQueue([]);

        const winState = checkWinCondition(currentPlayers);
        if (winState) {
            await finishGame(winState, currentPlayers);
            saveSnapshot();
            return;
        }

        if (resume === 'NIGHT_START') {
            const newTurn = turnCount + 1;
            setTurnCount(newTurn);
            setPhase(GamePhase.NIGHT_START);
            await addSystemLog(`--- 第 ${newTurn} 天 ---`);
            saveSnapshot();
            return;
        }

        await continueDayFlow(currentPlayers, nightDeathIds);
    }, [
        addSystemLog,
        checkWinCondition,
        continueDayFlow,
        finishGame,
        godState.deathActionResume,
        godState.pendingNightDeathIds,
        saveSnapshot,
        setGodState,
        setPhase,
        setSpeakingQueue,
        setTurnCount,
        turnCount,
    ]);

    // --- Helper: 获取下一个夜间行动阶段 ---
    const advanceToNextNightPhase = useCallback((fromPhase: GamePhase): GamePhase | null => {
        const hasLivingRole = (role: Role) => players.some(player =>
            player.role === role && isEffectivelyAlive(player)
        );
        const phaseOrder = [
            GamePhase.SEER_ACTION,
            GamePhase.GRAVEKEEPER_ACTION,
            GamePhase.WITCH_ACTION,
            GamePhase.GUARD_ACTION,
            GamePhase.DEMON_HUNTER_ACTION,
            GamePhase.MERCHANT_ACTION,
        ];
        const startIndex = phaseOrder.indexOf(fromPhase);
        const candidates = startIndex >= 0 ? phaseOrder.slice(startIndex + 1) : phaseOrder;

        for (const candidatePhase of candidates) {
            switch (candidatePhase) {
                case GamePhase.SEER_ACTION: {
                    const seerInGame = hasLivingRole(Role.SEER);
                    const merchantCheckPending = !godState.bloodMoonSealed && godState.merchantSkillType === 'check' && !!godState.merchantSkillTarget && !godState.merchantSkillUsed;
                    if (seerInGame || merchantCheckPending) return candidatePhase;
                    break;
                }
                case GamePhase.GRAVEKEEPER_ACTION: {
                    const gkInGame = hasLivingRole(Role.GRAVEKEEPER);
                    if (gkInGame && getRule('gravekeeperCheckIdentity')) return candidatePhase;
                    break;
                }
                case GamePhase.WITCH_ACTION: {
                    const witchInGame = hasLivingRole(Role.WITCH);
                    const merchantPoisonPending = !godState.bloodMoonSealed && godState.merchantSkillType === 'poison' && !!godState.merchantSkillTarget && !godState.merchantSkillUsed;
                    if (witchInGame || merchantPoisonPending) return candidatePhase;
                    break;
                }
                case GamePhase.GUARD_ACTION: {
                    const guardInGame = hasLivingRole(Role.GUARD);
                    const merchantGuardPending = !godState.bloodMoonSealed && godState.merchantSkillType === 'guard' && !!godState.merchantSkillTarget && !godState.merchantSkillUsed;
                    if (guardInGame || merchantGuardPending) return candidatePhase;
                    break;
                }
                case GamePhase.DEMON_HUNTER_ACTION: {
                    const dhInGame = hasLivingRole(Role.DEMON_HUNTER);
                    if (dhInGame && getRule('demonHunterHunt')) return candidatePhase;
                    break;
                }
                case GamePhase.MERCHANT_ACTION: {
                    const merchantInGame = hasLivingRole(Role.MIRACLE_MERCHANT);
                    if (merchantInGame && getRule('miracleMerchantGiveSkill')) return candidatePhase;
                    break;
                }
            }
        }
        return null;
    }, [godState, getRule, players]);

    // --- Helper: 执行夜间阶段过渡 ---
    const transitionToNextNightPhase = useCallback(async (fromPhase: GamePhase) => {
        const nextPhase = advanceToNextNightPhase(fromPhase);
        if (nextPhase) {
            await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
            setPhase(nextPhase);
            saveSnapshot();
            const phaseLabels: Partial<Record<GamePhase, string>> = {
                [GamePhase.SEER_ACTION]: "预言家请睁眼。",
                [GamePhase.GRAVEKEEPER_ACTION]: "守墓人请睁眼。",
                [GamePhase.WITCH_ACTION]: "女巫请睁眼。",
                [GamePhase.GUARD_ACTION]: "守卫请睁眼。",
                [GamePhase.DEMON_HUNTER_ACTION]: "猎魔人请睁眼。",
                [GamePhase.MERCHANT_ACTION]: "奇迹商人请睁眼。",
            };
            await addSystemLog(phaseLabels[nextPhase] || "", undefined, undefined, nextPhase);
        } else {
            await new Promise(r => setTimeout(r, 2000));
            setPhase(GamePhase.DAY_ANNOUNCE);
            saveSnapshot();
        }
    }, [advanceToNextNightPhase, addSystemLog]);

    // --- The GOD Loop ---
    useEffect(() => {
        if (!enabled) return;

        if (!isAuto || isProcessing || isReplay || isPlayingAudio || isTheater || engineStepInFlightRef.current || paused) return;

        const loopTimeout = setTimeout(async () => {
            if (engineStepInFlightRef.current || isUnmountedRef.current) return;
            engineStepInFlightRef.current = true;
            const phaseAtStart = phaseRef.current;
            const getNextSpeaker = (candidates: Player[]) => {
                // FIX: Add `l.turn === turnCount` to ensure we only look at actions from THIS turn.
                const spokenIds = logs.filter(l => l.phase === phaseAtStart && !l.isSystem && l.turn === turnCount).map(l => l.speakerId);
                return candidates.find(p => !spokenIds.includes(p.id));
            };

            // 阶段 handler 的共享上下文：每次 tick 就地构建，值与闭包一致（语义不变）
            const ctx: PhaseHandlerContext = {
                phaseAtStart,
                phase,
                players, godState, logs, speakingQueue, turnCount, aiHostedPlayers, actors, config, remoteConfig, globalConfig,
                setPhase, setPlayers, setGodState, setLogs, setSpeakingQueue, setTurnCount,
                setIsProcessing, setIsAuto, setTimeline, setSpeaker, setIsPlayingAudio, saveSnapshot,
                addSystemLog, addEventTrace, generateTurn, getTargetDecision, getAiVote, checkWinCondition, finishGame,
                handleLoverMartyrdom, beginDeathActions, completeDeathActions, continueDayFlow, transitionToNextNightPhase,
                notifyHumanDeath, waitForSpectatorDialogue, getAlivePlayers, getActorConfig, getRule, isWolfExplodeEnabled,
                buildSkillContext, getNextSpeaker,
                isAutoRef, logIdCounter, llmAbortControllersRef, jotaiStore,
            };

            try {
                const phaseHandler = PHASE_HANDLERS[phaseAtStart];
                if (phaseHandler) await phaseHandler(ctx);
            } catch (error) {
                // 单步异常兜底：异步步骤抛错时记录日志并暂停自动推进，
                // 避免阶段在中间被打断后无声重入/卡死，也避免未处理的 Promise 拒绝
                console.error(`[GOD-loop] ${phaseAtStart} 阶段执行异常`, error);
                if (!isUnmountedRef.current) {
                    setIsProcessing(false);
                    try {
                        await addSystemLog(`引擎内部异常（${phaseAtStart} 阶段），已自动暂停。请检查模型配置后重新开始。`);
                    } catch { /* 日志失败时不再抛出 */ }
                    setIsAuto(false);
                }
            } finally {
                engineStepInFlightRef.current = false;
            }
        }, 1000);

        return () => clearTimeout(loopTimeout);
    }, [isAuto, isProcessing, phase, players, generateTurn, isReplay, logs, turnCount, godState, speakingQueue, isPlayingAudio, isTheater, addSystemLog, getAiVote, getTargetDecision, setPhase, setPlayers, setGodState, setSpeakingQueue, saveSnapshot, setIsProcessing, setIsAuto, checkWinCondition, saveGameArchive, setAreRolesVisible, handleLoverMartyrdom, beginDeathActions, completeDeathActions, continueDayFlow, getRule, isWolfExplodeEnabled, setTurnCount, aiHostedPlayers, enabled, paused, getActorConfig, globalConfig.enabled, globalConfig.ttsSpeed, remoteConfig, setTimeline, setSpeaker, setIsPlayingAudio, waitForSpectatorDialogue]);

    const abortAllLLM = useCallback(() => {
        llmAbortControllersRef.current.forEach(ctrl => {
            try { ctrl.abort(); } catch {}
        });
        llmAbortControllersRef.current.clear();
    }, []);

    return { generateTurn, resolveHumanInput, rejectHumanInput, abortAllLLM };
};
