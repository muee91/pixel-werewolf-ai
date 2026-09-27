import { GamePhase, PlayerStatus, isWolfRole, type Player, type UserInput } from '../../../types';
import { isEffectivelyAlive } from '../../../game/rules';
import { appendLog, isLlmAbortedResult, isLlmFailedResult, mapWithConcurrency, parseSheriffFlow, VOTE_LLM_CONCURRENCY } from '../../engineHelpers';
import { AudioService } from '../../../audio';
import type { LLMResponse } from '../../../services/llm';
import type { PhaseHandlerContext } from '../phaseContext';

// ===== 警长竞选阶段 handler：SHERIFF_ELECTION / SHERIFF_VOTING / SHERIFF_WITHDRAW =====
// 函数体自 useGameEngine 的 GOD-loop switch case 原样搬移，语义以 ctx 传递保持不变。

export const handleSheriffElection = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, speakingQueue,
        setSpeakingQueue, setPhase, setIsProcessing, addSystemLog, saveSnapshot,
        generateTurn, getRule,
    } = ctx;
    const [nextId, ...rest] = speakingQueue;
    if (nextId) {
        const candidate = players.find(p => p.id === nextId);
        if (candidate && isEffectivelyAlive(candidate)) {
            const isPkSpeech = (godState.sheriffVoteRound ?? 1) > 1;
            const prompt = isPkSpeech
                ? "警长投票出现平票，你正在进行警长PK发言。请围绕自己为什么更适合拿警徽做简短发言。"
                : "你正在竞选警长。请发表简短竞选发言，说明你会如何带队归票。";
            const result = await generateTurn(candidate, prompt, undefined, true);
            if (isLlmAbortedResult(result) || isLlmFailedResult(result)) return;
        }
        setSpeakingQueue(rest);
    } else {
        setIsProcessing(true);
        try {
            // 退水环节（竞选发言结束后）
            if (getRule('sheriffWithdrawEnabled') && (godState.sheriffVoteRound ?? 1) <= 1) {
                await addSystemLog("竞选发言结束，进入退水环节。");
                setPhase(GamePhase.SHERIFF_WITHDRAW);
                saveSnapshot();
                return;
            }
            await addSystemLog("警长竞选发言结束，开始警长投票...");
            setPhase(GamePhase.SHERIFF_VOTING);
            saveSnapshot();
        } finally {
            setIsProcessing(false);
        }
    }
};

export const handleSheriffVoting = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, turnCount, aiHostedPlayers, config,
        setGodState, setSpeakingQueue, setPhase, setLogs, setIsProcessing, addSystemLog, saveSnapshot,
        logIdCounter, isAutoRef,
        getTargetDecision, getAlivePlayers, getRule,
    } = ctx;
    setIsProcessing(true);
    try {
        const alive = getAlivePlayers(players);
        const candidates = (godState.sheriffCandidates ?? []).filter(id => alive.some(p => p.id === id));

        if (candidates.length === 0) {
            await addSystemLog("本局无人竞选警长，跳过警长投票。");
            const startIdx = Math.floor(Math.random() * alive.length);
            const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
            setSpeakingQueue(queue);
            await addSystemLog(`从 ${alive[startIdx].id}号 开始发言。`);
            setPhase(GamePhase.DAY_DISCUSSION);
            saveSnapshot();
            return;
        }

        const sheriffVoteRound = godState.sheriffVoteRound ?? 1;
        const isPkRound = sheriffVoteRound > 1;
        const voters = isPkRound
            ? alive.filter(p => !candidates.includes(p.id))
            : alive;
        const actualVoters = voters.length > 0 ? voters : alive;
        // 人类投票立即挂起等待（并发安全：resolver 按 playerId 路由），
        // AI 投票走限流并发，避免全员同时打 LLM 触发 429 风暴
        const sheriffInstruction = `请在警长候选人中投票。候选人：[${candidates.join(', ')}]。${isPkRound ? '本轮为警长PK投票。' : ''}`;
        const isHumanVoter = (p: Player) => p.isHuman && !aiHostedPlayers[p.seatNumber];
        const humanSheriffVoters = actualVoters.filter(isHumanVoter);
        const aiSheriffVoters = actualVoters.filter(p => !isHumanVoter(p));
        const [humanSheriffDecisions, aiSheriffDecisions] = await Promise.all([
            Promise.all(humanSheriffVoters.map(p => getTargetDecision(p, candidates, GamePhase.SHERIFF_VOTING, sheriffInstruction, '人类玩家手动投警长票。'))),
            mapWithConcurrency(aiSheriffVoters, VOTE_LLM_CONCURRENCY, p => getTargetDecision(p, candidates, GamePhase.SHERIFF_VOTING, sheriffInstruction, '人类玩家手动投警长票。')),
        ]);
        if (!isAutoRef.current) return;
        const voteRows = [
            ...humanSheriffVoters.map((p, i) => ({ voter: p.id, decision: humanSheriffDecisions[i] })),
            ...aiSheriffVoters.map((p, i) => ({ voter: p.id, decision: aiSheriffDecisions[i] })),
        ];
        if (!isAutoRef.current) return;

        voteRows.forEach(row => {
            const targetText = row.decision.target ? `${row.decision.target}号` : '弃票';
            const reasonText = row.decision.speak ? `\n投票理由：${row.decision.speak}` : '';
            setLogs(prev => appendLog(prev, [{
                id: `sheriff-vote-strategy-T${turnCount}-${row.voter}-${Date.now()}-${logIdCounter.current++}`,
                turn: turnCount,
                phase: GamePhase.SHERIFF_VOTING,
                speakerId: row.voter,
                content: `警长投票轮次：第${sheriffVoteRound}轮${isPkRound ? '（PK）' : ''}\n警长投票目标：${targetText}${reasonText}`,
                timestamp: Date.now(),
                isSystem: false,
                debugType: 'VOTE_STRATEGY' as const,
                durationMs: row.decision.durationMs,
                strategySummary: row.decision.strategySummary,
                modelName: row.decision.modelName,
                debugData: row
            }]));                        });

        const votes: Record<number, number> = {};
        voteRows.forEach(({ decision }) => { if (decision.target && candidates.includes(decision.target)) votes[decision.target] = (votes[decision.target] || 0) + 1; });
        const sortedVoteEntries = Object.entries(votes)
            .map(([target, count]) => ({ target: Number(target), count }))
            .sort((a, b) => a.target - b.target);
        const maxVoteCount = sortedVoteEntries.reduce((max, item) => Math.max(max, item.count), -1);
        const winners = sortedVoteEntries.filter(item => item.count === maxVoteCount && item.count > 0).map(item => item.target);
        const hasSingleWinner = winners.length === 1;
        const isTie = winners.length > 1;
        const noValidVotes = winners.length === 0;
        const sheriffId = hasSingleWinner ? winners[0] : null;
        const abstainCount = voteRows.filter(({ decision }) => !decision.target || !candidates.includes(decision.target)).length;
        const detailLines = voteRows
            .sort((a, b) => a.voter - b.voter)
            .map(row => `${row.voter}号 -> ${row.decision.target && candidates.includes(row.decision.target) ? `${row.decision.target}号` : '弃票'}${row.decision.isHuman ? ' (人类)' : ''}${row.decision.durationMs ? `，耗时 ${row.decision.durationMs}ms` : ''}`);
        const tallyLines = sortedVoteEntries.map(({ target, count }) => `${target}号: ${count}票`);
        if (abstainCount > 0) tallyLines.push(`弃票/无效: ${abstainCount}票`);
        const resultText = hasSingleWinner
            ? `当选警长: ${sheriffId}号`
            : isTie && sheriffVoteRound === 1
                ? `处理结果: 平票进入PK发言`
                : `处理结果: ${noValidVotes ? '无人得票' : 'PK仍平票'}，本局警徽流失`;

        setLogs(prev => appendLog(prev, [{
            id: `sheriff-vote-tally-T${turnCount}-${Date.now()}-${logIdCounter.current++}`,
            turn: turnCount,
            phase: GamePhase.SHERIFF_VOTING,
            content: [
                `警长投票轮次: 第${sheriffVoteRound}轮${isPkRound ? '（PK）' : ''}`,
                `警长候选人: ${candidates.map(id => `${id}号`).join(', ')}`,
                `投票玩家: ${actualVoters.map(p => `${p.id}号`).join(', ') || '无'}`,
                `逐票明细:\n${detailLines.join('\n') || '无'}`,
                `票数统计:\n${tallyLines.join('\n') || '无人得票'}`,
                `最高票数: ${maxVoteCount > 0 ? maxVoteCount : 0}`,
                `平票候选: ${winners.length ? winners.map(id => `${id}号`).join(', ') : '无'}`,
                resultText
            ].join('\n\n'),
            timestamp: Date.now(),
            isSystem: true,
            debugType: 'VOTE_TALLY' as const,
            debugData: { candidates, voteRows, votes, abstainCount, tiedCandidates: winners, sheriffId, sheriffVoteRound, isPkRound }
        }]));
        if (hasSingleWinner && sheriffId) {
            setGodState(prev => ({ ...prev, sheriffId, sheriffTieCandidates: [], sheriffVoteRound: 1 }));
            const publicSheriffVoteSummary = config.voteDetailPublic
                ? `警长投票结果：${tallyLines.join('；') || '无人得票'}。${sheriffId}号 当选警长，放逐投票权重为 ${getRule('sheriffVoteWeight')} 票。`
                : `警长投票完成。${sheriffId}号 当选警长，放逐投票权重为 ${getRule('sheriffVoteWeight')} 票。`;
            await addSystemLog(publicSheriffVoteSummary, undefined, `${sheriffId}号当选警长。`);
        } else if (isTie && sheriffVoteRound === 1) {
            setGodState(prev => ({ ...prev, sheriffCandidates: winners, sheriffTieCandidates: winners, sheriffVoteRound: 2 }));
            setSpeakingQueue(winners);
            await addSystemLog(`警长投票平票，${winners.map(id => `${id}号`).join('、')} 进入警长PK发言。`);
            setPhase(GamePhase.SHERIFF_ELECTION);
            saveSnapshot();
            return;
        } else {
            setGodState(prev => ({ ...prev, sheriffId: null, sheriffTieCandidates: winners, sheriffVoteRound: 1 }));
            const publicNoSheriffSummary = config.voteDetailPublic
                ? `警长投票结果：${tallyLines.join('；') || '无人得票'}。${noValidVotes ? '无人得票' : 'PK仍平票'}，本局警徽流失。`
                : `警长投票完成。${noValidVotes ? '无人得票' : 'PK仍平票'}，本局警徽流失。`;
            await addSystemLog(publicNoSheriffSummary, undefined, '本局无警长。');
        }

        const startIdx = Math.floor(Math.random() * alive.length);
        const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
        setSpeakingQueue(queue);
        await addSystemLog(`从 ${alive[startIdx].id}号 开始发言。`);
        setPhase(GamePhase.DAY_DISCUSSION);
        saveSnapshot();
    } finally {
        setIsProcessing(false);
    }
};

export const handleSheriffWithdraw = async (ctx: PhaseHandlerContext) => {
    const {
        players, godState, turnCount, globalConfig, remoteConfig,
        setGodState, setPlayers, setSpeakingQueue, setTurnCount, setPhase, setTimeline, setSpeaker, setIsPlayingAudio, setIsProcessing, setLogs, addSystemLog, saveSnapshot,
        logIdCounter, isAutoRef,
        getTargetDecision, getActorConfig, getAlivePlayers, isWolfExplodeEnabled, waitForSpectatorDialogue,
    } = ctx;
    setIsProcessing(true);
    try {
        const candidates = godState.sheriffCandidates ?? [];
        const remainingCandidates: number[] = [];

        for (const candidateId of candidates) {
            const candidate = players.find(p => p.id === candidateId);
            if (!candidate || !isEffectivelyAlive(candidate)) continue;

            const withdrawPrompt = `你正在竞选警长，是否退水（放弃竞选）？`;
            const result = await getTargetDecision(candidate, [-1], GamePhase.SHERIFF_WITHDRAW, withdrawPrompt, '选择是否退水。');
            if (!isAutoRef.current) return;

            const shouldWithdraw = (result.rawResult as LLMResponse | UserInput | undefined)?.action === 'withdraw' || (result.rawResult as LLMResponse | UserInput | undefined)?.shouldWithdraw === true;
            const actionLabel = shouldWithdraw ? '退水' : '坚持竞选';
            const publicStatement = result.speak?.trim() || (shouldWithdraw
                ? '我选择退水，放弃本轮警长竞选。'
                : '我选择坚持竞选，请各位继续听我发言与归票。');
            const statementId = `sheriff-withdraw-statement-T${turnCount}-${candidateId}-${Date.now()}-${logIdCounter.current++}`;
            const decisionId = `sheriff-withdraw-strategy-T${turnCount}-${candidateId}-${Date.now()}-${logIdCounter.current++}`;
            const { actor, tts } = getActorConfig(candidate.actorId);
            const statementAudioKey = `audio_game_${statementId}`;
            const statementStartedAt = Date.now();

            // A withdrawal is a public declaration, so it must use the
            // exact same log/TTS/presentation lane as a normal speech.
            // This prevents the next system cue from overtaking it.
            setSpeaker(candidateId);
            setPlayers(prev => prev.map(player => player.id === candidateId ? { ...player, isSpeaking: true } : player));
            setLogs(prev => appendLog(prev, [{
                id: statementId,
                turn: turnCount,
                phase: GamePhase.SHERIFF_WITHDRAW,
                speakerId: candidateId,
                content: publicStatement,
                timestamp: Date.now(),
                isSystem: false,
            }]));                            setTimeline(prev => [...prev, {
                id: statementId,
                type: 'PLAYER',
                speakerName: `${candidateId}号`,
                text: publicStatement,
                voiceId: actor.voiceId,
                ttsProvider: tts.provider,
                ttsModel: '',
                ttsBaseUrl: '',
                ttsApiKey: '',
                audioKey: statementAudioKey,
                timestamp: Date.now(),
                isPrivate: false,
            }]);
            setLogs(prev => appendLog(prev, [{
                id: decisionId,
                turn: turnCount,
                phase: GamePhase.SHERIFF_WITHDRAW,
                speakerId: candidateId,
                content: `警长退水决策：${actionLabel}`,
                timestamp: Date.now(),
                isSystem: false,
                debugType: 'SHERIFF_WITHDRAW_STRATEGY' as const,
                durationMs: result.durationMs,
                strategySummary: result.strategySummary,
                modelName: result.modelName,
                debugData: { candidate: candidateId, decision: result }
            }]));
            setIsPlayingAudio(true);
            try {
                if (globalConfig.enabled) {
                    await AudioService.getInstance().playOrGenerate(
                        publicStatement,
                        actor.voiceId,
                        statementAudioKey,
                        tts,
                        undefined,
                        undefined,
                        globalConfig.ttsSpeed || 1.0,
                        remoteConfig,
                        actor.fineTune,
                    );
                } else {
                    await new Promise(resolve => window.setTimeout(resolve, 200));
                }
                await waitForSpectatorDialogue(publicStatement, statementStartedAt);
            } finally {
                setIsPlayingAudio(false);
                setPlayers(prev => prev.map(player => player.id === candidateId ? { ...player, isSpeaking: false } : player));
                setSpeaker(null);
            }

            if (shouldWithdraw) {
                await addSystemLog(`${candidateId}号 选择退水。`);
                if (isWolfRole(candidate.role) && result.rawResult?.shouldExplode && isWolfExplodeEnabled()) {
                    setPlayers(prev => prev.map(p => p.id === candidateId ? { ...p, status: PlayerStatus.EXPLODED } : p));
                    setGodState(prev => ({ ...prev, explodedWolves: [...prev.explodedWolves, candidateId] }));
                    await addSystemLog(`${candidateId}号 退水时自爆！警徽被吞！`);
                    setGodState(prev => ({ ...prev, sheriffId: null, sheriffCandidates: [] }));
                    const newTurn = turnCount + 1;
                    setTurnCount(newTurn);
                    setPhase(GamePhase.NIGHT_START);
                    await addSystemLog(`--- 第 ${newTurn} 天 ---`);
                    saveSnapshot();
                    return;
                }
            } else {
                remainingCandidates.push(candidateId);
                await addSystemLog(`${candidateId}号 坚持竞选。`);
            }
        }

        if (remainingCandidates.length === 0) {
            await addSystemLog(`所有竞选者退水，本局无警长。`);
            setGodState(prev => ({ ...prev, sheriffId: null, sheriffCandidates: [] }));
            const alive = getAlivePlayers(players);
            const startIdx = Math.floor(Math.random() * alive.length);
            const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
            setSpeakingQueue(queue);
            setPhase(GamePhase.DAY_DISCUSSION);
            saveSnapshot();
            return;
        }

        if (remainingCandidates.length === 1) {
            const sheriffId = remainingCandidates[0];
            setGodState(prev => ({ ...prev, sheriffId, sheriffCandidates: remainingCandidates }));
            await addSystemLog(`${sheriffId}号 当选警长！`);
            const alive = getAlivePlayers(players);
            const startIdx = Math.floor(Math.random() * alive.length);
            const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
            setSpeakingQueue(queue);
            setPhase(GamePhase.DAY_DISCUSSION);
            saveSnapshot();
            return;
        }

        // 多人坚持，进入投票
        setGodState(prev => ({ ...prev, sheriffCandidates: remainingCandidates }));
        setPhase(GamePhase.SHERIFF_VOTING);
        saveSnapshot();
    } finally {
        setIsProcessing(false);
    }
};
