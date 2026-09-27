import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDeaths } from '../../src/utils/replayDeaths';
import { PlayerStatus } from '../../src/types';

const ids = (content: string) => detectDeaths(content).map(d => d.id);
const statusOf = (content: string, id: number) =>
    detectDeaths(content).find(d => d.id === id)?.status;

test('投票出局标记为 DEAD_VOTE', () => {
    const content = '3号 被投票出局。';
    assert.deepEqual(ids(content), [3]);
    assert.equal(statusOf(content, 3), PlayerStatus.DEAD_VOTE);
});

test('警长出局并移交警徽时，接徽者不被误标死亡', () => {
    const content = '3号警长出局，警徽传给 6号。';
    assert.deepEqual(ids(content), [3]);
    assert.equal(statusOf(content, 3), PlayerStatus.DEAD_VOTE);
    assert.equal(statusOf(content, 6), undefined);
});

test('毒杀标记为 DEAD_POISON', () => {
    const content = '女巫毒死了 5号。';
    assert.deepEqual(ids(content), [5]);
    assert.equal(statusOf(content, 5), PlayerStatus.DEAD_POISON);
});

test('自爆者标记为 EXPLODED', () => {
    const content = '3号 自爆！身份是 狼人！';
    assert.deepEqual(ids(content), [3]);
    assert.equal(statusOf(content, 3), PlayerStatus.EXPLODED);
});

test('白狼王自爆带人只标记被带走者', () => {
    const content = '白狼王自爆带走了 5号！';
    assert.deepEqual(ids(content), [5]);
    assert.equal(statusOf(content, 5), PlayerStatus.DEAD_SHOOT);
});

test('骑士决斗击杀狼人时标记目标死亡', () => {
    const content = '骑士发起决斗！5号 是狼人，被决斗击杀！';
    assert.deepEqual(ids(content), [5]);
    assert.equal(statusOf(content, 5), PlayerStatus.DEAD_SHOOT);
});

test('骑士决斗落败时只标记骑士本人，不误标对手', () => {
    const content = '骑士发起决斗！5号 不是狼人，4号骑士自己死亡！';
    assert.deepEqual(ids(content), [4]);
    assert.equal(statusOf(content, 4), PlayerStatus.DEAD_SHOOT);
    assert.equal(statusOf(content, 5), undefined);
});

test('警长殉情并移交警徽时只标记殉情者', () => {
    const content = '3号警长殉情死亡，警徽传给 6号。';
    assert.deepEqual(ids(content), [3]);
    assert.equal(statusOf(content, 3), PlayerStatus.DEAD_NIGHT);
    assert.equal(statusOf(content, 6), undefined);
});

test('警长夜间死亡并移交警徽时只标记警长', () => {
    const content = '3号警长夜间死亡，警徽传给 6号。';
    assert.deepEqual(ids(content), [3]);
    assert.equal(statusOf(content, 3), PlayerStatus.DEAD_NIGHT);
    assert.equal(statusOf(content, 6), undefined);
});

test('夜间多死播报标记全部死者', () => {
    const content = '天亮了。昨晚 1, 3号 死亡。';
    assert.deepEqual(ids(content).sort((a, b) => a - b), [1, 3]);
    assert.equal(statusOf(content, 1), PlayerStatus.DEAD_NIGHT);
    assert.equal(statusOf(content, 3), PlayerStatus.DEAD_NIGHT);
});

test('新句式“X号、X号 死亡”同样解析（每个座位都带号）', () => {
    const content = '天亮了。昨晚 3号、1号 死亡。';
    assert.deepEqual(ids(content).sort((a, b) => a - b), [1, 3]);
    assert.equal(statusOf(content, 1), PlayerStatus.DEAD_NIGHT);
    assert.equal(statusOf(content, 3), PlayerStatus.DEAD_NIGHT);
});

test('新句式单人死亡与两位数座位', () => {
    assert.deepEqual(ids('天亮了。昨晚 12号 死亡。'), [12]);
    assert.deepEqual(ids('天亮了。昨晚 5号 死亡。'), [5]);
});

test('开枪倒牌标记为 DEAD_SHOOT', () => {
    const content = '猎人开枪，7号 倒牌。';
    assert.deepEqual(ids(content), [7]);
    assert.equal(statusOf(content, 7), PlayerStatus.DEAD_SHOOT);
});

test('技能链多人倒牌全部标记为 DEAD_SHOOT', () => {
    const content = '猎人 4号、狼王 9号 倒牌，依次处理死亡技能。';
    assert.deepEqual(ids(content).sort((a, b) => a - b), [4, 9]);
    assert.equal(statusOf(content, 4), PlayerStatus.DEAD_SHOOT);
    assert.equal(statusOf(content, 9), PlayerStatus.DEAD_SHOOT);
});

test('后续技能链播报不重复标记死亡', () => {
    assert.deepEqual(ids('4号、9号 触发后续死亡技能。'), []);
});

test('无人出局与指刀播报不产生死亡标记', () => {
    assert.deepEqual(ids('平安日，无人出局。'), []);
    assert.deepEqual(ids('狼人按照指刀，选择击杀 5号。'), []);
});
