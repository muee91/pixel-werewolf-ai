/**
 * 阶段分类：哪些阶段的内容是"所有人当场就能看到/听到"的。
 *
 * 为什么单独一个模块：这套判断同时被提示词层（要带哪些历史）和 UI 层（字幕能不能上屏）用。
 * 两边各写一份，早晚会漂移——漂移的后果是"提示词里算公开、字幕里当私聊"，或者反过来把私聊投上屏。
 */

import { GamePhase } from '../types';

/** 当场产生公开发言的阶段（本阶段的历史就是大家刚说的话） */
export const isPublicSpeechPhase = (phase: GamePhase): boolean => (
    phase === GamePhase.DAY_DISCUSSION ||
    phase === GamePhase.SHERIFF_ELECTION ||
    phase === GamePhase.LAST_WORDS ||
    phase === GamePhase.DAY_ANNOUNCE ||
    phase === GamePhase.DISCUSSION_ROUND_TWO
);

/**
 * 需要"当天公开发言"作为决策依据的阶段：这些阶段本身不产生公开发言，
 * 若只喂本回合同阶段日志，提示词里的发言记录会恒为空，AI 就成了盲投/盲枪。
 */
export const DECISION_PHASES_NEEDING_PUBLIC_TRANSCRIPT = new Set<GamePhase>([
    GamePhase.VOTING,
    GamePhase.SHERIFF_VOTING,
    // 退水：规则上是"听完所有竞选发言后决定要不要退"
    GamePhase.SHERIFF_WITHDRAW,
    GamePhase.HUNTER_ACTION,
    GamePhase.DEMON_HUNTER_ACTION,
    GamePhase.KNIGHT_CHALLENGE,
    GamePhase.WOLF_EXPLODE,
]);

/**
 * 决策过程可以公开显示"某座位正在决策"的阶段。
 *
 * 判据不是"这个阶段有没有模型调用"，而是**这个动作本身是不是当着所有人的面做的**：
 * 投票、退水、开枪、决斗、自爆都是公开动作，显示"07 号正在决策"不泄露任何信息。
 * 夜间行动一律不在其中——那会直接告诉人类玩家"3 号是神职或狼"，等于泄底。
 */
export const isPublicDecisionPhase = (phase: GamePhase): boolean => (
    phase === GamePhase.VOTING ||
    phase === GamePhase.SHERIFF_VOTING ||
    phase === GamePhase.SHERIFF_WITHDRAW ||
    phase === GamePhase.HUNTER_ACTION ||
    phase === GamePhase.DEMON_HUNTER_ACTION ||
    phase === GamePhase.KNIGHT_CHALLENGE ||
    phase === GamePhase.WOLF_EXPLODE
);
