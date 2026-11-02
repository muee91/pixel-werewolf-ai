import { atom, type WritableAtom, type PrimitiveAtom } from 'jotai';
import { atomWithStorage, loadable } from 'jotai/utils';
import { get as idbGetVal, set as idbSetVal, del as idbDelVal } from 'idb-keyval';
import {
    GameConfig, GamePhase, Player, GameLog, GameSnapshot, GameResult, GodState, AgentMessage,
    GAME_PRESETS, DEFAULT_ROLE_PROMPTS, DEFAULT_PHASE_PROMPTS, DEFAULT_GAME_RULES, TimelineEvent,
    TTSPreset, ActorProfile, GameArchive, LLMPreset, GlobalApiConfig,
    Perspective, LLMProviderConfig, EdgeVoice, TTSState, MinimizedGameState, UserInput,
    GameEvaluation, LoverState, DEFAULT_GOD_STATE
} from './types';
import type { UIConfig } from './themes/types';
import { THEME_DEFAULTS, normalizeUiConfig } from './themes/types';
import { DEFAULT_DISCONNECT_GRACE_MS } from './multiplayer/constants';

type StoredAtom<T> = WritableAtom<T, [T | ((prev: T) => T)], void>;
const createStorageAtom = <T,>(...args: Parameters<typeof atomWithStorage<T>>) =>
    atomWithStorage<T>(...args) as StoredAtom<T>;

// --- Toast Types & Atoms ---
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

export const toastsAtom = atom<Toast[]>([]);

export const addToastAtom = atom(null, (_, set, message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast: Toast = { id, message, type };
    set(toastsAtom, (prev) => [...prev, toast]);
    setTimeout(() => {
        set(toastsAtom, (prev) => prev.filter(t => t.id !== id));
    }, duration ?? 3000);
});

// --- 应用内确认(App 挂载 ConfirmDialogHost 渲染,utils/notify.confirmDialog 触发) ---
export interface ConfirmRequest {
    title?: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    resolve: (ok: boolean) => void;
}

// 显式断言 PrimitiveAtom:本项目未开 strictNullChecks,null 实参会误配 jotai 的
// 读函数重载(vanilla/atom.d.ts 的 Read<Value>),推出只读 Atom;运行时本是可写 primitive
export const confirmRequestAtom = atom<ConfirmRequest | null>(null) as PrimitiveAtom<ConfirmRequest | null>;

// Define IndexedDB storage adapter
const idbStorage = {
    getItem: async <T>(key: string, initialValue: T) => {
        const val = await idbGetVal(key);
        return val === undefined ? initialValue : val;
    },
    setItem: async <T>(key: string, newValue: T) => {
        await idbSetVal(key, newValue);
    },
    removeItem: async (key: string) => {
        await idbDelVal(key);
    },
};

// 高频游戏态的写入去抖存储：读仍同步走 localStorage（刷新后首帧可恢复对局），
// 写则合并为尾触发任务——每条日志追加、每次 isSpeaking 切换不再立即全量
// JSON.stringify 并同步写盘（长局卡顿与配额溢出异常的根因）。
// 关闭页面时待写任务会被 800ms 定时器截断，pagehide 时同步 flush，避免丢最后一次写入。
const DEBOUNCE_STORAGE_MS = 800;
type PendingStorageWrite = { timer: ReturnType<typeof setTimeout>; value: unknown };
// 本模块可能被 HMR 重复求值：待写表与注册守卫挂在全局作用域，
// 保证 pagehide 监听只注册一次，且旧监听器与新代码 flush 同一份待写表。
const globalScope = globalThis as typeof globalThis & {
    __werewolfPendingGameWrites?: Map<string, PendingStorageWrite>;
    __werewolfPagehideFlushRegistered?: boolean;
};
const pendingGameWrites: Map<string, PendingStorageWrite> =
    globalScope.__werewolfPendingGameWrites ??= new Map<string, PendingStorageWrite>();

const writeGameStorageNow = (key: string, value: unknown): void => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // 配额溢出时丢弃本次持久化，内存态不受影响
    }
};

const flushPendingGameStorageWrites = (): void => {
    if (pendingGameWrites.size === 0) return;
    for (const [key, entry] of pendingGameWrites) {
        clearTimeout(entry.timer);
        writeGameStorageNow(key, entry.value);
    }
    pendingGameWrites.clear();
};

if (typeof window !== 'undefined' && !globalScope.__werewolfPagehideFlushRegistered) {
    globalScope.__werewolfPagehideFlushRegistered = true;
    window.addEventListener('pagehide', flushPendingGameStorageWrites);
}

const debouncedGameStorage = {
    getItem: <T>(key: string, initialValue: T): T => {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? initialValue : JSON.parse(raw) as T;
        } catch {
            return initialValue;
        }
    },
    setItem: <T>(key: string, newValue: T): void => {
        const pending = pendingGameWrites.get(key);
        if (pending) clearTimeout(pending.timer);
        // 定时器触发时本条必仍是当前待写：后续 setItem/removeItem/flush 都先清掉它
        const timer = setTimeout(() => {
            pendingGameWrites.delete(key);
            writeGameStorageNow(key, newValue);
        }, DEBOUNCE_STORAGE_MS);
        pendingGameWrites.set(key, { timer, value: newValue });
    },
    removeItem: (key: string): void => {
        const pending = pendingGameWrites.get(key);
        if (pending) {
            clearTimeout(pending.timer);
            pendingGameWrites.delete(key);
        }
        localStorage.removeItem(key);
    },
};

const createGameStorageAtom = <T,>(key: string, initialValue: T) =>
    createStorageAtom<T>(key, initialValue, debouncedGameStorage, { getOnInit: true });

// --- State Atoms ---
export const appScreenAtom = createStorageAtom<'HOME' | 'GAME' | 'SETTINGS' | 'AGENT' | 'HISTORY' | 'RULES' | 'MULTIPLAYER' | 'REVIEW'>('werewolf-appScreen', 'HOME', undefined, { getOnInit: true });
export const minimizedGameAtom = createStorageAtom<MinimizedGameState>('werewolf-minimizedGame', { enabled: false }, undefined, { getOnInit: true });

// Multiplayer state atom
export type MultiplayerState = {
    roomId: string | null;
    playerId: string | null;
    nickname: string | null;
    isHost: boolean;
    hostPlayerId: string | null;
    status: 'LOBBY' | 'WAITING' | 'IN_GAME';
    sessionToken: string | null;
};

export const multiplayerStateAtom = createStorageAtom<MultiplayerState>('werewolf-multiplayerState', {
    roomId: null,
    playerId: null,
    nickname: null,
    isHost: false,
    hostPlayerId: null,
    status: 'LOBBY',
    sessionToken: null,
}, undefined, { getOnInit: true });

// 与 players/logs 同一持久化通道：刷新或恢复 minimized 局时，规则与板子必须跟着回来，
// 否则 AI 会被告知错误的板子描述、第三方局永远判不了胜。
export const gameConfigAtom = createGameStorageAtom<GameConfig>('werewolf-gameConfig', {
    playerCount: 9,
    roles: GAME_PRESETS[0].roles,
    phasePrompts: { ...DEFAULT_PHASE_PROMPTS },
    rolePrompts: { ...DEFAULT_ROLE_PROMPTS },
    globalAiInstructions: "你正在参与一场高水平的狼人杀对局。请使用简短、口语化的中文发言。不要复述规则，直接表达观点。逻辑要清晰，符合你的身份视角。",
    sheriffEnabled: DEFAULT_GAME_RULES.sheriffElection,
    voteDetailPublic: DEFAULT_GAME_RULES.voteDetailPublic,
    rules: { ...DEFAULT_GAME_RULES }
});

const defaultLlmProviders: LLMProviderConfig[] = [
    { id: 'provider-nvidia', name: 'NVIDIA NIM', type: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: '' },
    { id: 'provider-gemini', name: 'Google Gemini', type: 'gemini', apiKey: '' },
    { id: 'provider-deepseek', name: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: '' },
    { id: 'provider-volc', name: 'Volcengine (DeepSeek)', type: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '' }
];

// 预设不预置具体模型 ID:各厂商模型 ID 经常下线/更名,统一由用户「同步模型列表」后自选
const defaultLlmPresets: LLMPreset[] = [
    { id: 'llm-nvidia-nim', name: 'NVIDIA NIM', providerId: 'provider-nvidia', modelId: '' },
    { id: 'llm-gemini', name: 'Gemini', providerId: 'provider-gemini', modelId: '' },
    { id: 'llm-deepseek', name: 'DeepSeek', providerId: 'provider-deepseek', modelId: '' },
    { id: 'llm-volc', name: '火山方舟 (Volcengine)', providerId: 'provider-volc', modelId: '' },
];

const defaultTtsPresets: TTSPreset[] = [
    { id: 'tts-edge', name: 'Edge TTS (微软)', provider: 'edge-tts' },
];

export const DEFAULT_ACTORS: ActorProfile[] = [
    { id: 'n1', name: '上帝 (旁白)', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '' },
    { id: 'a1', name: '路人甲', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunxiNeural', stylePrompt: '' },
    { id: 'a2', name: '路人乙', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoyiNeural', stylePrompt: '' },
    { id: 'a3', name: '路人丙', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunjianNeural', stylePrompt: '' },
    { id: 'a4', name: '路人丁', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoyiNeural', stylePrompt: '' },
    { id: 'a5', name: '路人戊', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunyangNeural', stylePrompt: '' },
    { id: 'a8', name: '路人己', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunxiNeural', stylePrompt: '' },
    { id: 'a9', name: '路人庚', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '' },
    { id: 'a10', name: '路人辛', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunjianNeural', stylePrompt: '' },
    { id: 'a11', name: '路人壬', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoyiNeural', stylePrompt: '' },
    { id: 'a12', name: '路人癸', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunyangNeural', stylePrompt: '' },
    { id: 'a13', name: '路人子', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '' },
    { id: 'a14', name: '路人丑', llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunxiNeural', stylePrompt: '' },
];

export const llmProvidersAtom = createStorageAtom<LLMProviderConfig[]>('werewolf-llmProviders', defaultLlmProviders, undefined, { getOnInit: true });
export const llmPresetsAtom = createStorageAtom<LLMPreset[]>('werewolf-llmPresets', defaultLlmPresets, undefined, { getOnInit: true });
export const ttsPresetsAtom = createStorageAtom<TTSPreset[]>('werewolf-ttsPresets-v3', defaultTtsPresets, undefined, { getOnInit: true });

const MIGRATED_TTS_KEY = 'werewolf-ttsPresets-migrated-v4';
if (typeof window !== 'undefined' && !localStorage.getItem(MIGRATED_TTS_KEY)) {
    try {
        const raw = localStorage.getItem('werewolf-ttsPresets-v3');
        if (raw) {
            const existing: TTSPreset[] = JSON.parse(raw);
            const missing = defaultTtsPresets.filter(dp => !existing.some(ep => ep.provider === dp.provider));
            if (missing.length > 0) {
                const merged = [...existing, ...missing];
                localStorage.setItem('werewolf-ttsPresets-v3', JSON.stringify(merged));
            }
        }
        localStorage.setItem(MIGRATED_TTS_KEY, '1');
    } catch {}
}

const MIGRATED_ACTORS_KEY = 'werewolf-actorProfiles-migrated-v3';
if (typeof window !== 'undefined' && !localStorage.getItem(MIGRATED_ACTORS_KEY)) {
    try {
        const raw = localStorage.getItem('werewolf-actorProfiles-v2');
        if (raw) {
            const existing: ActorProfile[] = JSON.parse(raw);
            const providerRaw = localStorage.getItem('werewolf-llmProviders');
            const userProviders: LLMProviderConfig[] = providerRaw ? JSON.parse(providerRaw) : defaultLlmProviders;
            const deepseekProvider = userProviders.find(p => p.id === 'provider-deepseek');
            const deepseekHasApiKey = !!deepseekProvider?.apiKey?.trim();
            let changed = false;
            const fixed = existing.map(a => {
                if ((a.llmPresetId === 'llm-3' || a.llmPresetId === 'llm-4') && !deepseekHasApiKey) {
                    changed = true;
                    return { ...a, llmPresetId: '' };
                }
                return a;
            });
            if (changed) {
                localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify(fixed));
            }
        }
        localStorage.setItem(MIGRATED_ACTORS_KEY, '1');
    } catch {}
}
export const actorProfilesAtom = createStorageAtom<ActorProfile[]>('werewolf-actorProfiles-v2', DEFAULT_ACTORS, undefined, { getOnInit: true });
export const edgeTtsVoicesAtom = createStorageAtom<EdgeVoice[]>('werewolf-edgeTtsVoices', [], undefined, { getOnInit: true });
// 语音默认开启：观战体验的主通道是"听见 AI 说话"。
// 没有 TTS 后端时 AudioService 会在超时后静默降级为字幕，不会卡住对局。
export const globalApiConfigAtom = createStorageAtom<GlobalApiConfig>('werewolf-globalApiConfig', { enabled: true, narratorActorId: 'n1' }, undefined, { getOnInit: true });

/** 本局模型用量累计（HUD 读数用；initGame 归零） */
export interface LlmUsageTotals {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    totalMs: number;
}
export const EMPTY_LLM_USAGE: LlmUsageTotals = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalMs: 0 };
export const llmUsageAtom = atom<LlmUsageTotals>({ ...EMPTY_LLM_USAGE });

// --- Remote Server Config ---
export interface RemoteServerConfig {
    ttsRemoteUrl: string;
    llmProxyEnabled: boolean;
    llmProxyUrl: string;
}

export const remoteServerConfigAtom = createStorageAtom<RemoteServerConfig>('werewolf-remoteServerConfig-v2', {
    ttsRemoteUrl: '',
    llmProxyEnabled: false,
    llmProxyUrl: ''
}, undefined, { getOnInit: true });

export const gameArchivesAtom = atomWithStorage<GameArchive[]>('werewolf-gameArchives', [], idbStorage);
export const gameArchivesLoadableAtom = loadable(gameArchivesAtom);
export const lastSavedArchiveAtom = atom<GameArchive | null>(null) as PrimitiveAtom<GameArchive | null>;

/**
 * 复盘页正在看哪一局：null = 看当前这局（logsAtom/gameResultAtom 里那份）。
 *
 * 为什么不复用回放的 replaySourceLogsAtom：回放是"把对局重新演一遍"，
 * 复盘是"把已经发生的事摊开读"——前者要清空实时日志并逐条推进，
 * 后者必须只读，否则从历史进来会把正在进行的对局状态清掉。
 */
export const reviewArchiveAtom = atom<GameArchive | null>(null) as PrimitiveAtom<GameArchive | null>;

export const timelineAtom = createGameStorageAtom<TimelineEvent[]>('werewolf-currentTimeline', []);
export const replaySourceLogsAtom = atom<GameLog[]>([]) as StoredAtom<GameLog[]>;
export const isPlayingAudioAtom = atom<boolean>(false) as StoredAtom<boolean>;
export const isTheaterModeAtom = createStorageAtom<boolean>('werewolf-isTheaterMode', false, undefined, { getOnInit: true });
export const gamePhaseAtom = createGameStorageAtom<GamePhase>('werewolf-currentPhase', GamePhase.SETUP);
export const turnCountAtom = createGameStorageAtom<number>('werewolf-currentTurn', 1);
export const isAutoPlayAtom = createStorageAtom<boolean>('werewolf-isAutoPlay', false, undefined, { getOnInit: true });
export const debugModeAtom = createStorageAtom<boolean>('werewolf-debugMode', false, undefined, { getOnInit: true });
export const debugLogPanelOpenAtom = atom<boolean>(false);
export const debugGodViewAtom = createStorageAtom<boolean>('werewolf-debugGodView', false, undefined, { getOnInit: true });
export const isProcessingAtom = atom<boolean>(false);
export const llmThinkingAtom = atom<{
    playerId: number | null;
    actorName: string;
    modelName: string;
    phase: GamePhase | null;
    attempt: number;
    maxAttempts: number;
    startedAt: number | null;
    status: 'idle' | 'thinking' | 'retrying';
}>({
    playerId: null,
    actorName: '',
    modelName: '',
    phase: null,
    attempt: 0,
    maxAttempts: 0,
    startedAt: null,
    status: 'idle'
});
/**
 * 流式上屏：模型正在生成的这一句（只出现在"玩家正在等"的那段时间）。
 *
 * 单独一个 atom 而不是塞进 llmThinkingAtom：它每秒会变 8 次左右，
 * 放进房间级的 state 会让整张座位表跟着重渲染；这里只挂一个小小的字幕组件消费它。
 * 真·发言落账后立即清空，日志里那条才是权威文本。
 */
export interface StreamingSpeech {
    playerId: number;
    seat: number;
    text: string;
    thinkingChars: number;
    startedAt: number;
    /**
     * speech：公开发言，正文可以逐字上屏
     * decision：投票/退水/开枪这类公开决策。**正文绝不上屏**（里面是策略与目标），
     *           只把"谁在决策、思考了多少字、等了几秒"当进度显示
     */
    kind: 'speech' | 'decision';
}
export const streamingSpeechAtom = atom<StreamingSpeech | null>(null) as PrimitiveAtom<StreamingSpeech | null>;
export const isReplayModeAtom = createStorageAtom<boolean>('werewolf-isReplayMode', false, undefined, { getOnInit: true });
export const areRolesVisibleAtom = createStorageAtom<boolean>('werewolf-areRolesVisible', true, undefined, { getOnInit: true });
export const replayPerspectiveAtom = atom<Perspective>('GOOD');
export const replayPausedAtom = atom<boolean>(false) as StoredAtom<boolean>;
export const replayProgressAtom = atom<{ current: number; total: number; isFinished: boolean }>({ current: 0, total: 0, isFinished: false }) as StoredAtom<{ current: number; total: number; isFinished: boolean }>;

export const isHumanModeAtom = createStorageAtom<boolean>('werewolf-isHumanMode', false, undefined, { getOnInit: true });
export const humanPlayerSeatAtom = createStorageAtom<number>('werewolf-humanPlayerSeat', 1, undefined, { getOnInit: true });
export const userInputAtom = atom<UserInput | null>(null) as StoredAtom<UserInput | null>;
export const humanInputPanelExpandedAtom = createStorageAtom<boolean>('werewolf-humanInputPanelExpanded', false, undefined, { getOnInit: true });

export const godStateAtom = createGameStorageAtom<GodState>("werewolf-currentGodState", DEFAULT_GOD_STATE);

export const playersAtom = createGameStorageAtom<Player[]>('werewolf-currentPlayers', []);
export const logsAtom = createGameStorageAtom<GameLog[]>('werewolf-currentLogs', []);
// 事件流调试痕迹（EVENT_TRACE）：与内容日志分流，仅供调试面板与日志导出使用。
// 不持久化，内存中限量滑动窗口，避免状态噪声挤占过程日志、污染 AI 上下文与存档。
export const gameTracesAtom = atom<GameLog[]>([]);
export const gameResultAtom = createGameStorageAtom<GameResult | null>('werewolf-currentGameResult', null);
export const gameEvaluationAtom = createGameStorageAtom<GameEvaluation | null>('werewolf-gameEvaluation', null);
export const gameHistoryAtom = atom<GameSnapshot[]>([]) as StoredAtom<GameSnapshot[]>;
export const speakingQueueAtom = createGameStorageAtom<number[]>('werewolf-speakingQueue', []);
export const currentSpeakerIdAtom = atom<number | null>(null) as StoredAtom<number | null>;
export const agentMessagesAtom = atom<AgentMessage[]>([
    { id: 'welcome', role: 'model', content: '你好！我是狼人杀上帝助手。我可以感知当前对局状态，帮你分析局势、解释规则、回答配置问题。游戏进行中随时问我！', timestamp: Date.now() }
]) as StoredAtom<AgentMessage[]>;

// --- TTS Atoms ---
export const ttsStateAtom = createStorageAtom<TTSState>('werewolf-ttsState', {
    text: '',
    voiceId: 'zh-CN-XiaoxiaoNeural',
    speed: 1.0
});

// --- Extended Game Atoms ---
export const wolfExplodeAtom = atom<{
    enabled: boolean;
    target: number | null;
    explodedWolves: number[];
}>({
    enabled: false,
    target: null,
    explodedWolves: [],
});

export const knightChallengeAtom = atom<{
    challenged: boolean;
    target: number | null;
    result: 'success' | 'fail' | null;
}>({
    challenged: false,
    target: null,
    result: null,
});

export const discussionRoundAtom = atom<1 | 2>(1);

export const sheriffWithdrawListAtom = atom<number[]>([]);

export const playerModelMapAtom = atom<Record<number, string>>({});

export const bloodMoonSealedAtom = atom<boolean>(false);

export const loversAtom = atom<LoverState | null>(null);

export const merchantSkillAtom = atom<{
    target: number | null;
    skillType: 'check' | 'poison' | 'guard' | null;
    given: boolean;
}>({
    target: null,
    skillType: null,
    given: false,
});


export type HumanInputResolver = (input: import('./types').UserInput) => void;
// 按 playerId 登记的等待者：多人局并发投票/夜间行动时可能同时有多名
// 人类玩家在等待输入，单一 resolver 会互相覆盖导致引擎永久死锁。
export const humanInputResolverMapAtom = atom<Record<number, HumanInputResolver>>({});

export const cancelHumanInputAtom = atom(null, (_get, set) => {
    set(humanInputResolverMapAtom, {});
});

// --- Multiplayer Atoms ---
export interface MultiplayerConnectionState {
    isConnected: boolean;
    disconnectedAt: number | null;
    reconnectTimeout: number;
    disconnectedPlayerId: string | null;
    disconnectedPlayerNickname: string | null;
}

export const multiplayerNicknameAtom = createStorageAtom<string>('werewolf-multiplayerNickname', '', undefined, { getOnInit: true });

export const multiplayerRoleAtom = createStorageAtom<'host' | 'guest' | null>('werewolf-multiplayerRole', null, undefined, { getOnInit: true });

export const multiplayerConnectionAtom = createStorageAtom<MultiplayerConnectionState>('werewolf-multiplayerConnection', {
    isConnected: true,
    disconnectedAt: null,
    reconnectTimeout: DEFAULT_DISCONNECT_GRACE_MS,
    disconnectedPlayerId: null,
    disconnectedPlayerNickname: null,
}, undefined, { getOnInit: true });

export const aiHostedPlayersAtom = createStorageAtom<Record<number, boolean>>('werewolf-aiHostedPlayers', {}, undefined, { getOnInit: true });

export const isPausedAtom = createStorageAtom<boolean>('werewolf-isPaused', false, undefined, { getOnInit: true });

export const guestRoleInfoAtom = atom<{ role: string; rolePrompt: string; seatNumber: number; potions?: any } | null>(null) as StoredAtom<{ role: string; rolePrompt: string; seatNumber: number; potions?: any } | null>;

export const actionAckStateAtom = atom<{ pending: boolean; actionType: string; success: boolean | null; timestamp: number }>({ pending: false, actionType: '', success: null, timestamp: 0 });

export const multiplayerPingAtom = atom<Record<string, number | null>>({});

const fallbackUiConfig: UIConfig = {
  themeId: 'voxel-camp',
  ...THEME_DEFAULTS['voxel-camp'],
};

const storedUiConfigAtom = createStorageAtom<UIConfig>(
  'werewolf-uiConfig',
  fallbackUiConfig,
  undefined,
  { getOnInit: true }
);

export const uiConfigAtom = atom(
  (get) => normalizeUiConfig(get(storedUiConfigAtom)),
  (get, set, update: UIConfig | ((prev: UIConfig) => UIConfig)) => {
    const prev = normalizeUiConfig(get(storedUiConfigAtom));
    const next = typeof update === 'function' ? update(prev) : update;
    set(storedUiConfigAtom, normalizeUiConfig(next));
  }
) as StoredAtom<UIConfig>;
