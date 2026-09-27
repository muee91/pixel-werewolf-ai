import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import {
    playersAtom,
    currentSpeakerIdAtom,
    gamePhaseAtom,
    userInputAtom,
    humanInputResolverMapAtom,
    godStateAtom,
    isReplayModeAtom,
    isTheaterModeAtom,
    logsAtom,
    turnCountAtom,
    gameConfigAtom,
    actorProfilesAtom,
    llmPresetsAtom,
    llmProvidersAtom,
    humanInputPanelExpandedAtom,
    multiplayerRoleAtom,
    multiplayerStateAtom,
    actionAckStateAtom,
} from '../store';

// MC 原版对话框语言:灰石面板 + 斜面浮雕(左上白高光/右下暗影) + 凹陷文字井
const MC_PANEL_STYLE: React.CSSProperties = {
    background: '#c6c6c6',
    borderColor: '#000000',
    boxShadow: 'inset 3px 3px 0 #ffffff, inset -3px -3px 0 #555555, 6px 6px 0 rgba(0,0,0,0.45)',
};
const MC_BTN = "border-2 px-4 py-2 text-sm font-black transition-all shadow-[inset_2px_2px_0_#ffffff,inset_-2px_-2px_0_#555555] hover:brightness-110 active:shadow-[inset_2px_2px_0_#555555,inset_-2px_-2px_0_#ffffff]";
const MC_FIELD_STYLE: React.CSSProperties = {
    background: '#181818',
    color: '#f2dfaa',
    borderColor: '#000000',
    boxShadow: 'inset 2px 2px 0 #3a3a3a, inset -2px -2px 0 #6e6e6e',
};

interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
    error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

interface SpeechRecognitionResultList {
    length: number;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}



import { GamePhase, PlayerStatus, Role, ROLE_INFO, Player, GameLog, GodState, isImmuneToVote, WOLF_ROLES, isWolfRole, UserInput } from '../types';
import { werewolfSkillInstance } from '../services/skills/werewolf/WerewolfSkill';
import { generateText, parseLLMResponse } from '../services/llm';
import { isSheriffElectionEnabled } from '../game/rules';
import { remoteServerConfigAtom } from '../atoms';
import { sendWsMessage } from '../multiplayer/wsClient';
import { HUMAN_INPUT_TIMEOUT_MS } from '../multiplayer/constants';
import { createPlayerActionEnvelope } from '../multiplayer/protocol';
import {
    createAdvisorRequestMessage,
    createPlayerActionMessage,
} from '../multiplayer/clientMessages';
import { worldTargetAtom, resolveWorldTargetSelection } from './game/voxel3d/worldTarget';

let multiplayerActionSequence = Date.now() * 1000;
const nextMultiplayerActionSequence = () => ++multiplayerActionSequence;

const canHumanKnowRole = (viewer: Player, target: Player) => (
    target.id === viewer.id || (WOLF_ROLES.includes(viewer.role) && WOLF_ROLES.includes(target.role))
);

const maskPlayerForViewer = (viewer: Player, target: Player): Player => {
    if (canHumanKnowRole(viewer, target)) return target;

    return {
        ...target,
        role: Role.VILLAGER,
        potions: undefined,
        rolePrompt: ''
    };
};

const isLogVisibleToHuman = (log: GameLog, viewer: Player) => {
    if (log.debugType) return false;
    return !log.visibleTo || log.visibleTo.includes(viewer.id);
};


const buildAdvisorGodState = (phase: GamePhase, viewer: Player, godState: GodState): Partial<GodState> => {
    const base: Partial<GodState> = {
        deathsTonight: [],
        sheriffId: godState.sheriffId ?? null,
        sheriffCandidates: godState.sheriffCandidates ?? [],
        sheriffElectionDone: godState.sheriffElectionDone,
        sheriffVoteRound: godState.sheriffVoteRound,
        sheriffTieCandidates: godState.sheriffTieCandidates ?? [],
        bloodMoonSealed: godState.bloodMoonSealed,
    };

    if (viewer.role === Role.SEER) {
        base.seerCheck = godState.seerCheck;
    }
    if (viewer.role === Role.WITCH) {
        base.wolfTarget = phase === GamePhase.WITCH_ACTION ? godState.wolfTarget : null;
        base.witchSave = godState.witchSave;
        base.witchPoison = godState.witchPoison;
    }
    if (viewer.role === Role.GUARD) {
        base.guardProtect = godState.guardProtect;
        base.lastGuardProtect = godState.lastGuardProtect ?? null;
        base.merchantGuardProtect = godState.merchantGuardProtect;
    }
    if (isWolfRole(viewer.role)) {
        base.wolfTarget = godState.wolfTarget;
        base.wolfExplodeTarget = godState.wolfExplodeTarget;
    }
    if (viewer.role === Role.CUPID) {
        base.lovers = godState.lovers;
        base.cupidIsThirdParty = godState.cupidIsThirdParty;
    }
    if (viewer.role === Role.KNIGHT) {
        base.knightChallenged = godState.knightChallenged;
        base.knightChallengeTarget = godState.knightChallengeTarget;
    }
    if (viewer.role === Role.DEMON_HUNTER) {
        base.demonHunterKills = godState.demonHunterKills;
    }
    if (viewer.role === Role.GRAVEKEEPER) {
        base.lastExiledPlayerId = godState.lastExiledPlayerId;
    }
    if (viewer.role === Role.MIRACLE_MERCHANT) {
        base.merchantSkillTarget = godState.merchantSkillTarget;
        base.merchantSkillType = godState.merchantSkillType;
        base.merchantSkillUsed = godState.merchantSkillUsed;
    }
    if (godState.lovers && godState.lovers.includes(viewer.id) && viewer.role !== Role.CUPID) {
        base.lovers = godState.lovers;
        base.cupidIsThirdParty = godState.cupidIsThirdParty;
    }
    if (godState.merchantSkillTarget === viewer.id && !godState.merchantSkillUsed) {
        base.merchantSkillTarget = godState.merchantSkillTarget;
        base.merchantSkillType = godState.merchantSkillType;
        base.merchantSkillUsed = godState.merchantSkillUsed;
    }

    return base;
};

const HumanInputPanel = () => {
    const players = useAtomValue(playersAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const godState = useAtomValue(godStateAtom);
    const [, setUserInput] = useAtom(userInputAtom);
    const humanInputResolverMap = useAtomValue(humanInputResolverMapAtom);
    const isReplayMode = useAtomValue(isReplayModeAtom);
    const isTheaterMode = useAtomValue(isTheaterModeAtom);
    const logs = useAtomValue(logsAtom);
    const turnCount = useAtomValue(turnCountAtom);
    const gameConfig = useAtomValue(gameConfigAtom);
    const actorProfiles = useAtomValue(actorProfilesAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const [isExpanded, setIsExpanded] = useAtom(humanInputPanelExpandedAtom);
    const multiplayerRole = useAtomValue(multiplayerRoleAtom);
    const multiplayerState = useAtomValue(multiplayerStateAtom);
    const isGuest = multiplayerRole === 'guest';
    const [actionAckState, setActionAckState] = useAtom(actionAckStateAtom);
    const [worldTarget, setWorldTarget] = useAtom(worldTargetAtom);

    const humanPlayer = players.find(p => p.isHuman);
    const hasMerchantSkill = !!humanPlayer
        && godState.merchantSkillTarget === humanPlayer.id
        && !godState.merchantSkillUsed
        && !godState.bloodMoonSealed;
    const hasMerchantCheckSkill = hasMerchantSkill && godState.merchantSkillType === 'check';
    const hasMerchantPoisonSkill = hasMerchantSkill && godState.merchantSkillType === 'poison';
    const hasMerchantGuardSkill = hasMerchantSkill && godState.merchantSkillType === 'guard';
    // 投票是全员并发的：引擎同时等待多名人类，currentSpeakerId 只指向最后
    // 登记者；这两个阶段下面板按"阶段+身份"可见，而不是按发言位
    const isConcurrentVotePhase = phase === GamePhase.VOTING || phase === GamePhase.SHERIFF_VOTING;
    // 死亡玩家除猎人/狼王死亡技能外不得行动;投票类阶段必须活着(白痴翻牌由 isImmuneToVote 剔除)
    const isAliveHuman = humanPlayer?.status === PlayerStatus.ALIVE;
    const canActInPhase = !!humanPlayer && (
        (isAliveHuman && (
            phase === GamePhase.DAY_DISCUSSION ||
            phase === GamePhase.DISCUSSION_ROUND_TWO ||
            phase === GamePhase.SHERIFF_ELECTION ||
            phase === GamePhase.SHERIFF_VOTING ||
            phase === GamePhase.SHERIFF_WITHDRAW ||
            (phase === GamePhase.VOTING && !isImmuneToVote(humanPlayer))
        )) ||
        phase === GamePhase.LAST_WORDS ||
        phase === GamePhase.HUNTER_ACTION ||
        (phase === GamePhase.WEREWOLF_ACTION && WOLF_ROLES.includes(humanPlayer.role)) ||
        (phase === GamePhase.SEER_ACTION && (humanPlayer.role === Role.SEER || hasMerchantCheckSkill)) ||
        (phase === GamePhase.WITCH_ACTION && (humanPlayer.role === Role.WITCH || hasMerchantPoisonSkill)) ||
        (phase === GamePhase.GUARD_ACTION && (humanPlayer.role === Role.GUARD || hasMerchantGuardSkill)) ||
        (phase === GamePhase.KNIGHT_CHALLENGE && humanPlayer.role === Role.KNIGHT) ||
        (phase === GamePhase.WOLF_EXPLODE && WOLF_ROLES.includes(humanPlayer.role)) ||
        (phase === GamePhase.STONE_GHOST_ACTION && humanPlayer.role === Role.STONE_GHOST) ||
        (phase === GamePhase.GRAVEKEEPER_ACTION && humanPlayer.role === Role.GRAVEKEEPER) ||
        (phase === GamePhase.DEMON_HUNTER_ACTION && humanPlayer.role === Role.DEMON_HUNTER) ||
        (phase === GamePhase.CUPID_LINK && humanPlayer.role === Role.CUPID) ||
        (phase === GamePhase.MERCHANT_ACTION && humanPlayer.role === Role.MIRACLE_MERCHANT)
    );
    // 面板可见性：轮到本人发言；或并发投票阶段且本人存活（按阶段+身份可见）；
    // 或引擎已在等待本人输入（resolver 已登记,含死亡技能）
    const isMyTurn = !!humanPlayer && (
        currentSpeakerId === humanPlayer.id ||
        (isConcurrentVotePhase && isAliveHuman && canActInPhase) ||
        humanInputResolverMap[humanPlayer.id] != null
    );

    const advisorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 联机座位等待倒计时:引擎会在 HUMAN_INPUT_TIMEOUT_MS 后转 AI 托管,这里同步显示剩余秒数
    const [waitCountdown, setWaitCountdown] = useState<number | null>(null);
    const isMultiplayerSeat = !!humanPlayer?.roomPlayerId;
    useEffect(() => {
        if (!isMyTurn || !isMultiplayerSeat) {
            setWaitCountdown(null);
            return;
        }
        setWaitCountdown(Math.round(HUMAN_INPUT_TIMEOUT_MS / 1000));
        const timer = window.setInterval(() => {
            setWaitCountdown(v => (v == null ? null : Math.max(0, v - 1)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [isMyTurn, isMultiplayerSeat, humanPlayer?.roomPlayerId, humanPlayer?.id, phase, turnCount]);

    const [text, setText] = useState('');
    const [targetId, setTargetId] = useState<number | null>(null);
    const [cupidTarget1, setCupidTarget1] = useState<number | null>(null);
    const [cupidTarget2, setCupidTarget2] = useState<number | null>(null);
    const [merchantSkillType, setMerchantSkillType] = useState<'check' | 'poison' | 'guard' | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [speechError, setSpeechError] = useState('');
    const [advisorLoading, setAdvisorLoading] = useState(false);
    const [advisorError, setAdvisorError] = useState('');
    const [advisorDebugData, setAdvisorDebugData] = useState<UserInput['_advisorDebugData']>(undefined);
    const [shouldWithdraw, setShouldWithdraw] = useState(false);
    // 人类狼"退水并自爆"选项（引擎退水路径已支持读取 shouldExplode）
    const [withdrawExplode, setWithdrawExplode] = useState(false);
    const isHumanWolf = !!humanPlayer && WOLF_ROLES.includes(humanPlayer.role);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (isMyTurn) {
            setText('');
            setTargetId(null);
            setCupidTarget1(null);
            setCupidTarget2(null);
            setMerchantSkillType(null);
            setSpeechError('');
            setAdvisorError('');
            setAdvisorDebugData(undefined);
            setShouldWithdraw(false);
            setWithdrawExplode(false);
            setIsExpanded(true);
        }
    }, [isMyTurn, phase, setIsExpanded]);

    useEffect(() => {
        return () => {
            recognitionRef.current?.abort?.();
            recognitionRef.current = null;
            if (advisorTimeoutRef.current) {
                clearTimeout(advisorTimeoutRef.current);
                advisorTimeoutRef.current = null;
            }
        };
    }, []);

    const isEffectivelyAlive = (p: Player) => p.status === PlayerStatus.ALIVE || p.status === PlayerStatus.IDIOT_REVEALED;
    const aliveEveryone = players.filter(isEffectivelyAlive);
    const isVoting = phase === GamePhase.VOTING;
    const isSheriffVoting = phase === GamePhase.SHERIFF_VOTING;
    const isWitchAction = phase === GamePhase.WITCH_ACTION;
    const isGuardAction = phase === GamePhase.GUARD_ACTION;
    const isKnightChallenge = phase === GamePhase.KNIGHT_CHALLENGE;
    const isWolfExplode = phase === GamePhase.WOLF_EXPLODE;
    const isCupidLink = phase === GamePhase.CUPID_LINK;
    const isMerchantAction = phase === GamePhase.MERCHANT_ACTION;
    const isDemonHunterAction = phase === GamePhase.DEMON_HUNTER_ACTION;
    const isStoneGhostAction = phase === GamePhase.STONE_GHOST_ACTION;
    const isHunterAction = phase === GamePhase.HUNTER_ACTION;
    const canSpeakInPhase = [
        GamePhase.DAY_DISCUSSION,
        GamePhase.DISCUSSION_ROUND_TWO,
        GamePhase.LAST_WORDS,
        GamePhase.SHERIFF_ELECTION,
        GamePhase.WEREWOLF_ACTION,
        GamePhase.HUNTER_ACTION
    ].includes(phase);
    const witchCanCure = !!humanPlayer?.potions?.cure
        && !!godState.wolfTarget
        && (gameConfig.rules.witchSelfSave === true || gameConfig.rules.witchSelfSave === 'FIRST_NIGHT' && turnCount === 1 || godState.wolfTarget !== humanPlayer?.id);
    const witchCanPoison = !!humanPlayer?.potions?.poison;
    const sheriffCandidateIds = godState.sheriffCandidates ?? [];
    // 平票PK轮：只能投平票候选人，不允许弃票（与引擎强制改投口径一致）
    const exileTieCandidateIds = godState.voteTieCandidates ?? [];
    const isExilePkVoting = isVoting && exileTieCandidateIds.length > 0;
    const targetCandidates = isSheriffVoting
        ? aliveEveryone.filter(p => sheriffCandidateIds.includes(p.id))
        : isVoting
            ? aliveEveryone.filter(p => !isImmuneToVote(p) && (!isExilePkVoting || exileTieCandidateIds.includes(p.id)))
            : isKnightChallenge
                ? aliveEveryone.filter(p => p.id !== humanPlayer?.id)
                : isDemonHunterAction
                ? aliveEveryone.filter(p => p.id !== humanPlayer?.id)
                : isHunterAction
                    ? aliveEveryone.filter(p => p.id !== humanPlayer?.id)
                : isStoneGhostAction
                    ? aliveEveryone.filter(p => p.id !== humanPlayer?.id)
                    : phase === GamePhase.SEER_ACTION
                        ? aliveEveryone.filter(p => p.id !== humanPlayer?.id)
                        : isCupidLink
                            ? aliveEveryone
                            : isMerchantAction
                                ? aliveEveryone.filter(p => p.id !== humanPlayer?.id)
                                : aliveEveryone.filter(p => !isGuardAction || !gameConfig.rules.guardCannotSameTarget || p.id !== godState.lastGuardProtect);

    let instruction = "";
    if (phase === GamePhase.WITCH_ACTION) {
        const dyingId = godState.wolfTarget;
        // 用药受限时把原因讲清楚（此前只有 AI 会收到拒绝解释，人类只能瞎猜）
        let witchDenyHint = '';
        if (dyingId === humanPlayer?.id && !witchCanCure) {
            witchDenyHint = !humanPlayer?.potions?.cure ? '（解药已用尽）'
                : gameConfig.rules.witchSelfSave === false ? '（规则限制：不可自救）'
                : gameConfig.rules.witchSelfSave === 'FIRST_NIGHT' && turnCount !== 1 ? '（规则限制：仅首夜可自救）'
                : '（当前无法使用解药）';
        }
        instruction = hasMerchantPoisonSkill
            ? "你获得了奇迹商人发放的一次性毒药技能。请选择一名玩家毒杀，或跳过。"
            : dyingId ? `昨晚 ${dyingId} 号玩家被刀。${witchDenyHint}` : "昨晚无人被杀。";
    } else if (phase === GamePhase.SEER_ACTION) {
        instruction = hasMerchantCheckSkill ? "你获得了奇迹商人发放的一次性查验技能。请选择一名玩家查验其阵营。" : "请选择查验一名玩家。";
    } else if (phase === GamePhase.WEREWOLF_ACTION) {
        instruction = "与队友沟通并决定目标。";
    } else if (phase === GamePhase.VOTING) {
        instruction = godState.sheriffId ? `请投出你的一票。警长 ${godState.sheriffId} 号放逐票权重为 1.5。` : "请投出你的一票。";
    } else if (phase === GamePhase.SHERIFF_ELECTION) {
        instruction = "请发表警长竞选发言。";
    } else if (phase === GamePhase.SHERIFF_VOTING) {
        instruction = `请在警长候选人中投票：${targetCandidates.map(p => `${p.id}号`).join('、') || '暂无候选人'}。`;
    } else if (phase === GamePhase.SHERIFF_WITHDRAW) {
        instruction = isHumanWolf && gameConfig.rules.wolfExplodeEnabled
            ? "竞选者可选择退水；狼人也可以选择退水并自爆。"
            : "竞选者可选择退水，放弃竞选警长。";
    } else if (phase === GamePhase.GUARD_ACTION) {
        instruction = hasMerchantGuardSkill
            ? "你获得了奇迹商人发放的一次性守护技能。请选择一名玩家守护，或跳过。"
            : godState.lastGuardProtect
                ? `请选择今晚守护对象。（不能连续守护 ${godState.lastGuardProtect} 号）可跳过守护。`
                : "请选择今晚守护对象，或跳过本轮守护。";
    } else if (phase === GamePhase.KNIGHT_CHALLENGE) {
        instruction = "选择一名玩家发起决斗。若对方是狼人则对方死亡，否则你自己死亡。跳过不消耗机会，明日清晨仍可再次决斗（整局限决斗一次）。";
    } else if (phase === GamePhase.WOLF_EXPLODE) {
        instruction = "选择是否自爆。自爆后可指刀一名玩家。";
    } else if (phase === GamePhase.STONE_GHOST_ACTION) {
        instruction = "请选择查验一名玩家的身份。";
    } else if (phase === GamePhase.GRAVEKEEPER_ACTION) {
        instruction = "守墓人自动查验昨夜被放逐玩家的身份，无需操作。";
    } else if (phase === GamePhase.HUNTER_ACTION) {
        instruction = "你已出局。可选择开枪带走一人，或选择「弃权/不操作」压枪；也可在输入框留下遗言。";
    } else if (phase === GamePhase.DEMON_HUNTER_ACTION) {
        instruction = "请选择一名玩家进行猎杀。";
    } else if (phase === GamePhase.CUPID_LINK) {
        instruction = "请选择两名玩家连结为情侣。情侣一方死亡时另一方殉情。";
    } else if (phase === GamePhase.MERCHANT_ACTION) {
        instruction = "请选择一名玩家发放技能，并选择技能类型。";
    } else if (phase === GamePhase.DISCUSSION_ROUND_TWO) {
        instruction = "第二轮讨论，请发言。";
    }

    const needsTarget = [
        GamePhase.VOTING,
        GamePhase.SHERIFF_VOTING,
        GamePhase.WEREWOLF_ACTION,
        GamePhase.SEER_ACTION,
        GamePhase.WITCH_ACTION,
        GamePhase.HUNTER_ACTION,
        GamePhase.GUARD_ACTION,
        GamePhase.KNIGHT_CHALLENGE,
        GamePhase.WOLF_EXPLODE,
        GamePhase.STONE_GHOST_ACTION,
        GamePhase.DEMON_HUNTER_ACTION,
        GamePhase.MERCHANT_ACTION
    ].includes(phase);

    const needsCupidLink = phase === GamePhase.CUPID_LINK;
    const needsMerchantSkill = phase === GamePhase.MERCHANT_ACTION;
    const targetCandidateSignature = targetCandidates.map(candidate => candidate.id).join(',');

    // A 3D world click is only a pre-selection. The existing HumanInputPanel
    // remains the sole submit path and revalidates the target for this exact turn.
    useEffect(() => {
        if (worldTarget === null) return;
        if (!isMyTurn || !needsTarget) {
            setWorldTarget(null);
            return;
        }
        const resolved = resolveWorldTargetSelection(
            worldTarget,
            targetCandidates.map(candidate => candidate.id)
        );
        if (resolved === null) {
            setWorldTarget(null);
            return;
        }
        setTargetId(resolved);
    }, [currentSpeakerId, isMyTurn, needsTarget, phase, setWorldTarget, targetCandidateSignature, worldTarget]);

    useEffect(() => {
        if (!isGuest) return;
        const handler = (e: Event) => {
            if (advisorTimeoutRef.current) {
                clearTimeout(advisorTimeoutRef.current);
                advisorTimeoutRef.current = null;
            }
            setAdvisorLoading(false);
            const detail = (e as CustomEvent).detail;
            if (!detail) {
                setAdvisorError('AI建议结果为空');
                return;
            }
            if (detail.error) {
                setAdvisorError(detail.error);
                return;
            }
            setAdvisorDebugData({
                rawResult: detail,
                rawResponse: '',
                promptContext: { phase, turnCount, visibleTo: undefined, actionInstruction: '' },
                durationMs: 0,
                modelName: detail.modelName || '',
                strategySummary: detail.strategySummary || ''
            });
            const suggestedText = String(detail.speak || '').trim();
            if (suggestedText) setText(suggestedText);
            if (phase === GamePhase.WITCH_ACTION) {
                if (detail.useCure && witchCanCure) {
                    setTargetId(0);
                } else if (typeof detail.poisonTarget === 'number' && targetCandidates.some(p => p.id === detail.poisonTarget)) {
                    setTargetId(detail.poisonTarget);
                } else if (detail.poisonTarget === null) {
                    setTargetId(null);
                }
            } else if (needsTarget && typeof detail.actionTarget === 'number' && targetCandidates.some(p => p.id === detail.actionTarget)) {
                setTargetId(detail.actionTarget);
            } else if (needsTarget && detail.actionTarget === null) {
                setTargetId(null);
            }
            if (!suggestedText && !('actionTarget' in detail) && !('useCure' in detail) && !('poisonTarget' in detail)) {
                setAdvisorError('军师没有生成有效建议，请稍后重试。');
            }
        };
        window.addEventListener('advisor-result', handler);
        return () => window.removeEventListener('advisor-result', handler);
    }, [isGuest, phase, turnCount, witchCanCure, needsTarget, targetCandidates]);

    if (!isMyTurn || !canActInPhase || !humanPlayer || isReplayMode || isTheaterMode) return null;

    const handleSubmit = () => {
        if (isVoting && targetId === null) {
            if (isExilePkVoting) {
                alert("平票PK轮不允许弃票，请选择一名平票候选人。");
                return;
            }
            if (!confirm("确定弃票吗？")) return;
        }

        if (isWitchAction) {
            if (targetId === 0 && !witchCanCure) {
                alert("当前不能使用解药。");
                return;
            }
            if (targetId !== null && targetId !== 0 && !witchCanPoison) {
                alert("当前不能使用毒药。");
                return;
            }
        }

        if (isCupidLink) {
            if (cupidTarget1 === null || cupidTarget2 === null) {
                alert("请选择两名玩家进行连结。");
                return;
            }
            if (cupidTarget1 === cupidTarget2) {
                alert("不能选择同一名玩家。");
                return;
            }
        }

        if (isMerchantAction && merchantSkillType === null && targetId !== null) {
            alert("请选择技能类型。");
            return;
        }

        // 不可逆的高代价操作统一二次确认（弃票可反悔性最高却有 confirm，方向不能反）
        const lethalConfirms: string[] = [];
        if (isKnightChallenge && targetId !== null) {
            lethalConfirms.push(`你将与 ${targetId}号 决斗：若对方不是狼人，你将当场出局。确认发起决斗？`);
        }
        if (isHunterAction && targetId !== null) {
            lethalConfirms.push(`开枪带走 ${targetId}号 后不可撤销。确认开枪？`);
        }
        if (isWitchAction && witchCanPoison && targetId !== null && targetId !== 0) {
            lethalConfirms.push(`对 ${targetId}号 使用毒药不可撤销。确认用毒？`);
        }
        if (isWolfExplode && targetId !== null) {
            lethalConfirms.push(`自爆将立即出局并指刀 ${targetId}号。确认自爆？`);
        }
        if (phase === GamePhase.SHERIFF_WITHDRAW && withdrawExplode) {
            lethalConfirms.push(`退水并自爆将立即出局${gameConfig.rules.doubleExplodeSwallowBadge ? '并触发警徽流失' : ''}。确认自爆？`);
        }
        if (isMerchantAction && merchantSkillType !== null && targetId !== null) {
            lethalConfirms.push(`把「${merchantSkillType === 'check' ? '查验' : merchantSkillType === 'poison' ? '毒药' : '守护'}」技能交给 ${targetId}号？若对方是狼人你将出局。确认发放？`);
        }
        for (const message of lethalConfirms) {
            if (!confirm(message)) return;
        }

        if (canSpeakInPhase && !text.trim()) {
            alert("请先输入发言。");
            return;
        }

        const input: UserInput = {
            speak: text || (isVoting || isSheriffVoting ? "投票" : ""),
            actionTarget: targetId,
            target: targetId,
            action: isWolfExplode ? (targetId !== null ? 'explode' : 'skip') : phase === GamePhase.SHERIFF_WITHDRAW ? (shouldWithdraw ? 'withdraw' : 'stay') : undefined,
            shouldExplode: isWolfExplode ? targetId !== null : phase === GamePhase.SHERIFF_WITHDRAW ? withdrawExplode : undefined,
            shouldWithdraw: phase === GamePhase.SHERIFF_WITHDRAW ? shouldWithdraw : undefined,
            useCure: isWitchAction && targetId === 0 && witchCanCure,
            poisonTarget: isWitchAction && witchCanPoison && targetId !== 0 && targetId !== null ? targetId : null,
            target1: isCupidLink ? cupidTarget1 : undefined,
            target2: isCupidLink ? cupidTarget2 : undefined,
            cupidTarget1: isCupidLink ? cupidTarget1 : undefined,
            cupidTarget2: isCupidLink ? cupidTarget2 : undefined,
            skillType: isMerchantAction ? merchantSkillType : undefined,
            merchantSkillType: isMerchantAction ? merchantSkillType : undefined,
            wolfExplode: isWolfExplode ? targetId !== null : undefined,
            explodeTarget: isWolfExplode && targetId !== null ? targetId : undefined,
            _advisorDebugData: advisorDebugData
        };
        if (humanPlayer && humanInputResolverMap[humanPlayer.id]) {
            humanInputResolverMap[humanPlayer.id](input);
        } else if (isGuest && multiplayerState.roomId && multiplayerState.playerId) {
            setActionAckState({ pending: true, actionType: input.action || phase, success: null, timestamp: Date.now() });
            const envelope = createPlayerActionEnvelope(nextMultiplayerActionSequence);
            const sent = sendWsMessage(createPlayerActionMessage(envelope, input));
            if (!sent) {
                setActionAckState({ pending: false, actionType: input.action || phase, success: false, timestamp: Date.now() });
                alert('行动没有送达房主，请检查连接后重试。');
                return;
            }
        } else {
            // 引擎尚未登记 resolver 的竞态兜底：带上归属玩家，引擎登记后按 _playerId 认领
            setUserInput(humanPlayer ? { ...input, _playerId: humanPlayer.id } : input);
        }
        setIsExpanded(false);
    };

    const handleAdvisorSuggestion = async () => {
        if (!humanPlayer || advisorLoading) return;

        setAdvisorLoading(true);
        setAdvisorError('');
        const advisorStartTime = Date.now();

        try {
            if (isGuest && multiplayerState.roomId && multiplayerState.playerId) {
                const requestPayload = {
                    seatNumber: humanPlayer.seatNumber,
                    phase,
                    turnCount,
                    gameConfig: {
                        roles: gameConfig.roles,
                        rules: gameConfig.rules,
                        sheriffEnabled: isSheriffElectionEnabled(gameConfig),
                    },
                    instruction: instruction || '',
                };
                const sent = sendWsMessage(createAdvisorRequestMessage(requestPayload));
                if (!sent) {
                    setAdvisorError('AI建议请求未送达房主，请检查连接后重试。');
                    setAdvisorLoading(false);
                    return;
                }
                if (advisorTimeoutRef.current) clearTimeout(advisorTimeoutRef.current);
                advisorTimeoutRef.current = setTimeout(() => {
                    setAdvisorLoading(false);
                    setAdvisorError('AI建议请求超时，请重试。');
                }, 30000);
                return;
            }

            const actor = actorProfiles.find(a => a.id === humanPlayer.actorId) || actorProfiles[0];
            const llm = llmPresets.find(p => p.id === actor?.llmPresetId) || llmPresets[0];
            const provider = llmProviders.find(p => p.id === llm?.providerId);

            if (!llm || !provider) {
                setAdvisorError('未找到可用的军师模型配置，请先在设置中配置 LLM。');
                return;
            }
            const skill = werewolfSkillInstance;
            const visiblePlayers = players.map(p => maskPlayerForViewer(humanPlayer, p));
            const safeLogs = logs.filter(l => isLogVisibleToHuman(l, humanPlayer));
            const alivePlayers = visiblePlayers.filter(isEffectivelyAlive);
            const currentTurnLogs = safeLogs.filter(l => l.turn === turnCount);
            const roleConfigStr = gameConfig.roles.map(r => ROLE_INFO[r].label).join(' ');
            const advisorInstruction = `${instruction || ''}\n你是人类玩家的军师，请严格站在该玩家可见信息视角给出当前最优操作建议。只输出可直接填入输入框的发言和必要的行动目标，不要暴露推理过程，不要猜测或提及不可见身份与私密夜间信息。`;
            const messages = await skill.generatePrompts(humanPlayer, {
                phase,
                turnCount,
                players: visiblePlayers,
                logs: safeLogs,
                roleConfigStr,
                roles: gameConfig.roles,
                rules: gameConfig.rules,
                godState: buildAdvisorGodState(phase, humanPlayer, godState),
                sheriffEnabled: isSheriffElectionEnabled(gameConfig),
                sheriffId: godState.sheriffId ?? null,
                sheriffCandidates: godState.sheriffCandidates ?? [],
                currentTurnLogs,
                alivePlayers
            }, advisorInstruction);
            const responseText = await generateText(messages, llm, provider, undefined, undefined, remoteConfig.llmProxyEnabled ? remoteConfig.llmProxyUrl : undefined);
            const result = parseLLMResponse(responseText || '{}');
            setAdvisorDebugData({
                rawResult: result,
                rawResponse: responseText || '',
                promptContext: { phase, turnCount, visibleTo: undefined, actionInstruction: advisorInstruction || null },
                durationMs: Date.now() - advisorStartTime,
                modelName: llm.name || llm.modelId,
                strategySummary: result?.strategySummary || result?.summary || ''
            });
            const suggestedText = String(result.speak || '').trim();

            if (suggestedText) setText(suggestedText);

            if (phase === GamePhase.WITCH_ACTION) {
                if (result.useCure && witchCanCure) {
                    setTargetId(0);
                } else if (typeof result.poisonTarget === 'number' && targetCandidates.some(p => p.id === result.poisonTarget)) {
                    setTargetId(result.poisonTarget);
                } else if (result.poisonTarget === null) {
                    setTargetId(null);
                }
            } else if (needsTarget && typeof result.actionTarget === 'number' && targetCandidates.some(p => p.id === result.actionTarget)) {
                setTargetId(result.actionTarget);
            } else if (needsTarget && result.actionTarget === null) {
                setTargetId(null);
            }

            if (!suggestedText && !('actionTarget' in result) && !('useCure' in result) && !('poisonTarget' in result)) {
                setAdvisorError('军师没有生成有效建议，请稍后重试。');
            }
        } catch (error) {
            console.error(error);
            setAdvisorError(error instanceof Error ? error.message : '军师建议生成失败。');
        } finally {
            if (!isGuest) {
                setAdvisorLoading(false);
            }
        }
    };

    const startListening = () => {
        if (isListening) {
            recognitionRef.current?.stop?.();
            return;
        }

        setSpeechError('');
        const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition || (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSpeechError('当前浏览器不支持语音转文字。建议使用 Chrome/Edge，且在 localhost 或 HTTPS 环境下打开。');
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            recognition.lang = 'zh-CN';
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            let finalTranscript = '';
            const initialText = text.trim();

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => {
                setIsListening(false);
                recognitionRef.current = null;
            };
            recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                const errorMap: Record<string, string> = {
                    'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风权限后重试。',
                    'service-not-allowed': '语音识别服务不可用，请确认浏览器支持并使用 localhost 或 HTTPS。',
                    'no-speech': '没有识别到语音，请靠近麦克风后重试。',
                    'audio-capture': '没有检测到可用麦克风。',
                    'network': '语音识别网络服务连接失败，请检查网络或稍后重试。'
                };
                setSpeechError(errorMap[event.error] || `语音识别失败：${event.error || '未知错误'}`);
                setIsListening(false);
            };
            recognition.onresult = (event: SpeechRecognitionEvent) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i += 1) {
                    const transcript = event.results[i][0]?.transcript || '';
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                const recognizedText = `${finalTranscript}${interimTranscript}`.trim();
                if (recognizedText) {
                    setText(initialText ? `${initialText} ${recognizedText}` : recognizedText);
                }
            };

            recognition.start();
        } catch (error) {
            console.error(error);
            setIsListening(false);
            setSpeechError('语音识别启动失败，请确认麦克风权限和浏览器兼容性。');
        }
    };

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-[100] animate-slide-up pointer-events-none">
            <div className="border-[4px] p-4 pointer-events-auto max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar" style={MC_PANEL_STYLE}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="font-black shrink-0" style={{ color: 'var(--voxel-torch)', textShadow: '1px 1px 0 rgba(0,0,0,0.35)' }}>你的回合</span>
                        {waitCountdown != null && <span className="text-xs font-black animate-pulse" style={{ color: 'var(--voxel-redstone)' }}>⏳ {waitCountdown}s 后由 AI 托管</span>}
                        <span className="border-[3px] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0" style={{ background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}>
                            {humanPlayer.role}
                        </span>
                        {instruction && <span className="text-sm font-medium break-words" style={{ color: 'var(--voxel-ink)' }}>{instruction}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setIsExpanded(value => !value)}
                            className="border-[3px] px-2 py-1.5 text-xs font-black"
                            style={{ background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                            title={isExpanded ? '收起面板（保留输入）' : '展开面板'}
                            aria-expanded={isExpanded}
                        >
                            {isExpanded ? '▾' : '▸'}
                        </button>
                        <button
                            onClick={handleAdvisorSuggestion}
                            disabled={advisorLoading}
                            className={clsx(
                                "border-[3px] px-3 py-1.5 text-xs font-black transition-all",
                                advisorLoading ? "animate-pulse cursor-wait" : ""
                            )}
                            style={advisorLoading ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                            title={advisorLoading ? "军师思考中" : "行动建议"}
                            aria-label={advisorLoading ? "军师思考中" : "行动建议"}
                        >
                            {advisorLoading ? "💡思考中..." : "💡行动建议"}
                        </button>
                        {canSpeakInPhase && (
                            <button
                                onClick={startListening}
                                className={clsx(
                                    "border-[3px] px-3 py-1.5 text-xs font-black transition-all",
                                    isListening && "animate-pulse"
                                )}
                                style={isListening ? { background: 'var(--voxel-redstone)', color: '#fff', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-wood)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)' }}
                            >
                                {isListening ? "聆听中..." : "🎤 语音转文字"}
                            </button>
                        )}
                    </div>
                </div>

                {isExpanded && (<>
                {speechError && (
                    <div className="mb-3 border-[3px] px-3 py-2 text-xs font-black" style={{ background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}>
                        {speechError}
                    </div>
                )}

                {advisorError && (
                    <div className="mb-3 border-[3px] px-3 py-2 text-xs font-black" style={{ background: 'var(--voxel-redstone)', color: '#fff', borderColor: 'var(--voxel-ink)' }}>
                        {advisorError}
                    </div>
                )}

                {canSpeakInPhase && (
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="输入你的发言..."
                        className="w-full h-24 p-3 border-2 outline-none transition-all resize-none font-medium overflow-y-auto"
                        style={MC_FIELD_STYLE}
                    />
                )}

                {needsTarget && (
                    <div className={clsx("space-y-2", canSpeakInPhase ? "mt-3" : "")}>
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: 'var(--voxel-ink)' }}>
                            {phase === GamePhase.WITCH_ACTION ? "选择操作目标 (可选)" : isSheriffVoting ? "选择警长候选人" : isKnightChallenge ? "选择决斗目标" : isDemonHunterAction ? "选择猎杀目标" : isStoneGhostAction ? "选择查验目标" : isMerchantAction ? "选择技能发放目标" : isWolfExplode ? "选择指刀目标" : "选择目标"}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {targetCandidates.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setTargetId(p.id)}
                                    disabled={isWitchAction && !witchCanPoison}
                                    title={p.displayName && p.displayName !== `${p.id}号` ? `${p.id}号 · ${p.displayName}` : `${p.id}号`}
                                    className={clsx(
                                        MC_BTN,
                                        isWitchAction && !witchCanPoison && "cursor-not-allowed opacity-50"
                                    )}
                                    style={(isWitchAction && !witchCanPoison) ? { background: 'var(--voxel-wood)', color: 'var(--voxel-paper-dim)', borderColor: 'var(--voxel-ink)' } : (targetId === p.id ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' })}
                                >
                                    {p.id}号
                                </button>
                            ))}
                            {phase === GamePhase.WITCH_ACTION && witchCanCure && (
                                <button
                                    onClick={() => setTargetId(targetId === 0 ? null : 0)}
                                    className={clsx(MC_BTN)}
                                    style={targetId === 0 ? { background: 'var(--voxel-emerald)', color: '#fff', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                                >
                                    使用解药 (救人)
                                </button>
                            )}
                            {!isExilePkVoting && (
                                <button
                                    onClick={() => setTargetId(null)}
                                    className={clsx(MC_BTN)}
                                    style={targetId === null ? { background: 'var(--voxel-stone-dark)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                                >
                                    {isVoting || isSheriffVoting ? "弃票" : isKnightChallenge ? "跳过决斗" : "弃权/不操作"}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {needsCupidLink && (
                    <div className={clsx("space-y-2", canSpeakInPhase || needsTarget ? "mt-3" : "")}>
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: 'var(--voxel-redstone)' }}>选择情侣 (两名玩家)</label>
                        <div className="space-y-2">
                            <div>
                                <span className="text-[10px] font-black ml-1" style={{ color: 'var(--voxel-paper-dim)' }}>玩家 1 💕</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {targetCandidates.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setCupidTarget1(cupidTarget1 === p.id ? null : p.id)}
                                            className={clsx(MC_BTN, cupidTarget2 === p.id && "cursor-not-allowed opacity-50")}
                                            style={cupidTarget1 === p.id ? { background: 'var(--voxel-redstone)', color: '#fff', borderColor: 'var(--voxel-ink)' } : cupidTarget2 === p.id ? { background: 'var(--voxel-wood)', color: 'var(--voxel-paper-dim)', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                                        >
                                            {p.id}号
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] font-black ml-1" style={{ color: 'var(--voxel-paper-dim)' }}>玩家 2 💕</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {targetCandidates.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setCupidTarget2(cupidTarget2 === p.id ? null : p.id)}
                                            className={clsx(MC_BTN, cupidTarget1 === p.id && "cursor-not-allowed opacity-50")}
                                            style={cupidTarget2 === p.id ? { background: 'var(--voxel-redstone)', color: '#fff', borderColor: 'var(--voxel-ink)' } : cupidTarget1 === p.id ? { background: 'var(--voxel-wood)', color: 'var(--voxel-paper-dim)', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                                        >
                                            {p.id}号
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {needsMerchantSkill && targetId !== null && (
                    <div className="mt-3 space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: 'var(--voxel-torch)' }}>选择技能类型</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { type: 'check' as const, label: '查验身份', icon: '🔮', color: 'purple' },
                                { type: 'poison' as const, label: '毒药', icon: '🧪', color: 'red' },
                                { type: 'guard' as const, label: '守护', icon: '🛡️', color: 'blue' }
                            ].map(skill => (
                                <button
                                    key={skill.type}
                                    onClick={() => setMerchantSkillType(merchantSkillType === skill.type ? null : skill.type)}
                                    className={clsx(MC_BTN)}
                                    style={merchantSkillType === skill.type ? (skill.color === 'purple' ? { background: 'var(--voxel-emerald)', color: '#fff', borderColor: 'var(--voxel-ink)' } : skill.color === 'red' ? { background: 'var(--voxel-redstone)', color: '#fff', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }) : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                                >
                                    {skill.icon} {skill.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {phase === GamePhase.SHERIFF_WITHDRAW && (
                    <div className="mt-3 space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: 'var(--voxel-torch)' }}>选择行动</label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setShouldWithdraw(true)}
                                className={clsx(MC_BTN)}
                                style={shouldWithdraw && !withdrawExplode ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                            >
                                退水（放弃竞选）
                            </button>
                            <button
                                onClick={() => setShouldWithdraw(false)}
                                className={clsx(MC_BTN)}
                                style={!shouldWithdraw ? { background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                            >
                                坚持竞选
                            </button>
                            {isHumanWolf && gameConfig.rules.wolfExplodeEnabled && (
                                <button
                                    onClick={() => { setShouldWithdraw(true); setWithdrawExplode(true); }}
                                    className={clsx(MC_BTN)}
                                    style={withdrawExplode ? { background: 'var(--voxel-redstone)', color: '#fff', borderColor: 'var(--voxel-ink)' } : { background: 'var(--voxel-paper)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)' }}
                                    title="退水同时自爆出局；若开启双爆吞警徽，将导致警徽流失"
                                >
                                    退水并自爆
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    className="mt-3 w-full border-[4px] py-3 font-black transition-all active:translate-x-[2px] active:translate-y-[2px]"
                    style={{ background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '4px 4px 0 var(--voxel-ink)' }}
                >
                    确认行动
                </button>
                {isGuest && actionAckState.pending && (
                    <div className="text-xs font-black animate-pulse mt-1" style={{ color: 'var(--voxel-torch)' }}>⏳ 操作已提交，等待确认...</div>
                )}
                {isGuest && !actionAckState.pending && actionAckState.success === true && (
                    <div className="text-xs font-black mt-1" style={{ color: 'var(--voxel-emerald)' }}>✓ 操作已确认</div>
                )}
                {isGuest && !actionAckState.pending && actionAckState.success === false && (
                    <div className="text-xs font-black mt-1" style={{ color: 'var(--voxel-redstone)' }}>✗ 操作失败，请重试</div>
                )}
                </>)}
            </div>
        </div>
    );
};

export default HumanInputPanel;
