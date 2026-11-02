/**
 * 复盘页的数据模型（纯函数，不碰 React / 不碰存档 IO）。
 *
 * 复盘要回答三个问题，所以只抽三类事实：
 *   1. 谁是谁 —— 每个座位拿到什么牌、由哪个模型在打、怎么出局的；
 *   2. 说了什么 —— 按天分组的公开发言，逐条带模型名；
 *   3. 怎么投的 —— 每天的逐票明细与加权票数、最后谁被放逐。
 *
 * 三个入口（结算面板、历史对局、3D 房间）都读同一份结构，
 * 避免"结算页说 4 票、复盘页说 3 票"这种自相矛盾。
 */

import {
    GamePhase,
    PHASE_LABELS,
    PlayerStatus,
    ROLE_INFO,
    type GameLog,
    type GameResult,
    type Player,
    type Role,
} from '../types';

export interface ReviewSeat {
    playerId: number;
    seatNumber: number;
    name: string;
    role: Role;
    roleLabel: string;
    isHuman: boolean;
    model: string;
    status: string;
    alive: boolean;
    outReason: string;
}

export interface ReviewSpeech {
    logId: string;
    turn: number;
    phase: GamePhase;
    phaseLabel: string;
    seatNumber: number;
    name: string;
    model: string;
    content: string;
    chars: number;
    durationMs: number | null;
}

export interface ReviewVoteRow {
    voterSeat: number;
    voterName: string;
    voterModel: string;
    targetSeat: number | null;
    targetName: string;
    weight: number;
    forced: boolean;
    reason: string;
}

export interface ReviewVoteRound {
    key: string;
    turn: number;
    phase: GamePhase;
    label: string;
    rows: ReviewVoteRow[];
    /** 按加权票数降序 */
    tally: { seatNumber: number; count: number }[];
    abstain: number;
    exiledSeat: number | null;
    tiedSeats: number[];
}

export interface ReviewEvent {
    id: string;
    phase: GamePhase;
    phaseLabel: string;
    text: string;
}

export interface ReviewDay {
    turn: number;
    speeches: ReviewSpeech[];
    votes: ReviewVoteRound[];
    events: ReviewEvent[];
}

export interface ReviewModelStat {
    label: string;
    seats: number[];
    speeches: number;
    chars: number;
    avgChars: number;
    /** 平均单次生成耗时（只用带耗时样本的发言） */
    avgDurationMs: number | null;
    durationSamples: number;
    votes: number;
}

export interface GameReview {
    seats: ReviewSeat[];
    days: ReviewDay[];
    modelStats: ReviewModelStat[];
    totals: {
        speeches: number;
        votes: number;
        chars: number;
        models: number;
    };
}

const OUT_REASON: Partial<Record<string, string>> = {
    [PlayerStatus.ALIVE]: '存活',
    [PlayerStatus.IDIOT_REVEALED]: '白痴翻牌（存活·失去投票权）',
    [PlayerStatus.DEAD_NIGHT]: '夜间出局',
    [PlayerStatus.DEAD_VOTE]: '被放逐',
    [PlayerStatus.DEAD_SHOOT]: '被开枪带走',
    [PlayerStatus.DEAD_POISON]: '被毒杀',
    [PlayerStatus.EXPLODED]: '自爆',
};

const isAliveStatus = (status: string): boolean =>
    status === PlayerStatus.ALIVE || status === PlayerStatus.IDIOT_REVEALED;

/** 内部调试痕迹：复盘用的是"发生过什么"，不是模型提示词，这些不进正文 */
const isDebugLog = (log: GameLog): boolean =>
    !!log.debugType ||
    log.phase === GamePhase.SETUP;

/** 公开发言：真人/AI 说出口的那句话（排除系统播报与内部策略日志） */
const isSpeechLog = (log: GameLog): boolean =>
    !log.isSystem && !isDebugLog(log) && !!log.content?.trim();

const charCount = (text: string): number => text.replace(/\s+/g, '').length;

/** 日志里没有 debugData 时（导入的老存档），从正文里把投票目标捞回来 */
const parseVoteTargetFromContent = (content: string): number | null => {
    const match = content.match(/投票目标[：:]\s*(\d+)\s*号/);
    return match ? Number(match[1]) : null;
};

type VoteDebugData = {
    voter?: number;
    target?: number | null;
    voteWeight?: number;
    pkForced?: boolean;
    speak?: string;
};

const buildVoteRow = (
    log: GameLog,
    seatOf: Map<number, ReviewSeat>,
): ReviewVoteRow | null => {
    const data = (log.debugData ?? {}) as VoteDebugData;
    const voterId = data.voter ?? log.speakerId;
    if (voterId == null) return null;
    const voter = seatOf.get(voterId);
    const targetId = data.target ?? parseVoteTargetFromContent(log.content);
    const target = targetId != null ? seatOf.get(targetId) : undefined;
    return {
        voterSeat: voter?.seatNumber ?? voterId,
        voterName: voter?.name ?? `${voterId}号`,
        voterModel: voter?.model ?? log.modelName ?? '',
        targetSeat: targetId ?? null,
        targetName: target ? `${target.seatNumber}号 ${target.name}` : (targetId ? `${targetId}号` : '弃票'),
        weight: typeof data.voteWeight === 'number' ? data.voteWeight : 1,
        forced: !!data.pkForced,
        reason: (data.speak ?? log.content.split('投票理由：')[1] ?? '').trim(),
    };
};

const summarizeTally = (rows: ReviewVoteRow[]) => {
    const counts = new Map<number, number>();
    let abstain = 0;
    for (const row of rows) {
        if (row.targetSeat == null) {
            abstain += 1;
            continue;
        }
        counts.set(row.targetSeat, (counts.get(row.targetSeat) ?? 0) + row.weight);
    }
    return {
        tally: [...counts.entries()]
            .map(([seatNumber, count]) => ({ seatNumber, count }))
            .sort((a, b) => b.count - a.count || a.seatNumber - b.seatNumber),
        abstain,
    };
};

const normalizePlayers = (
    players: Array<Pick<Player, 'id' | 'seatNumber' | 'role' | 'status' | 'actorId'> & {
        displayName?: string;
        isHuman?: boolean;
    }>,
    labelOf: (player: { id: number; actorId: string; isHuman?: boolean }) => string,
    /** 日志里实测到的模型名：比分身配置更可信（分身配置会因为改设置而漂） */
    modelByPlayer: Map<number, string> = new Map(),
): ReviewSeat[] => players
    .slice()
    .sort((a, b) => a.seatNumber - b.seatNumber)
    .map(player => ({
        playerId: player.id,
        seatNumber: player.seatNumber,
        name: player.displayName || `${player.seatNumber}号玩家`,
        role: player.role,
        roleLabel: ROLE_INFO[player.role]?.label ?? String(player.role),
        isHuman: !!player.isHuman,
        model: modelByPlayer.get(player.id) ?? labelOf(player),
        status: player.status,
        alive: isAliveStatus(player.status),
        outReason: OUT_REASON[player.status] ?? String(player.status),
    }));

/**
 * 每个座位这局实际用的是哪个模型：数公开发言里出现的 modelName，取最多的那个。
 *
 * 为什么不直接读分身配置：分身是"当前设置"，不是"这局用的"。
 * 用户改过一次模型预设，历史存档里的座位就会集体改口——复盘页说假话比不显示更糟。
 */
const inferSeatModels = (logs: GameLog[]): Map<number, string> => {
    const counts = new Map<number, Map<string, number>>();
    for (const log of logs) {
        if (!isSpeechLog(log) || log.speakerId == null || !log.modelName) continue;
        const perSeat = counts.get(log.speakerId) ?? new Map<string, number>();
        perSeat.set(log.modelName, (perSeat.get(log.modelName) ?? 0) + 1);
        counts.set(log.speakerId, perSeat);
    }
    const result = new Map<number, string>();
    for (const [playerId, perSeat] of counts) {
        const best = [...perSeat.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) result.set(playerId, best[0]);
    }
    return result;
};

export interface BuildGameReviewInput {
    logs: GameLog[];
    players: Array<Pick<Player, 'id' | 'seatNumber' | 'role' | 'status' | 'actorId'> & {
        displayName?: string;
        isHuman?: boolean;
    }>;
    result?: GameResult | null;
    /** 座位模型名（口径来自 utils/modelLabels） */
    labelOf: (player: { id: number; actorId: string; isHuman?: boolean }) => string;
}

export const buildGameReview = ({ logs, players, labelOf }: BuildGameReviewInput): GameReview => {
    const seats = normalizePlayers(players, labelOf, inferSeatModels(logs));
    const seatOf = new Map(seats.map(seat => [seat.playerId, seat]));
    // 出局玩家的座位信息也可能出现在日志里（联机客人拿到的 players 可能不含已退出的座位）
    const seatBySeatNumber = new Map(seats.map(seat => [seat.seatNumber, seat]));

    const days = new Map<number, ReviewDay>();
    const dayOf = (turn: number): ReviewDay => {
        const existing = days.get(turn);
        if (existing) return existing;
        const created: ReviewDay = { turn, speeches: [], votes: [], events: [] };
        days.set(turn, created);
        return created;
    };

    const modelStats = new Map<string, ReviewModelStat>();
    const statOf = (label: string): ReviewModelStat => {
        const existing = modelStats.get(label);
        if (existing) return existing;
        const created: ReviewModelStat = {
            label,
            seats: [],
            speeches: 0,
            chars: 0,
            avgChars: 0,
            avgDurationMs: null,
            durationSamples: 0,
            votes: 0,
        };
        modelStats.set(label, created);
        return created;
    };
    for (const seat of seats) {
        if (!seat.model) continue;
        const stat = statOf(seat.model);
        if (!stat.seats.includes(seat.seatNumber)) stat.seats.push(seat.seatNumber);
    }
    for (const stat of modelStats.values()) stat.seats.sort((a, b) => a - b);

    const voteLogs = new Map<string, ReviewVoteRow[]>();
    const tallyLogs = new Map<string, GameLog>();
    let speechTotal = 0;
    let voteTotal = 0;
    let charTotal = 0;

    for (const log of logs) {
        const day = dayOf(log.turn);

        if (isSpeechLog(log)) {
            const speakerId = log.speakerId;
            const seat = speakerId != null ? seatOf.get(speakerId) : undefined;
            const model = log.modelName || seat?.model || '';
            const chars = charCount(log.content);
            const speech: ReviewSpeech = {
                logId: log.id,
                turn: log.turn,
                phase: log.phase,
                phaseLabel: PHASE_LABELS[log.phase] ?? String(log.phase),
                seatNumber: seat?.seatNumber ?? speakerId ?? 0,
                name: log.speakerName || seat?.name || (speakerId != null ? `${speakerId}号` : '系统'),
                model,
                content: log.content.trim(),
                chars,
                durationMs: typeof log.durationMs === 'number' ? log.durationMs : null,
            };
            day.speeches.push(speech);
            speechTotal += 1;
            charTotal += chars;
            if (model) {
                const stat = statOf(model);
                stat.speeches += 1;
                stat.chars += chars;
                if (speech.durationMs != null) {
                    const previous = stat.avgDurationMs ?? 0;
                    stat.avgDurationMs = previous
                        ? (previous * stat.durationSamples + speech.durationMs) / (stat.durationSamples + 1)
                        : speech.durationMs;
                    stat.durationSamples += 1;
                }
            }
            continue;
        }

        if (log.debugType === 'VOTE_STRATEGY') {
            const row = buildVoteRow(log, seatOf);
            if (!row) continue;
            const key = `${log.turn}-${log.phase}-${row.voterSeat}`;
            const bucket = voteLogs.get(key) ?? [];
            bucket.push(row);
            voteLogs.set(key, bucket);
            voteTotal += 1;
            const voterSeat = seatBySeatNumber.get(row.voterSeat);
            const label = row.voterModel || voterSeat?.model || '';
            if (label) statOf(label).votes += 1;
            continue;
        }

        if (log.debugType === 'VOTE_TALLY') {
            tallyLogs.set(`${log.turn}-${log.phase}`, log);
            continue;
        }

        if (log.isSystem && log.content?.trim()) {
            // 系统播报只留第一行：结算块/投票明细块的后半段是给排错用的，不进复盘正文
            day.events.push({
                id: log.id,
                phase: log.phase,
                phaseLabel: PHASE_LABELS[log.phase] ?? String(log.phase),
                text: log.content.trim().split('\n')[0],
            });
        }
    }

    // 投票轮：以 VOTE_TALLY（权威，含加权统计）为主，逐票明细按 turn+phase 归并
    for (const [key, tallyLog] of tallyLogs) {
        const [, phase] = key.split('-');
        const data = (tallyLog.debugData ?? {}) as {
            votes?: Record<string, number>;
            voteRows?: unknown[];
            final?: number | null;
            tiedCandidates?: number[];
            abstainCount?: number;
        };
        const day = dayOf(tallyLog.turn);
        // debugData.voteRows 是引擎原始行（字段 voter/target/voteWeight）；老存档没有就退回已解析的逐票
        const rawRows = Array.isArray(data.voteRows) ? (data.voteRows as VoteDebugData[]) : null;
        const normalizedRows: ReviewVoteRow[] = rawRows
            ? rawRows.map(row => {
                const voter = row.voter != null ? seatOf.get(row.voter) : undefined;
                const target = row.target != null ? seatOf.get(row.target) : undefined;
                return {
                    voterSeat: voter?.seatNumber ?? row.voter ?? 0,
                    voterName: voter?.name ?? `${row.voter ?? 0}号`,
                    voterModel: voter?.model ?? '',
                    targetSeat: row.target ?? null,
                    targetName: target ? `${target.seatNumber}号 ${target.name}` : (row.target ? `${row.target}号` : '弃票'),
                    weight: row.voteWeight ?? 1,
                    forced: !!row.pkForced,
                    reason: (row.speak ?? '').trim(),
                };
            })
            : (voteLogs.get(`${tallyLog.turn}-${phase}`) ?? []);

        const computed = summarizeTally(normalizedRows);
        const tally = data.votes
            ? Object.entries(data.votes)
                .map(([target, count]) => ({
                    seatNumber: seatOf.get(Number(target))?.seatNumber ?? Number(target),
                    count: Number(count),
                }))
                .sort((a, b) => b.count - a.count || a.seatNumber - b.seatNumber)
            : computed.tally;

        day.votes.push({
            key: `${tallyLog.turn}-${phase}-${tallyLog.id}`,
            turn: tallyLog.turn,
            phase: phase as GamePhase,
            label: PHASE_LABELS[phase as GamePhase] ?? phase,
            rows: normalizedRows.sort((a, b) => a.voterSeat - b.voterSeat),
            tally,
            abstain: typeof data.abstainCount === 'number' ? data.abstainCount : computed.abstain,
            exiledSeat: data.final != null ? (seatOf.get(data.final)?.seatNumber ?? data.final) : null,
            tiedSeats: (data.tiedCandidates ?? []).map(id => seatOf.get(id)?.seatNumber ?? id),
        });
    }

    // 有逐票明细却没有 VOTE_TALLY（老存档/中断的对局）：仍然把票摆出来，别让复盘页空着
    const fallbackRounds = new Map<string, ReviewVoteRow[]>();
    for (const [key, rows] of voteLogs) {
        const [turnText, phase] = key.split('-');
        const roundKey = `${turnText}-${phase}`;
        fallbackRounds.set(roundKey, [...(fallbackRounds.get(roundKey) ?? []), ...rows]);
    }
    for (const [roundKey, rows] of fallbackRounds) {
        const [turnText, phase] = roundKey.split('-');
        const turn = Number(turnText);
        const already = [...(days.get(turn)?.votes ?? [])].some(vote => vote.phase === phase);
        if (already) continue;
        const computed = summarizeTally(rows);
        dayOf(turn).votes.push({
            key: `${roundKey}-fallback`,
            turn,
            phase: phase as GamePhase,
            label: PHASE_LABELS[phase as GamePhase] ?? phase,
            rows: rows.slice().sort((a, b) => a.voterSeat - b.voterSeat),
            tally: computed.tally,
            abstain: computed.abstain,
            exiledSeat: null,
            tiedSeats: [],
        });
    }

    for (const stat of modelStats.values()) {
        stat.avgChars = stat.speeches > 0 ? Math.round(stat.chars / stat.speeches) : 0;
    }

    return {
        seats,
        days: [...days.values()]
            .sort((a, b) => a.turn - b.turn)
            .map(day => ({
                ...day,
                votes: day.votes.sort((a, b) => a.turn - b.turn),
            })),
        modelStats: [...modelStats.values()]
            .sort((a, b) => b.speeches - a.speeches || b.chars - a.chars || a.label.localeCompare(b.label)),
        totals: {
            speeches: speechTotal,
            votes: voteTotal,
            chars: charTotal,
            models: modelStats.size,
        },
    };
};

/** 复盘页头部一句结论：谁赢了、为什么、打了几天 */
export const getReviewHeadline = (result: GameResult | null | undefined, fallbackWinner?: string | null) => {
    if (!result) {
        return {
            title: fallbackWinner === 'GOOD' ? '好人阵营胜利' : fallbackWinner === 'WOLF' ? '狼人阵营胜利' : '对局已结束',
            detail: '存档里没有结构化结算数据。',
            winner: fallbackWinner ?? null,
        };
    }
    const title = result.winner === 'GOOD'
        ? '好人阵营胜利'
        : result.winner === 'WOLF'
            ? '狼人阵营胜利'
            : '第三方阵营胜利';
    return { title, detail: result.reasonText, winner: result.winner };
};
