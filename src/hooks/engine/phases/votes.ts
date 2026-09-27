import { GamePhase, PlayerStatus, Role, isImmuneToVote, isWolfRole } from '../../../types';
import { appendPendingDeathActionIds, enforcePkVoteTarget, getExileVoterIds, isEffectivelyAlive, resolveExileVote } from '../../../game/rules';
import { appendLog, isLlmAbortedResult, isLlmFailedResult, mapWithConcurrency, parseSheriffFlow, VOTE_LLM_CONCURRENCY } from '../../engineHelpers';
import type { PhaseHandlerContext } from '../phaseContext';

// ===== 投票与死亡技能阶段 handler：VOTING / HUNTER_ACTION / GAME_REVIEW =====
// 函数体自 useGameEngine 的 GOD-loop switch case 原样搬移，语义以 ctx 传递保持不变。

export const handleVoting = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, logs, turnCount, aiHostedPlayers, config,
        setGodState, setPlayers, setSpeakingQueue, setTurnCount, setPhase, setLogs, setIsProcessing, addSystemLog, saveSnapshot,
        logIdCounter, isAutoRef,
        getAiVote, generateTurn, checkWinCondition, finishGame, handleLoverMartyrdom, beginDeathActions,
        notifyHumanDeath, getAlivePlayers, getRule,
    } = ctx;
    setIsProcessing(true);
    try {
        const alive = getAlivePlayers(players);
        const votes: Record<number, number> = {};

        // 平票重投时，只能投平票候选人
        const tiedIds = godState.voteTieCandidates ?? null;
        const voterIds = getExileVoterIds(players, tiedIds);
        const voters = alive.filter(player => voterIds.includes(player.id));
        const exileCandidates = alive.filter(p => !isImmuneToVote(p));
        const validTargetIds = tiedIds
            ? tiedIds.filter(id => exileCandidates.some(p => p.id === id))
            : exileCandidates.map(a => a.id);
        // 人类投票立即挂起等待（并发安全），AI 投票限流并发
        const humanVoters = voters.filter(p => p.isHuman && !aiHostedPlayers[p.seatNumber]);
        const aiVoters = voters.filter(p => !(p.isHuman && !aiHostedPlayers[p.seatNumber]));
        const [humanResults, aiResults] = await Promise.all([
            Promise.all(humanVoters.map(async p => ({ voter: p.id, decision: await getAiVote(p, validTargetIds) }))),
            mapWithConcurrency(aiVoters, VOTE_LLM_CONCURRENCY, async p => ({ voter: p.id, decision: await getAiVote(p, validTargetIds) })),
        ]);
        const results = [...humanResults, ...aiResults];
        if (!isAutoRef.current) return;

        // 平票PK轮不允许弃票：空票/无效票强制改投平票候选人
        const isExilePkRound = !!tiedIds && validTargetIds.length > 0;
        const pkForcedVoterIds: number[] = [];
        const enforcedResults = isExilePkRound
            ? results.map(({ voter, decision }) => {
                const forcedTarget = enforcePkVoteTarget(decision.target, validTargetIds);
                if (forcedTarget === decision.target) return { voter, decision };
                pkForcedVoterIds.push(voter);
                return { voter, decision: { ...decision, target: forcedTarget } };
            })
            : results;

        const sheriffId = godState.sheriffId ?? null;
        const voteRows = enforcedResults.map(({ voter, decision }) => ({
            voter,
            target: decision.target,
            voteWeight: sheriffId === voter ? getRule('sheriffVoteWeight') : 1,
            speak: decision.speak,
            strategySummary: decision.strategySummary,
            modelName: decision.modelName,
            durationMs: decision.durationMs,
            isHuman: !!decision.isHuman,
            pkForced: pkForcedVoterIds.includes(voter),
            rawResult: decision.rawResult,
            rawResponse: decision.rawResponse
        }));

        voteRows.forEach(row => {
            const targetText = row.target ? `${row.target}号${row.pkForced ? '（PK轮强制改投）' : ''}` : '弃票';
            const reasonText = row.speak ? `\n投票理由：${row.speak}` : '';
            setLogs(prev => appendLog(prev, [{
                id: `vote-strategy-T${turnCount}-${row.voter}-${Date.now()}-${logIdCounter.current++}`,
                turn: turnCount,
                phase: GamePhase.VOTING,
                speakerId: row.voter,
                content: `投票目标：${targetText}${reasonText}`,
                timestamp: Date.now(),
                isSystem: false,
                debugType: 'VOTE_STRATEGY' as const,
                durationMs: row.durationMs,
                strategySummary: row.strategySummary,
                modelName: row.modelName,
                debugData: row
            }]));                        });

        // Count weighted votes for logic
        voteRows.forEach(({ target, voteWeight }) => {
            if (target && validTargetIds.includes(target)) {
                votes[target] = (votes[target] || 0) + voteWeight;
            }
        });

        const sortedVoteEntries = Object.entries(votes)
            .map(([target, count]) => ({ target: Number(target), count }))
            .sort((a, b) => a.target - b.target);
        const maxVoteCount = sortedVoteEntries.reduce((max, item) => Math.max(max, item.count), -1);
        const tieRound = godState.voteTieRound ?? 0;
        const voteResolution = resolveExileVote(votes, tieRound);
        const victims = voteResolution.tiedPlayerIds;
        const final = voteResolution.finalPlayerId;
        const shouldTieRevote = voteResolution.shouldRevote;

        if (shouldTieRevote) {
            setGodState(prev => ({
                ...prev,
                voteTieCandidates: victims,
                voteTieRound: tieRound + 1,
            }));
        } else {
            setGodState(prev => ({ ...prev, voteTieCandidates: undefined, voteTieRound: undefined }));
        }

        const voteByVoterLines = voteRows
            .sort((a, b) => a.voter - b.voter)
            .map(row => `${row.voter}号${sheriffId === row.voter ? '(警长)' : ''} -> ${row.target ? `${row.target}号${row.pkForced ? '（PK轮强制改投）' : ''}` : '弃票'}，权重 ${row.voteWeight}${row.isHuman ? ' (人类)' : ''}${row.durationMs ? `，耗时 ${row.durationMs}ms` : ''}`);
        const tallyLines = sortedVoteEntries.map(({ target, count }) => `${target}号: ${count}票`);
        const abstainCount = voteRows.filter(({ target }) => !target).length;
        if (abstainCount > 0) tallyLines.push(`弃票: ${abstainCount}票`);

        const voteDetails = [
            `存活玩家: ${validTargetIds.join(', ')}`,
            `警长: ${sheriffId ? `${sheriffId}号（票权 ${getRule('sheriffVoteWeight')}）` : '无'}`,
            `逐票明细:\n${voteByVoterLines.join('\n') || '无'}`,
            `加权票数统计:\n${tallyLines.join('\n') || '无人得票'}`,
            `最高加权票数: ${maxVoteCount > 0 ? maxVoteCount : 0}`,
            `平票候选: ${victims.length ? victims.map(id => `${id}号`).join(', ') : '无'}`,
            `最终出局: ${final ? `${final}号` : '无'}`
        ].join('\n\n');

        setLogs(prev => appendLog(prev, [{
            id: `vote-tally-T${turnCount}-${Date.now()}-${logIdCounter.current++}`,
            turn: turnCount,
            phase: GamePhase.VOTING,
            content: voteDetails,
            timestamp: Date.now(),
            isSystem: true,
            debugType: 'VOTE_TALLY' as const,
            debugData: {
                alive: validTargetIds,
                sheriffId,
                sheriffVoteWeight: getRule('sheriffVoteWeight'),
                votes,
                voteRows,
                abstainCount,
                maxVoteCount: maxVoteCount > 0 ? maxVoteCount : 0,
                tiedCandidates: victims,
                final
            }
        }]));
        const publicVoteSummary = config.voteDetailPublic
            ? `投票结果（加权）:\n${tallyLines.join('\n') || '无人得票'}`
            : final
                ? `投票完成。${final}号 得票最高，被放逐。`
                : shouldTieRevote
                    ? `投票完成。出现平票：${victims.map(id => `${id}号`).join('、')}，进入平票PK发言+重投。`
                    : `投票完成。本轮无人出局。`;
        await addSystemLog(publicVoteSummary, undefined, "投票统计完毕。");

        if (shouldTieRevote) {
            // 平票：平票玩家PK发言后重投
            const tieMsg = `平票PK：${victims.map(id => `${id}号`).join('、')} 请进行补充发言为自己辩护。`;
            await addSystemLog(tieMsg);
            for (const tiedId of victims) {
                const tiedPlayer = players.find(p => p.id === tiedId);
                if (tiedPlayer) {
                    const result = await generateTurn(tiedPlayer, "你处于平票PK环节。请为自己辩护，说服其他玩家不要投给你。");
                    if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
                }
            }
            await addSystemLog(`平票PK发言结束，开始重新投票。`);
            setPhase(GamePhase.VOTING);
            saveSnapshot();
            return;
        }

        if (final) {
            const votedOutPlayer = players.find(p => p.id === final);
            const isIdiot = votedOutPlayer && votedOutPlayer.role === Role.IDIOT;

            if (isIdiot) {
                await addSystemLog(`${final}号 白痴翻牌，免疫放逐！`);
                const newPlayers = players.map(p => p.id === final ? { ...p, status: PlayerStatus.IDIOT_REVEALED } : p);
                setPlayers(newPlayers);
                await addSystemLog(`白痴 ${final}号 翻牌存活，但从此失去投票权。`);
                await addSystemLog("请白痴发表遗言。");
                setPhase(GamePhase.LAST_WORDS);
                setSpeakingQueue([final]);
            } else {
                await addSystemLog(`${final}号 被投票出局。`);
                notifyHumanDeath(final, '被投票放逐');
                let newPlayers = players.map(p => p.id === final ? { ...p, status: PlayerStatus.DEAD_VOTE } : p);
                setPlayers(newPlayers);
                // 记录被放逐玩家ID（守墓人用）
                setGodState(prev => ({ ...prev, lastExiledPlayerId: final }));
                if (godState.sheriffId === final) {
                    const flowTarget = parseSheriffFlow(final, logs, (tid) => !!newPlayers.find(p => p.id === tid && isEffectivelyAlive(p)));
                    if (flowTarget) {
                        setGodState(prev => ({ ...prev, sheriffId: flowTarget }));
                        await addSystemLog(`${final}号警长出局，警徽传给 ${flowTarget}号。`);
                    } else {
                        setGodState(prev => ({ ...prev, sheriffId: null }));
                        await addSystemLog(`${final}号警长出局，无有效警徽流，警徽流失。`);
                    }
                }

                // 情侣殉情检查
                newPlayers = await handleLoverMartyrdom(final, newPlayers, PlayerStatus.DEAD_VOTE);

                // 胜负判断需等死亡技能（猎人/狼王开枪）处理完后再进行，避免提前结束游戏。
                const newlyDeadIds = newPlayers
                    .filter(player => !isEffectivelyAlive(player) &&
                        players.some(previous => previous.id === player.id && isEffectivelyAlive(previous)))
                    .map(player => player.id);
                if (await beginDeathActions(newPlayers, newlyDeadIds, 'NIGHT_START')) {
                    return;
                }

                const exileWinState = checkWinCondition(newPlayers);
                if (exileWinState) {
                    await finishGame(exileWinState, newPlayers);
                    return;
                }

                if (getRule('votedOutLastWords')) {
                    await addSystemLog("请发表遗言。");
                    setPhase(GamePhase.LAST_WORDS);
                    setSpeakingQueue([final]);
                } else {
                    const newTurn = turnCount + 1;
                    setTurnCount(newTurn);
                    setPhase(GamePhase.NIGHT_START);
                    await addSystemLog(`--- 第 ${newTurn} 天 ---`);
                }
            }
        } else {
            await addSystemLog("平安日，无人出局。");
            setPhase(GamePhase.LAST_WORDS);
            setSpeakingQueue([]);
        }
        saveSnapshot();
    } finally {
        setIsProcessing(false);
    }
};

export const handleHunterAction = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, logs, speakingQueue, getRule,
        setPlayers, setGodState, setIsProcessing, addSystemLog, saveSnapshot,
        generateTurn, completeDeathActions, handleLoverMartyrdom,
        notifyHumanDeath, getAlivePlayers,
    } = ctx;
    const pendingIds = godState.pendingDeathActionIds?.length
        ? godState.pendingDeathActionIds
        : speakingQueue;
    const [shooterId, ...remainingIds] = pendingIds;

    if (!shooterId) {
        setIsProcessing(true);
        try {
            await completeDeathActions(players, []);
        } finally {
            setIsProcessing(false);
        }
        return;
    }

    const shooter = players.find(player => player.id === shooterId);
    if (!shooter) {
        setIsProcessing(true);
        try {
            await completeDeathActions(players, remainingIds);
        } finally {
            setIsProcessing(false);
        }
        return;
    }

    const alivePlayers = getAlivePlayers(players);
    const targetIds = alivePlayers.map(player => player.id);
    const isWolfKing = shooter.role === Role.WOLF_KING;
    const wasVotedOut = shooter.status === PlayerStatus.DEAD_VOTE;
    let shotTargetId: number | null = null;

    if (targetIds.length > 0) {
        const shootPrompt = isWolfKing
            ? `你是狼王，你已出局。你可以开枪带走一名玩家，或选择不开枪。`
            : wasVotedOut
                ? `你被投票出局了。请发表你的【遗言】，并在发言末尾发动技能带走一名玩家。此外，你也可以选择放弃开枪（压枪）。`
                : `你出局了，发动猎人技能带走一人。此外，你也可以选择放弃开枪（压枪）。`;
        const result = await generateTurn(shooter, shootPrompt);
        if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
        shotTargetId = result?.actionTarget && targetIds.includes(result.actionTarget)
            ? result.actionTarget
            : null;
    }

    setIsProcessing(true);
    try {
        const shooterLabel = isWolfKing ? '狼王' : '猎人';
        let finalPlayers = players;
        let nextPendingIds = remainingIds;

        if (shotTargetId) {
            await addSystemLog(`${shooterLabel}开枪，${shotTargetId}号 倒牌。`);
            notifyHumanDeath(shotTargetId, '被开枪带走');
            finalPlayers = players.map(player => player.id === shotTargetId
                ? { ...player, status: PlayerStatus.DEAD_SHOOT }
                : player);
            setPlayers(finalPlayers);

            if (godState.sheriffId === shotTargetId) {
                const flowTarget = parseSheriffFlow(
                    shotTargetId,
                    logs,
                    targetId => !!finalPlayers.find(player =>
                        player.id === targetId && isEffectivelyAlive(player)
                    )
                );
                if (flowTarget) {
                    setGodState(prev => ({ ...prev, sheriffId: flowTarget }));
                    await addSystemLog(`${shotTargetId}号警长被枪杀，警徽传给 ${flowTarget}号。`);
                } else {
                    setGodState(prev => ({ ...prev, sheriffId: null }));
                    await addSystemLog(`${shotTargetId}号警长被枪杀，无有效警徽流，警徽流失。`);
                }
            }

            finalPlayers = await handleLoverMartyrdom(
                shotTargetId,
                finalPlayers,
                PlayerStatus.DEAD_SHOOT
            );
            const newlyDeadIds = finalPlayers
                .filter(player => !isEffectivelyAlive(player) &&
                    players.some(previous => previous.id === player.id && isEffectivelyAlive(previous)))
                .map(player => player.id);
            nextPendingIds = appendPendingDeathActionIds(
                remainingIds,
                finalPlayers,
                newlyDeadIds,
                godState.poisonedTonight ?? [],
                getRule('hunterCanShootWhenPoisoned'),
                getRule('wolfKingCanShootWhenPoisoned')
            );

            const addedIds = nextPendingIds.filter(id => !remainingIds.includes(id));
            if (addedIds.length > 0) {
                await addSystemLog(`${addedIds.map(id => `${id}号`).join('、')} 触发后续死亡技能。`);
            }
        } else {
            await addSystemLog(
                targetIds.length > 0
                    ? `${shooterLabel}选择不开枪。`
                    : `${shooterLabel}没有可选择的存活目标，技能结束。`
            );
        }

        await completeDeathActions(finalPlayers, nextPendingIds);
    } finally {
        setIsProcessing(false);
    }
    saveSnapshot();
};

export const handleGameReview = async (ctx: PhaseHandlerContext) => {
    // Stop auto loop
    ctx.setIsAuto(false);
};
