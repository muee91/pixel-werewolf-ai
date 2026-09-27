import { GamePhase } from '../../../types';
import type { PhaseHandlerContext } from '../phaseContext';
import { handleNightStart, handleCupidLink, handleWerewolfAction, handleStoneGhostAction, handleSeerAction, handleGravekeeperAction, handleWitchAction, handleGuardAction, handleDemonHunterAction, handleMerchantAction } from './night';
import { handleDayAnnounce, handleDayDiscussion, handleLastWords, handleKnightChallenge, handleWolfExplode, handleDiscussionRoundTwo } from './day';
import { handleSheriffElection, handleSheriffVoting, handleSheriffWithdraw } from './sheriff';
import { handleVoting, handleHunterAction, handleGameReview } from './votes';

export type PhaseHandler = (ctx: PhaseHandlerContext) => Promise<void>;

// SETUP / GAME_OVER 在原 switch 中无 case（自然落空），no-op 保持同一行为
const handleNoOp = async (_ctx: PhaseHandlerContext) => {};

// GOD-loop 的阶段 → handler 分发表。
// Record<GamePhase, …> 让 tsc 强制每个阶段都有 handler，新增阶段漏注册会在编译期报错。
export const PHASE_HANDLERS: Record<GamePhase, PhaseHandler> = {
    [GamePhase.SETUP]: handleNoOp,

    [GamePhase.NIGHT_START]: handleNightStart,
    [GamePhase.CUPID_LINK]: handleCupidLink,
    [GamePhase.WEREWOLF_ACTION]: handleWerewolfAction,
    [GamePhase.STONE_GHOST_ACTION]: handleStoneGhostAction,
    [GamePhase.SEER_ACTION]: handleSeerAction,
    [GamePhase.GRAVEKEEPER_ACTION]: handleGravekeeperAction,
    [GamePhase.WITCH_ACTION]: handleWitchAction,
    [GamePhase.GUARD_ACTION]: handleGuardAction,
    [GamePhase.DEMON_HUNTER_ACTION]: handleDemonHunterAction,
    [GamePhase.MERCHANT_ACTION]: handleMerchantAction,

    [GamePhase.DAY_ANNOUNCE]: handleDayAnnounce,
    [GamePhase.DAY_DISCUSSION]: handleDayDiscussion,
    [GamePhase.DISCUSSION_ROUND_TWO]: handleDiscussionRoundTwo,
    [GamePhase.LAST_WORDS]: handleLastWords,
    [GamePhase.KNIGHT_CHALLENGE]: handleKnightChallenge,
    [GamePhase.WOLF_EXPLODE]: handleWolfExplode,
    [GamePhase.SHERIFF_ELECTION]: handleSheriffElection,
    [GamePhase.SHERIFF_VOTING]: handleSheriffVoting,
    [GamePhase.SHERIFF_WITHDRAW]: handleSheriffWithdraw,

    [GamePhase.VOTING]: handleVoting,
    [GamePhase.HUNTER_ACTION]: handleHunterAction,

    [GamePhase.GAME_OVER]: handleNoOp,
    [GamePhase.GAME_REVIEW]: handleGameReview,
};
