import assert from 'node:assert/strict';
import test from 'node:test';
import {
    NIGHT_ACTION_PHASES,
    canRoleSeeNightPhase,
    canSeeLoverInfo,
    canSeeMerchantSkillInfo,
    canSeeSpeakerForPhase,
    isGodLikeView,
    isInternalDebugLog,
    isWolfPrivateLog,
    shouldExperienceLog,
    shouldShowLogForViewer,
    shouldShowPlayerRole,
} from '../../src/utils/visibility';
import {
    GamePhase,
    PlayerStatus,
    Role,
    WOLF_ROLES,
    type GameLog,
    type GodState,
    type Perspective,
    type Player,
} from '../../src/types';

// ── 最小夹具 ──────────────────────────────────────────────

const player = (id: number, role: Role, options: { status?: PlayerStatus; isHuman?: boolean } = {}): Player => ({
    id,
    seatNumber: id,
    role,
    status: options.status ?? PlayerStatus.ALIVE,
    avatarSeed: id,
    rolePrompt: '',
    isSpeaking: false,
    actorId: `actor-${id}`,
    isHuman: options.isHuman ?? false,
});

let logSeq = 0;
const makeLog = (over: Partial<GameLog> = {}): GameLog => ({
    id: `log-${++logSeq}`,
    turn: 1,
    phase: GamePhase.DAY_DISCUSSION,
    content: 'content',
    timestamp: 0,
    isSystem: false,
    ...over,
});

const godState = (over: Partial<GodState> = {}): GodState => ({
    wolfTarget: null,
    seerCheck: null,
    witchSave: false,
    witchPoison: null,
    guardProtect: null,
    merchantGuardProtect: null,
    deathsTonight: [],
    wolfExplodeTarget: null,
    explodedWolves: [],
    knightChallenged: false,
    knightChallengeTarget: null,
    bloodMoonSealed: false,
    lovers: null,
    cupidIsThirdParty: false,
    merchantSkillTarget: null,
    merchantSkillType: null,
    lastExiledPlayerId: null,
    demonHunterKills: [],
    ...over,
});

const players = [
    player(1, Role.WEREWOLF),
    player(2, Role.VILLAGER),
    player(3, Role.SEER),
    player(4, Role.WITCH),
    player(5, Role.WOLF_KING),
];

// ── NIGHT_ACTION_PHASES 常量锁定 ──────────────────────────

test('NIGHT_ACTION_PHASES covers exactly the nine gated night phases', () => {
    assert.deepEqual(NIGHT_ACTION_PHASES, [
        GamePhase.WEREWOLF_ACTION,
        GamePhase.SEER_ACTION,
        GamePhase.WITCH_ACTION,
        GamePhase.GUARD_ACTION,
        GamePhase.STONE_GHOST_ACTION,
        GamePhase.GRAVEKEEPER_ACTION,
        GamePhase.DEMON_HUNTER_ACTION,
        GamePhase.CUPID_LINK,
        GamePhase.MERCHANT_ACTION,
    ]);
});

// ── (a) 夜间行动阶段对普通村民视角不可见 ──────────────────

test('(a) night action phases are hidden from a villager perspective (canRoleSeeNightPhase)', () => {
    for (const phase of NIGHT_ACTION_PHASES) {
        assert.equal(canRoleSeeNightPhase(phase, Role.VILLAGER), false, phase);
    }
    // 日间阶段默认可见
    assert.equal(canRoleSeeNightPhase(GamePhase.DAY_DISCUSSION, Role.VILLAGER), true);
    assert.equal(canRoleSeeNightPhase(GamePhase.VOTING, Role.VILLAGER), true);
    // 未纳入门控的阶段即使角色匹配也走默认可见分支
    assert.equal(canRoleSeeNightPhase(GamePhase.HUNTER_ACTION, Role.HUNTER), true);
});

test('(a) each night action phase is only visible to its owning role; wolves share only WEREWOLF_ACTION', () => {
    const owningRoles: Array<[GamePhase, Role]> = [
        [GamePhase.WEREWOLF_ACTION, Role.WEREWOLF],
        [GamePhase.SEER_ACTION, Role.SEER],
        [GamePhase.WITCH_ACTION, Role.WITCH],
        [GamePhase.GUARD_ACTION, Role.GUARD],
        [GamePhase.STONE_GHOST_ACTION, Role.STONE_GHOST],
        [GamePhase.GRAVEKEEPER_ACTION, Role.GRAVEKEEPER],
        [GamePhase.DEMON_HUNTER_ACTION, Role.DEMON_HUNTER],
        [GamePhase.CUPID_LINK, Role.CUPID],
        [GamePhase.MERCHANT_ACTION, Role.MIRACLE_MERCHANT],
    ];

    for (const [phase, role] of owningRoles) {
        assert.equal(canRoleSeeNightPhase(phase, role), true, `${phase}/${role}`);
    }

    // 所有狼队角色共享狼人行动阶段
    for (const role of WOLF_ROLES) {
        assert.equal(canRoleSeeNightPhase(GamePhase.WEREWOLF_ACTION, role), true, role);
        // 但狼人看不到其他阵营的夜间行动
        assert.equal(canRoleSeeNightPhase(GamePhase.SEER_ACTION, role), false, role);
        assert.equal(canRoleSeeNightPhase(GamePhase.WITCH_ACTION, role), false, role);
    }
    // 非狼队角色看不到狼人行动阶段
    assert.equal(canRoleSeeNightPhase(GamePhase.WEREWOLF_ACTION, Role.VILLAGER), false);
    assert.equal(canRoleSeeNightPhase(GamePhase.WEREWOLF_ACTION, Role.SEER), false);
});

test('(a) system logs in night action phases are hidden from mismatched perspectives (shouldExperienceLog)', () => {
    const seerSystem = makeLog({ phase: GamePhase.SEER_ACTION, isSystem: true });
    assert.equal(shouldExperienceLog(seerSystem, 'GOOD', players), false);
    assert.equal(shouldExperienceLog(seerSystem, 'WOLF', players), false);
    assert.equal(shouldExperienceLog(seerSystem, 'GOD', players), true);

    // 狼人行动阶段的系统日志对狼阵营可见、对好人不可见
    const wolfPhaseSystem = makeLog({ phase: GamePhase.WEREWOLF_ACTION, isSystem: true });
    assert.equal(shouldExperienceLog(wolfPhaseSystem, 'WOLF', players), true);
    assert.equal(shouldExperienceLog(wolfPhaseSystem, 'GOOD', players), false);

    // 日间系统日志所有视角都可见
    const daySystem = makeLog({ phase: GamePhase.DAY_DISCUSSION, isSystem: true });
    assert.equal(shouldExperienceLog(daySystem, 'GOOD', players), true);
    assert.equal(shouldExperienceLog(daySystem, 'WOLF', players), true);
    assert.equal(shouldExperienceLog(daySystem, 'GOD', players), true);
});

test('(a) shouldShowLogForViewer hides unrestricted system night logs from a human villager but shows them to the matching role', () => {
    const humanVillager = player(11, Role.VILLAGER, { isHuman: true });
    const humanSeer = player(12, Role.SEER, { isHuman: true });
    const seerSystem = makeLog({ phase: GamePhase.SEER_ACTION, isSystem: true });

    assert.equal(shouldShowLogForViewer(seerSystem, {
        isReplay: false, perspective: 'GOOD', players, humanPlayer: humanVillager,
    }), false);
    assert.equal(shouldShowLogForViewer(seerSystem, {
        isReplay: false, perspective: 'GOOD', players, humanPlayer: humanSeer,
    }), true);

    // 无真人玩家时不过滤
    assert.equal(shouldShowLogForViewer(seerSystem, {
        isReplay: false, perspective: 'GOD', players,
    }), true);

    // 无 visibleTo 的非系统夜间日志对人类直接可见（内容隐私依赖日志自带 visibleTo）
    const seerSpeech = makeLog({ phase: GamePhase.SEER_ACTION, isSystem: false });
    assert.equal(shouldShowLogForViewer(seerSpeech, {
        isReplay: false, perspective: 'GOOD', players, humanPlayer: humanVillager,
    }), true);

    // debugGodView 优先于人类过滤
    assert.equal(shouldShowLogForViewer(seerSystem, {
        isReplay: false, perspective: 'GOD', players, humanPlayer: humanVillager, debugGodView: true,
    }), true);
});

// ── (b) 狼人私聊仅狼阵营可见 ──────────────────────────────

test('(b) isWolfPrivateLog requires werewolf-action phase and a wolf-only visibleTo list', () => {
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [1] }), players), true);
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [1, 5] }), players), true);
    // 名单里混入好人
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [1, 2] }), players), false);
    // 名单里有未知 id
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [1, 99] }), players), false);
    // 阶段不是狼人行动
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.SEER_ACTION, visibleTo: [1] }), players), false);
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.DAY_DISCUSSION, visibleTo: [1] }), players), false);
    // 无 visibleTo
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.WEREWOLF_ACTION }), players), false);
});

test('(b) wolf private logs: WOLF perspective sees them, GOOD never does, GOD sees all non-debug', () => {
    const wolfChat = makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [1] });
    assert.equal(shouldExperienceLog(wolfChat, 'WOLF', players), true);
    assert.equal(shouldExperienceLog(wolfChat, 'GOOD', players), false);
    assert.equal(shouldExperienceLog(wolfChat, 'GOD', players), true);

    // 可见者名单里有好人的“私聊”对 WOLF 视角同样不可见
    const mixed = makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [1, 2] });
    assert.equal(shouldExperienceLog(mixed, 'WOLF', players), false);

    // 阶段限定在预言家行动的私密日志（即使可见者全是狼的场景不成立）对 WOLF 不可见
    const seerResult = makeLog({ phase: GamePhase.SEER_ACTION, visibleTo: [3] });
    assert.equal(shouldExperienceLog(seerResult, 'WOLF', players), false);
    assert.equal(shouldExperienceLog(seerResult, 'GOD', players), true);
    // GOOD 视角看不到任何 visibleTo 受限日志（fail-closed）
    assert.equal(shouldExperienceLog(seerResult, 'GOOD', players), false);
});

test('(b) human wolf sees wolf private chat only when included in visibleTo (shouldShowLogForViewer)', () => {
    const wolfA = player(21, Role.WEREWOLF, { isHuman: true });
    const wolfB = player(22, Role.WOLF_KING, { isHuman: true });
    const humanVillager = player(23, Role.VILLAGER, { isHuman: true });
    const roster = [wolfA, wolfB, humanVillager];
    const wolfChat = makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [wolfA.id] });
    const base = { isReplay: false, perspective: 'GOOD' as Perspective, players: roster };

    assert.equal(shouldShowLogForViewer(wolfChat, { ...base, humanPlayer: wolfA }), true);
    // 同为狼但不在名单内 → 不可见
    assert.equal(shouldShowLogForViewer(wolfChat, { ...base, humanPlayer: wolfB }), false);
    // 好人 → 不可见
    assert.equal(shouldShowLogForViewer(wolfChat, { ...base, humanPlayer: humanVillager }), false);
    // 名单外的日志（预言家结果）对人类玩家同样按名单过滤
    const seerResult = makeLog({ phase: GamePhase.SEER_ACTION, visibleTo: [3] });
    assert.equal(shouldShowLogForViewer(seerResult, { ...base, humanPlayer: wolfA }), false);
});

test('(b) replay mode routes log visibility through shouldExperienceLog', () => {
    const wolfChat = makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [1] });
    assert.equal(shouldShowLogForViewer(wolfChat, {
        isReplay: true, perspective: 'WOLF', players,
    }), true);
    assert.equal(shouldShowLogForViewer(wolfChat, {
        isReplay: true, perspective: 'GOOD', players,
    }), false);
    assert.equal(shouldShowLogForViewer(wolfChat, {
        isReplay: true, perspective: 'GOD', players,
    }), true);
});

// ── (c) 人类玩家在夜间阶段看不到发言者（回放例外） ────────

test('(c) humans cannot see night-phase speakers outside replay mode (canSeeSpeakerForPhase)', () => {
    const humanVillager = player(31, Role.VILLAGER, { isHuman: true });
    const humanSeer = player(32, Role.SEER, { isHuman: true });

    for (const phase of NIGHT_ACTION_PHASES) {
        assert.equal(canSeeSpeakerForPhase(phase, humanVillager, false), false, phase);
    }
    // 回放模式例外：始终可见
    for (const phase of NIGHT_ACTION_PHASES) {
        assert.equal(canSeeSpeakerForPhase(phase, humanVillager, true), true, phase);
    }
    // 无真人玩家（纯 AI / 观战）不隐藏
    assert.equal(canSeeSpeakerForPhase(GamePhase.SEER_ACTION, undefined, false), true);
    // 日间阶段始终可见
    assert.equal(canSeeSpeakerForPhase(GamePhase.DAY_DISCUSSION, humanVillager, false), true);
    // 拥有对应角色的真人可见自己阶段的发言者
    assert.equal(canSeeSpeakerForPhase(GamePhase.SEER_ACTION, humanSeer, false), true);
    const humanWolf = player(33, Role.WEREWOLF, { isHuman: true });
    assert.equal(canSeeSpeakerForPhase(GamePhase.WEREWOLF_ACTION, humanWolf, false), true);
    assert.equal(canSeeSpeakerForPhase(GamePhase.SEER_ACTION, humanWolf, false), false);
});

// ── (d) 非上帝视角不显示他人真实职业，本人可见 ────────────

test('(d) live mode: human sees own role but not other good roles', () => {
    const humanSeer = player(41, Role.SEER, { isHuman: true });
    const wolf = player(42, Role.WEREWOLF);
    const villager = player(43, Role.VILLAGER);
    const base = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: false,
        perspective: 'GOOD' as Perspective,
        humanPlayer: humanSeer,
        godState: godState(),
    };

    assert.equal(shouldShowPlayerRole(humanSeer, base), true);
    assert.equal(shouldShowPlayerRole(wolf, base), false);
    assert.equal(shouldShowPlayerRole(villager, base), false);
    // showRolesGlobal 在有真人时按本人规则走，不会泄露他人身份
    assert.equal(shouldShowPlayerRole(villager, { ...base, showRolesGlobal: true }), false);
});

test('(d) wolf human sees all wolf roles; cupid sees lovers only', () => {
    const humanWolf = player(51, Role.WEREWOLF, { isHuman: true });
    const wolfMate = player(52, Role.STONE_GHOST);
    const villager = player(53, Role.VILLAGER);
    const wolfBase = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: false,
        perspective: 'WOLF' as Perspective,
        humanPlayer: humanWolf,
        godState: godState(),
    };

    assert.equal(shouldShowPlayerRole(humanWolf, wolfBase), true);
    assert.equal(shouldShowPlayerRole(wolfMate, wolfBase), true);
    assert.equal(shouldShowPlayerRole(villager, wolfBase), false);

    const humanCupid = player(61, Role.CUPID, { isHuman: true });
    const lover = player(62, Role.VILLAGER);
    const stranger = player(63, Role.WITCH);
    const lovers = godState({ lovers: [61, 62] });
    const cupidBase = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: false,
        perspective: 'GOOD' as Perspective,
        humanPlayer: humanCupid,
        godState: lovers,
    };

    assert.equal(shouldShowPlayerRole(humanCupid, cupidBase), true);
    assert.equal(shouldShowPlayerRole(lover, cupidBase), true);
    assert.equal(shouldShowPlayerRole(stranger, cupidBase), false);
    // 非丘比特即使情侣存在也看不到
    const seerBase = { ...cupidBase, humanPlayer: player(64, Role.SEER, { isHuman: true }) };
    assert.equal(shouldShowPlayerRole(lover, seerBase), false);
    // 没有情侣时丘比特也看不到任何角色
    const noLoversBase = { ...cupidBase, godState: godState() };
    assert.equal(shouldShowPlayerRole(lover, noLoversBase), false);
});

test('(d) game over / debugGodView / spectator showRolesGlobal reveal all roles', () => {
    const humanSeer = player(71, Role.SEER, { isHuman: true });
    const stranger = player(72, Role.VILLAGER);
    const live = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: false,
        perspective: 'GOOD' as Perspective,
        humanPlayer: humanSeer,
        godState: godState(),
    };

    assert.equal(shouldShowPlayerRole(stranger, live), false);
    assert.equal(shouldShowPlayerRole(stranger, { ...live, debugGodView: true }), true);

    for (const phase of [GamePhase.GAME_OVER, GamePhase.GAME_REVIEW]) {
        assert.equal(shouldShowPlayerRole(stranger, { ...live, phase }), true, phase);
    }

    // 观战（无真人）：showRolesGlobal 打开时显示全部角色
    const spectate = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: false,
        perspective: 'GOD' as Perspective,
        godState: godState(),
    };
    assert.equal(shouldShowPlayerRole(stranger, { ...spectate, showRolesGlobal: true }), true);
    assert.equal(shouldShowPlayerRole(stranger, spectate), false);
});

test('(d) replay perspective: GOD reveals all, WOLF reveals wolves, GOOD reveals humans', () => {
    const humanVillager = player(81, Role.VILLAGER, { isHuman: true });
    const aiVillager = player(82, Role.VILLAGER);
    const wolf = player(83, Role.WEREWOLF);
    const humanWolf = player(84, Role.WHITE_WOLF_KING, { isHuman: true });
    const base = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: true,
        godState: godState(),
    };

    for (const p of [humanVillager, aiVillager, wolf, humanWolf]) {
        assert.equal(shouldShowPlayerRole(p, { ...base, perspective: 'GOD' }), true, `GOD/${p.id}`);
        assert.equal(shouldShowPlayerRole(p, { ...base, perspective: 'WOLF' }), WOLF_ROLES.includes(p.role), `WOLF/${p.id}`);
        assert.equal(shouldShowPlayerRole(p, { ...base, perspective: 'GOOD' }), !!p.isHuman, `GOOD/${p.id}`);
    }
});

// ── (e) isGodLikeView 开关组合 ────────────────────────────

test('(e) isGodLikeView switch combinations', () => {
    const human = player(91, Role.VILLAGER, { isHuman: true });
    const base = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: false,
        perspective: 'GOOD' as Perspective,
        humanPlayer: human,
    };

    // 常规真人对局 → 非上帝视角
    assert.equal(isGodLikeView(base), false);
    // debugGodView 开关
    assert.equal(isGodLikeView({ ...base, debugGodView: true }), true);
    assert.equal(isGodLikeView({ ...base, debugGodView: false }), false);
    // 结算阶段强制上帝视角
    assert.equal(isGodLikeView({ ...base, phase: GamePhase.GAME_REVIEW }), true);
    assert.equal(isGodLikeView({ ...base, phase: GamePhase.GAME_OVER }), true);
    // 回放 + 上帝视角
    assert.equal(isGodLikeView({ ...base, isReplayMode: true, perspective: 'GOD' }), true);
    assert.equal(isGodLikeView({ ...base, isReplayMode: true, perspective: 'WOLF' }), false);
    assert.equal(isGodLikeView({ ...base, isReplayMode: true, perspective: 'GOOD' }), false);
    // 有真人时 showRolesGlobal 不提升为上帝视角
    assert.equal(isGodLikeView({ ...base, showRolesGlobal: true }), false);
    // 观战：无真人 + showRolesGlobal
    const spectator = {
        phase: GamePhase.DAY_DISCUSSION,
        isReplayMode: false,
        perspective: 'GOD' as Perspective,
    };
    assert.equal(isGodLikeView(spectator), false);
    assert.equal(isGodLikeView({ ...spectator, showRolesGlobal: true }), true);
});

// ── 内部调试日志 ──────────────────────────────────────────

test('internal debug logs are hidden from every viewer', () => {
    const tally = makeLog({ debugType: 'VOTE_TALLY' });
    const trace = makeLog({ debugType: 'EVENT_TRACE' });
    const thinking = makeLog({ debugType: 'AI_THINKING' });

    assert.equal(isInternalDebugLog(tally), true);
    assert.equal(isInternalDebugLog(trace), true);
    // AI_THINKING 不算内部日志
    assert.equal(isInternalDebugLog(thinking), false);
    assert.equal(isInternalDebugLog(makeLog()), false);

    assert.equal(shouldExperienceLog(tally, 'GOD', players), false);
    assert.equal(shouldShowLogForViewer(tally, {
        isReplay: true, perspective: 'GOD', players,
    }), false);
    assert.equal(shouldShowLogForViewer(tally, {
        isReplay: false, perspective: 'GOD', players, debugGodView: true, viewerId: 1,
    }), false);
    // 非内部日志不受该短路影响
    assert.equal(shouldExperienceLog(thinking, 'GOD', players), true);
});

// ── viewerId / visibleTo 边界 ─────────────────────────────

test('live viewerId branch: restricted logs are shown only to listed viewers', () => {
    const seerResult = makeLog({ phase: GamePhase.SEER_ACTION, visibleTo: [3] });
    const base = { isReplay: false, perspective: 'GOD' as Perspective, players };

    assert.equal(shouldShowLogForViewer(seerResult, { ...base, viewerId: 3 }), true);
    assert.equal(shouldShowLogForViewer(seerResult, { ...base, viewerId: 1 }), false);
    // 无 viewerId 时不做名单过滤
    assert.equal(shouldShowLogForViewer(seerResult, base), true);
    // 无 visibleTo 的日志对所有 viewerId 可见
    const open = makeLog({ phase: GamePhase.SEER_ACTION });
    assert.equal(shouldShowLogForViewer(open, { ...base, viewerId: 1 }), true);
});

test('edge: empty visibleTo array is treated inconsistently across helpers (locks current behavior)', () => {
    // isWolfPrivateLog 把空名单当作“全都是狼”（空集 every 为真）
    assert.equal(isWolfPrivateLog(
        makeLog({ phase: GamePhase.WEREWOLF_ACTION, visibleTo: [] }), players), true);
    // shouldShowLogForViewer 的 viewerId 分支按真值而非 length 判断：
    // 空名单 + viewerId → 隐藏；空名单 + 无 viewerId → 显示
    const emptyRestricted = makeLog({ phase: GamePhase.DAY_DISCUSSION, visibleTo: [] });
    assert.equal(shouldShowLogForViewer(emptyRestricted, {
        isReplay: false, perspective: 'GOD', players, viewerId: 1,
    }), false);
    assert.equal(shouldShowLogForViewer(emptyRestricted, {
        isReplay: false, perspective: 'GOD', players,
    }), true);
    // 而 shouldExperienceLog 用 ?.length 判空，空名单走“无限制”路径
    assert.equal(shouldExperienceLog(emptyRestricted, 'GOOD', players), true);
});

// ── canSeeLoverInfo / canSeeMerchantSkillInfo ─────────────

test('canSeeLoverInfo: god view, cupid, and the lovers themselves only', () => {
    const gs = godState({ lovers: [1, 2] });
    const loverA = player(1, Role.VILLAGER);
    const loverB = player(2, Role.SEER);
    const cupid = player(3, Role.CUPID);
    const stranger = player(4, Role.WITCH);

    // 上帝视角即使无玩家上下文也放行
    assert.equal(canSeeLoverInfo(undefined, gs, true), true);
    assert.equal(canSeeLoverInfo(loverA, gs, false), true);
    assert.equal(canSeeLoverInfo(loverB, gs, false), true);
    assert.equal(canSeeLoverInfo(cupid, gs, false), true);
    assert.equal(canSeeLoverInfo(stranger, gs, false), false);
    assert.equal(canSeeLoverInfo(undefined, gs, false), false);

    // 无情侣时一律不可见
    const noLovers = godState({ lovers: null });
    assert.equal(canSeeLoverInfo(cupid, noLovers, false), false);
    assert.equal(canSeeLoverInfo(loverA, noLovers, false), false);
});

test('canSeeMerchantSkillInfo: god view, the skill target, and the merchant only', () => {
    const target = player(1, Role.VILLAGER);
    const other = player(2, Role.SEER);
    const merchant = player(3, Role.MIRACLE_MERCHANT);

    assert.equal(canSeeMerchantSkillInfo(undefined, target, true), true);
    assert.equal(canSeeMerchantSkillInfo(target, target, false), true);
    assert.equal(canSeeMerchantSkillInfo(merchant, target, false), true);
    assert.equal(canSeeMerchantSkillInfo(other, target, false), false);
    assert.equal(canSeeMerchantSkillInfo(undefined, target, false), false);
});
