import { GamePhase } from '../types';

/** 结算阶段里会被挑进「名场面」的关键阶段：这些阶段的发言自带戏剧性(开枪/自爆/决斗/遗言) */
const DRAMATIC_PHASES: GamePhase[] = [
    GamePhase.HUNTER_ACTION,
    GamePhase.WOLF_EXPLODE,
    GamePhase.KNIGHT_CHALLENGE,
    GamePhase.LAST_WORDS,
];

type HighlightLog = {
    id: string;
    content?: string;
    phase: GamePhase;
    isSystem?: boolean;
};

/**
 * 结算「本局名场面」：关键阶段的真实发言 + 最后一条结算陈词。
 *
 * 抽成纯函数是因为 2D 营地结算卡与 3D 冒险结算面板要显示同一批条目——
 * 两处各写一遍迟早会走形（上一轮就出现过只有 2D 能看到名场面）。
 */
export const buildHighlights = <T extends HighlightLog>(logs: readonly T[], phase: GamePhase, maxDramatic = 4): T[] => {
    if (phase !== GamePhase.GAME_REVIEW && phase !== GamePhase.GAME_OVER) return [];
    const dramatic = logs.filter(log =>
        !log.isSystem &&
        DRAMATIC_PHASES.includes(log.phase) &&
        !!log.content?.trim(),
    );
    const finale = logs.filter(log => log.phase === GamePhase.GAME_REVIEW).slice(-1);
    return [...dramatic.slice(-maxDramatic), ...finale];
};
