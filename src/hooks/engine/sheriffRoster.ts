/**
 * 警长候选人（上警意向）
 *
 * 为什么要有这一层：此前是 `alive.map(p => p.id)` —— 全体活人都上警。
 * 12 人 Day 1 就是 12 次竞选发言 + 12 次退水决策 = 24 次调用，占当天全部调用的四成多。
 * 而真实牌桌上从来不是人人都想拿徽章：预言家要起跳报验，狼要争徽抢归票，
 * 大部分平民宁可待在台下听。所以"人人上警"既是性能问题，也是规则还原问题。
 *
 * 为什么不用模型决定："你要上警吗"问 12 个人本身就是 12 次调用 —— 等于不省。
 * 这里用**角色动机 + 稳定抖动**排序取前 N，零调用；同局同座位结果恒定（重开、重放一致）。
 *
 * 边界（明确写下，避免以后被当成 bug）：
 * - 人类座位一律在名单里：面板没有"放弃上警"的入口，静默把他排除比多花一次调用更糟。
 * - 有狼在场却没有狼上警时，把得分最高的狼提上来：全场无狼上警的牌局在真实桌上几乎不存在，
 *   而且会让"警徽只可能落在好人手里"，策略空间少一半。
 */

import { Player, Role, WOLF_ROLES } from '../../types';
import { isEffectivelyAlive } from '../../game/rules';

/** 上警动机先验：不是概率，只用于排序（真实概率由排序 + 上限隐式决定） */
const RUN_MOTIVATION: Record<Role, number> = {
    [Role.SEER]: 0.95,
    [Role.WOLF_KING]: 0.72,
    [Role.WEREWOLF]: 0.66,
    [Role.WHITE_WOLF_KING]: 0.68,
    [Role.STONE_GHOST]: 0.6,
    [Role.BLOOD_MOON_DISCIPLE]: 0.6,
    [Role.WITCH]: 0.52,
    [Role.MIRACLE_MERCHANT]: 0.48,
    [Role.HUNTER]: 0.46,
    [Role.DEMON_HUNTER]: 0.44,
    [Role.GUARD]: 0.4,
    [Role.KNIGHT]: 0.4,
    [Role.GRAVEKEEPER]: 0.38,
    [Role.IDIOT]: 0.34,
    [Role.CUPID]: 0.3,
    [Role.VILLAGER]: 0.2,
};

/** 抖动幅度：够大才能让同角色不同座位分出差别，够小才不会让平民挤掉预言家 */
const JITTER = 0.36;

const hashSeed = (text: string): number => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

/** mulberry32：小而稳的确定性随机，避免用 Math.random 破坏重放一致性 */
const makeRandom = (seed: string) => {
    let state = hashSeed(seed) || 1;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/** 候选人上限：12 人 6 个、9 人 5 个、6 人 3 个；至少 3 个（少于 3 人的竞选没有意义） */
export const sheriffCandidateCeiling = (aliveCount: number): number =>
    Math.max(3, Math.min(aliveCount, Math.round(aliveCount * 0.5)));

export interface SheriffRosterInput {
    players: Player[];
    /** 稳定种子：同局不变、换局不同（用座位/角色/名字拼出） */
    seed: string;
}

export const pickSheriffCandidates = ({ players, seed }: SheriffRosterInput): number[] => {
    const alive = players.filter(isEffectivelyAlive);
    if (alive.length <= 3) return alive.map(p => p.id);

    const random = makeRandom(seed);
    const scored = alive.map(player => {
        const motivation = player.isHuman ? 1.2 : (RUN_MOTIVATION[player.role] ?? 0.3);
        return { player, score: motivation + random() * JITTER };
    });
    scored.sort((a, b) => b.score - a.score);

    const ceiling = sheriffCandidateCeiling(alive.length);
    const picked = scored.slice(0, ceiling).map(entry => entry.player);
    const pickedIds = new Set(picked.map(p => p.id));

    // 狼必须有人上警（上限满员时挤掉末位的好人）
    const wolvesAlive = alive.filter(p => WOLF_ROLES.includes(p.role));
    if (wolvesAlive.length > 0 && !wolvesAlive.some(w => pickedIds.has(w.id))) {
        const bestWolf = scored.find(entry => WOLF_ROLES.includes(entry.player.role));
        if (bestWolf) {
            if (picked.length >= ceiling) {
                const dropped = picked[picked.length - 1];
                pickedIds.delete(dropped.id);
                picked.pop();
            }
            picked.push(bestWolf.player);
            pickedIds.add(bestWolf.player.id);
        }
    }

    // 按座位号返回：上屏顺序要跟座位一致，否则"候选人：3、7、2"看起来像随机
    return picked.map(p => p.id).sort((a, b) => a - b);
};

/** 由对局初始状态算出种子：角色分配 + 座位 + 名字，同局恒定 */
export const sheriffRosterSeed = (players: Player[]): string =>
    players.map(p => `${p.id}:${p.seatNumber}:${p.role}:${p.displayName ?? ''}`).join('|');
