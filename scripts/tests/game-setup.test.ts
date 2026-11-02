import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canEnableRole,
    countRole,
    groupLineupByTeam,
    summarizeLineup,
    toggleRoleInLineup,
    validateLineup,
} from '../../src/utils/gameSetup';
import { Role } from '../../src/types';

// 开局面板只换"神职 ↔ 村民"：人数不变、狼牌不动，规则层的屠边分母才不会漂。

const classic9 = [
    Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
    Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
    Role.SEER, Role.WITCH, Role.HUNTER,
];

test('阵容统计按阵营分开数', () => {
    assert.deepEqual(summarizeLineup(classic9), { total: 9, wolves: 3, gods: 3, villagers: 3 });
    assert.equal(countRole(classic9, Role.VILLAGER), 3);
    assert.equal(countRole(classic9, Role.GUARD), 0);
});

test('打开一个神职 = 拿一个村民换，总人数与狼数不变', () => {
    const next = toggleRoleInLineup(classic9, Role.GUARD, true);
    assert.equal(next.length, 9);
    assert.equal(countRole(next, Role.GUARD), 1);
    assert.equal(countRole(next, Role.VILLAGER), 2);
    assert.equal(summarizeLineup(next).wolves, 3);
    // 原数组不能被改（面板要做撤销/对比）
    assert.equal(countRole(classic9, Role.GUARD), 0);
});

test('关掉一个神职 = 换回村民', () => {
    const next = toggleRoleInLineup(classic9, Role.HUNTER, false);
    assert.equal(countRole(next, Role.HUNTER), 0);
    assert.equal(countRole(next, Role.VILLAGER), 4);
});

test('没有村民可换时打开神职无效', () => {
    const allGods = [Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.SEER, Role.WITCH, Role.HUNTER];
    assert.equal(canEnableRole(allGods), false);
    assert.deepEqual(toggleRoleInLineup(allGods, Role.GUARD, true), allGods);
});

test('板子里没有的神职关不掉，不会把别的牌换成村民', () => {
    assert.deepEqual(toggleRoleInLineup(classic9, Role.CUPID, false), classic9);
});

test('重置只还原神职，狼牌与人数原样', () => {
    let roles = toggleRoleInLineup(classic9, Role.GUARD, true);
    roles = toggleRoleInLineup(roles, Role.SEER, false);
    const reset = [...classic9];
    assert.deepEqual(summarizeLineup(reset), { total: 9, wolves: 3, gods: 3, villagers: 3 });
    assert.equal(reset.length, 9);
});

test('校验拦下人数不符 / 没有狼 / 全是狼', () => {
    assert.equal(validateLineup(classic9, 9).length, 0);
    assert.equal(validateLineup(classic9, 12).length, 1);
    assert.equal(validateLineup([Role.VILLAGER, Role.SEER], 2).length, 1);
    assert.equal(validateLineup([Role.WEREWOLF, Role.WEREWOLF], 2).length, 1);
});

// 侧栏的「阵容组成」原来读板子预设，下面的摘要读玩家改过的草稿，改过神职后两处人数
// 当场打架（截图里 狼4·神6·民1 对上 狼4 预言家1 女巫1 猎人1 村民4）。台账改成只认
// 一份 roles，这里钉住"行合计 = 摘要 = 牌数"。
test('阵营台账只认一手牌，行合计与摘要、牌数三方一致', () => {
    const rows = groupLineupByTeam(classic9);
    const summary = summarizeLineup(classic9);
    assert.deepEqual(rows.map(row => row.team), ['wolf', 'god', 'villager']);
    assert.deepEqual(rows.map(row => row.total), [summary.wolves, summary.gods, summary.villagers]);
    assert.equal(rows.reduce((sum, row) => sum + row.total, 0), classic9.length);
    // 行内角色计数之和 = 该行总人数，不多不少
    for (const row of rows) {
        assert.equal(row.roles.reduce((sum, item) => sum + item.count, 0), row.total);
    }
});

test('同名牌在一行里合并计数，不出重复条目', () => {
    const rows = groupLineupByTeam(classic9);
    const wolfRow = rows.find(row => row.team === 'wolf');
    assert.deepEqual(wolfRow?.roles.map(item => [item.label, item.count]), [['狼人', 3]]);
    const godRow = rows.find(row => row.team === 'god');
    assert.equal(godRow?.roles.length, 3);
});

test('空阵营不占行：全好人阵容里没有狼人那一行', () => {
    const rows = groupLineupByTeam([Role.VILLAGER, Role.SEER]);
    assert.deepEqual(rows.map(row => row.team), ['god', 'villager']);
});
