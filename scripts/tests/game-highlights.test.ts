import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHighlights } from '../../src/utils/gameHighlights';
import { GamePhase, type GameLog } from '../../src/types';

// 名场面现在是 2D 营地结算卡与 3D 冒险结算面板共用的一份计算：
// 口径一旦走形，两个视图会对同一局给出不同的"名场面"，所以钉在纯函数上。

const log = (id: string, phase: GamePhase, content: string, isSystem = false): GameLog => ({
    id,
    timestamp: 0,
    phase,
    content,
    type: 'SPEECH',
    isSystem,
    speakerId: 1,
} as unknown as GameLog);

test('非结算阶段不产出名场面', () => {
    const logs = [log('a', GamePhase.LAST_WORDS, '我的遗言')];
    assert.equal(buildHighlights(logs, GamePhase.DAY_DISCUSSION).length, 0);
    assert.equal(buildHighlights(logs, GamePhase.VOTING).length, 0);
});

test('只收关键阶段的真实发言，按时间序保留最后 4 条', () => {
    const logs = [
        log('1', GamePhase.DAY_DISCUSSION, '白天闲聊'),
        log('2', GamePhase.HUNTER_ACTION, '猎人开枪带走 5 号'),
        log('3', GamePhase.WOLF_EXPLODE, '狼人自爆'),
        log('4', GamePhase.KNIGHT_CHALLENGE, '骑士决斗'),
        log('5', GamePhase.LAST_WORDS, '遗言 A'),
        log('6', GamePhase.LAST_WORDS, '遗言 B'),
        log('7', GamePhase.GAME_REVIEW, '【游戏结算】好人胜利'),
    ];
    const out = buildHighlights(logs, GamePhase.GAME_REVIEW);
    const ids = out.map(item => item.id);
    // 4 条戏剧 + 1 条结算陈词；白天闲聊不在其中
    assert.deepEqual(ids, ['3', '4', '5', '6', '7']);
});

test('结算陈词只取最后一条，且允许是系统行', () => {
    const logs = [
        log('r1', GamePhase.GAME_REVIEW, '【游戏结算】第一段', true),
        log('r2', GamePhase.GAME_REVIEW, '【游戏结算】第二段', true),
    ];
    const out = buildHighlights(logs, GamePhase.GAME_REVIEW);
    assert.deepEqual(out.map(item => item.id), ['r2']);
});

test('系统行与空白发言不占名额', () => {
    const logs = [
        log('s1', GamePhase.WOLF_EXPLODE, '狼人自爆（系统）', true),
        log('s2', GamePhase.LAST_WORDS, '   '),
        log('s3', GamePhase.LAST_WORDS, '真有内容的遗言'),
    ];
    const out = buildHighlights(logs, GamePhase.GAME_REVIEW);
    assert.deepEqual(out.map(item => item.id), ['s3']);
});

test('GAME_OVER 与 GAME_REVIEW 同样产出', () => {
    const logs = [log('a', GamePhase.LAST_WORDS, '遗言')];
    assert.equal(buildHighlights(logs, GamePhase.GAME_OVER).length, 1);
    assert.equal(buildHighlights(logs, GamePhase.GAME_REVIEW).length, 1);
});
