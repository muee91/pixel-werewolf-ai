import assert from 'node:assert/strict';
import test from 'node:test';
import { extractWolfChatTarget } from '../../src/utils/wolfChatTarget';

const TARGETS = [2, 3, 4, 5, 7, 9, 10, 11]; // 假设狼是 1/6/8/12

test('从狼聊中解析多数刀口意见', () => {
    const chats = [
        '今晚刀5号。中位、无信息关联。',
        '吾以寒刀斩杀 5 号。',
        '吾今夜以血月之怒，欲斩 5 号。',
        '锁定五号，稳步推进。',
    ];
    assert.equal(extractWolfChatTarget(chats, TARGETS), 5);
});

test('中文数字座位号可解析（四号/十号/十一号）', () => {
    assert.equal(extractWolfChatTarget(['干掉十一号'], TARGETS), 11);
    assert.equal(extractWolfChatTarget(['今夜猎四号'], TARGETS), 4);
    assert.equal(extractWolfChatTarget(['带走十号'], [2, 3, 4, 5, 7, 9, 11]), null); // 10 不在 validTargets
    assert.equal(extractWolfChatTarget(['带走十号'], [10]), 10);
});

test('发言/身份描述里的座位号不算刀口', () => {
    const chats = [
        '白天分工：6号跳预言家，报一个活人查杀；12号跟我集中投票。',
        '8号低调潜伏，不抢警、不跳身份。',
    ];
    assert.equal(extractWolfChatTarget(chats, TARGETS), null);
});

test('带否定/无动词的提及不误判为主刀口', () => {
    // “出4号”没有刀杀动词 → 不算
    assert.equal(extractWolfChatTarget(['今天全票出4号'], TARGETS), null);
});

test('票数相同时取最后被提及的座位', () => {
    const chats = ['刀4号', '杀9号'];
    assert.equal(extractWolfChatTarget(chats, TARGETS), 9);
});

test('刀口目标为狼队友时忽略（不在合法目标内）', () => {
    const chats = ['今晚刀6号']; // 6 是狼
    assert.equal(extractWolfChatTarget(chats, TARGETS), null);
});

test('空发言返回 null', () => {
    assert.equal(extractWolfChatTarget([], TARGETS), null);
    assert.equal(extractWolfChatTarget(['', ''], TARGETS), null);
});
