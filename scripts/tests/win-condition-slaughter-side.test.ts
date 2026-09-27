import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWinCondition } from '../../src/game/rules';
import { PlayerStatus, Role, type Player } from '../../src/types';

const player = (id: number, role: Role, status = PlayerStatus.ALIVE): Player => ({
    id, seatNumber: id, role, status, avatarSeed: id, rolePrompt: '', isSpeaking: false, actorId: `a-${id}`,
});

// 屠边局(SLAUGHTER_SIDE)边界:村民全灭=狼胜,即使还有神职存活。
// 回归场景:9 人局中 2 号村民兼警长被放逐后村民全灭,
// 引擎判狼胜,当时被误判为"女巫还活着不该结束"。
const ninePlayerEndgame = (): Player[] => [
    player(1, Role.WITCH),
    player(2, Role.VILLAGER, PlayerStatus.DEAD_VOTE),
    player(3, Role.WEREWOLF),
    player(4, Role.VILLAGER, PlayerStatus.DEAD_SHOOT),
    player(5, Role.VILLAGER, PlayerStatus.DEAD_NIGHT),
    player(6, Role.SEER, PlayerStatus.DEAD_NIGHT),
    player(7, Role.WEREWOLF),
    player(8, Role.WEREWOLF),
    player(9, Role.HUNTER, PlayerStatus.DEAD_VOTE),
];

test('slaughter-side: all villagers dead = wolf win even with gods alive', () => {
    const r = checkWinCondition(ninePlayerEndgame(), { thirdPartyEnabled: false });
    assert.deepEqual(r, {
        winner: 'WOLF',
        reason: 'ALL_VILLAGERS_DEAD',
        reasonText: '所有村民已出局，狼人屠民胜利。',
    });
});

test('slaughter-side: surviving witch keeps resistance alive when a villager remains', () => {
    const players = ninePlayerEndgame();
    players[4] = player(5, Role.VILLAGER); // 5 号村民复活(对照:民边未灭)
    const r = checkWinCondition(players, { thirdPartyEnabled: false });
    assert.equal(r, null);
});
