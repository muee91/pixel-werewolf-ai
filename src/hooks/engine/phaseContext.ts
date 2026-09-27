import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { getDefaultStore } from 'jotai';
import type {
    ActorProfile,
    GameConfig,
    GameLog,
    GamePhase,
    GameRules,
    GlobalApiConfig,
    GodState,
    LLMPreset,
    LLMProviderConfig,
    Player,
    PlayerStatus,
    TimelineEvent,
    TTSPreset,
    UserInput,
} from '../../types';
import type { LLMResponse } from '../../services/llm';
import type { RemoteServerConfig } from '../../atoms';
import type { SkillContext } from '../../services/skills/types';
import type { WinResult } from '../../game/rules';
import { createLlmFailedResult, LLM_ABORTED_RESULT } from '../engineHelpers';

// GOD-loop 各阶段 handler 的共享上下文。
// useGameEngine 的主循环 effect 每次 tick 就地构建本对象（传入闭包当前值），
// handler 只通过 ctx 读写状态，保证与原 switch case 完全相同的语义。

export type VoteDecision = {
    target: number | null;
    speak: string;
    strategySummary: string;
    modelName: string;
    durationMs?: number;
    rawResult?: LLMResponse | UserInput | Record<string, unknown>;
    rawResponse?: string;
    isHuman?: boolean;
};

export type TurnResult = LLMResponse | UserInput | typeof LLM_ABORTED_RESULT | ReturnType<typeof createLlmFailedResult> | null;

export interface PhaseHandlerContext {
    // 本步开始时的阶段（phase 与 phaseAtStart 在本步执行期间恒等）
    phaseAtStart: GamePhase;
    phase: GamePhase;

    // 渲染时快照值
    players: Player[];
    godState: GodState;
    logs: GameLog[];
    speakingQueue: number[];
    turnCount: number;
    aiHostedPlayers: Record<number, boolean>;
    actors: ActorProfile[];
    config: GameConfig;
    remoteConfig: RemoteServerConfig;
    globalConfig: GlobalApiConfig;

    // 状态写入
    setPhase: Dispatch<SetStateAction<GamePhase>>;
    setPlayers: Dispatch<SetStateAction<Player[]>>;
    setGodState: Dispatch<SetStateAction<GodState>>;
    setLogs: Dispatch<SetStateAction<GameLog[]>>;
    setSpeakingQueue: Dispatch<SetStateAction<number[]>>;
    setTurnCount: Dispatch<SetStateAction<number>>;
    setIsProcessing: Dispatch<SetStateAction<boolean>>;
    setIsAuto: Dispatch<SetStateAction<boolean>>;
    setTimeline: Dispatch<SetStateAction<TimelineEvent[]>>;
    setSpeaker: Dispatch<SetStateAction<number | null>>;
    setIsPlayingAudio: Dispatch<SetStateAction<boolean>>;
    saveSnapshot: () => void;

    // 引擎辅助
    addSystemLog: (content: string, visibleTo?: number[], audioOverride?: string, phaseOverride?: GamePhase) => Promise<void>;
    addEventTrace: (content: string, debugData?: Record<string, unknown>) => void;
    generateTurn: (player: Player, actionInstruction?: string, visibleTo?: number[], skipIsProcessingFlag?: boolean) => Promise<TurnResult>;
    getTargetDecision: (player: Player, validTargets: number[], contextPhase: GamePhase, actionInstruction: string, fallbackSummary: string) => Promise<VoteDecision>;
    getAiVote: (player: Player, validTargets: number[]) => Promise<VoteDecision>;
    checkWinCondition: (currentPlayers: Player[]) => WinResult | null;
    finishGame: (winState: WinResult, finalPlayers: Player[]) => Promise<void>;
    handleLoverMartyrdom: (deadPlayerId: number, currentPlayers: Player[], deathStatus?: PlayerStatus) => Promise<Player[]>;
    beginDeathActions: (currentPlayers: Player[], candidateIds: number[], resume: 'DAY_FLOW' | 'NIGHT_START', nightDeathIds?: number[]) => Promise<boolean>;
    completeDeathActions: (currentPlayers: Player[], remainingIds: number[]) => Promise<void>;
    continueDayFlow: (currentPlayers: Player[], nightDeathIds?: number[]) => Promise<void>;
    transitionToNextNightPhase: (fromPhase: GamePhase) => Promise<void>;
    notifyHumanDeath: (deadPlayerId: number, cause: string) => void;
    waitForSpectatorDialogue: (content: string, startedAt: number) => Promise<void>;
    getAlivePlayers: (sourcePlayers: Player[]) => Player[];
    getActorConfig: (actorId: string) => { actor: ActorProfile; llm: LLMPreset; provider: LLMProviderConfig; tts: TTSPreset };
    getRule: <K extends keyof GameRules>(key: K) => GameRules[K];
    isWolfExplodeEnabled: () => boolean;
    buildSkillContext: (player: Player, contextPhase: GamePhase) => SkillContext;
    getNextSpeaker: (candidates: Player[]) => Player | undefined;

    // refs / 模块级单例
    isAutoRef: { readonly current: boolean };
    logIdCounter: { current: number };
    llmAbortControllersRef: RefObject<Set<AbortController>>;
    jotaiStore: ReturnType<typeof getDefaultStore>;
}
