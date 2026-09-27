import assert from 'node:assert/strict';
import test from 'node:test';
import {
    appendPendingDeathActionIds,
    canWolfSelfExplode,
    checkWinCondition,
    enforcePkVoteTarget,
    getExileVoterIds,
    getPendingDeathActionIds,
    isCrossFactionLoverPair,
    isSheriffElectionEnabled,
    normalizeMerchantSkillType,
    resolveExileVote,
    shouldOfferWolfExplosion,
} from '../../src/game/rules';
import { DEFAULT_GAME_RULES, PlayerStatus, Role, type Player } from '../../src/types';

const player = (id: number, role: Role, status = PlayerStatus.ALIVE): Player => ({
    id,
    seatNumber: id,
    role,
    status,
    avatarSeed: id,
    rolePrompt: '',
    isSpeaking: false,
    actorId: `actor-${id}`,
});

test('wolves win immediately when the last villager dies, regardless of wolf parity', () => {
    const result = checkWinCondition([
        player(1, Role.WEREWOLF),
        player(2, Role.SEER),
        player(3, Role.WITCH),
        player(4, Role.GUARD),
        player(5, Role.VILLAGER, PlayerStatus.DEAD_VOTE),
    ], { thirdPartyEnabled: false });

    assert.equal(result?.winner, 'WOLF');
    assert.equal(result?.reason, 'ALL_VILLAGERS_DEAD');
});

test('wolves win immediately when the last god dies, regardless of wolf parity', () => {
    const result = checkWinCondition([
        player(1, Role.WEREWOLF),
        player(2, Role.VILLAGER),
        player(3, Role.VILLAGER),
        player(4, Role.VILLAGER),
        player(5, Role.SEER, PlayerStatus.DEAD_NIGHT),
    ], { thirdPartyEnabled: false });

    assert.equal(result?.winner, 'WOLF');
    assert.equal(result?.reason, 'ALL_GODS_DEAD');
});

test('revealed idiot still counts as a living god', () => {
    const result = checkWinCondition([
        player(1, Role.WEREWOLF),
        player(2, Role.VILLAGER),
        player(3, Role.IDIOT, PlayerStatus.IDIOT_REVEALED),
    ], { thirdPartyEnabled: false });

    assert.equal(result, null);
});

test('good wins when all wolf-faction roles are dead', () => {
    const result = checkWinCondition([
        player(1, Role.WEREWOLF, PlayerStatus.DEAD_VOTE),
        player(2, Role.STONE_GHOST, PlayerStatus.DEAD_NIGHT),
        player(3, Role.VILLAGER),
        player(4, Role.SEER),
    ], { thirdPartyEnabled: false });

    assert.equal(result?.winner, 'GOOD');
    assert.equal(result?.reason, 'ALL_WOLVES_DEAD');
});

test('third-party lovers win before faction slaughter checks', () => {
    const result = checkWinCondition([
        player(1, Role.CUPID),
        player(2, Role.WEREWOLF),
        player(3, Role.VILLAGER),
        player(4, Role.SEER, PlayerStatus.DEAD_NIGHT),
    ], {
        thirdPartyEnabled: true,
        cupidIsThirdParty: true,
        lovers: [2, 3],
    });

    assert.equal(result?.winner, 'THIRD_PARTY');
});

test('a hunter shot queues the final wolf king before win resolution', () => {
    const players = [
        player(1, Role.HUNTER, PlayerStatus.DEAD_NIGHT),
        player(2, Role.WOLF_KING, PlayerStatus.DEAD_SHOOT),
        player(3, Role.VILLAGER),
        player(4, Role.SEER),
    ];

    assert.deepEqual(
        appendPendingDeathActionIds([], players, [2], [], false),
        [2]
    );
    assert.equal(checkWinCondition(players, { thirdPartyEnabled: false })?.winner, 'GOOD');
});

test('multiple simultaneous death skills are queued in deterministic order', () => {
    const players = [
        player(1, Role.HUNTER, PlayerStatus.DEAD_NIGHT),
        player(2, Role.WOLF_KING, PlayerStatus.DEAD_NIGHT),
        player(3, Role.VILLAGER),
    ];

    assert.deepEqual(
        getPendingDeathActionIds(players, [2, 1, 2], [], false),
        [2, 1]
    );
});

test('poisoned hunter obeys hunterCanShootWhenPoisoned for all poison sources', () => {
    const poisonedHunter = player(1, Role.HUNTER, PlayerStatus.DEAD_POISON);

    assert.deepEqual(
        getPendingDeathActionIds([poisonedHunter], [1], [1], false),
        []
    );
    assert.deepEqual(
        getPendingDeathActionIds([poisonedHunter], [1], [1], true),
        [1]
    );
});

test('poisoned wolf king cannot shoot by default (standard rule)', () => {
    const poisonedWolfKing = player(1, Role.WOLF_KING, PlayerStatus.DEAD_POISON);

    assert.deepEqual(
        getPendingDeathActionIds([poisonedWolfKing], [1], [1], false),
        []
    );
});

test('poisoned wolf king shooting is opt-in via wolfKingCanShootWhenPoisoned', () => {
    const poisonedWolfKing = player(1, Role.WOLF_KING, PlayerStatus.DEAD_POISON);

    assert.deepEqual(
        getPendingDeathActionIds([poisonedWolfKing], [1], [1], false, true),
        [1]
    );
});

test('wolf king still shoots on vote/night/shot deaths even with poison-gun disabled', () => {
    for (const status of [PlayerStatus.DEAD_VOTE, PlayerStatus.DEAD_NIGHT, PlayerStatus.DEAD_SHOOT]) {
        const wolfKing = player(1, Role.WOLF_KING, status);
        assert.deepEqual(
            getPendingDeathActionIds([wolfKing], [1], [], false, false),
            [1],
            `status ${status}`
        );
    }
});

test('tie candidates cannot vote in exile PK', () => {
    const players = [
        player(1, Role.VILLAGER),
        player(2, Role.WEREWOLF),
        player(3, Role.SEER),
        player(4, Role.IDIOT, PlayerStatus.IDIOT_REVEALED),
    ];

    assert.deepEqual(getExileVoterIds(players, [1, 2]), [3]);
});

test('second exile tie produces a peaceful day instead of random exile', () => {
    assert.deepEqual(resolveExileVote({ 1: 2, 2: 2 }, 1), {
        finalPlayerId: null,
        tiedPlayerIds: [1, 2],
        shouldRevote: false,
    });
});

test('exile PK forbids abstention: blank and out-of-range votes coerce onto tied candidates', () => {
    // 有效票原样保留
    assert.equal(enforcePkVoteTarget(2, [1, 2]), 2);
    // 弃票（null/undefined）与投给非候选人都被强制改投平票候选人
    for (const blank of [null, undefined, 9]) {
        const forced = enforcePkVoteTarget(blank, [1, 2]);
        assert.ok(forced === 1 || forced === 2, `blank ${blank} should coerce to a tied candidate`);
    }
    // 边界：PK候选全部不可投时退回弃票
    assert.equal(enforcePkVoteTarget(null, []), null);
});

test('wolf explosion is offered at most once per day', () => {
    const players = [player(1, Role.WEREWOLF), player(2, Role.VILLAGER)];

    assert.equal(shouldOfferWolfExplosion(true, 2, null, players), true);
    assert.equal(shouldOfferWolfExplosion(true, 2, 2, players), false);
});

test('stone ghost never receives the regular wolf self-explosion action', () => {
    const stoneGhost = player(1, Role.STONE_GHOST);
    const regularWolf = player(2, Role.WEREWOLF);

    assert.equal(canWolfSelfExplode(stoneGhost), false);
    assert.equal(canWolfSelfExplode(regularWolf), true);
    assert.equal(shouldOfferWolfExplosion(true, 2, null, [stoneGhost, player(3, Role.VILLAGER)]), false);
});

test('merchant skill type accepts only engine-supported values', () => {
    assert.equal(normalizeMerchantSkillType('check'), 'check');
    assert.equal(normalizeMerchantSkillType('poison'), 'poison');
    assert.equal(normalizeMerchantSkillType('guard'), 'guard');
    assert.equal(normalizeMerchantSkillType('attack'), null);
    assert.equal(normalizeMerchantSkillType(undefined), null);
});

test('cross-faction lover detection is identical for chosen and fallback pairs', () => {
    const players = [
        player(1, Role.WEREWOLF),
        player(2, Role.VILLAGER),
        player(3, Role.SEER),
    ];

    assert.equal(isCrossFactionLoverPair(players, [1, 2]), true);
    assert.equal(isCrossFactionLoverPair(players, [2, 3]), false);
    assert.equal(isCrossFactionLoverPair(players, [1, 99]), false);
});

test('nested sheriff rule is the effective source with legacy fallback', () => {
    assert.equal(isSheriffElectionEnabled({
        sheriffEnabled: false,
        rules: { ...DEFAULT_GAME_RULES, sheriffElection: true },
    }), true);
    assert.equal(isSheriffElectionEnabled({
        sheriffEnabled: false,
        rules: undefined as never,
    }), false);
});
