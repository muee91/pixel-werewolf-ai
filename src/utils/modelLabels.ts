/**
 * 座位上"这张牌是谁在打"的模型标签，统一口径。
 *
 * 为什么单独拎出来：同一句话要在四个地方出现——2D 座位卡、结算模型战绩、
 * 3D 世界名牌、复盘页阵容表。四处各算一份，早晚出现"2D 写 v4.1-flash、
 * 3D 写 DeepSeek"这种自相矛盾，观众就没法比了。
 */

import type { ActorProfile, LLMPreset, Player, Role } from '../types';
import { WOLF_ROLES } from '../types';

/** 人类座位不算模型，但也需要参与"是不是混用"的判断 */
export const HUMAN_MODEL_LABEL = '人类';

type ModelSeat = Pick<Player, 'id' | 'actorId'> & { isHuman?: boolean };

/**
 * 单个座位的模型标签。
 *
 * 未绑定模型的分身沿用列表首个预设——这是房间原本的口径，改掉会让
 * "全员同一模型"的局突然显示空标签（回归风险大于收益）。
 */
export const getPlayerModelLabel = (
    player: ModelSeat,
    actors: ActorProfile[],
    presets: LLMPreset[],
): string => {
    if (player.isHuman) return HUMAN_MODEL_LABEL;
    const actor = actors.find(candidate => candidate.id === player.actorId);
    const preset = (actor?.llmPresetId ? presets.find(item => item.id === actor.llmPresetId) : undefined)
        ?? presets[0];
    return preset?.name || preset?.modelId || '';
};

/** 整桌的模型标签表（跳过空标签，座位号即键） */
export const buildModelLabelMap = (
    players: ModelSeat[],
    actors: ActorProfile[],
    presets: LLMPreset[],
): Record<number, string> => {
    const labels: Record<number, string> = {};
    for (const player of players) {
        const label = getPlayerModelLabel(player, actors, presets);
        if (label) labels[player.id] = label;
    }
    return labels;
};

/**
 * 全桌出现 ≥2 种模型才算"混搭"。
 * 单一模型的局标注这行没有任何信息量，只是噪音。
 */
export const hasMixedModelLabels = (labels: Record<number, string>): boolean =>
    new Set(Object.values(labels)).size > 1;

/**
 * UI 真正要展示的标签表：真的混用模型时才返回全表，否则返回空表。
 * 调用方拿到空表就不用到处写 `mixedModels ? ... : ''`。
 *
 * 判"混搭"只看 AI 座位：人手一个的局模型只有一个，不该因为多了个真人座位
 * 就把模型名铺满全桌。真混搭时才把"人类"也一起标出来——观众要知道哪张牌是人打的。
 */
export const pickDisplayedModelLabels = (
    players: ModelSeat[],
    actors: ActorProfile[],
    presets: LLMPreset[],
): Record<number, string> => {
    const labels = buildModelLabelMap(players, actors, presets);
    const aiLabels = players
        .filter(player => !player.isHuman)
        .map(player => labels[player.id])
        .filter(Boolean);
    return new Set(aiLabels).size > 1 ? labels : {};
};

export interface ModelScoreboardRow {
    label: string;
    seats: number[];
    /** 该模型这局拿到的牌数 */
    total: number;
    /** 站在获胜阵营的牌数 */
    wins: number;
    scoreSum: number;
    scored: number;
}

export type Camp = 'GOOD' | 'WOLF' | 'THIRD_PARTY';

/**
 * 电子斗蛐蛐的记账：按模型合并座位，算出"赢了几张牌、平均多少分"。
 * 排序口径：胜率优先，同胜率比总分——和座位数无关，不然铺得多的模型永远赢。
 */
export interface ScoreboardSeat extends ModelSeat {
    seatNumber: number;
    role: Role;
}

export const buildModelScoreboard = (
    players: ScoreboardSeat[],
    labelOf: (player: ModelSeat) => string,
    wonCamp: Camp,
    scoreOf?: (playerId: number) => number | null,
): ModelScoreboardRow[] => {
    const rows = new Map<string, ModelScoreboardRow>();
    for (const player of players) {
        const label = labelOf(player);
        if (!label) continue;
        const camp: Camp = WOLF_ROLES.includes(player.role as Role) ? 'WOLF' : 'GOOD';
        const row = rows.get(label) ?? { label, seats: [], total: 0, wins: 0, scoreSum: 0, scored: 0 };
        row.seats.push(player.seatNumber);
        row.total += 1;
        if (camp === wonCamp) row.wins += 1;
        const score = scoreOf?.(player.id);
        if (typeof score === 'number') {
            row.scoreSum += score;
            row.scored += 1;
        }
        rows.set(label, row);
    }
    return [...rows.values()]
        .map(row => ({ ...row, seats: [...row.seats].sort((a, b) => a - b) }))
        .sort((a, b) => (b.wins / b.total) - (a.wins / a.total)
            || b.scoreSum - a.scoreSum
            || a.label.localeCompare(b.label));
};
