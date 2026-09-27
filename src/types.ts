// Role Definitions
export enum Role {
    WEREWOLF = 'WEREWOLF',
    VILLAGER = 'VILLAGER',
    SEER = 'SEER',
    WITCH = 'WITCH',
    HUNTER = 'HUNTER',
    GUARD = 'GUARD',
    IDIOT = 'IDIOT',
    WOLF_KING = 'WOLF_KING',                      // 狼王
    KNIGHT = 'KNIGHT',                            // 骑士
    STONE_GHOST = 'STONE_GHOST',                  // 石像鬼
    WHITE_WOLF_KING = 'WHITE_WOLF_KING',          // 白狼王
    BLOOD_MOON_DISCIPLE = 'BLOOD_MOON_DISCIPLE',  // 血月使徒
    GRAVEKEEPER = 'GRAVEKEEPER',                  // 守墓人
    DEMON_HUNTER = 'DEMON_HUNTER',                // 猎魔人
    CUPID = 'CUPID',                              // 丘比特
    MIRACLE_MERCHANT = 'MIRACLE_MERCHANT',        // 奇迹商人
}

// 被投票出局会翻牌不死，之后不能投票
export const isImmuneToVote = (p: Player) => p.role === Role.IDIOT && p.status === PlayerStatus.IDIOT_REVEALED;

export type Perspective = 'GOD' | 'GOOD' | 'WOLF';

export interface MinimizedGameState {
    enabled: boolean;
    phase?: GamePhase;
    turnCount?: number;
    aliveCount?: number;
    updatedAt?: number;
}

export interface MultiplayerGameState {
    players: Player[];
    logs: GameLog[];
    phase: GamePhase;
    turnCount: number;
    godState: GodState;
    isAutoPlay: boolean;
    currentSpeakerId: number | null;
    areRolesVisible: boolean;
}

// Helper arrays for win conditions
export const GOD_ROLES = [Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD, Role.IDIOT, Role.KNIGHT, Role.GRAVEKEEPER, Role.DEMON_HUNTER, Role.CUPID, Role.MIRACLE_MERCHANT];
export const VILLAGER_ROLES = [Role.VILLAGER];
export const WOLF_ROLES = [Role.WEREWOLF, Role.WOLF_KING, Role.STONE_GHOST, Role.WHITE_WOLF_KING, Role.BLOOD_MOON_DISCIPLE];

// Role Metadata for UI
export const ROLE_INFO: Record<Role, { label: string; icon: string; color: string }> = {
    [Role.WEREWOLF]: { label: '狼人', icon: '🐺', color: 'text-red-500' },
    [Role.VILLAGER]: { label: '村民', icon: '🧑', color: 'text-gray-400' },
    [Role.SEER]: { label: '预言家', icon: '🔮', color: 'text-purple-400' },
    [Role.WITCH]: { label: '女巫', icon: '🧪', color: 'text-fuchsia-500' },
    [Role.HUNTER]: { label: '猎人', icon: '🔫', color: 'text-orange-500' },
    [Role.GUARD]: { label: '守卫', icon: '🛡️', color: 'text-blue-400' },
    [Role.IDIOT]: { label: '白痴', icon: '😶', color: 'text-teal-400' },
    [Role.WOLF_KING]: { label: '狼王', icon: '👑', color: 'text-red-600' },
    [Role.KNIGHT]: { label: '骑士', icon: '⚔️', color: 'text-yellow-500' },
    [Role.STONE_GHOST]: { label: '石像鬼', icon: '🗿', color: 'text-stone-500' },
    [Role.WHITE_WOLF_KING]: { label: '白狼王', icon: '🦊', color: 'text-red-400' },
    [Role.BLOOD_MOON_DISCIPLE]: { label: '血月使徒', icon: '🌑', color: 'text-rose-700' },
    [Role.GRAVEKEEPER]: { label: '守墓人', icon: '🪦', color: 'text-slate-500' },
    [Role.DEMON_HUNTER]: { label: '猎魔人', icon: '🏹', color: 'text-amber-600' },
    [Role.CUPID]: { label: '丘比特', icon: '💘', color: 'text-pink-500' },
    [Role.MIRACLE_MERCHANT]: { label: '奇迹商人', icon: '✨', color: 'text-emerald-400' },
};

export enum GamePhase {
    SETUP = 'SETUP',
    NIGHT_START = 'NIGHT_START',

    // Night Actions
    WEREWOLF_ACTION = 'WEREWOLF_ACTION',
    SEER_ACTION = 'SEER_ACTION',
    WITCH_ACTION = 'WITCH_ACTION',
    GUARD_ACTION = 'GUARD_ACTION', // Reserved

    // Day Flow
    DAY_ANNOUNCE = 'DAY_ANNOUNCE',   // God announces deaths
    HUNTER_ACTION = 'HUNTER_ACTION', // If hunter died
    LAST_WORDS = 'LAST_WORDS',       // If applicable

    DAY_DISCUSSION = 'DAY_DISCUSSION',
    SHERIFF_ELECTION = 'SHERIFF_ELECTION',
    SHERIFF_VOTING = 'SHERIFF_VOTING',
    VOTING = 'VOTING',

    // Extended Phases
    KNIGHT_CHALLENGE = 'KNIGHT_CHALLENGE',      // 骑士决斗
    WOLF_EXPLODE = 'WOLF_EXPLODE',              // 狼人自爆
    SHERIFF_WITHDRAW = 'SHERIFF_WITHDRAW',      // 警长退水
    DISCUSSION_ROUND_TWO = 'DISCUSSION_ROUND_TWO', // 第二轮讨论
    STONE_GHOST_ACTION = 'STONE_GHOST_ACTION',  // 石像鬼查验
    GRAVEKEEPER_ACTION = 'GRAVEKEEPER_ACTION',  // 守墓人查验
    DEMON_HUNTER_ACTION = 'DEMON_HUNTER_ACTION', // 猎魔人猎杀
    CUPID_LINK = 'CUPID_LINK',                  // 丘比特连结
    MERCHANT_ACTION = 'MERCHANT_ACTION',        // 奇迹商人发技能

    GAME_OVER = 'GAME_OVER',
    GAME_REVIEW = 'GAME_REVIEW' // Post-game chat
}

// TTS Screen State
export interface TTSState {
    text: string;
    voiceId: string;
    speed: number;
}

/** 是否为狼人阵营角色(共享工具,替代各文件重复定义) */
export const isWolfRole = (role: Role) => WOLF_ROLES.includes(role);

export const canSeeRoleShared = (
    targetId: number,
    targetRole: Role,
    viewerId: number | null,
    viewerRole: Role | undefined,
    isGodView: boolean,
    isGameOver: boolean,
): boolean =>
    isGodView || isGameOver || (
        viewerId != null && viewerRole != null && (
            targetId === viewerId ||
            (isWolfRole(viewerRole) && isWolfRole(targetRole))
        )
    );

/** 角色可见性判断:上帝视角/游戏结束/本人/同阵营狼队 可见 */
export const canSeeRole = (
    targetId: number,
    targetRole: Role,
    viewerId: number | null,
    viewerRole: Role | undefined,
    isGodView: boolean,
    isGameOver: boolean,
): boolean =>
    isGodView || isGameOver || (
        viewerId != null && viewerRole != null && (
            targetId === viewerId ||
            (isWolfRole(viewerRole) && isWolfRole(targetRole))
        )
    );

export const PHASE_LABELS: Record<GamePhase, string> = {
    [GamePhase.SETUP]: '游戏设置',
    [GamePhase.NIGHT_START]: '入夜',
    [GamePhase.WEREWOLF_ACTION]: '狼人行动',
    [GamePhase.SEER_ACTION]: '预言家行动',
    [GamePhase.WITCH_ACTION]: '女巫行动',
    [GamePhase.GUARD_ACTION]: '守卫行动',
    [GamePhase.DAY_ANNOUNCE]: '死亡宣告',
    [GamePhase.HUNTER_ACTION]: '猎人开枪',
    [GamePhase.LAST_WORDS]: '遗言环节',
    [GamePhase.DAY_DISCUSSION]: '公聊发言',
    [GamePhase.SHERIFF_ELECTION]: '警长竞选',
    [GamePhase.SHERIFF_VOTING]: '警长投票',
    [GamePhase.VOTING]: '投票放逐',
    [GamePhase.KNIGHT_CHALLENGE]: '骑士决斗',
    [GamePhase.WOLF_EXPLODE]: '狼人自爆',
    [GamePhase.SHERIFF_WITHDRAW]: '警长退水',
    [GamePhase.DISCUSSION_ROUND_TWO]: '第二轮讨论',
    [GamePhase.STONE_GHOST_ACTION]: '石像鬼查验',
    [GamePhase.GRAVEKEEPER_ACTION]: '守墓人查验',
    [GamePhase.DEMON_HUNTER_ACTION]: '猎魔人猎杀',
    [GamePhase.CUPID_LINK]: '丘比特连结',
    [GamePhase.MERCHANT_ACTION]: '奇迹商人发技能',
    [GamePhase.GAME_OVER]: '游戏结束',
    [GamePhase.GAME_REVIEW]: '赛后复盘',
};

export enum PlayerStatus {
    ALIVE = 'ALIVE',
    DEAD_NIGHT = 'DEAD_NIGHT',
    DEAD_VOTE = 'DEAD_VOTE',
    DEAD_SHOOT = 'DEAD_SHOOT',
    DEAD_POISON = 'DEAD_POISON',
    IDIOT_REVEALED = 'IDIOT_REVEALED', // 白痴翻牌存活
    EXPLODED = 'EXPLODED',    // 已自爆
    LINKED = 'LINKED',        // 情侣连结
    SKILLED = 'SKILLED',      // 获得商人技能
}

// A player instance in a game
export interface Player {
    id: number;
    seatNumber: number;
    role: Role;
    status: PlayerStatus;
    avatarSeed: number;
    rolePrompt: string;
    isSpeaking: boolean;
    actorId: string; // Link to ActorProfile
    // Abilities status
    potions?: {
        cure: boolean;
        poison: boolean;
    };
    isHuman?: boolean;
    displayName?: string; // Custom name override (e.g., room nickname in multiplayer)
    roomPlayerId?: string | null; // Room server player UUID for multiplayer identity mapping
    /** 本局说话人设(直播整活):创建玩家时从分身/随机人设注入,prompt 层消费 */
    stylePrompt?: string;
}

// ── 直播整活:AI 人设预设(注入 prompt 的说话风格) ──
export const PERSONA_PRESETS: { id: string; label: string; prompt: string }[] = [
    { id: 'none', label: '默认', prompt: '' },
    { id: 'drama', label: '戏精附体', prompt: '你的所有发言必须极度戏剧化,情绪放大,善用感叹号与排比,像在演独幕剧,但推理保持正确。' },
    { id: 'yinyang', label: '阴阳怪气', prompt: '你全程阴阳怪气,用反讽和暗喻表达怀疑,句句带刺但风度翩翩,策略保持正确。' },
    { id: 'dongbei', label: '东北老铁', prompt: '你用东北方言口吻发言,豪爽幽默,爱用"咱""整""咋地""老铁"等词,但逻辑清晰不含糊。' },
    { id: 'zhenhuan', label: '甄嬛体', prompt: '你用甄嬛体发言:文雅古风,惯用"想必是极好的""倒也不负恩泽""臣妾"等句式,推理含蓄但精准。' },
    { id: 'poet', label: '赛博诗人', prompt: '你的发言像诗:多用比喻和意象,每段至少一句押韵或对仗,看似飘忽实则判断精准。' },
    { id: 'straight', label: '直球刑警', prompt: '你发言极度直接简短,只说结论和证据链,像审讯室里办案多年的老刑警,绝不绕弯。' },
    { id: 'chuunibyou', label: '中二病', prompt: '你用中二病口吻发言:自称"吾",称投票为"审判",把局势说成命运之战,但推理认真严肃。' },
];
export const pickRandomPersona = (): { label: string; prompt: string } =>
    PERSONA_PRESETS[Math.floor(Math.random() * PERSONA_PRESETS.length)];

/** 由 stylePrompt 反查人设标签:预设返回名称,自定义返回"自定义",未设置返回空 */
export const getPersonaLabel = (stylePrompt?: string): string => {
    const p = stylePrompt?.trim();
    if (!p) return '';
    return PERSONA_PRESETS.find(preset => preset.prompt === p)?.label ?? '自定义';
};

// --- New Settings Structure ---

// export type LLMProvider = 'gemini' | 'openai'; // Moved to LLMProviderConfig

// 1. LLM Definition
export interface LLMProviderConfig {
    id: string;
    name: string;
    type: 'gemini' | 'openai'; // 'openai' covers DeepSeek, Moonshot, NVIDIA NIM, etc.
    baseUrl?: string;
    apiKey?: string;
    models?: string[];
}

export interface LLMPreset {
    id: string;
    name: string; // Nickname
    providerId: string; // Link to LLMProviderConfig
    modelId: string; // API Model String (e.g., gemini-2.5-flash)
}

// 2. TTS Definition (Edge TTS Format)
export interface EdgeVoice {
    Name: string;
    ShortName: string;
    Gender: string;
    Locale: string;
    SuggestedCodec: string;
    FriendlyName: string;
    Status: string;
}

export interface TTSFineTune {
    speed?: number;
    rate?: string;
    pitch?: string;
}

export interface TTSPreset {
    id: string;
    name: string;
    provider: string;
    fineTune?: TTSFineTune;
}

export interface ActorProfile {
    id: string;
    name: string;
    /** 大脑类型:llm=本地/远程模型;mcp=外部 AI 通过本地桥接管 */
    brain?: 'llm' | 'mcp';
    llmPresetId: string;
    ttsPresetId: string;
    voiceId: string;
    stylePrompt: string;
    fineTune?: TTSFineTune;
}

// Global API Configuration (Reduced scope)
export interface GlobalApiConfig {
    enabled: boolean; // Audio enabled
    narratorActorId: string; // The actor used for the narrator
    ttsSpeed?: number; // Global TTS Playback Rate (0.5x - 2.0x)
}

// "God's Notebook" - Tracks logic for the current night/turn
export interface GodState {
    wolfTarget: number | null;
    seerCheck: number | null;
    witchSave: boolean;
    witchPoison: number | null;
    /** 怀疑表（agent 自维护）：键=玩家 id，值=该 AI 玩家最近一轮输出的怀疑表文本，仅回注其本人提示词 */
    agentSuspicion?: Record<number, string>;
    /** 女巫视角派生字段：今晚解药是否可用（含自救限制），仅注入提示词上下文，不入全局状态 */
    canUseCure?: boolean;
    guardProtect: number | null;
    lastGuardProtect?: number | null;
    merchantGuardProtect: number | null;
    deathsTonight: number[]; // IDs of players who died
    sheriffId?: number | null;
    sheriffCandidates?: number[];
    sheriffElectionDone?: boolean;
    sheriffVoteRound?: number;
    sheriffTieCandidates?: number[];
    voteTieCandidates?: number[];
    voteTieRound?: number;
    lastWordsFromNight?: boolean;
    pendingDeathActionIds?: number[];
    deathActionResume?: 'DAY_FLOW' | 'NIGHT_START';
    pendingNightDeathIds?: number[];
    poisonedTonight?: number[];
    // Extended fields
    wolfExplodeTarget: number | null;         // 自爆指刀目标
    explodedWolves: number[];                 // 已自爆狼人列表
    wolfExplodeCheckedTurn?: number | null;    // 本日是否已询问过狼人自爆
    knightChallenged: boolean;                // 骑士是否已决斗
    knightChallengeTarget: number | null;     // 骑士决斗目标
    bloodMoonSealed: boolean;                 // 血月使徒是否封印了神职
    lovers: [number, number] | null;          // 丘比特连结的情侣
    cupidIsThirdParty: boolean;              // 丘比特是否为第三方
    merchantSkillTarget: number | null;       // 奇迹商人技能发放目标
    merchantSkillType: 'check' | 'poison' | 'guard' | null; // 发放的技能类型
    merchantSkillUsed?: boolean;              // 商人发放的一次性技能是否已使用
    discussionRoundTwoDone?: boolean;          // 本日是否已进入过第二轮讨论
    discussionRoundTwoTurn?: number | null;    // 已进入第二轮讨论的天数
    lastExiledPlayerId: number | null;        // 上一轮被放逐的玩家ID（守墓人用）
    demonHunterKills: number[];              // 猎魔人猎杀记录
}

// The structure of a log entry
export interface GameLog {
    id: string;
    turn: number;
    phase: GamePhase;
    speakerId?: number; // Null if system message
    speakerName?: string; // Optional override for podcast/custom modes
    content: string; // markdown supported
    thought?: string; // The internal monologue (CoT)
    timestamp: number;
    isSystem: boolean;
    visibleTo?: number[]; // If set, only these player IDs (and user) can see this log. E.g. Seer result.
    debugType?: 'AI_THINKING' | 'VOTE_STRATEGY' | 'VOTE_TALLY' | 'WOLF_EXPLODE_STRATEGY' | 'KNIGHT_CHALLENGE_STRATEGY' | 'SHERIFF_WITHDRAW_STRATEGY' | 'EVENT_TRACE';
    durationMs?: number;
    strategySummary?: string;
    modelName?: string;
    debugData?: Record<string, unknown>;
}

// Audio Timeline Event for Replay
export interface TimelineEvent {
    id: string;
    type: 'NARRATOR' | 'PLAYER';
    speakerName: string;
    text: string;
    voiceId: string;
    // Store snapshot of TTS config used
    ttsProvider: string;
    ttsModel?: string;
    ttsBaseUrl?: string;
    ttsApiKey?: string;

    audioKey: string; // IndexedDB Key
    timestamp: number;
    isPrivate?: boolean;
}

export interface GameRules {
    /** 当前仅支持屠边（村民或神职一边全灭即狼胜）；字段为未来扩展预留 */
    winCondition: 'SLAUGHTER_SIDE';
    sheriffElection: boolean;
    sheriffVoteWeight: number;
    voteDetailPublic: boolean;
    doubleExplodeNoSheriff: boolean;
    witchSelfSave: boolean | 'FIRST_NIGHT';
    witchSameNight: boolean;
    guardCannotSameTarget: boolean;
    guardBlocksPoison: boolean;
    guardHealConflictKills: boolean;
    hunterCanShootWhenPoisoned: boolean;
    wolfKingCanShootWhenPoisoned: boolean;    // 狼王被毒后能否开枪（标准狼王守卫板为禁枪），默认 false
    firstNightLastWords: boolean;
    votedOutLastWords: boolean;
    // Extended rules
    wolfExplodeEnabled: boolean;              // 狼人自爆开关，默认 true
    doubleExplodeSwallowBadge: boolean;       // 双爆吞警徽，默认 true
    knightChallengeEnabled: boolean;          // 骑士决斗开关，默认 true
    twoRoundDiscussion: boolean;              // 两轮讨论，默认 false
    sheriffWithdrawEnabled: boolean;          // 退水环节，默认 true
    stoneGhostCheckIdentity: boolean;         // 石像鬼查验身份，默认 true
    whiteWolfKingExplodeShoot: boolean;       // 白狼王自爆带人，默认 true
    bloodMoonBlockAbilities: boolean;         // 血月使徒封印神职，默认 true
    gravekeeperCheckIdentity: boolean;        // 守墓人查验身份，默认 true
    demonHunterHunt: boolean;                 // 猎魔人猎杀，默认 true
    cupidLinkLovers: boolean;                 // 丘比特连结，默认 true
    thirdPartyEnabled: boolean;               // 第三方阵营，默认 false
    miracleMerchantGiveSkill: boolean;        // 奇迹商人发技能，默认 true
}

// Game Rules Configuration
export interface GameConfig {
    playerCount: number;
    roles: Role[];
    phasePrompts: Record<string, string>;
    rolePrompts: Record<string, string>;
    globalAiInstructions: string;
    sheriffEnabled: boolean;
    voteDetailPublic: boolean;
    rules: GameRules;
}

export interface PlayerScore {
    playerId: number;
    score: number;
    isMvp: boolean;
    isSvp: boolean;
    details: {
        survivalBonus: number;
        winBonus: number;
        voteAccuracyBonus: number;
        skillBonus: number;
        speechBonus: number;
    };
}

export interface GameEvaluation {
    scores: PlayerScore[];
    metrics: {
        roleIdentificationAccuracy: number;
        deceptionSuccessRate: number;
        voteAccuracy: number;
        communicationEffectiveness: number;
        survivalRate: number;
        skillUsageAccuracy: number;
    };
}

export interface LoverState {
    players: [number, number];
    bothAlive: boolean;
}

export interface ThirdPartyState {
    type: 'lovers' | 'other';
    members: number[];
    winCondition: string;
}

export interface GameResult {
    winner: 'GOOD' | 'WOLF' | 'THIRD_PARTY';
    reason: 'ALL_WOLVES_DEAD' | 'ALL_VILLAGERS_DEAD' | 'ALL_GODS_DEAD' | 'THIRD_PARTY_WIN';
    reasonText: string;
    turn: number;
    endedAt: number;
    alivePlayerIds: number[];
    deadPlayerIds: number[];
    sheriffId?: number | null;
    mvp?: { id: number; seat: number; role: Role; score: number } | null;
    svp?: { id: number; seat: number; role: Role; score: number } | null;
    // Extended fields
    evaluation: GameEvaluation;
    thirdParty: ThirdPartyState | null;
    lovers: LoverState | null;
}

// Agent Chat Types
export interface AgentMessage {
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
}

// Snapshot for replay (State restoration)
export interface GameSnapshot {
    phase: GamePhase;
    players: Player[];
    logs: GameLog[];
    turn: number;
    godState: GodState;
}

// --- Archive Structure for History ---
export interface GameArchive {
    schemaVersion?: number;
    id: string;
    timestamp: number;
    duration: number; // in seconds (approximation)
    playerCount: number;
    winner: 'GOOD' | 'WOLF' | 'THIRD_PARTY' | 'UNKNOWN';
    roles: Role[];
    result?: GameResult | null;
    keyEvents?: string[];
    debugLogCount?: number;
    publicLogCount?: number;
    isMultiplayer?: boolean; // 是否为联机模式对局

    // State needed for replay
    logs: GameLog[];
    timeline: TimelineEvent[];
    players: Player[]; // Final state of players (names, avatars)
    turnCount: number;
}

// Board Preset for UI Selection
export interface GamePreset {
    key: string;
    label: string;
    description: string;
    icon: string;
    playerCount: number;
    roles: Role[];
    rules: GameRules;
}

export const DEFAULT_GAME_RULES: GameRules = {
    winCondition: 'SLAUGHTER_SIDE',
    sheriffElection: true,
    sheriffVoteWeight: 1.5,
    voteDetailPublic: false,
    doubleExplodeNoSheriff: true,
    witchSelfSave: 'FIRST_NIGHT',
    witchSameNight: false,
    guardCannotSameTarget: true,
    guardBlocksPoison: false,
    guardHealConflictKills: true,
    hunterCanShootWhenPoisoned: false,
    wolfKingCanShootWhenPoisoned: false,
    firstNightLastWords: true,
    votedOutLastWords: true,
    // Extended defaults
    wolfExplodeEnabled: true,
    doubleExplodeSwallowBadge: true,
    knightChallengeEnabled: true,
    twoRoundDiscussion: false,
    sheriffWithdrawEnabled: true,
    stoneGhostCheckIdentity: true,
    whiteWolfKingExplodeShoot: true,
    bloodMoonBlockAbilities: true,
    gravekeeperCheckIdentity: true,
    demonHunterHunt: true,
    cupidLinkLovers: true,
    thirdPartyEnabled: false,
    miracleMerchantGiveSkill: true,
};

const createRules = (overrides: Partial<GameRules> = {}): GameRules => ({ ...DEFAULT_GAME_RULES, ...overrides });

export const GAME_PRESETS: GamePreset[] = [
    {
        key: '9-v1',
        label: '经典标准局',
        description: '全网最火的标准配置：3狼人、3村民，神职为预言家、女巫、猎人，攻守平衡。',
        icon: 'mc:sword',
        playerCount: 9,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER
        ],
        rules: createRules({
            sheriffElection: true,
            doubleExplodeNoSheriff: true,
            witchSelfSave: true,
            witchSameNight: false,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '9-guard',
        label: '守卫进阶局',
        description: '把猎人换成守卫：3狼人、3村民，神职为预言家、女巫、守卫。女巫与守卫可组成双救体系。',
        icon: 'mc:shield',
        playerCount: 9,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.GUARD
        ],
        rules: createRules({
            sheriffElection: true,
            doubleExplodeNoSheriff: true,
            witchSelfSave: true,
            witchSameNight: false,
            guardCannotSameTarget: true,
            guardHealConflictKills: true,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '12-v1',
        label: '经典标准局',
        description: '经典的十二人配置：4狼人、4村民，神职为预言家、女巫、猎人、白痴。',
        icon: 'mc:sword',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.IDIOT
        ],
        rules: createRules({
            sheriffElection: true,
            doubleExplodeNoSheriff: true,
            witchSelfSave: 'FIRST_NIGHT',
            witchSameNight: false,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '12-guard',
        label: '守卫标准局',
        description: '经典的十二人守卫配置：4狼人、4村民，神职为预言家、女巫、猎人、守卫。',
        icon: 'mc:shield',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD
        ],
        rules: createRules({
            sheriffElection: true,
            doubleExplodeNoSheriff: true,
            witchSelfSave: false,
            witchSameNight: false,
            guardCannotSameTarget: true,
            guardHealConflictKills: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    // --- 6人局 ---
    {
        key: '6-seer-witch',
        label: '新手入门局',
        description: '六人入门配置：2狼人、2村民，神职为预言家、女巫。无警长、无自爆，女巫可以自救。',
        icon: 'mc:bread',
        playerCount: 6,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH
        ],
        rules: createRules({
            sheriffElection: false,
            wolfExplodeEnabled: false,
            doubleExplodeNoSheriff: false,
            doubleExplodeSwallowBadge: false,
            witchSelfSave: true,
            witchSameNight: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '6-seer-only',
        label: '极简推理局',
        description: '六人极简配置：2狼人、3村民，神职仅有预言家。没有女巫与警长，纯靠逻辑推演。',
        icon: 'mc:bookFilled',
        playerCount: 6,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER
        ],
        rules: createRules({
            sheriffElection: false,
            wolfExplodeEnabled: false,
            doubleExplodeNoSheriff: false,
            doubleExplodeSwallowBadge: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    // --- 7人局 ---
    {
        key: '7-standard',
        label: '主流标准局',
        description: '七人标准配置：3狼人、2村民，神职为预言家、女巫。有警长，狼人可自爆。',
        icon: 'mc:torch',
        playerCount: 7,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: false,
            doubleExplodeSwallowBadge: false,
            witchSelfSave: true,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '7-demon-hunter',
        label: '猎魔人变种局',
        description: '七人变种配置：3狼人、2村民，神职为预言家、猎魔人。有警长，狼人可自爆。',
        icon: 'mc:bow',
        playerCount: 7,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.DEMON_HUNTER
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: false,
            doubleExplodeSwallowBadge: false,
            demonHunterHunt: true,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    // --- 8人局 ---
    {
        key: '8-standard',
        label: '官方标准局',
        description: '八人官方配置：3狼人、3村民，神职为预言家、女巫。有警长，狼人可自爆，双爆吞警徽。',
        icon: 'mc:torch',
        playerCount: 8,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: true,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '8-seer-witch-hunter',
        label: '竞技猎人局',
        description: '八人竞技配置：3狼人、2村民，神职为预言家、女巫、猎人。有警长，可自爆双爆吞警徽。',
        icon: 'mc:bow',
        playerCount: 8,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    // --- 10人局 ---
    {
        key: '10-standard',
        label: '均衡标准局',
        description: '十人标准配置：3狼人、4村民，神职为预言家、女巫、猎人。女巫不可自救。',
        icon: 'mc:torch',
        playerCount: 10,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: false,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '10-seer-witch-hunter-guard',
        label: '四神守卫局',
        description: '十人守卫配置：3狼人、3村民，神职为预言家、女巫、猎人、守卫。女巫不可自救，守卫可以连续守护。',
        icon: 'mc:shield',
        playerCount: 10,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: false,
            guardCannotSameTarget: false,
            guardHealConflictKills: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    // --- 11人局 ---
    {
        key: '11-balanced',
        label: '平衡配置局',
        description: '十一人平衡配置：4狼人、4村民，神职为预言家、女巫、猎人。女巫不可自救。',
        icon: 'mc:emerald',
        playerCount: 11,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: false,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '11-wolf-king-guard',
        label: '狼王守卫局',
        description: '十一人狼王守卫配置：狼人三名加狼王、村民三名，神职为预言家、女巫、猎人、守卫。女巫不可自救。',
        icon: 'mc:bone',
        playerCount: 11,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WOLF_KING,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: false,
            guardCannotSameTarget: true,
            guardHealConflictKills: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    // --- 12人局扩展 ---
    {
        key: '12-wolf-king-guard',
        label: '狼王守卫局',
        description: '十二人狼王守卫配置：狼人三名加狼王、村民四名，神职为预言家、女巫、猎人、守卫。狼王阵亡时可开枪。',
        icon: 'mc:bone',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WOLF_KING,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: 'FIRST_NIGHT',
            witchSameNight: false,
            guardCannotSameTarget: true,
            guardHealConflictKills: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '12-stone-ghost-gravekeeper',
        label: '石像鬼守墓人局',
        description: '十二人石像鬼守墓人配置：狼人三名加石像鬼、村民四名，神职为预言家、女巫、猎人、守墓人。',
        icon: 'mc:shovel',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.STONE_GHOST,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.GRAVEKEEPER
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: 'FIRST_NIGHT',
            witchSameNight: false,
            stoneGhostCheckIdentity: true,
            gravekeeperCheckIdentity: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '12-white-wolf-king-knight',
        label: '白狼王骑士局',
        description: '十二人白狼王骑士配置：狼人三名加白狼王、村民四名，神职为预言家、女巫、猎人、骑士。白狼王自爆时可带人。',
        icon: 'mc:sword',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WHITE_WOLF_KING,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.KNIGHT
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: 'FIRST_NIGHT',
            witchSameNight: false,
            whiteWolfKingExplodeShoot: true,
            knightChallengeEnabled: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '12-blood-moon-demon-hunter',
        label: '血月使徒猎魔人局',
        description: '十二人血月使徒猎魔人配置：狼人三名加血月使徒、村民四名，神职为预言家、女巫、猎人、猎魔人。',
        icon: 'mc:bow',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.BLOOD_MOON_DISCIPLE,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.DEMON_HUNTER
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: 'FIRST_NIGHT',
            witchSameNight: false,
            bloodMoonBlockAbilities: true,
            demonHunterHunt: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '12-cupid',
        label: '丘比特情侣局',
        description: '十二人丘比特情侣配置：4狼人、4村民，神职为预言家、女巫、猎人、丘比特。情侣构成第三方阵营。',
        icon: 'mc:heart',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.CUPID
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: 'FIRST_NIGHT',
            witchSameNight: false,
            cupidLinkLovers: true,
            thirdPartyEnabled: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    },
    {
        key: '12-miracle-merchant',
        label: '奇迹商人局',
        description: '十二人奇迹商人配置：4狼人、4村民，神职为预言家、女巫、猎人、奇迹商人。商人把技能交给狼人时会阵亡。',
        icon: 'mc:emerald',
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.MIRACLE_MERCHANT
        ],
        rules: createRules({
            sheriffElection: true,
            wolfExplodeEnabled: true,
            doubleExplodeNoSheriff: true,
            doubleExplodeSwallowBadge: true,
            witchSelfSave: 'FIRST_NIGHT',
            witchSameNight: false,
            miracleMerchantGiveSkill: true,
            hunterCanShootWhenPoisoned: false,
            firstNightLastWords: true,
            votedOutLastWords: true
        })
    }
];

export const DEFAULT_PHASE_PROMPTS: Record<string, string> = {
    [GamePhase.NIGHT_START]: "Night falls. Everyone close your eyes.",
    [GamePhase.WEREWOLF_ACTION]: "Werewolves wake up and choose a target.",
    [GamePhase.SEER_ACTION]: "Seer wakes up.",
    [GamePhase.WITCH_ACTION]: "Witch wakes up.",
    [GamePhase.GUARD_ACTION]: "Guard wakes up.",
    [GamePhase.DAY_ANNOUNCE]: "Morning comes.",
    [GamePhase.DAY_DISCUSSION]: "Discuss who is the werewolf.",
    [GamePhase.SHERIFF_ELECTION]: "Players may run for Sheriff and make campaign speeches.",
    [GamePhase.SHERIFF_VOTING]: "Vote for the Sheriff.",
    [GamePhase.VOTING]: "Vote for who to eliminate.",
    [GamePhase.LAST_WORDS]: "Leave your final words.",
    [GamePhase.GAME_REVIEW]: "Game over. Review the game.",
    [GamePhase.GAME_OVER]: "Game Over.",
    [GamePhase.KNIGHT_CHALLENGE]: "骑士可以选择决斗一名玩家，若对方是狼人则对方死亡，若不是则骑士死亡。",
    [GamePhase.WOLF_EXPLODE]: "狼人可以选择自爆，直接进入黑夜并吞掉警徽。",
    [GamePhase.SHERIFF_WITHDRAW]: "竞选警长的玩家可以选择退水。",
    [GamePhase.DISCUSSION_ROUND_TWO]: "第二轮讨论开始，玩家继续发言。",
    [GamePhase.STONE_GHOST_ACTION]: "石像鬼可以查验一名玩家的具体身份。",
    [GamePhase.GRAVEKEEPER_ACTION]: "守墓人可以查验上一轮被放逐玩家的身份。",
    [GamePhase.DEMON_HUNTER_ACTION]: "猎魔人可以选择猎杀一名玩家。",
    [GamePhase.CUPID_LINK]: "丘比特可以选择连结两名玩家为情侣。",
    [GamePhase.MERCHANT_ACTION]: "奇迹商人可以选择给一名玩家发放技能。",
};

export const DEFAULT_ROLE_PROMPTS: Record<string, string> = {
    [Role.WEREWOLF]: "你是狼人。你的目标是杀死所有好人。白天你需要伪装成好人，混淆视听。晚上与队友配合刀人。",
    [Role.VILLAGER]: "你是普通村民。你没有任何特殊能力。你的目标是找出所有狼人并投票放逐他们。通过逻辑分析和观察别人的发言。",
    [Role.SEER]: "你是预言家。你是好人的核心。每晚你可以查验一个人的身份。白天你需要适时跳身份带领好人，但也要注意保护自己。",
    [Role.WITCH]: "你是女巫。你有一瓶解药和一瓶毒药。解药可以救活晚上被杀的人，毒药可以毒死一个人。合理使用你的药水。",
    [Role.HUNTER]: "你是猎人。如果你被狼人杀害或被投票放逐，你可以开枪带走一人。但在被女巫毒死时不能开枪。",
    [Role.GUARD]: "你是守卫。每晚你可以守护一个人不被狼人杀害。你不能连续两晚守护同一个人。",
    [Role.IDIOT]: "你是白痴。你属于好人阵营。若你被投票放逐，会翻牌存活但失去投票权；白天需要通过发言帮助好人找出狼人。",
    [Role.WOLF_KING]: "你是狼王。你属于狼人阵营。被放逐或夜晚死亡后可以开枪带走一人；被毒杀时能否开枪以当局规则为准（标准规则禁止被毒开枪）。白天伪装好人，死亡时精准带走关键神职。",
    [Role.KNIGHT]: "你是骑士。你属于好人阵营。白天你可以选择决斗一名玩家：若对方是狼人则对方死亡，若不是则你自己死亡。整局只能决斗一次。",
    [Role.STONE_GHOST]: "你是石像鬼。你属于狼人阵营，但无法参与狼人刀人。每晚你可以查验一名玩家的具体身份。白天需要伪装好人，为狼队提供信息。",
    [Role.WHITE_WOLF_KING]: "你是白狼王。你属于狼人阵营，自爆时可以带走一人。白天可以选择自爆并指定带走一名玩家。",
    [Role.BLOOD_MOON_DISCIPLE]: "你是血月使徒。你属于狼人阵营。白天自爆后可以封印当晚所有神职技能。合理利用自爆与封印能力为狼队创造机会。",
    [Role.GRAVEKEEPER]: "你是守墓人。你属于好人阵营。每晚你可以查验上一轮被放逐玩家的身份。利用信息帮助好人分析局势。",
    [Role.DEMON_HUNTER]: "你是猎魔人。你属于好人阵营。每晚可以选择猎杀一名玩家；若目标是狼人则目标死亡，否则你自己死亡。谨慎使用你的猎杀能力。",
    [Role.CUPID]: "你是丘比特。第一晚你可以连结两名玩家为情侣。情侣一方死亡则另一方殉情。如果情侣分属不同阵营，则形成第三方阵营。",
    [Role.MIRACLE_MERCHANT]: "你是奇迹商人。你属于好人阵营。每晚你可以给一名玩家发放技能（查验、毒药或守护），若该玩家是狼人则你自己死亡。",
};
export interface UserInput {
    speak: string;
    actionTarget: number | null;
    target: number | null;
    action?: 'explode' | 'skip' | 'challenge' | 'hunt' | 'check' | 'link' | 'give' | 'withdraw' | 'stay';
    shouldExplode?: boolean;
    useCure?: boolean;
    poisonTarget?: number | null;
    target1?: number | null;
    target2?: number | null;
    cupidTarget1?: number | null;
    cupidTarget2?: number | null;
    skillType?: 'check' | 'poison' | 'guard' | null;
    merchantSkillType?: 'check' | 'poison' | 'guard' | null;
    wolfExplode?: boolean;
    explodeTarget?: number | null;
    strategySummary?: string;
    speech?: string;
    summary?: string;
    shootTarget?: number | null;
    shootActionTarget?: number | null;
    /** 提交输入的人类玩家 id：面板在引擎尚未登记 resolver 时先落 userInputAtom，引擎据此认领 */
    _playerId?: number;
    secondTarget?: number | null;
    shouldWithdraw?: boolean;
    _advisorDebugData?: {
        rawResult: any;
        rawResponse: string;
        promptContext: Record<string, unknown>;
        durationMs: number;
        modelName: string;
        strategySummary: string;
    };
}

export const DEFAULT_GOD_STATE: GodState = {
    wolfTarget: null,
    seerCheck: null,
    witchSave: false,
    witchPoison: null,
    guardProtect: null,
    lastGuardProtect: null,
    merchantGuardProtect: null,
    deathsTonight: [],
    sheriffId: null,
    sheriffCandidates: [],
    sheriffElectionDone: false,
    sheriffVoteRound: 1,
    sheriffTieCandidates: [],
    voteTieCandidates: null,
    voteTieRound: null,
    pendingDeathActionIds: [],
    deathActionResume: undefined,
    pendingNightDeathIds: [],
    poisonedTonight: [],
    wolfExplodeTarget: null,
    explodedWolves: [],
    wolfExplodeCheckedTurn: null,
    knightChallenged: false,
    knightChallengeTarget: null,
    bloodMoonSealed: false,
    lovers: null,
    cupidIsThirdParty: false,
    merchantSkillTarget: null,
    merchantSkillType: null,
    merchantSkillUsed: false,
    discussionRoundTwoDone: false,
    discussionRoundTwoTurn: null,
    lastExiledPlayerId: null,
    demonHunterKills: [],
    lastWordsFromNight: false,
};
