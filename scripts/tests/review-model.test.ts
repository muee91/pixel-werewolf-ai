import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGameReview, getReviewHeadline } from '../../src/utils/reviewModel';
import { GamePhase, PlayerStatus, Role, type GameLog, type Player } from '../../src/types';

// 复盘页只做"把日志摊平成能读的东西"：谁说了什么、谁投了谁、谁出局。
// 三个入口共用同一份结构，所以这里盯死的是字段口径，不是排版。

const player = (
    id: number,
    role: Role,
    overrides: Partial<Player> = {},
): Player => ({
    id,
    seatNumber: id,
    role,
    status: PlayerStatus.ALIVE,
    avatarSeed: id,
    rolePrompt: '',
    isSpeaking: false,
    actorId: `a${id}`,
    displayName: `${id}号玩家`,
    ...overrides,
});

const players: Player[] = [
    player(1, Role.WEREWOLF, { status: PlayerStatus.DEAD_VOTE, actorId: 'a1', displayName: '狼一' }),
    player(2, Role.SEER, { actorId: 'a2', displayName: '预言家二' }),
    player(3, Role.VILLAGER, { actorId: 'a3', displayName: '村民三' }),
];

const labelOf = (p: { actorId: string }) => (p.actorId === 'a2' ? 'gpt-mini' : 'v4.1-flash');

const log = (overrides: Partial<GameLog> & Pick<GameLog, 'id' | 'content'>): GameLog => ({
    turn: 1,
    phase: GamePhase.DAY_DISCUSSION,
    timestamp: 0,
    isSystem: false,
    ...overrides,
});

const logs: GameLog[] = [
    log({ id: 'sys-1', content: '天亮了，昨夜 1 号出局。', isSystem: true, phase: GamePhase.DAY_ANNOUNCE }),
    log({
        id: 'speech-1',
        content: '我觉得 3 号有问题，他昨天一直在划水。',
        speakerId: 2,
        modelName: 'gpt-mini',
        durationMs: 8000,
    }),
    log({
        id: 'speech-2',
        content: '我是好人，别投我。',
        speakerId: 3,
        modelName: 'v4.1-flash',
        durationMs: 4000,
    }),
    log({
        id: 'vote-1',
        content: '投票目标：1号\n投票理由：他第一晚的发言太假。',
        speakerId: 2,
        phase: GamePhase.VOTING,
        debugType: 'VOTE_STRATEGY',
        modelName: 'gpt-mini',
        debugData: { voter: 2, target: 1, voteWeight: 1, speak: '他第一晚的发言太假。' },
    }),
    log({
        id: 'vote-2',
        content: '投票目标：3号',
        speakerId: 3,
        phase: GamePhase.VOTING,
        debugType: 'VOTE_STRATEGY',
        modelName: 'v4.1-flash',
        debugData: { voter: 3, target: 3, voteWeight: 1 },
    }),
    log({
        id: 'tally-1',
        content: '逐票明细……',
        isSystem: true,
        phase: GamePhase.VOTING,
        debugType: 'VOTE_TALLY',
        debugData: {
            votes: { 1: 1, 3: 1 },
            voteRows: [
                { voter: 2, target: 1, voteWeight: 1, speak: '他第一晚的发言太假。' },
                { voter: 3, target: 3, voteWeight: 1 },
            ],
            abstainCount: 0,
            final: null,
            tiedCandidates: [1, 3],
        },
    }),
    // 第二天的发言与放逐
    log({
        id: 'speech-3',
        turn: 2,
        content: '昨天平票，今天我把票压在 1 号身上。',
        speakerId: 3,
    }),
    log({
        id: 'vote-3',
        turn: 2,
        content: '投票目标：1号',
        speakerId: 3,
        phase: GamePhase.VOTING,
        debugType: 'VOTE_STRATEGY',
        debugData: { voter: 3, target: 1, voteWeight: 1.5, speak: '警徽归票。' },
    }),
    log({
        id: 'tally-2',
        turn: 2,
        content: '逐票明细……',
        isSystem: true,
        phase: GamePhase.VOTING,
        debugType: 'VOTE_TALLY',
        debugData: {
            votes: { 1: 1.5 },
            voteRows: [{ voter: 3, target: 1, voteWeight: 1.5, speak: '警徽归票。' }],
            abstainCount: 0,
            final: 1,
            tiedCandidates: [],
        },
    }),
];

test('按天分组：发言和票型各自归到当天', () => {
    const review = buildGameReview({ logs, players, labelOf });
    assert.equal(review.days.length, 2);
    assert.equal(review.days[0].turn, 1);
    assert.equal(review.days[0].speeches.length, 2);
    assert.equal(review.days[0].votes.length, 1);
    assert.equal(review.days[1].speeches.length, 1);
    assert.equal(review.days[1].votes.length, 1);
});

test('公开发言只收玩家说的话：系统播报、策略日志、投票统计都不混进来', () => {
    const review = buildGameReview({ logs, players, labelOf });
    const ids = review.days.flatMap(day => day.speeches.map(speech => speech.logId));
    assert.deepEqual(ids, ['speech-1', 'speech-2', 'speech-3']);
    assert.ok(!ids.includes('tally-1'));
});

test('每条发言都带座位、模型与字数（复盘要能看出哪个模型在打）', () => {
    const review = buildGameReview({ logs, players, labelOf });
    const [first, second] = review.days[0].speeches;
    assert.equal(first.seatNumber, 2);
    assert.equal(first.name, '预言家二');
    assert.equal(first.model, 'gpt-mini');
    assert.equal(first.chars, 18);
    assert.equal(first.phaseLabel, '公聊发言');
    assert.equal(second.model, 'v4.1-flash');
});

test('关键票型：逐票带权重与理由，票数按加权统计并降序', () => {
    const review = buildGameReview({ logs, players, labelOf });
    const round = review.days[1].votes[0];
    assert.equal(round.label, '投票放逐');
    assert.equal(round.rows.length, 1);
    assert.equal(round.rows[0].voterSeat, 3);
    assert.equal(round.rows[0].targetSeat, 1);
    assert.equal(round.rows[0].weight, 1.5);
    assert.equal(round.rows[0].reason, '警徽归票。');
    assert.deepEqual(round.tally, [{ seatNumber: 1, count: 1.5 }]);
    assert.equal(round.exiledSeat, 1);
});

test('平票局：票数列两人并列、tiedSeats 与 exiledSeat 如实记录', () => {
    const review = buildGameReview({ logs, players, labelOf });
    const round = review.days[0].votes[0];
    assert.deepEqual(round.tiedSeats, [1, 3]);
    assert.equal(round.exiledSeat, null);
    assert.deepEqual(round.tally.map(item => item.seatNumber), [1, 3]);
});

test('阵容表带出局原因，活着的座位不会写"存活"以外的死因', () => {
    const review = buildGameReview({ logs, players, labelOf });
    const dead = review.seats.find(seat => seat.seatNumber === 1);
    const alive = review.seats.find(seat => seat.seatNumber === 2);
    assert.equal(dead?.alive, false);
    assert.equal(dead?.outReason, '被放逐');
    assert.equal(dead?.roleLabel, '狼人');
    assert.equal(alive?.alive, true);
    assert.equal(alive?.outReason, '存活');
    assert.equal(alive?.model, 'gpt-mini');
});

test('模型战绩：发言数/字数/平均耗时/投票次数按模型合并', () => {
    const review = buildGameReview({ logs, players, labelOf });
    const gpt = review.modelStats.find(stat => stat.label === 'gpt-mini');
    const flash = review.modelStats.find(stat => stat.label === 'v4.1-flash');
    assert.ok(gpt && flash);
    assert.equal(gpt.speeches, 1);
    assert.equal(gpt.avgDurationMs, 8000);
    assert.equal(gpt.votes, 1);
    assert.equal(flash.speeches, 2);
    // v4.1-flash 只有第一条带耗时样本，第二条没耗时不能把均值拉成 0
    assert.equal(flash.avgDurationMs, 4000);
    assert.equal(flash.durationSamples, 1);
    assert.equal(flash.votes, 2);
    assert.ok(flash.chars > gpt.chars);
});

test('座位模型以日志实测为准：分身配置改过，旧存档也不会跟着改口', () => {
    // 用户事后换了模型预设，labelOf 现在把所有人都说成 v4.1-flash
    const review = buildGameReview({ logs, players, labelOf: () => 'v4.1-flash' });
    const seat2 = review.seats.find(seat => seat.seatNumber === 2);
    const seat3 = review.seats.find(seat => seat.seatNumber === 3);
    assert.equal(seat2?.model, 'gpt-mini', '2 号这局说的是 gpt-mini，不该被当前配置覆盖');
    assert.equal(seat3?.model, 'v4.1-flash');
    // 一句话都没留下的座位只能退回配置
    const seat1 = review.seats.find(seat => seat.seatNumber === 1);
    assert.equal(seat1?.model, 'v4.1-flash');
});

test('没有 VOTE_TALLY 的老存档也能把票摆出来（退回逐票明细）', () => {
    const review = buildGameReview({
        logs: logs.filter(item => item.debugType !== 'VOTE_TALLY'),
        players,
        labelOf,
    });
    const round = review.days[0].votes[0];
    assert.equal(round.rows.length, 2);
    assert.deepEqual(round.tally, [
        { seatNumber: 1, count: 1 },
        { seatNumber: 3, count: 1 },
    ]);
    assert.equal(round.exiledSeat, null);
});

test('debugData 被裁掉的存档：从正文里把投票目标捞回来', () => {
    const stripped: GameLog[] = [{
        id: 'vote-x',
        turn: 1,
        phase: GamePhase.VOTING,
        content: '投票目标：2号\n投票理由：直觉。',
        timestamp: 0,
        isSystem: false,
        speakerId: 1,
        debugType: 'VOTE_STRATEGY',
    }];
    const review = buildGameReview({ logs: stripped, players, labelOf });
    assert.equal(review.days[0].votes[0].rows[0].targetSeat, 2);
    assert.equal(review.days[0].votes[0].rows[0].reason, '直觉。');
});

test('空日志不炸，返回空复盘', () => {
    const review = buildGameReview({ logs: [], players: [], labelOf });
    assert.deepEqual(review.seats, []);
    assert.deepEqual(review.days, []);
    assert.deepEqual(review.modelStats, []);
    assert.equal(review.totals.speeches, 0);
});

test('头部结论文案跟阵营走，缺结算时退化但不崩', () => {
    assert.equal(getReviewHeadline({ winner: 'GOOD', reasonText: '狼全死' } as never).title, '好人阵营胜利');
    assert.equal(getReviewHeadline({ winner: 'WOLF', reasonText: '屠民' } as never).title, '狼人阵营胜利');
    assert.equal(getReviewHeadline(null, 'WOLF').title, '狼人阵营胜利');
    assert.equal(getReviewHeadline(null, null).detail, '存档里没有结构化结算数据。');
});
