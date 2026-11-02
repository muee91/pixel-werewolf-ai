import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicDecisionPhase, isPublicSpeechPhase } from '../../src/game/phases';
import { GamePhase } from '../../src/types';

// 这两条守卫的是"信息边界"，不是文案：
// 夜间行动如果被判成公开，人类玩家会在字幕上直接看到"3 号正在决策"——等于告诉他 3 号是神职或狼。

test('公开决策阶段：投票 / 退水 / 开枪 / 决斗 / 自爆', () => {
    for (const phase of [
        GamePhase.VOTING,
        GamePhase.SHERIFF_VOTING,
        GamePhase.SHERIFF_WITHDRAW,
        GamePhase.HUNTER_ACTION,
        GamePhase.DEMON_HUNTER_ACTION,
        GamePhase.KNIGHT_CHALLENGE,
        GamePhase.WOLF_EXPLODE,
    ]) {
        assert.equal(isPublicDecisionPhase(phase), true, `${phase} 应该是公开决策`);
    }
});

test('夜间行动一律不算公开：不能泄露谁在动', () => {
    for (const phase of [
        GamePhase.NIGHT_START,
        GamePhase.WEREWOLF_ACTION,
        GamePhase.SEER_ACTION,
        GamePhase.WITCH_ACTION,
        GamePhase.GUARD_ACTION,
        GamePhase.CUPID_LINK,
        GamePhase.STONE_GHOST_ACTION,
        GamePhase.GRAVEKEEPER_ACTION,
        GamePhase.MERCHANT_ACTION,
    ]) {
        assert.equal(isPublicDecisionPhase(phase), false, `${phase} 不该被当成公开决策`);
    }
});

test('发言阶段与决策阶段不重叠（同一份定义给提示词和 UI 用）', () => {
    for (const phase of Object.values(GamePhase)) {
        if (!isPublicSpeechPhase(phase)) continue;
        assert.equal(isPublicDecisionPhase(phase), false, `${phase} 不能同时是"公开言论"和"公开决策"`);
    }
});
