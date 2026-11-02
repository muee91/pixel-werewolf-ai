/**
 * 夜间决策预取计划：纯函数，供引擎在 NIGHT_START 一次性排程。
 *
 * 为什么只有这几个角色：夜间的依赖关系是明确的。
 * - **狼队**：夜聊是"后一只狼听得到前一只狼"的共识过程，必须串行，不能预取；
 * - **女巫**：她的提示词里带着"今晚谁被刀"（godState.wolfTarget），必须等狼队落刀之后才能问，
 *   否则等于让她在刀口定下来之前先表态 —— 这是会被玩家看出来的逻辑错误；
 * - 其余神职（丘比特/石像鬼/预言家/守墓人/守卫/猎魔人/奇迹商人）的决策互不依赖，
 *   也不依赖刀口，各自只读自己的已知信息与公开日志，可以全部提前并发发起。
 *
 * 预取只改变提问时刻，不改变阶段顺序：每个阶段照旧在自己的 tick 里"睁眼、取答案、闭眼"。
 */
import { GamePhase, Role, type GameRules, type GodState, type Player } from '../../types';
import { isEffectivelyAlive } from '../../game/rules';

export interface NightPrefetchEntry {
    playerId: number;
    seatNumber: number;
    role: Role;
    phase: GamePhase;
    instruction: string;
}

type RuleGetter = <K extends keyof GameRules>(key: K) => GameRules[K];

/**
 * 夜间行动指令的唯一文案来源：预取与执行必须下发同一句话。
 * 预取 key 含指令文本（见 prefetchKey），文案一旦分叉就会变成"预取了却对不上、白白多打一次"。
 */
export const nightActionInstruction = (params: {
    role: Role;
    getRule: RuleGetter;
    lastExiledPlayerId?: number | null;
}): string | undefined => {
    const { role, getRule, lastExiledPlayerId } = params;
    switch (role) {
        case Role.CUPID:
            return '请选择两名玩家连结为情侣。';
        case Role.STONE_GHOST:
            return '请选择查验对象，你将得知对方的具体身份。';
        case Role.SEER:
            return '请选择查验对象。';
        case Role.GRAVEKEEPER:
            return lastExiledPlayerId
                ? `查验上一轮被放逐玩家（${lastExiledPlayerId}号）的身份。`
                : undefined;
        case Role.GUARD:
            return getRule('guardCannotSameTarget')
                ? '请选择今晚守护对象。不能连续两晚守护同一名玩家。'
                : '请选择今晚守护对象。';
        case Role.DEMON_HUNTER:
            return '选择一名玩家猎杀。若对方是狼人则对方死亡；若对方是好人则你自己死亡。';
        case Role.MIRACLE_MERCHANT:
            return '选择一名玩家发放技能。';
        default:
            return undefined;
    }
};

export const buildNightPrefetchPlan = (params: {
    players: Player[];
    // 只读这几个字段：它们在 NIGHT_START 的重置里都会被保留或已在白天结束时清掉，
    // 因此用重置前的 godState 计算与用重置后计算等价（预取发生在同一 tick 的重置之后）。
    godState: Pick<GodState, 'lovers' | 'lastExiledPlayerId' | 'bloodMoonSealed'>;
    turnCount: number;
    getRule: RuleGetter;
}): NightPrefetchEntry[] => {
    const { players, godState, turnCount, getRule } = params;
    const entries: NightPrefetchEntry[] = [];

    const push = (role: Role, phase: GamePhase) => {
        const player = players.find(p => p.role === role && isEffectivelyAlive(p));
        if (!player) return;
        const instruction = nightActionInstruction({
            role,
            getRule,
            lastExiledPlayerId: godState.lastExiledPlayerId,
        });
        if (!instruction) return;
        entries.push({ playerId: player.id, seatNumber: player.seatNumber, role, phase, instruction });
    };

    // 顺序刻意与夜间实际推进顺序一致：并发槽位有限时，先排的先进场。
    if (turnCount === 1 && getRule('cupidLinkLovers') && !godState.lovers) {
        push(Role.CUPID, GamePhase.CUPID_LINK);
    }
    if (getRule('stoneGhostCheckIdentity')) {
        push(Role.STONE_GHOST, GamePhase.STONE_GHOST_ACTION);
    }
    // 血月封印当夜所有神职技能作废：这几个阶段只会播报"无法行动"，预取等于白烧额度
    if (!godState.bloodMoonSealed) {
        push(Role.SEER, GamePhase.SEER_ACTION);
        if (godState.lastExiledPlayerId) {
            push(Role.GRAVEKEEPER, GamePhase.GRAVEKEEPER_ACTION);
        }
        push(Role.GUARD, GamePhase.GUARD_ACTION);
        push(Role.DEMON_HUNTER, GamePhase.DEMON_HUNTER_ACTION);
        push(Role.MIRACLE_MERCHANT, GamePhase.MERCHANT_ACTION);
    }

    return entries;
};
