import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNightPrefetchPlan, nightActionInstruction } from '../../src/hooks/engine/nightPlan';
import {
    DEFAULT_GAME_RULES,
    GamePhase,
    PlayerStatus,
    Role,
    type GameRules,
    type Player,
} from '../../src/types';

// 夜间预取计划：哪些角色可以提前并发问话，哪些必须等前一步落定。
// 这条测试守的是"依赖关系不能被性能优化吃掉"——女巫必须看到刀口、狼队必须互相听。

const makePlayer = (id: number, role: Role, status = PlayerStatus.ALIVE): Player => ({
    id,
    seatNumber: id,
    role,
    status,
    avatarSeed: id,
    rolePrompt: '',
    isSpeaking: false,
    actorId: `actor-${id}`,
});

const rules = (overrides: Partial<GameRules> = {}): GameRules => ({ ...DEFAULT_GAME_RULES, ...overrides });
const getRuleWith = (overrides: Partial<GameRules> = {}) => {
    const merged = rules(overrides);
    return <K extends keyof GameRules>(key: K) => merged[key];
};
const baseGodState = { lovers: null as [number, number] | null, lastExiledPlayerId: null as number | null, bloodMoonSealed: false };

test('classic 9-player board prefetches only the seer; the witch must wait for the knife', () => {
    const players = [
        makePlayer(1, Role.WEREWOLF), makePlayer(2, Role.WEREWOLF), makePlayer(3, Role.WEREWOLF),
        makePlayer(4, Role.SEER), makePlayer(5, Role.WITCH), makePlayer(6, Role.HUNTER),
        makePlayer(7, Role.VILLAGER), makePlayer(8, Role.VILLAGER), makePlayer(9, Role.VILLAGER),
    ];
    const plan = buildNightPrefetchPlan({ players, godState: baseGodState, turnCount: 2, getRule: getRuleWith() });
    assert.deepEqual(plan.map(entry => entry.role), [Role.SEER]);
    assert.equal(plan[0].phase, GamePhase.SEER_ACTION);
    assert.equal(plan[0].instruction, '请选择查验对象。');
    // 反向对照：狼队（共识过程）与女巫（依赖 wolfTarget）绝不能出现在预取计划里
    assert.ok(!plan.some(entry => entry.role === Role.WEREWOLF), '狼队夜聊必须串行');
    assert.ok(!plan.some(entry => entry.role === Role.WITCH), '女巫必须先看到刀口');
});

test('full 12-player board on the first night prefetches every independent god role', () => {
    const players = [
        makePlayer(1, Role.WEREWOLF), makePlayer(2, Role.WEREWOLF), makePlayer(3, Role.WEREWOLF),
        makePlayer(4, Role.SEER), makePlayer(5, Role.WITCH), makePlayer(6, Role.GUARD),
        makePlayer(7, Role.GRAVEKEEPER), makePlayer(8, Role.DEMON_HUNTER), makePlayer(9, Role.MIRACLE_MERCHANT),
        makePlayer(10, Role.CUPID), makePlayer(11, Role.HUNTER), makePlayer(12, Role.VILLAGER),
    ];
    const plan = buildNightPrefetchPlan({
        players,
        godState: { ...baseGodState, lastExiledPlayerId: 12 },
        turnCount: 1,
        getRule: getRuleWith(),
    });
    const roles = plan.map(entry => entry.role);
    for (const expected of [Role.CUPID, Role.SEER, Role.GRAVEKEEPER, Role.GUARD, Role.DEMON_HUNTER, Role.MIRACLE_MERCHANT]) {
        assert.ok(roles.includes(expected), `第一夜应预取 ${expected}`);
    }
    assert.ok(!roles.includes(Role.WITCH));
    assert.equal(roles.filter(role => role === Role.WEREWOLF).length, 0);

    const gravekeeper = plan.find(entry => entry.role === Role.GRAVEKEEPER)!;
    assert.equal(gravekeeper.instruction, '查验上一轮被放逐玩家（12号）的身份。');
    // 顺序即夜间推进顺序：并发槽位有限时先排的先进场
    assert.ok(roles.indexOf(Role.CUPID) < roles.indexOf(Role.SEER));
});

test('dead, sealed and not-yet-existing abilities are not prefetched', () => {
    const players = [
        makePlayer(1, Role.WEREWOLF),
        makePlayer(2, Role.SEER, PlayerStatus.DEAD_NIGHT),
        makePlayer(3, Role.GUARD),
        makePlayer(4, Role.CUPID),
        makePlayer(5, Role.GRAVEKEEPER),
    ];
    // 首夜无放逐记录 → 守墓人无信息可查，不该为一个空问题花一次往返
    const firstNight = buildNightPrefetchPlan({
        players,
        godState: { ...baseGodState, lastExiledPlayerId: null },
        turnCount: 1,
        getRule: getRuleWith(),
    });
    assert.deepEqual(firstNight.map(entry => entry.role), [Role.CUPID, Role.GUARD]);

    // 血月封印：所有神职当夜只会播"无法行动"，不产生任何 LLM 往返，预取等于白烧额度
    const sealed = buildNightPrefetchPlan({
        players,
        godState: { ...baseGodState, lovers: [3, 4], bloodMoonSealed: true },
        turnCount: 2,
        getRule: getRuleWith(),
    });
    assert.deepEqual(sealed, [], '封印当夜不应预取任何神职决策');

    // 第二夜起丘比特不再行动
    const secondNight = buildNightPrefetchPlan({
        players,
        godState: { ...baseGodState, lovers: [3, 4] },
        turnCount: 2,
        getRule: getRuleWith(),
    });
    assert.ok(!secondNight.some(entry => entry.role === Role.CUPID));
});

test('instructions come from one source so prefetch and execution cannot drift', () => {
    const withRule = getRuleWith({ guardCannotSameTarget: true });
    const withoutRule = getRuleWith({ guardCannotSameTarget: false });
    assert.equal(
        nightActionInstruction({ role: Role.GUARD, getRule: withRule }),
        '请选择今晚守护对象。不能连续两晚守护同一名玩家。',
    );
    assert.equal(nightActionInstruction({ role: Role.GUARD, getRule: withoutRule }), '请选择今晚守护对象。');
    assert.equal(nightActionInstruction({ role: Role.GRAVEKEEPER, getRule: withoutRule, lastExiledPlayerId: null }), undefined);
    assert.equal(nightActionInstruction({ role: Role.WITCH, getRule: withoutRule }), undefined, '女巫不该有可预取指令');
});
