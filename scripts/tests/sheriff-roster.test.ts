import assert from 'node:assert/strict';
import test from 'node:test';
import { pickSheriffCandidates, sheriffCandidateCeiling, sheriffRosterSeed } from '../../src/hooks/engine/sheriffRoster';
import { PlayerStatus, Role, WOLF_ROLES, type Player } from '../../src/types';

// 上警意向：把"全体活人都上警"换成"按动机排序取前 N"。
// 这条测试守三件事：① 名单必须是活人 ② 狼必须有人上警 ③ 同局结果恒定（重放/重开一致）。

const makePlayer = (id: number, role: Role, status = PlayerStatus.ALIVE, isHuman = false): Player => ({
    id,
    seatNumber: id,
    role,
    status,
    avatarSeed: id,
    rolePrompt: '',
    isSpeaking: false,
    actorId: `actor-${id}`,
    isHuman,
});

const classic12 = (): Player[] => [
    makePlayer(1, Role.WEREWOLF),
    makePlayer(2, Role.WEREWOLF),
    makePlayer(3, Role.WEREWOLF),
    makePlayer(4, Role.WEREWOLF),
    makePlayer(5, Role.SEER),
    makePlayer(6, Role.WITCH),
    makePlayer(7, Role.HUNTER),
    makePlayer(8, Role.GUARD),
    makePlayer(9, Role.VILLAGER),
    makePlayer(10, Role.VILLAGER),
    makePlayer(11, Role.VILLAGER),
    makePlayer(12, Role.VILLAGER),
];

test('12 人局：候选数落在上限内，且不是全员上警', () => {
    const players = classic12();
    const picked = pickSheriffCandidates({ players, seed: sheriffRosterSeed(players) });
    assert.ok(picked.length >= 3, `至少 3 人，实际 ${picked.length}`);
    assert.ok(picked.length <= sheriffCandidateCeiling(12), `不超过上限，实际 ${picked.length}`);
    assert.ok(picked.length < players.length, '不能是全员上警——那正是这一层要解决的问题');
});

test('候选人只会是存活玩家', () => {
    const players = classic12();
    players[0].status = PlayerStatus.DEAD_NIGHT;
    players[4].status = PlayerStatus.DEAD_NIGHT;
    const picked = pickSheriffCandidates({ players, seed: sheriffRosterSeed(players) });
    assert.ok(!picked.includes(1), '死者不能上警');
    assert.ok(!picked.includes(5), '死者不能上警');
});

test('有狼在场时，名单里一定有狼', () => {
    // 换 40 个种子扫一遍：抖动是随机的，这条守卫不能只在某一个种子上成立
    for (let i = 0; i < 40; i += 1) {
        const players = classic12();
        const picked = pickSheriffCandidates({ players, seed: `seed-${i}` });
        const hasWolf = picked.some(id => WOLF_ROLES.includes(players.find(p => p.id === id)!.role));
        assert.ok(hasWolf, `seed-${i} 的名单里没有狼：${picked.join(',')}`);
    }
});

test('同种子结果恒定（重开/重放一致），换种子会变', () => {
    const players = classic12();
    const seed = sheriffRosterSeed(players);
    const first = pickSheriffCandidates({ players, seed });
    const second = pickSheriffCandidates({ players, seed });
    assert.deepEqual(first, second);

    const variants = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
        variants.add(pickSheriffCandidates({ players, seed: `other-${i}` }).join(','));
    }
    assert.ok(variants.size > 1, '不同种子的名单应该会变，否则"每局不同"是假的');
});

test('人类座位不会被静默排除', () => {
    for (let i = 0; i < 20; i += 1) {
        const players = classic12();
        players[10] = makePlayer(11, Role.VILLAGER, PlayerStatus.ALIVE, true);
        const picked = pickSheriffCandidates({ players, seed: `human-${i}` });
        assert.ok(picked.includes(11), `seed human-${i} 把人类座位挤掉了：${picked.join(',')}`);
    }
});

test('只剩 3 人时全部上警（竞选才有意义）', () => {
    const players = [
        makePlayer(1, Role.WEREWOLF), makePlayer(2, Role.SEER), makePlayer(3, Role.VILLAGER),
        makePlayer(4, Role.VILLAGER, PlayerStatus.DEAD_NIGHT),
    ];
    assert.deepEqual(pickSheriffCandidates({ players, seed: 'x' }), [1, 2, 3]);
});

test('名单按座位号升序，上屏不会出现跳号', () => {
    for (let i = 0; i < 10; i += 1) {
        const players = classic12();
        const picked = pickSheriffCandidates({ players, seed: `order-${i}` });
        assert.deepEqual(picked, [...picked].sort((a, b) => a - b));
    }
});
