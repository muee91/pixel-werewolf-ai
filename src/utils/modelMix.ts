/**
 * 模型混搭（电子斗蛐蛐）
 *
 * 本作的看点之一是"不同模型的 AI 同桌对打"：`ActorProfile.llmPresetId` 逐座位解析模型，
 * 数据层早就支持一格一模型；缺的是把 N 个模型铺到 M 个分身上的操作——一个个改太慢。
 *
 * 这里只做纯计算，不碰 UI、不碰存储：
 * - rotate：按分身顺序轮流铺，保证每个模型都上场、且相邻座位尽量不同；
 * - random：打乱后铺，适合"想看随机对局"；
 * 两种模式都从**已选模型**里取，绝不引入没选中的模型。
 */

export type MixMode = 'rotate' | 'random';

export interface ModelMixInput {
    /** 分身的稳定顺序（调用方给，通常是玩家列表顺序） */
    actorIds: string[];
    /** 参与混搭的模型 id（已过滤掉空串） */
    presetIds: string[];
    mode: MixMode;
    /** 注入随机源，便于单测；默认 Math.random */
    random?: () => number;
}

/** 返回 actorId → presetId 的映射；入参不合法时返回空对象（调用方据此不改任何东西） */
export const buildModelMix = ({ actorIds, presetIds, mode, random = Math.random }: ModelMixInput): Record<string, string> => {
    const pool = presetIds.filter(Boolean);
    if (pool.length === 0 || actorIds.length === 0) return {};

    const order = mode === 'random' ? shuffle(pool, random) : pool;
    const assignment: Record<string, string> = {};
    actorIds.forEach((actorId, index) => {
        assignment[actorId] = order[index % order.length];
    });
    return assignment;
};

/** Fisher–Yates，不改原数组 */
const shuffle = (items: string[], random: () => number): string[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

/**
 * 混搭结果的摘要，用于设置页显示"现在这桌是谁和谁"。
 * 例：`deepseek-v4.1-flash × 6 · gpt-5-mini × 3`
 */
export const summarizeMix = (assignment: Record<string, string>, labelOf: (presetId: string) => string): string => {
    const counts = new Map<string, number>();
    Object.values(assignment).forEach(presetId => {
        const label = labelOf(presetId) || presetId;
        counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    if (counts.size === 0) return '未混搭';
    return [...counts.entries()].map(([label, count]) => `${label} × ${count}`).join(' · ');
};
