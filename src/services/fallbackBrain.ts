// 内置离线大脑:零配置机器上的兜底决策引擎(规则型,非 LLM)。
// 只使用玩家 legitimately 可见的信息:传入的 alivePlayers 必须已按视角脱敏;
// 狼人阵营知识由引擎单独以 teammates 显式传入。让任何一台电脑开箱即可玩完整局。
import { GamePhase, type Player } from '../types';

export interface FallbackContext {
    player: Player;
    phase: GamePhase;
    turnCount: number;
    /** 可选目标(投票/技能/开枪);夜间无明确目标的行为可为空 */
    validTargets?: number[];
    /** 已按视角脱敏的存活玩家 */
    alivePlayers: Player[];
    /** 狼人视角的队友座位对应玩家 id(仅狼人传入) */
    wolfTeammates?: number[];
    sheriffId?: number | null;
}

export interface FallbackDecision {
    target: number | null;
    speak: string;
    summary: string;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const others = (ctx: FallbackContext): number[] =>
    ctx.alivePlayers.filter(p => p.id !== ctx.player.id && p.status === 'ALIVE').map(p => p.id);

const DAY_LINES = [
    '我先听大家的，目前信息还太少，{suspect}号今天的发言我有点在意。',
    '我没有什么硬线索，但 {suspect} 号昨天到今天的表态总感觉在带节奏。',
    '第一轮我保留意见，重点听 {suspect} 号怎么解释昨晚的局势。',
    '直觉告诉我 {suspect} 号有问题，但我也可能看走眼，大家帮我判断。',
];
const WOLF_DAY_LINES = [
    '我觉得 {suspect} 号状态很不对，建议大家把票集中到他身上。',
    '这局我站 {suspect} 号是狼的判断，昨天他躲着最关键的信息不谈。',
    '别分散火力，我仔细听了 {suspect} 号的发言，逻辑对不上。',
];
const SEER_CLAIM_LINES = [
    '我是预言家。昨晚我查验了 {check} 号，结果是好的，请大家保我。',
    '预言家在此：我验了 {check} 号，金水，希望好人别浪费我的信息。',
];
const SHERIFF_LINES = [
    '我竞选警长，因为我很擅长梳理局势，选我大家不会吃亏。',
    '让我来扛警徽，我会在每天早上给大家明确的方向。',
];
const LAST_WORDS_LINES = [
    '我死得冤，大家记住我生前的判断，别让狼人得逞。',
    '我走了，但信息留给大家：仔细回想 {suspect} 号说过的话。',
];
const WOLF_NIGHT_LINES = [
    '今晚稳一点，按我们说好的来。',
    '听我指挥，这刀下去白天我来带节奏。',
];

const wolfTeamAlive = (ctx: FallbackContext): number[] =>
    (ctx.wolfTeammates ?? []).filter(id => ctx.alivePlayers.some(p => p.id === id && p.status === 'ALIVE'));

const pickSuspect = (ctx: FallbackContext): number | null => {
    const pool = others(ctx);
    return pool.length ? pick(pool) : null;
};

/** 夜间决策:返回引擎各阶段期望的字段(与 UserInput/LLMResponse 对齐) */
export const fallbackNightAction = (ctx: FallbackContext): Record<string, unknown> => {
    const isWolf = wolfTeamAlive(ctx).length >= 0 && (ctx.wolfTeammates !== undefined);
    switch (ctx.phase) {
        case GamePhase.WEREWOLF_ACTION: {
            if (!isWolf) return { speak: '（闭眼）' };
            // 刀优先级:警长 > 随机好人
            const prey = others(ctx).filter(id => !wolfTeamAlive(ctx).includes(id) && id !== ctx.player.id);
            const preyPool = prey.length ? prey : others(ctx);
            const sheriffAlive = ctx.sheriffId != null && preyPool.includes(ctx.sheriffId);
            const target = sheriffAlive && Math.random() < 0.6 ? ctx.sheriffId! : pick(preyPool);
            return { actionTarget: target, target, speak: pick(WOLF_NIGHT_LINES) };
        }
        case GamePhase.SEER_ACTION: {
            const pool = others(ctx);
            const target = pool.length ? pick(pool) : null;
            return { actionTarget: target, target, speak: target ? `查验 ${target} 号。` : '跳过。' };
        }
        case GamePhase.WITCH_ACTION: {
            // 离线女巫偏保守:解药留给 self-save 或首夜(30% 概率用),毒药 25% 概率随机毒
            const dying = (ctx as FallbackContext & { dyingId?: number | null }).dyingId ?? null;
            const useCure = !!dying && Math.random() < 0.35;
            const pool = others(ctx);
            const poisonTarget = Math.random() < 0.25 && pool.length ? pick(pool) : null;
            return {
                useCure,
                poisonTarget,
                speak: useCure ? '昨晚的刀我用解药了。' : poisonTarget ? '这杯毒药，带走一个。' : '今晚不用药。',
            };
        }
        case GamePhase.GUARD_ACTION: {
            const pool = others(ctx);
            const target = pool.length ? pick(pool) : null;
            return { actionTarget: target, target, speak: target ? `今晚守 ${target} 号。` : '今晚空守。' };
        }
        case GamePhase.HUNTER_ACTION: {
            const pool = (ctx.validTargets?.length ? ctx.validTargets : others(ctx));
            const target = pool.length ? pick(pool) : null;
            return { actionTarget: target, target, speak: '我的枪，带走一个。' };
        }
        default:
            return { speak: '……' };
    }
};

/** 白天/投票决策:返回 target 与 speak */
export const fallbackDecide = (ctx: FallbackContext): FallbackDecision => {
    const isWolf = ctx.wolfTeammates !== undefined;
    const suspect = pickSuspect(ctx);
    const fill = (tpl: string) => tpl
        .replace('{suspect}', String(suspect ?? ''))
        .replace('{check}', String(suspect ?? ''));

    switch (ctx.phase) {
        case GamePhase.VOTING: {
            const pool = (ctx.validTargets?.length ? ctx.validTargets : others(ctx)).filter(id => id !== ctx.player.id);
            let target: number | null = null;
            if (pool.length) {
                // 狼人倾向投好人;好人随机站边
                const goodPool = isWolf ? pool.filter(id => !wolfTeamAlive(ctx).includes(id)) : pool;
                target = pick(goodPool.length ? goodPool : pool);
            }
            return {
                target,
                speak: target ? `我投 ${target} 号，感觉TA的发言有问题。` : '我弃票，这轮信息太少。',
                summary: target ? `投给 ${target} 号` : '弃票',
            };
        }
        case GamePhase.SHERIFF_ELECTION:
            return { target: null, speak: fill(pick(SHERIFF_LINES)), summary: '竞选警长发言' };
        case GamePhase.SHERIFF_VOTING: {
            const pool = (ctx.validTargets?.length ? ctx.validTargets : others(ctx));
            const target = pool.length ? pick(pool) : null;
            return {
                target,
                speak: target ? `警长我投 ${target} 号，TA更值得信任。` : '弃票。',
                summary: target ? `警长票投 ${target} 号` : '弃票',
            };
        }
        case GamePhase.DAY_DISCUSSION:
        case GamePhase.DISCUSSION_ROUND_TWO:
        case GamePhase.LAST_WORDS: {
            const isSeer = ctx.player.role === 'SEER';
            if (ctx.phase === GamePhase.LAST_WORDS) {
                return { target: null, speak: fill(pick(LAST_WORDS_LINES)), summary: '遗言' };
            }
            if (isSeer && Math.random() < 0.5) {
                return { target: null, speak: fill(pick(SEER_CLAIM_LINES)), summary: '声称预言家' };
            }
            const pool = isWolf ? WOLF_DAY_LINES : DAY_LINES;
            return { target: null, speak: fill(pick(pool)), summary: '表态势态' };
        }
        case GamePhase.KNIGHT_CHALLENGE:
        case GamePhase.WOLF_EXPLODE:
            return { target: null, speak: '这场对决，我认输也认命。', summary: '放弃' };
        default:
            return { target: null, speak: '我保留意见。', summary: '保留意见' };
    }
};
