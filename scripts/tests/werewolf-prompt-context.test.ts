import assert from 'node:assert/strict';
import test from 'node:test';
import { werewolfSkillInstance } from '../../src/services/skills/werewolf/WerewolfSkill';
import {
    DEFAULT_GAME_RULES,
    DEFAULT_GOD_STATE,
    GAME_PRESETS,
    GamePhase,
    PlayerStatus,
    Role,
    type GameLog,
    type Player,
} from '../../src/types';

const makePlayer = (id: number, role: Role): Player => ({
    id,
    seatNumber: id,
    role,
    status: PlayerStatus.ALIVE,
    avatarSeed: id,
    rolePrompt: '',
    isSpeaking: false,
    actorId: `actor-${id}`,
});

const makeLog = (overrides: Partial<GameLog> = {}): GameLog => ({
    id: `log-${overrides.id ?? 'default'}`,
    turn: 1,
    phase: GamePhase.DAY_DISCUSSION,
    content: '公开台词',
    timestamp: 1,
    isSystem: false,
    ...overrides,
});

const promptFor = async (player: Player, logs: GameLog[]) => {
    const messages = await werewolfSkillInstance.generatePrompts(player, {
        phase: GamePhase.DAY_DISCUSSION,
        turnCount: 1,
        players: [player, makePlayer(2, Role.WEREWOLF)],
        alivePlayers: [player, makePlayer(2, Role.WEREWOLF)],
        logs,
        currentTurnLogs: logs.filter(log => log.phase === GamePhase.DAY_DISCUSSION),
        roleConfigStr: '测试板子',
        roles: [player.role, Role.WEREWOLF],
        rules: DEFAULT_GAME_RULES,
        godState: DEFAULT_GOD_STATE,
        sheriffEnabled: true,
    });
    return messages[1].content;
};

test('public dialogue keeps earlier public AI speech but never private or debug-only records', async () => {
    const seer = makePlayer(1, Role.SEER);
    const prompt = await promptFor(seer, [
        makeLog({ id: 'public-ai', speakerId: 2, content: '2号：我怀疑8号。', debugType: 'AI_THINKING' }),
        makeLog({ id: 'public-system', phase: GamePhase.DAY_ANNOUNCE, isSystem: true, content: '天亮了。昨晚是平安夜。' }),
        makeLog({ id: 'private-result', phase: GamePhase.SEER_ACTION, isSystem: true, visibleTo: [1], content: '上帝(私聊): 2号是 狼人' }),
        makeLog({ id: 'trace', isSystem: true, content: '阶段切换：狼人行动 -> 预言家行动', debugType: 'EVENT_TRACE' }),
        makeLog({ id: 'vote-debug', speakerId: 2, content: '隐藏投票策略', debugType: 'VOTE_STRATEGY' }),
    ]);

    assert.match(prompt, /2号：我怀疑8号/);
    assert.match(prompt, /天亮了。昨晚是平安夜/);
    assert.match(prompt, /\[Your Past Checks\]:[\s\S]*2号是 狼人/);
    assert.doesNotMatch(prompt, /阶段切换：狼人行动/);
    assert.doesNotMatch(prompt, /隐藏投票策略/);
});

test('same-day private action results remain in role memory during public speech', async () => {
    const seer = makePlayer(1, Role.SEER);
    const prompt = await promptFor(seer, [
        makeLog({
            id: 'same-day-check',
            phase: GamePhase.SEER_ACTION,
            isSystem: true,
            visibleTo: [1],
            content: '上帝(私聊): 2号是 狼人',
        }),
    ]);

    assert.match(prompt, /Current Day: 1/);
    assert.match(prompt, /\[Your Past Checks\]:[\s\S]*2号是 狼人/);
});

test('every built-in board has a complete player roster and legal base rule values', () => {
    for (const preset of GAME_PRESETS) {
        assert.equal(preset.roles.length, preset.playerCount, `${preset.key}: role count must match player count`);
        assert.ok(preset.roles.some(role => role === Role.WEREWOLF || role === Role.WOLF_KING || role === Role.STONE_GHOST || role === Role.WHITE_WOLF_KING || role === Role.BLOOD_MOON_DISCIPLE), `${preset.key}: board needs a wolf faction`);
        assert.equal(typeof preset.rules.sheriffElection, 'boolean', `${preset.key}: sheriff rule`);
        assert.equal(typeof preset.rules.wolfExplodeEnabled, 'boolean', `${preset.key}: explosion rule`);
        assert.equal(typeof preset.rules.thirdPartyEnabled, 'boolean', `${preset.key}: third-party rule`);

        if (preset.roles.includes(Role.STONE_GHOST)) {
            assert.equal(preset.rules.stoneGhostCheckIdentity, true, `${preset.key}: stone ghost ability`);
        }
        if (preset.roles.includes(Role.WHITE_WOLF_KING)) {
            assert.equal(preset.rules.whiteWolfKingExplodeShoot, true, `${preset.key}: white wolf king ability`);
        }
        if (preset.roles.includes(Role.BLOOD_MOON_DISCIPLE)) {
            assert.equal(preset.rules.bloodMoonBlockAbilities, true, `${preset.key}: blood moon ability`);
        }
        if (preset.roles.includes(Role.GRAVEKEEPER)) {
            assert.equal(preset.rules.gravekeeperCheckIdentity, true, `${preset.key}: gravekeeper ability`);
        }
        if (preset.roles.includes(Role.DEMON_HUNTER)) {
            assert.equal(preset.rules.demonHunterHunt, true, `${preset.key}: demon hunter ability`);
        }
        if (preset.roles.includes(Role.CUPID)) {
            assert.equal(preset.rules.cupidLinkLovers, true, `${preset.key}: cupid ability`);
            assert.equal(preset.rules.thirdPartyEnabled, true, `${preset.key}: cupid third-party rule`);
        }
        if (preset.roles.includes(Role.MIRACLE_MERCHANT)) {
            assert.equal(preset.rules.miracleMerchantGiveSkill, true, `${preset.key}: merchant ability`);
        }
    }
});
