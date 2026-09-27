import { GamePhase, PlayerStatus, Role, ROLE_INFO, isWolfRole } from '../../../types';
import { isEffectivelyAlive, isCrossFactionLoverPair, normalizeMerchantSkillType } from '../../../game/rules';
import { isLlmAbortedResult, isLlmFailedResult } from '../../engineHelpers';
import { BUILTIN_LLM_PRESET_ID, builtinGenerate, isBuiltinLlmReady } from '../../../services/builtinLlm';
import { generateText, parseLLMResponse } from '../../../services/llm';
import { werewolfSkillInstance } from '../../../services/skills/werewolf/WerewolfSkill';
import { extractWolfChatTarget } from '../../../utils/wolfChatTarget';
import { logsAtom } from '../../../atoms';
import type { PhaseHandlerContext } from '../phaseContext';

const werewolfSkill = werewolfSkillInstance;

// ===== 夜间阶段 handler：NIGHT_START / CUPID_LINK / WEREWOLF_ACTION /
// STONE_GHOST_ACTION / SEER_ACTION / GRAVEKEEPER_ACTION / WITCH_ACTION /
// GUARD_ACTION / DEMON_HUNTER_ACTION / MERCHANT_ACTION =====
// 函数体自 useGameEngine 的 GOD-loop switch case 原样搬移，语义以 ctx 传递保持不变。

export const handleNightStart = async (ctx: PhaseHandlerContext) => {
    const { players, godState, turnCount, getRule, setGodState, setPhase, setIsProcessing, addSystemLog, saveSnapshot } = ctx;
    setIsProcessing(true);
    try {
        await addSystemLog("天黑请闭眼。");

        // 血月封印持续本夜，等天亮结算后再重置
        // wolfExplodeTarget 由上一轮自爆设置，必须保留到本夜狼人行动阶段消费。
        setGodState(prev => ({
            ...prev,
            wolfTarget: null,
            seerCheck: null,
            witchSave: false,
            witchPoison: null,
            guardProtect: null,
            lastGuardProtect: prev.lastGuardProtect ?? null,
            merchantGuardProtect: null,
            deathsTonight: [],
            poisonedTonight: [],
            pendingDeathActionIds: [],
            deathActionResume: undefined,
            pendingNightDeathIds: [],
            wolfExplodeCheckedTurn: null,
            discussionRoundTwoDone: false,
            discussionRoundTwoTurn: null,
        }));

        // Delay before night actions
        await new Promise(r => setTimeout(r, Math.random() * 2000 + 1500));

        // 首夜丘比特连结（在所有夜间行动之前）
        const cupid = players.find(p => p.role === Role.CUPID && p.status === PlayerStatus.ALIVE);
        if (turnCount === 1 && cupid && getRule('cupidLinkLovers') && !godState.lovers) {
            setPhase(GamePhase.CUPID_LINK);
            saveSnapshot();
            await addSystemLog("丘比特请睁眼。", undefined, undefined, GamePhase.CUPID_LINK);
            return;
        }

        setPhase(GamePhase.WEREWOLF_ACTION);
        saveSnapshot();

        await addSystemLog("狼人请睁眼。", undefined, undefined, GamePhase.WEREWOLF_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleWerewolfAction = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, turnCount, getRule,
        setGodState, setPhase, setIsProcessing, addSystemLog, saveSnapshot,
        generateTurn, getActorConfig, actors, remoteConfig, buildSkillContext,
        llmAbortControllersRef, isAutoRef, jotaiStore, addEventTrace, getNextSpeaker,
        transitionToNextNightPhase,
    } = ctx;
    setIsProcessing(true);
    try {
        // 狼人阵营中，石像鬼不参与狼人讨论
        const wolves = players.filter(p => p.status === PlayerStatus.ALIVE && isWolfRole(p.role) && p.role !== Role.STONE_GHOST);

        if (wolves.length === 0) {
            // 所有狼人死亡，仍播报睁眼闭眼防止信息泄露
            await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
            await addSystemLog("狼人请闭眼。");

            await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));

            const stoneGhostAlive = players.some(player => player.role === Role.STONE_GHOST && isEffectivelyAlive(player));
            if (stoneGhostAlive && getRule('stoneGhostCheckIdentity')) {
                setPhase(GamePhase.STONE_GHOST_ACTION);
                saveSnapshot();
                await addSystemLog("石像鬼请睁眼。", undefined, undefined, GamePhase.STONE_GHOST_ACTION);
                return;
            }

            await transitionToNextNightPhase(GamePhase.WEREWOLF_ACTION);
        } else if (godState.wolfExplodeTarget) {
            const explodeTarget = godState.wolfExplodeTarget;
            const targetAlive = players.find(p => p.id === explodeTarget && isEffectivelyAlive(p));
            if (targetAlive) {
                setGodState(prev => ({ ...prev, wolfTarget: explodeTarget, wolfExplodeTarget: null }));
                await addSystemLog(`狼人按照指刀，选择击杀 ${explodeTarget}号。`, wolves.map(w => w.id));
            } else {
                // 指刀目标已死亡，清除指刀，正常讨论
                setGodState(prev => ({ ...prev, wolfExplodeTarget: null }));
            }
            // 无论指刀是否有效，都跳过讨论直接闭眼
            await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
            await addSystemLog("狼人请闭眼。");
        } else {
            // 正常狼人讨论流程
            // 首夜无任何公开发言：显式禁止模型编造"观感"类理由（开源项目通行做法：
            // 无信息时允许承认盲选，禁止虚构对其他玩家的观察）
            const noInfoHint = turnCount === 1
                ? '（首夜提醒：全场还没有任何公开发言，禁止描述任何玩家的发言、习惯或态度；刀人理由只谈座位分布、编号，或直接承认是盲选）'
                : '';
            const wolfNightPrompt = `这是狼人夜间私聊。请讨论刀人目标和白天伪装计划；本轮不是最终刀人决策，JSON 的 actionTarget 必须为 null。${noInfoHint}`;
            const nextWolf = getNextSpeaker(wolves);

            if (nextWolf) {
                const isLastSpeaker = nextWolf.id === wolves[wolves.length - 1].id;

                if (isLastSpeaker) {
                    const nonWolfTargets = players.filter(p => isEffectivelyAlive(p) && !isWolfRole(p.role)).map(t => t.id);
                    const finalPrompt = `**最终决策**：你是最后一个发言的狼人。请在 speak 中总结并给出最终决定，且必须在 **actionTarget** 中填入今晚要杀的玩家ID (数字)。${noInfoHint}`;

                    const result = await generateTurn(nextWolf, finalPrompt, wolves.map(w => w.id), true);
                    if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;

                    const pickValidTarget = (raw: unknown): number | undefined => {
                        const t = Number(raw);
                        return Number.isFinite(t) && nonWolfTargets.includes(t) ? t : undefined;
                    };

                    // 1) 模型给出的合法 actionTarget
                    let targetId = pickValidTarget(result?.actionTarget);

                    // 2) 漏填/无效时:从本轮狼聊解析多数刀口意见,
                    //    避免随机刀口与狼队商议目标相矛盾(如全员喊刀5号却随机刀中3号)
                    let fallbackKind: '狼聊多数意见' | '重试决策' | '随机指定' | null = null;
                    if (targetId === undefined) {
                        const wolfChats = jotaiStore.get(logsAtom)
                            .filter(l => l.phase === GamePhase.WEREWOLF_ACTION && l.turn === turnCount && !l.isSystem)
                            .map(l => String(l.content ?? ''));
                        const parsed = extractWolfChatTarget(wolfChats, nonWolfTargets);
                        if (parsed !== null) {
                            targetId = parsed;
                            fallbackKind = '狼聊多数意见';
                        }
                    }

                    // 3) 狼聊也解析不出:静默重试一次(只补 actionTarget,不重复落发言日志)
                    if (targetId === undefined) {
                        try {
                            const { llm, provider } = getActorConfig(nextWolf.actorId);
                            const retryInstruction = `你上一条 JSON 漏填了 actionTarget。请只返回 JSON：从这些玩家中选一人作为今晚的刀口并填入 actionTarget（数字）：${nonWolfTargets.join('、')}。`;
                            const context = buildSkillContext(nextWolf, GamePhase.WEREWOLF_ACTION);
                            const messages = await werewolfSkill.generatePrompts(nextWolf, context, retryInstruction);
                            const actorCfg = actors.find(a => a.id === nextWolf.actorId);
                            if (actorCfg?.llmPresetId === BUILTIN_LLM_PRESET_ID) {
                                targetId = pickValidTarget(parseLLMResponse(await builtinGenerate(messages, { maxTokens: 160 }))?.actionTarget);
                            } else {
                                const controller = new AbortController();
                                llmAbortControllersRef.current.add(controller);
                                const retryText = await generateText(messages, llm, provider, () => {}, controller.signal, remoteConfig.llmProxyEnabled ? remoteConfig.llmProxyUrl : undefined);
                                llmAbortControllersRef.current.delete(controller);
                                if (controller.signal.aborted || !isAutoRef.current) return;
                                targetId = pickValidTarget(parseLLMResponse(retryText || '{}')?.actionTarget);
                            }
                            if (targetId !== undefined) fallbackKind = '重试决策';
                        } catch {
                            // 重试失败走随机兜底
                        }
                    }

                    // 4) 全部失败:随机指定,并给狼队一条可追溯的私聊播报
                    if (targetId === undefined && nonWolfTargets.length > 0) {
                        targetId = nonWolfTargets[Math.floor(Math.random() * nonWolfTargets.length)];
                        fallbackKind = '随机指定';
                    }

                    if (targetId !== undefined) {
                        setGodState(prev => ({ ...prev, wolfTarget: targetId }));
                        if (fallbackKind) {
                            addEventTrace(`狼刀兜底（${fallbackKind}）：${nextWolf.seatNumber}号未给出有效 actionTarget，按${fallbackKind}指定 ${targetId}号`, {
                                eventKind: 'ACTION',
                                action: 'WOLF_TARGET_FALLBACK',
                                playerId: nextWolf.id,
                                seatNumber: nextWolf.seatNumber,
                                phase: GamePhase.WEREWOLF_ACTION,
                                fallbackKind,
                                target: targetId,
                            });
                        }
                        if (fallbackKind === '随机指定') {
                            await addSystemLog(`今晚狼队刀口未能成形，上帝替狼队指定了 ${targetId}号。`, wolves.map(w => w.id));
                        }
                    }
                } else {
                    const result = await generateTurn(nextWolf, wolfNightPrompt, wolves.map(w => w.id), true);
                    if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
                }
                saveSnapshot();
                return;
            }

            // 狼队全部发言完毕，进入闭眼与后续夜间阶段
            await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
            await addSystemLog("狼人请闭眼。");
        }

        // 狼人闭眼后，进入石像鬼/预言家阶段
        // Delay before Stone Ghost
        await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));

        // 石像鬼行动（在狼人闭眼后、预言家之前）
        const stoneGhostAlive = players.some(player => player.role === Role.STONE_GHOST && isEffectivelyAlive(player));
        if (stoneGhostAlive && getRule('stoneGhostCheckIdentity')) {
            setPhase(GamePhase.STONE_GHOST_ACTION);
            saveSnapshot();
            await addSystemLog("石像鬼请睁眼。", undefined, undefined, GamePhase.STONE_GHOST_ACTION);
            return;
        }

        // 使用辅助函数确定下一个夜间阶段
        await transitionToNextNightPhase(GamePhase.WEREWOLF_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleSeerAction = async (ctx: PhaseHandlerContext) => {
    const { players, godState, logs, phase, turnCount, getRule, setGodState, setIsProcessing, addSystemLog, generateTurn, transitionToNextNightPhase } = ctx;
    setIsProcessing(true);
    try {
        const seer = players.find(p => p.role === Role.SEER && p.status === PlayerStatus.ALIVE);
        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === seer?.id && l.turn === turnCount);
        const merchantSkillHolderAlive = godState.merchantSkillType === 'check' && godState.merchantSkillTarget && !godState.merchantSkillUsed && players.some(p => p.id === godState.merchantSkillTarget && isEffectivelyAlive(p));

        if (!seer && !merchantSkillHolderAlive) {
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }

        // 商人发放的查验技能（一次性，优先于预言家行动）
        if (godState.merchantSkillType === 'check' && godState.merchantSkillTarget && !godState.merchantSkillUsed && !godState.bloodMoonSealed) {
            const skillHolder = players.find(p => p.id === godState.merchantSkillTarget && isEffectivelyAlive(p));
            if (skillHolder) {
                const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== skillHolder.id).map(t => t.id);
                const result = await generateTurn(skillHolder, '你获得了奇迹商人发放的一次性查验技能。请选择一名玩家查验其阵营。', [skillHolder.id], true);
                if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
                const checkTarget = Number(result?.actionTarget ?? result?.target);
                if (targetIds.includes(checkTarget)) {
                    const targetPlayer = players.find(p => p.id === checkTarget);
                    await addSystemLog(`上帝(私聊): 商人查验结果：${checkTarget}号是 ${targetPlayer && isWolfRole(targetPlayer.role) ? '狼人' : '好人'}`, [skillHolder.id]);
                } else {
                    await addSystemLog('上帝(私聊): 商人查验技能未使用。', [skillHolder.id]);
                }
                setGodState(prev => ({ ...prev, merchantSkillUsed: true, merchantSkillTarget: null, merchantSkillType: null }));
            } else {
                setGodState(prev => ({ ...prev, merchantSkillUsed: true, merchantSkillTarget: null, merchantSkillType: null }));
            }
        }

        // 血月封印：跳过预言家查验
        if (seer && !hasSpoken && !godState.bloodMoonSealed) {
            const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== seer.id).map(t => t.id);
            const seerPrompt = `请选择查验对象。`;
            const result = await generateTurn(seer, seerPrompt, [seer.id], true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;

            if (result?.actionTarget) {
                const checkId = targetIds.includes(result.actionTarget) ? result.actionTarget : targetIds[Math.floor(Math.random() * targetIds.length)];
                const targetPlayer = players.find(p => p.id === checkId);
                const isGood = targetPlayer ? !isWolfRole(targetPlayer.role) : true;
                await addSystemLog(`上帝(私聊): ${checkId}号是 ${isGood ? '好人' : '狼人'}`, [seer.id]);
                setGodState(prev => ({ ...prev, seerCheck: checkId }));
            }
        } else if (godState.bloodMoonSealed && seer) {
            await addSystemLog(`上帝(私聊): 血月封印，今晚无法查验。`, [seer.id]);
        }

        await addSystemLog("预言家请闭眼。");

        await transitionToNextNightPhase(GamePhase.SEER_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleWitchAction = async (ctx: PhaseHandlerContext) => {
    const { players, godState, logs, phase, turnCount, getRule, setGodState, setPlayers, setIsProcessing, addSystemLog, generateTurn, transitionToNextNightPhase } = ctx;
    setIsProcessing(true);
    try {
        const witch = players.find(p => p.role === Role.WITCH && p.status === PlayerStatus.ALIVE);
        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === witch?.id && l.turn === turnCount);
        const witchMerchantHolderAlive = (godState.merchantSkillType === 'poison' || godState.merchantSkillType === 'guard') && godState.merchantSkillTarget && !godState.merchantSkillUsed && players.some(p => p.id === godState.merchantSkillTarget && isEffectivelyAlive(p));

        if (!witch && !witchMerchantHolderAlive) {
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }

        // 商人发放的毒药技能（一次性，优先于女巫行动）
        if (godState.merchantSkillType === 'poison' && godState.merchantSkillTarget && !godState.merchantSkillUsed && !godState.bloodMoonSealed) {
            const skillHolder = players.find(p => p.id === godState.merchantSkillTarget && isEffectivelyAlive(p));
            if (skillHolder) {
                const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== skillHolder.id).map(t => t.id);
                const result = await generateTurn(skillHolder, '你获得了奇迹商人发放的一次性毒药技能。请选择一名玩家毒杀，或跳过。', [skillHolder.id], true);
                if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
                const poisonTarget = Number(result?.actionTarget ?? result?.target ?? result?.poisonTarget);
                if (targetIds.includes(poisonTarget)) {
                    setGodState(prev => ({
                        ...prev,
                        deathsTonight: [...prev.deathsTonight, poisonTarget],
                        poisonedTonight: [...(prev.poisonedTonight ?? []), poisonTarget],
                        merchantSkillUsed: true,
                        merchantSkillTarget: null,
                        merchantSkillType: null,
                    }));
                    await addSystemLog(`上帝(私聊): 你使用商人毒药毒杀了 ${poisonTarget}号。`, [skillHolder.id]);
                } else {
                    setGodState(prev => ({ ...prev, merchantSkillUsed: true, merchantSkillTarget: null, merchantSkillType: null }));
                    await addSystemLog('上帝(私聊): 商人毒药技能未使用。', [skillHolder.id]);
                }
            } else {
                setGodState(prev => ({ ...prev, merchantSkillUsed: true, merchantSkillTarget: null, merchantSkillType: null }));
            }
        }

        // 血月封印：跳过女巫用药
        if (witch && !hasSpoken && !godState.bloodMoonSealed) {
            const dyingId = godState.wolfTarget;
            const witchPrompt = `女巫行动。`;

            const result = await generateTurn(witch, witchPrompt, [witch.id], true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;

            if (result) {
                const aliveTargetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== witch.id).map(p => p.id);
                const poisonTarget = Number(result.poisonTarget);
                const canUseCure = !!witch.potions?.cure
                    && !!dyingId
                    && (getRule('witchSelfSave') === true || (getRule('witchSelfSave') === 'FIRST_NIGHT' && turnCount === 1) || dyingId !== witch.id);
                const wantsPoison = witch.potions?.poison && aliveTargetIds.includes(poisonTarget);
                // 锁毒以“实际生效的解药”为准：声称用解药但被规则拒绝时不应误锁毒药
                const canUsePoison = !!wantsPoison && (!(canUseCure && result.useCure) || getRule('witchSameNight'));

                if (canUseCure && result.useCure && dyingId) {
                    setGodState(prev => ({ ...prev, witchSave: true }));
                    await addSystemLog(`上帝(私聊): 使用解药救了 ${dyingId}号。`, [witch.id]);
                    setPlayers(prev => prev.map(p => p.id === witch.id ? { ...p, potions: { ...p.potions!, cure: false } } : p));
                }

                if (canUsePoison) {
                    setGodState(prev => ({
                        ...prev,
                        witchPoison: poisonTarget,
                        poisonedTonight: [...(prev.poisonedTonight ?? []), poisonTarget],
                    }));
                    await addSystemLog(`上帝(私聊): 毒死了 ${poisonTarget}号。`, [witch.id]);
                    setPlayers(prev => prev.map(p => p.id === witch.id ? { ...p, potions: { ...p.potions!, poison: false } } : p));
                }

                if (result.useCure && !canUseCure) {
                    // 静默拒绝会让女巫 AI 误以为药已消耗、后续策略全错：
                    // 明确私聊告知拒绝原因，且不扣药水
                    const denyReason = !witch.potions?.cure
                        ? '解药已用尽'
                        : !dyingId
                            ? '今晚无人被袭击'
                            : '当前规则限制今晚不可自救';
                    await addSystemLog(`上帝(私聊): 解药未能生效（${denyReason}），药水未消耗。`, [witch.id]);
                }

                if (!(canUseCure && result.useCure && dyingId) && !canUsePoison) {
                    await addSystemLog(`上帝(私聊): 未使用药水。`, [witch.id]);
                }
            }
        } else if (godState.bloodMoonSealed && witch) {
            await addSystemLog(`上帝(私聊): 血月封印，今晚无法用药。`, [witch.id]);
        }

        // Delay before closing eyes
        await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));

        await addSystemLog("女巫请闭眼。");

        await transitionToNextNightPhase(GamePhase.WITCH_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleGuardAction = async (ctx: PhaseHandlerContext) => {
    const { players, godState, logs, phase, turnCount, getRule, setGodState, setIsProcessing, addSystemLog, generateTurn, transitionToNextNightPhase } = ctx;
    setIsProcessing(true);
    try {
        const guard = players.find(p => p.role === Role.GUARD && p.status === PlayerStatus.ALIVE);
        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === guard?.id && l.turn === turnCount);
        const guardMerchantHolderAlive = godState.merchantSkillType === 'guard' && godState.merchantSkillTarget && !godState.merchantSkillUsed && players.some(p => p.id === godState.merchantSkillTarget && isEffectivelyAlive(p));

        if (!guard && !guardMerchantHolderAlive) {
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }

        // 商人发放的守护技能（一次性，优先于守卫行动）
        if (godState.merchantSkillType === 'guard' && godState.merchantSkillTarget && !godState.merchantSkillUsed && !godState.bloodMoonSealed) {
            const skillHolder = players.find(p => p.id === godState.merchantSkillTarget && isEffectivelyAlive(p));
            if (skillHolder) {
                const targetIds = players.filter(isEffectivelyAlive).map(t => t.id);
                const result = await generateTurn(skillHolder, '你获得了奇迹商人发放的一次性守护技能。请选择一名玩家守护，或跳过。', [skillHolder.id], true);
                if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
                const guardTarget = Number(result?.actionTarget ?? result?.target);
                if (targetIds.includes(guardTarget)) {
                    setGodState(prev => ({ ...prev, merchantGuardProtect: guardTarget, merchantSkillUsed: true, merchantSkillTarget: null, merchantSkillType: null }));
                    await addSystemLog(`上帝(私聊): 你使用商人守护技能守护了 ${guardTarget}号。`, [skillHolder.id]);
                } else {
                    setGodState(prev => ({ ...prev, merchantSkillUsed: true, merchantSkillTarget: null, merchantSkillType: null }));
                    await addSystemLog('上帝(私聊): 商人守护技能未使用。', [skillHolder.id]);
                }
            } else {
                setGodState(prev => ({ ...prev, merchantSkillUsed: true, merchantSkillTarget: null, merchantSkillType: null }));
            }
        }

        // 血月封印：跳过守卫守护
        if (guard && !hasSpoken && !godState.bloodMoonSealed) {
            const validTargets = players
                .filter(p => isEffectivelyAlive(p) && (!getRule('guardCannotSameTarget') || p.id !== godState.lastGuardProtect))
                .map(p => p.id);
            const guardPrompt = getRule('guardCannotSameTarget')
                ? `请选择今晚守护对象。不能连续两晚守护同一名玩家。`
                : `请选择今晚守护对象。`;
            const result = await generateTurn(guard, guardPrompt, [guard.id], true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
            const protectTarget = Number(result?.actionTarget);

            if (validTargets.includes(protectTarget)) {
                setGodState(prev => ({ ...prev, guardProtect: protectTarget, lastGuardProtect: protectTarget }));
                await addSystemLog(`上帝(私聊): 守护了 ${protectTarget}号。`, [guard.id]);
            } else {
                setGodState(prev => ({ ...prev, guardProtect: null, lastGuardProtect: null }));
                await addSystemLog(`上帝(私聊): 未进行守护。`, [guard.id]);
            }
        } else if (godState.bloodMoonSealed && guard) {
            setGodState(prev => ({ ...prev, guardProtect: null }));
            await addSystemLog(`上帝(私聊): 血月封印，今晚无法守护。`, [guard.id]);
        }

        await addSystemLog("守卫请闭眼。");

        await transitionToNextNightPhase(GamePhase.GUARD_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleCupidLink = async (ctx: PhaseHandlerContext) => {
    const { players, godState, getRule, setGodState, setPhase, setIsProcessing, addSystemLog, generateTurn, saveSnapshot } = ctx;
    setIsProcessing(true);
    try {
        const cupid = players.find(p => p.role === Role.CUPID && p.status === PlayerStatus.ALIVE);
        if (cupid && !godState.lovers) {
            // 连结对象不含丘比特自己（与其他夜间行动排除自身的口径一致）
            const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== cupid.id).map(t => t.id);
            const cupidPrompt = `请选择两名玩家连结为情侣。`;
            const result = await generateTurn(cupid, cupidPrompt, [cupid.id], true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;

            const lover1Raw = result?.target1 ?? result?.cupidTarget1 ?? result?.actionTarget;
            const lover2Raw = result?.target2 ?? result?.cupidTarget2 ?? result?.secondTarget;
            const lover1 = lover1Raw && targetIds.includes(Number(lover1Raw)) ? Number(lover1Raw) : null;
            const lover2 = lover2Raw && targetIds.includes(Number(lover2Raw)) ? Number(lover2Raw) : null;

            const notifyLovers = async (lover1: number, lover2: number) => {
                const p1 = players.find(p => p.id === lover1);
                const p2 = players.find(p => p.id === lover2);
                if (p1) await addSystemLog(`上帝(私聊): 你和 ${lover2}号 已被连结为情侣。一方死亡，另一方殉情。`, [lover1]);
                if (p2) await addSystemLog(`上帝(私聊): 你和 ${lover1}号 已被连结为情侣。一方死亡，另一方殉情。`, [lover2]);
                await addSystemLog(`上帝(私聊): 你连结了 ${lover1}号 和 ${lover2}号 为情侣。`, [cupid.id]);
                await addSystemLog(`丘比特已完成情侣连结。`);
                return { p1, p2 };
            };

            if (lover1 && lover2 && lover1 !== lover2) {
                setGodState(prev => ({ ...prev, lovers: [lover1, lover2] }));
                const { p1, p2 } = await notifyLovers(lover1, lover2);
                // 判断是否第三方：如果情侣分属不同阵营
                if (p1 && p2 && isCrossFactionLoverPair(players, [lover1, lover2]) && getRule('thirdPartyEnabled')) {
                    setGodState(prev => ({ ...prev, cupidIsThirdParty: true }));
                    await addSystemLog(`上帝(私聊): 情侣分属不同阵营，丘比特与情侣形成第三方阵营！`, [cupid.id]);
                }
            } else {
                // 随机选择
                const shuffled = targetIds.sort(() => Math.random() - 0.5);
                if (shuffled.length >= 2) {
                    const randomLovers: [number, number] = [shuffled[0], shuffled[1]];
                    setGodState(prev => ({ ...prev, lovers: randomLovers }));
                    await notifyLovers(...randomLovers);
                    if (isCrossFactionLoverPair(players, randomLovers) && getRule('thirdPartyEnabled')) {
                        setGodState(prev => ({ ...prev, cupidIsThirdParty: true }));
                        await addSystemLog(`上帝(私聊): 情侣分属不同阵营，丘比特与情侣形成第三方阵营！`, [cupid.id]);
                    }
                }
            }
        }

        await addSystemLog("丘比特请闭眼。");
        await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
        setPhase(GamePhase.WEREWOLF_ACTION);
        saveSnapshot();
        await addSystemLog("狼人请睁眼。", undefined, undefined, GamePhase.WEREWOLF_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleStoneGhostAction = async (ctx: PhaseHandlerContext) => {
    const { players, godState, logs, phase, turnCount, setIsProcessing, addSystemLog, generateTurn, transitionToNextNightPhase } = ctx;
    setIsProcessing(true);
    try {
        const stoneGhost = players.find(p => p.role === Role.STONE_GHOST && p.status === PlayerStatus.ALIVE);
        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === stoneGhost?.id && l.turn === turnCount);

        if (!stoneGhost) {
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }

        if (stoneGhost && !hasSpoken) {
            const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== stoneGhost.id).map(t => t.id);
            const sgPrompt = `请选择查验对象，你将得知对方的具体身份。`;
            const result = await generateTurn(stoneGhost, sgPrompt, [stoneGhost.id], true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;

            // 石像鬼 AI 返回 target 字段（非 actionTarget）
            const checkTarget = result?.target ?? result?.actionTarget;
            if (checkTarget) {
                const checkId = targetIds.includes(Number(checkTarget)) ? Number(checkTarget) : targetIds[Math.floor(Math.random() * targetIds.length)];
                const targetPlayer = players.find(p => p.id === checkId);
                const roleLabel = targetPlayer ? ROLE_INFO[targetPlayer.role].label : '未知';
                await addSystemLog(`上帝(私聊): ${checkId}号的真实身份是 ${roleLabel}`, [stoneGhost.id]);
            }
        }

        await addSystemLog("石像鬼请闭眼。");

        await transitionToNextNightPhase(GamePhase.STONE_GHOST_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleGravekeeperAction = async (ctx: PhaseHandlerContext) => {
    const { players, godState, logs, phase, turnCount, aiHostedPlayers, setIsProcessing, addSystemLog, generateTurn, transitionToNextNightPhase } = ctx;
    setIsProcessing(true);
    try {
        const gravekeeper = players.find(p => p.role === Role.GRAVEKEEPER && p.status === PlayerStatus.ALIVE);
        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === gravekeeper?.id && l.turn === turnCount);
        const lastExiled = godState.lastExiledPlayerId;

        if (!gravekeeper) {
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }

        if (gravekeeper && !hasSpoken && lastExiled && !godState.bloodMoonSealed) {
            const exiledPlayer = players.find(p => p.id === lastExiled);
            const roleLabel = exiledPlayer ? ROLE_INFO[exiledPlayer.role].label : '未知';
            const isHumanGravekeeper = gravekeeper.isHuman && !aiHostedPlayers[gravekeeper.seatNumber];
            if (isHumanGravekeeper) {
                // 查验无需人类选择：面板提示"无需操作"，引擎若仍等待人类输入会永久挂起
                await addSystemLog(`上帝(私聊): ${lastExiled}号的真实身份是 ${roleLabel}`, [gravekeeper.id]);
            } else {
                const gkPrompt = `查验上一轮被放逐玩家（${lastExiled}号）的身份。`;
                const result = await generateTurn(gravekeeper, gkPrompt, [gravekeeper.id], true);
                if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
                await addSystemLog(`上帝(私聊): ${lastExiled}号的真实身份是 ${roleLabel}`, [gravekeeper.id]);
            }
        } else if (gravekeeper && godState.bloodMoonSealed) {
            await addSystemLog(`上帝(私聊): 血月封印，今晚无法查验。`, [gravekeeper.id]);
        } else if (gravekeeper && !lastExiled) {
            await addSystemLog(`上帝(私聊): 昨日日间没有被放逐玩家，无信息可查。`, [gravekeeper.id]);
        }

        await addSystemLog("守墓人请闭眼。");

        await transitionToNextNightPhase(GamePhase.GRAVEKEEPER_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleDemonHunterAction = async (ctx: PhaseHandlerContext) => {
    const { players, godState, logs, phase, turnCount, setGodState, setIsProcessing, addSystemLog, generateTurn, transitionToNextNightPhase } = ctx;
    setIsProcessing(true);
    try {
        const demonHunter = players.find(p => p.role === Role.DEMON_HUNTER && p.status === PlayerStatus.ALIVE);
        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === demonHunter?.id && l.turn === turnCount);

        if (!demonHunter) {
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }

        if (demonHunter && !hasSpoken && !godState.bloodMoonSealed) {
            const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== demonHunter.id).map(t => t.id);
            const dhPrompt = `选择一名玩家猎杀。若对方是狼人则对方死亡；若对方是好人则你自己死亡。`;
            const result = await generateTurn(demonHunter, dhPrompt, [demonHunter.id], true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;

            // 猎魔人 AI 返回 target 字段（非 actionTarget）
            const dhTarget = result?.target ?? result?.actionTarget;
            if (dhTarget && targetIds.includes(Number(dhTarget))) {
                const targetId = Number(dhTarget);
                const targetPlayer = players.find(p => p.id === targetId);
                if (targetPlayer) {
                    if (isWolfRole(targetPlayer.role)) {
                        // 对方是狼人，对方死亡
                        await addSystemLog(`上帝(私聊): 猎杀成功！${targetId}号 是狼人。`, [demonHunter.id]);
                        setGodState(prev => ({ ...prev, demonHunterKills: [...prev.demonHunterKills, targetId], deathsTonight: [...prev.deathsTonight, targetId] }));
                    } else {
                        // 对方是好人，猎魔人自己死亡
                        await addSystemLog(`上帝(私聊): 猎杀失败！${targetId}号 不是狼人，你自己死亡。`, [demonHunter.id]);
                        setGodState(prev => ({ ...prev, deathsTonight: [...prev.deathsTonight, demonHunter.id] }));
                    }
                }
            }
        } else if (demonHunter && godState.bloodMoonSealed) {
            await addSystemLog(`上帝(私聊): 血月封印，今晚无法猎杀。`, [demonHunter.id]);
        }

        await addSystemLog("猎魔人请闭眼。");

        await transitionToNextNightPhase(GamePhase.DEMON_HUNTER_ACTION);
    } finally {
        setIsProcessing(false);
    }
};

export const handleMerchantAction = async (ctx: PhaseHandlerContext) => {
    const { players, godState, logs, phase, turnCount, setGodState, setPhase, setIsProcessing, addSystemLog, generateTurn, saveSnapshot } = ctx;
    setIsProcessing(true);
    try {
        const merchant = players.find(p => p.role === Role.MIRACLE_MERCHANT && p.status === PlayerStatus.ALIVE);
        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === merchant?.id && l.turn === turnCount);

        if (!merchant) {
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }

        if (merchant && !hasSpoken && !godState.bloodMoonSealed) {
            const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== merchant.id).map(t => t.id);
            const merchantPrompt = `选择一名玩家发放技能。`;
            const result = await generateTurn(merchant, merchantPrompt, [merchant.id], true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;

            // 商人 AI 返回 target 字段（非 actionTarget）
            const merchantTarget = result?.target ?? result?.actionTarget;
            if (merchantTarget && targetIds.includes(Number(merchantTarget))) {
                const targetId = Number(merchantTarget);
                const targetPlayer = players.find(p => p.id === targetId);
                const skillType = normalizeMerchantSkillType(result?.skillType);

                if (targetPlayer && skillType) {
                    if (isWolfRole(targetPlayer.role)) {
                        // 发给狼人，商人自己死亡
                        await addSystemLog(`上帝(私聊): ${targetId}号是狼人阵营！你发放技能失败，自己死亡！`, [merchant.id]);
                        setGodState(prev => ({
                            ...prev,
                            deathsTonight: [...prev.deathsTonight, merchant.id],
                            merchantSkillTarget: null,
                            merchantSkillType: null
                        }));
                    } else {
                        // 成功发放技能
                        await addSystemLog(`上帝(私聊): 成功向 ${targetId}号 发放了${skillType === 'check' ? '查验' : skillType === 'poison' ? '毒药' : '守护'}技能。`, [merchant.id]);
                        setGodState(prev => ({ ...prev, merchantSkillTarget: targetId, merchantSkillType: skillType, merchantSkillUsed: false }));
                        // 技能信息通过 godState 跟踪，不改变玩家 status
                    }
                } else if (targetPlayer) {
                    // AI 给了目标但技能类型非法:兜底日志,消除静默失败
                    await addSystemLog(`上帝(私聊): 未指定有效技能类型，本次技能发放作废。`, [merchant.id]);
                }
            }
        } else if (merchant && godState.bloodMoonSealed) {
            await addSystemLog(`上帝(私聊): 血月封印，今晚无法发放技能。`, [merchant.id]);
        }

        await addSystemLog("奇迹商人请闭眼。");
        await new Promise(r => setTimeout(r, 2000));
        setPhase(GamePhase.DAY_ANNOUNCE);
        saveSnapshot();
    } finally {
        setIsProcessing(false);
    }
};
