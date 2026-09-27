import { GamePhase, PlayerStatus, Role, ROLE_INFO, isWolfRole } from '../../../types';
import { isEffectivelyAlive, canWolfSelfExplode } from '../../../game/rules';
import { appendLog, isLlmAbortedResult, isLlmFailedResult, parseSheriffFlow } from '../../engineHelpers';
import type { LLMResponse } from '../../../services/llm';
import type { PhaseHandlerContext } from '../phaseContext';

// ===== 白天阶段 handler：DAY_ANNOUNCE / DAY_DISCUSSION / DISCUSSION_ROUND_TWO /
// LAST_WORDS / KNIGHT_CHALLENGE / WOLF_EXPLODE =====
// 函数体自 useGameEngine 的 GOD-loop switch case 原样搬移，语义以 ctx 传递保持不变。

export const handleDayAnnounce = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, logs, getRule,
        setGodState, setPlayers, setIsProcessing, addSystemLog,
        notifyHumanDeath, handleLoverMartyrdom, beginDeathActions, checkWinCondition, finishGame, continueDayFlow,
    } = ctx;
    setIsProcessing(true);
    try {
        // 合并猎魔人夜间猎杀的死亡
        const extraDeaths = godState.deathsTonight ?? [];
        const deaths: number[] = [];
        const wolfTarget = godState.wolfTarget;
        const isGuarded = !!wolfTarget && (godState.guardProtect === wolfTarget || godState.merchantGuardProtect === wolfTarget);
        const isHealed = !!wolfTarget && godState.witchSave;
        const guardHealConflictKills = getRule('guardHealConflictKills');

        // 守卫单守可防刀；女巫单救可防刀；若规则启用同守同救死亡，则同守同救/无守护无施救死亡。
        if (wolfTarget && (!isGuarded && !isHealed || guardHealConflictKills && isGuarded && isHealed)) deaths.push(wolfTarget);
        const poisonBlockedByGuard = getRule('guardBlocksPoison') && !!godState.witchPoison && (godState.guardProtect === godState.witchPoison || godState.merchantGuardProtect === godState.witchPoison);
        if (godState.witchPoison && !poisonBlockedByGuard && players.some(p => p.id === godState.witchPoison && isEffectivelyAlive(p))) deaths.push(godState.witchPoison);

        // 加入猎魔人/商人等夜间额外死亡
        for (const ed of extraDeaths) {
            if (!deaths.includes(ed) && players.some(p => p.id === ed && isEffectivelyAlive(p))) {
                deaths.push(ed);
            }
        }

        const uniqueDeaths = [...new Set(deaths)];
        const poisonedIds = [...new Set(godState.poisonedTonight ?? [])]
            .filter(id => uniqueDeaths.includes(id));
        setGodState(prev => ({ ...prev, deathsTonight: [], bloodMoonSealed: false })); // 清空夜间额外死亡并结束血月封印

        // Update statuses
        let currentPlayers = players;
        if (uniqueDeaths.length > 0) {
            currentPlayers = currentPlayers.map(p => uniqueDeaths.includes(p.id)
                ? {
                    ...p,
                    status: poisonedIds.includes(p.id)
                        ? PlayerStatus.DEAD_POISON
                        : PlayerStatus.DEAD_NIGHT,
                }
                : p);
            setPlayers(currentPlayers);
            await addSystemLog(`天亮了。昨晚 ${uniqueDeaths.map(id => `${id}号`).join('、')} 死亡。`);
            for (const deadId of uniqueDeaths) {
                notifyHumanDeath(deadId, poisonedIds.includes(deadId) ? '昨晚被毒杀' : '昨晚被袭击');
            }

            // 情侣殉情检查
            for (const deadId of uniqueDeaths) {
                const updatedPlayers = await handleLoverMartyrdom(deadId, currentPlayers, PlayerStatus.DEAD_NIGHT);
                if (updatedPlayers !== currentPlayers) {
                    currentPlayers = updatedPlayers;
                    // 将殉情者加入死亡列表
                    const [l1, l2] = godState.lovers!;
                    const martyrId = deadId === l1 ? l2 : l1;
                    if (!uniqueDeaths.includes(martyrId)) uniqueDeaths.push(martyrId);
                }
            }

            // 胜负判断需等死亡技能（猎人/狼王开枪）处理完后再进行，避免提前结束游戏。
        } else {
            await addSystemLog("天亮了。昨晚是平安夜。");
        }

        if (uniqueDeaths.includes(godState.sheriffId ?? -1)) {
            const deadSheriffId = godState.sheriffId;
            const flowTarget = parseSheriffFlow(deadSheriffId!, logs, (tid) => !!players.find(p => p.id === tid && isEffectivelyAlive(p) && !uniqueDeaths.includes(p.id)));
            if (flowTarget) {
                setGodState(prev => ({ ...prev, sheriffId: flowTarget }));
                await addSystemLog(`${deadSheriffId}号警长夜间死亡，警徽传给 ${flowTarget}号。`);
            } else {
                setGodState(prev => ({ ...prev, sheriffId: null }));
                await addSystemLog(`${deadSheriffId}号警长夜间死亡，无有效警徽流，警徽流失。`);
            }
        }

        if (await beginDeathActions(
            currentPlayers,
            uniqueDeaths,
            'DAY_FLOW',
            uniqueDeaths
        )) {
            return;
        }

        const postDeathWinState = checkWinCondition(currentPlayers);
        if (postDeathWinState) {
            await finishGame(postDeathWinState, currentPlayers);
            return;
        }

        await continueDayFlow(currentPlayers, uniqueDeaths);
    } finally {
        setIsProcessing(false);
    }
};

export const handleDayDiscussion = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, speakingQueue, turnCount, getRule,
        setGodState, setSpeakingQueue, setPhase, setIsProcessing, addSystemLog, saveSnapshot,
        generateTurn, getAlivePlayers, isWolfExplodeEnabled,
    } = ctx;
    const [nextId, ...rest] = speakingQueue;
    if (nextId) {
        const player = players.find(p => p.id === nextId);
        if (player && isEffectivelyAlive(player)) {
            const result = await generateTurn(player);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
        }
        setSpeakingQueue(rest);
    } else {
        setIsProcessing(true);
        try {
            // 两轮讨论制：第一轮结束后进入第二轮
            if (getRule('twoRoundDiscussion') && !(godState.discussionRoundTwoDone && godState.discussionRoundTwoTurn === turnCount)) {
                const alive = getAlivePlayers(players);
                const startIdx = Math.floor(Math.random() * alive.length);
                const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
                setSpeakingQueue(queue);
                setGodState(prev => ({ ...prev, discussionRoundTwoDone: true, discussionRoundTwoTurn: turnCount }));
                await addSystemLog("第一轮发言结束，进入第二轮补充发言。");
                setPhase(GamePhase.DISCUSSION_ROUND_TWO);
                saveSnapshot();
                return;
            }

            // 狼人自爆判定（讨论后、投票前）
            if (godState.wolfExplodeCheckedTurn !== turnCount && isWolfExplodeEnabled()) {
                const alive = getAlivePlayers(players);
                const livingWolves = alive.filter(p => isWolfRole(p.role));
                if (livingWolves.length > 0) {
                    setPhase(GamePhase.WOLF_EXPLODE);
                    saveSnapshot();
                    await addSystemLog("狼人可以选择自爆。");
                    return;
                }
            }

            await addSystemLog("发言结束，开始投票...");
            setPhase(GamePhase.VOTING);
            saveSnapshot();
        } finally {
            setIsProcessing(false);
        }
    }
};

export const handleLastWords = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, speakingQueue, turnCount,
        setGodState, setSpeakingQueue, setTurnCount, setPhase, setIsProcessing, addSystemLog, saveSnapshot,
        generateTurn, continueDayFlow,
    } = ctx;
    const [sid, ...rest] = speakingQueue;
    if (sid) {
        const p = players.find(o => o.id === sid);
        if (p) {
            const result = await generateTurn(p, "发表遗言。告诉好人你的身份，或者误导他们。");
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
        }
        setSpeakingQueue(rest);
    } else {
        setIsProcessing(true);
        try {
            const fromNight = godState.lastWordsFromNight;
            setGodState(prev => ({ ...prev, lastWordsFromNight: undefined }));
            if (fromNight) {
                await continueDayFlow(players);
            } else {
                // 投票遗言结束后进入夜晚
                const newTurn = turnCount + 1;
                setTurnCount(newTurn);
                setPhase(GamePhase.NIGHT_START);
                await addSystemLog(`--- 第 ${newTurn} 天 ---`);
            }
            saveSnapshot();
        } finally {
            setIsProcessing(false);
        }
    }
};

export const handleKnightChallenge = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, turnCount, getRule,
        setGodState, setPlayers, setSpeakingQueue, setPhase, setLogs, setIsProcessing, addSystemLog, saveSnapshot,
        logIdCounter, isAutoRef,
        getTargetDecision, handleLoverMartyrdom, beginDeathActions, checkWinCondition, finishGame, getAlivePlayers, isWolfExplodeEnabled,
    } = ctx;
    setIsProcessing(true);
    try {
        const knight = players.find(p => p.role === Role.KNIGHT && p.status === PlayerStatus.ALIVE);
        let playersAfterChallenge = players;

        if (knight && !godState.knightChallenged && getRule('knightChallengeEnabled')) {
            const targetIds = players.filter(p => isEffectivelyAlive(p) && p.id !== knight.id).map(t => t.id);
            const knightPrompt = `你可以选择与一名玩家决斗，或放弃决斗。`;
            const result = await getTargetDecision(knight, targetIds, GamePhase.KNIGHT_CHALLENGE, knightPrompt, '骑士选择决斗目标。');
            if (!isAutoRef.current) return;

            const actionLabel = result.target ? `决斗 ${result.target}号` : '放弃决斗';
            const reasonText = result.speak ? `\n决策理由：${result.speak}` : '';
            setLogs(prev => appendLog(prev, [{
                id: `knight-challenge-strategy-T${turnCount}-${knight.id}-${Date.now()}-${logIdCounter.current++}`,
                turn: turnCount,
                phase: GamePhase.KNIGHT_CHALLENGE,
                speakerId: knight.id,
                content: `骑士决斗决策：${actionLabel}${reasonText}`,
                timestamp: Date.now(),
                isSystem: false,
                debugType: 'KNIGHT_CHALLENGE_STRATEGY' as const,
                durationMs: result.durationMs,
                strategySummary: result.strategySummary,
                modelName: result.modelName,
                debugData: { knight: knight.id, decision: result }
            }]));
            if (result.target) {
                const targetId = result.target;
                const targetPlayer = players.find(p => p.id === targetId);
                setGodState(prev => ({ ...prev, knightChallenged: true, knightChallengeTarget: targetId }));

                if (targetPlayer && isWolfRole(targetPlayer.role)) {
                    // 目标是狼人，目标死亡
                    await addSystemLog(`骑士发起决斗！${targetId}号 是狼人，被决斗击杀！`);
                    const newPlayers = players.map(p => p.id === targetId ? { ...p, status: PlayerStatus.DEAD_SHOOT } : p);
                    setPlayers(newPlayers);

                    // 情侣殉情检查
                    const afterMartyrPlayers = await handleLoverMartyrdom(targetId, newPlayers, PlayerStatus.DEAD_SHOOT);
                    const finalPlayers = afterMartyrPlayers ?? newPlayers;
                    playersAfterChallenge = finalPlayers;
                    const newlyDeadIds = finalPlayers
                        .filter(player => !isEffectivelyAlive(player) &&
                            players.some(previous => previous.id === player.id && isEffectivelyAlive(previous)))
                        .map(player => player.id);
                    if (await beginDeathActions(finalPlayers, newlyDeadIds, 'DAY_FLOW')) {
                        return;
                    }

                    // 决斗致死的猎人不触发开枪（非投票/非狼杀死亡）
                    // 不进入 HUNTER_ACTION

                    const winState = checkWinCondition(finalPlayers);
                    if (winState) { await finishGame(winState, finalPlayers); return; }
                } else {
                    // 目标是好人，骑士死亡
                    await addSystemLog(`骑士发起决斗！${targetId}号 不是狼人，${knight.id}号骑士自己死亡！`);
                    const newPlayers = players.map(p => p.id === knight.id ? { ...p, status: PlayerStatus.DEAD_SHOOT } : p);
                    setPlayers(newPlayers);

                    // 情侣殉情检查
                    const afterMartyrKnight = await handleLoverMartyrdom(knight.id, newPlayers, PlayerStatus.DEAD_SHOOT);
                    const finalKnightPlayers = afterMartyrKnight ?? newPlayers;
                    playersAfterChallenge = finalKnightPlayers;
                    const newlyDeadIds = finalKnightPlayers
                        .filter(player => !isEffectivelyAlive(player) &&
                            players.some(previous => previous.id === player.id && isEffectivelyAlive(previous)))
                        .map(player => player.id);
                    if (await beginDeathActions(finalKnightPlayers, newlyDeadIds, 'DAY_FLOW')) {
                        return;
                    }

                    const winState = checkWinCondition(finalKnightPlayers);
                    if (winState) { await finishGame(winState, finalKnightPlayers); return; }
                }
            } else {
                await addSystemLog(`骑士选择不发起决斗。`);
            }
        }

        // 决斗结束后进入狼人自爆判定或讨论
        const alive = getAlivePlayers(playersAfterChallenge);
        if (godState.wolfExplodeCheckedTurn !== turnCount && isWolfExplodeEnabled()) {
            const livingWolves = alive.filter(p => isWolfRole(p.role));
            if (livingWolves.length > 0) {
                const startIdx = Math.floor(Math.random() * alive.length);
                const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
                setSpeakingQueue(queue);
                setPhase(GamePhase.WOLF_EXPLODE);
                saveSnapshot();
                return;
            }
        }

        // 进入讨论
        const startIdx = Math.floor(Math.random() * alive.length);
        const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
        setSpeakingQueue(queue);
        await addSystemLog(`从 ${alive[startIdx]?.id}号 开始发言。`);
        setPhase(GamePhase.DAY_DISCUSSION);
        saveSnapshot();
    } finally {
        setIsProcessing(false);
    }
};

export const handleWolfExplode = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, speakingQueue, turnCount, getRule,
        setGodState, setPlayers, setTurnCount, setPhase, setLogs, setIsProcessing, addSystemLog, saveSnapshot,
        logIdCounter, isAutoRef,
        getTargetDecision, handleLoverMartyrdom, beginDeathActions, checkWinCondition, finishGame, getAlivePlayers,
    } = ctx;
    setIsProcessing(true);
    try {
        const alive = getAlivePlayers(players);
        const livingWolves = alive.filter(canWolfSelfExplode);
        setGodState(prev => ({ ...prev, wolfExplodeCheckedTurn: turnCount }));
        let exploded = false;

        for (const wolf of livingWolves) {
            const targetIds = alive.filter(p => !isWolfRole(p.role)).map(t => t.id);
            const explodePrompt = `你可以选择自爆并指刀，或放弃。`;
            const result = await getTargetDecision(wolf, [...targetIds, -1], GamePhase.WOLF_EXPLODE, explodePrompt, '狼人选择是否自爆。');
            if (!isAutoRef.current) return;

            const actionLabel = result.rawResult?.action === 'explode' || result.rawResult?.shouldExplode ? '自爆' : '放弃';
            const targetLabel = result.target && targetIds.includes(result.target) ? `，指刀：${result.target}号` : '';
            const reasonText = result.speak ? `\n决策理由：${result.speak}` : '';
            setLogs(prev => appendLog(prev, [{
                id: `wolf-explode-strategy-T${turnCount}-${wolf.id}-${Date.now()}-${logIdCounter.current++}`,
                turn: turnCount,
                phase: GamePhase.WOLF_EXPLODE,
                speakerId: wolf.id,
                content: `狼人自爆决策：${actionLabel}${targetLabel}${reasonText}`,
                timestamp: Date.now(),
                isSystem: false,
                debugType: 'WOLF_EXPLODE_STRATEGY' as const,
                durationMs: result.durationMs,
                strategySummary: result.strategySummary,
                modelName: result.modelName,
                debugData: { wolf: wolf.id, decision: result }
            }]));
            // AI 返回 action: "explode" | "skip"（WerewolfSkill 定义的 Schema）
            const shouldExplode = result.rawResult?.action === 'explode' || result.rawResult?.shouldExplode;
            if (shouldExplode) {
                exploded = true;
                let playersAfterExplosion = players.map(p => p.id === wolf.id ? { ...p, status: PlayerStatus.EXPLODED } : p);
                setPlayers(playersAfterExplosion);
                setGodState(prev => ({ ...prev, explodedWolves: [...prev.explodedWolves, wolf.id] }));
                await addSystemLog(`${wolf.id}号 自爆！身份是 ${ROLE_INFO[wolf.role].label}！`);

                const explodeTarget = result.target;
                const shootTargetRaw = (result.rawResult as LLMResponse | undefined)?.shootTarget ?? (result.rawResult as LLMResponse | undefined)?.shootActionTarget;
                const shootTarget = Number.isFinite(Number(shootTargetRaw)) && targetIds.includes(Number(shootTargetRaw)) ? Number(shootTargetRaw) : null;
                let explosionDeathActionIds: number[] = [];

                // 指刀
                if (explodeTarget && targetIds.includes(explodeTarget)) {
                    setGodState(prev => ({ ...prev, wolfExplodeTarget: explodeTarget }));
                    await addSystemLog(`${wolf.id}号 指刀：${explodeTarget}号。`);
                }

                // 白狼王自爆带人
                if (wolf.role === Role.WHITE_WOLF_KING && getRule('whiteWolfKingExplodeShoot') && shootTarget) {
                    await addSystemLog(`白狼王自爆带走了 ${shootTarget}号！`);
                    playersAfterExplosion = playersAfterExplosion.map(p => p.id === shootTarget ? { ...p, status: PlayerStatus.DEAD_SHOOT } : p);
                    setPlayers(playersAfterExplosion);
                    const afterMartyrExplosion = await handleLoverMartyrdom(
                        shootTarget,
                        playersAfterExplosion,
                        PlayerStatus.DEAD_SHOOT
                    );
                    playersAfterExplosion = afterMartyrExplosion ?? playersAfterExplosion;
                    explosionDeathActionIds = playersAfterExplosion
                        .filter(player => player.id !== wolf.id &&
                            !isEffectivelyAlive(player) &&
                            players.some(previous => previous.id === player.id && isEffectivelyAlive(previous)))
                        .map(player => player.id);
                }

                // 血月使徒自爆封印
                if (wolf.role === Role.BLOOD_MOON_DISCIPLE && getRule('bloodMoonBlockAbilities')) {
                    setGodState(prev => ({ ...prev, bloodMoonSealed: true }));
                    await addSystemLog(`血月使徒自爆，今晚所有神职技能被封印！`);
                }

                // 双爆吞警徽
                if (getRule('doubleExplodeSwallowBadge') && godState.explodedWolves.length >= 1) {
                    // 已有至少1狼自爆过（加上当前这只），双爆吞警徽
                    if (godState.sheriffId) {
                        await addSystemLog(`双爆吞警徽！${godState.sheriffId}号警徽流失！`);
                        setGodState(prev => ({ ...prev, sheriffId: null }));
                    }
                }

                if (await beginDeathActions(
                    playersAfterExplosion,
                    explosionDeathActionIds,
                    'NIGHT_START'
                )) {
                    return;
                }

                const explosionWinState = checkWinCondition(playersAfterExplosion);
                if (explosionWinState) {
                    await finishGame(explosionWinState, playersAfterExplosion);
                    return;
                }

                // 自爆后跳过讨论和投票，直接进入夜晚
                const newTurn = turnCount + 1;
                setTurnCount(newTurn);
                setPhase(GamePhase.NIGHT_START);
                await addSystemLog(`--- 第 ${newTurn} 天 ---`);
                saveSnapshot();
                return;
            }
        }

        if (!exploded) {
            await addSystemLog(`没有狼人自爆，继续白天流程。`);
            if (speakingQueue.length > 0) {
                setPhase(GamePhase.DAY_DISCUSSION);
            } else {
                setPhase(GamePhase.VOTING);
            }
            saveSnapshot();
            return;
        }

        // 自爆后跳过讨论和投票，直接进入夜晚（下方处理）
    } finally {
        setIsProcessing(false);
    }
};

export const handleDiscussionRoundTwo = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, speakingQueue, turnCount,
        setSpeakingQueue, setPhase, setIsProcessing, addSystemLog, saveSnapshot,
        generateTurn, getAlivePlayers, isWolfExplodeEnabled,
    } = ctx;
    const [nextId, ...rest] = speakingQueue;
    if (nextId) {
        const player = players.find(p => p.id === nextId);
        if (player && isEffectivelyAlive(player)) {
            const result = await generateTurn(player, "第二轮补充发言，你可以补充观点或选择跳过。");
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
        }
        setSpeakingQueue(rest);
    } else {
        setIsProcessing(true);
        try {
            if (godState.wolfExplodeCheckedTurn !== turnCount && isWolfExplodeEnabled()) {
                const alive = getAlivePlayers(players);
                const livingWolves = alive.filter(p => isWolfRole(p.role));
                if (livingWolves.length > 0) {
                    setPhase(GamePhase.WOLF_EXPLODE);
                    saveSnapshot();
                    await addSystemLog("狼人可以选择自爆。");
                    return;
                }
            }
            await addSystemLog("第二轮发言结束，开始投票...");
            setPhase(GamePhase.VOTING);
            saveSnapshot();
        } finally {
            setIsProcessing(false);
        }
    }
};
