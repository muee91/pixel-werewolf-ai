
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import { agentMessagesAtom, appScreenAtom, globalApiConfigAtom, actorProfilesAtom, llmPresetsAtom, llmProvidersAtom, gamePhaseAtom, playersAtom, gameConfigAtom, turnCountAtom, gameResultAtom, logsAtom } from '../store';
import { remoteServerConfigAtom } from '../atoms';
import { AgentMessage, GamePhase, GameResult, Player, PlayerStatus, PHASE_LABELS, ROLE_INFO, Role, WOLF_ROLES, GOD_ROLES, GAME_PRESETS } from '../types';
import { generateText } from '../services/llm';

const buildPresetsInfo = (): string => {
    return GAME_PRESETS.map(p => {
        const roleCount: Record<string, number> = {};
        for (const r of p.roles) {
            const info = ROLE_INFO[r];
            const label = info ? info.label : r;
            roleCount[label] = (roleCount[label] || 0) + 1;
        }
        const roleList = Object.entries(roleCount).map(([name, count]) => `${name}×${count}`).join('、');
        return `- ${p.icon} ${p.label}（${p.playerCount}人）：${p.description}。配置：${roleList}`;
    }).join('\n');
};

const PRESETS_INFO = buildPresetsInfo();

const buildGameContext = (
    phase: GamePhase,
    players: Player[],
    turnCount: number,
    roles: Role[],
    gameResult: GameResult | null,
    recentLogs: string
): string => {
    if (phase === GamePhase.SETUP) {
        return '当前没有进行中的游戏。用户可能在询问规则或准备开始游戏。';
    }

    const phaseLabel = PHASE_LABELS[phase] || phase;
    const alivePlayers = players.filter(p => p.status === PlayerStatus.ALIVE || p.status === PlayerStatus.IDIOT_REVEALED);
    const deadPlayers = players.filter(p => p.status !== PlayerStatus.ALIVE && p.status !== PlayerStatus.IDIOT_REVEALED);

    const roleCount: Record<string, number> = {};
    for (const r of roles) {
        const info = ROLE_INFO[r];
        const label = info ? info.label : r;
        roleCount[label] = (roleCount[label] || 0) + 1;
    }
    const roleList = Object.entries(roleCount).map(([name, count]) => `${name}×${count}`).join('、');

    const aliveList = alivePlayers.map(p => {
        const info = ROLE_INFO[p.role];
        const roleName = info ? info.label : p.role;
        const statusTag = p.status === PlayerStatus.IDIOT_REVEALED ? '(已翻牌)' : '';
        return `${p.seatNumber}号(${roleName}${statusTag})`;
    }).join('、');

    const deadList = deadPlayers.map(p => {
        const info = ROLE_INFO[p.role];
        const roleName = info ? info.label : p.role;
        const causeMap: Record<string, string> = {
            [PlayerStatus.DEAD_NIGHT]: '夜晚死亡',
            [PlayerStatus.DEAD_VOTE]: '被放逐',
            [PlayerStatus.DEAD_SHOOT]: '被猎杀',
            [PlayerStatus.DEAD_POISON]: '被毒杀',
            [PlayerStatus.EXPLODED]: '自爆',
        };
        const cause = causeMap[p.status] || '已死亡';
        return `${p.seatNumber}号(${roleName}，${cause})`;
    }).join('、');

    const teams = { wolf: 0, god: 0, villager: 0 };
    for (const p of alivePlayers) {
        if (WOLF_ROLES.includes(p.role)) teams.wolf++;
        else if (GOD_ROLES.includes(p.role)) teams.god++;
        else teams.villager++;
    }

    let context = `## 当前对局状态\n`;
    context += `- 回合：第 ${turnCount} 回合\n`;
    context += `- 阶段：${phaseLabel}\n`;
    context += `- 角色配置：${roleList}\n`;
    context += `- 存活人数：${alivePlayers.length}人（狼人阵营${teams.wolf}人、神职${teams.god}人、平民${teams.villager}人）\n`;

    if (gameResult) {
        const resultMap: Record<string, string> = { GOOD: '好人阵营', WOLF: '狼人阵营', THIRD_PARTY: '第三方阵营' };
        context += `- 游戏结果：${resultMap[gameResult.winner] || gameResult.winner}获胜\n`;
    }

    if (aliveList) context += `- 存活玩家：${aliveList}\n`;
    if (deadList) context += `- 已死亡：${deadList}\n`;

    if (recentLogs) {
        context += `\n## 近期事件摘要\n${recentLogs}`;
    }

    return context;
};

const AgentView = () => {
    const setScreen = useSetAtom(appScreenAtom);
    const [messages, setMessages] = useAtom(agentMessagesAtom);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const config = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);

    const phase = useAtomValue(gamePhaseAtom);
    const players = useAtomValue(playersAtom);
    const gameConfig = useAtomValue(gameConfigAtom);
    const turnCount = useAtomValue(turnCountAtom);
    const gameResult = useAtomValue(gameResultAtom);
    const allLogs = useAtomValue(logsAtom);

    const recentLogs = useMemo(() => {
        const recent = allLogs.slice(-15);
        return recent
            .filter(l => l.isSystem || l.speakerId != null)
            .map(l => {
                const label = PHASE_LABELS[l.phase] || l.phase;
                if (l.isSystem) return `[${label}] ${l.content}`;
                return `[${label}] ${l.speakerId}号: ${l.content}`;
            })
            .join('\n');
    }, [allLogs]);

    const gameContext = useMemo(() => {
        return buildGameContext(phase, players, turnCount, gameConfig.roles, gameResult, recentLogs);
    }, [phase, players, turnCount, gameConfig.roles, gameResult, recentLogs]);

    const isInGame = phase !== GamePhase.SETUP;

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isThinking]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg: AgentMessage = { id: Date.now().toString(), role: 'user', content: input, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsThinking(true);

        try {
            const narrator = actors.find(a => a.id === config.narratorActorId) || actors[0];
            const llm = llmPresets.find(l => l.id === narrator?.llmPresetId) || llmPresets[0];
            const provider = llmProviders.find(p => p.id === llm?.providerId) || llmProviders[0];

            if (!llm || !provider) {
                throw new Error('请先在设置中配置可用的模型。');
            }

            const apiMsgs = [
                {
                    role: 'system',
                    content: `你是 AI 狼人杀的上帝助手。你可以看到所有隐藏信息，你的职责是：
1. 回答狼人杀规则和流程问题
2. 分析当前对局局势，给出策略建议
3. 解释角色技能和互动机制
4. 回答本应用的使用问题
5. 推荐适合的玩法配置

注意：你是上帝视角，可以看到所有角色身份，但不要主动剧透——只有当用户明确询问时才透露隐藏信息。

## 内置玩法列表
${PRESETS_INFO}

${gameContext}`
                },
                ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content })),
                { role: 'user', content: input }
            ];
            const text = await generateText(apiMsgs, llm, provider, undefined, undefined, remoteConfig.llmProxyEnabled ? remoteConfig.llmProxyUrl : undefined);

            if (text) setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: text, timestamp: Date.now() }]);
        } catch (e) {
            const message = e instanceof Error ? e.message : '连接 AI 失败。';
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: `连接 AI 失败：${message}`, timestamp: Date.now() }]);
        } finally {
            setIsThinking(false);
        }
    };

    const isSendingDisabled = !input.trim() || isThinking;

    return (
        <div
            className="vw-settings absolute inset-0 w-full bg-th-bg flex flex-col overflow-hidden z-50"
            style={{ height: '100dvh' }}
        >
            <div className="flex items-center min-h-14 sm:min-h-16 bg-th-card/70 border-b-[3px] border-th-border px-4 sm:px-6 sticky top-0 z-20 shadow-[3px_3px_0_var(--voxel-ink)] justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">✨</span>
                    <div>
                        <h2 className="text-lg font-black text-th-fg tracking-tight leading-tight">上帝助手</h2>
                        {isInGame && (
                            <span className="text-xs font-bold text-th-god bg-th-god/10 px-1.5 py-0.5 rounded-none">
                                已感知第{turnCount}回合对局
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setScreen('HOME')}
                    className="flex min-h-10 items-center border-[3px] border-th-border bg-th-bg2 px-3 text-xs font-black text-th-fg transition-colors hover:border-th-accent1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                    关闭
                </button>
            </div>

            {/* 对话贴底：只有一条问候时也不该顶着页头飘在上半屏（mt-auto 在内容超出时自动归零，滚动照常） */}
            <div ref={scrollRef} className="flex flex-1 min-h-0 flex-col overflow-y-auto p-3 pb-6 relative z-10 custom-scrollbar sm:p-4">
                <div className="mx-auto mt-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
                {messages.map(m => (
                    <div key={m.id} className={clsx("flex flex-col max-w-[85%]", m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                        <div className={clsx(
                            /* break-words 是必需的：模型报错会原样带回一整段 JSON（没有空格的长 token）。
                               但光有 overflow-wrap 不够——flex 项的自动最小宽度仍是「最长不可断片段」的宽度
                               （实测 599px vs 父级 311px），必须同时 min-w-0 把这条下限放开，才会真的折行 */
                            "min-w-0 max-w-full p-4 rounded-none text-sm leading-relaxed shadow-[3px_3px_0_var(--voxel-ink)] border-[3px] whitespace-pre-wrap break-words",
                            m.role === 'user'
                                ? "bg-th-accent1 text-[var(--voxel-ink)] border-th-accent1"
                                : "bg-th-card/70 text-th-fg border-th-border"
                        )}>
                            {m.content}
                        </div>
                        <span className="text-xs text-th-muted mt-1 px-1">{new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                    </div>
                ))}
                {messages.length <= 1 && !isThinking && (
                    <div className="border-[3px] border-th-border bg-th-card/70 p-4 shadow-[3px_3px_0_var(--voxel-ink)]">
                        <div className="text-xs font-black tracking-[0.18em] text-th-muted">可以这样问</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(isInGame
                                ? ['现在场上谁最像狼？', '还有几个神职在场上？', '这一轮该票谁？']
                                : ['新手适合用哪个板子？', '女巫首晚能自救吗？', '预言家第一晚该查谁？']
                            ).map(prompt => (
                                <button
                                    key={prompt}
                                    onClick={() => setInput(prompt)}
                                    className="min-h-11 border-[3px] border-th-border bg-th-bg2 px-3 py-2 text-left text-xs font-black text-th-fg transition-colors hover:border-th-accent1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 text-xs font-bold text-th-muted">
                            {isInGame
                                ? '助手能看到完整牌局，只在被问到时才会透露隐藏身份。'
                                : '它知道全部规则和内置板子；开局后再问它，还能读当前局势。'}
                        </div>
                    </div>
                )}
                {isThinking && (
                    <div className="flex flex-col max-w-[85%] mr-auto items-start animate-pulse">
                        <div className="bg-th-card/70 p-4 rounded-none border-[3px] border-th-border shadow-[3px_3px_0_var(--voxel-ink)] flex gap-1">
                            <div className="w-2 h-2 bg-th-muted rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-th-muted rounded-full animate-pulse delay-150"></div>
                            <div className="w-2 h-2 bg-th-muted rounded-full animate-pulse delay-300"></div>
                        </div>
                    </div>
                )}
                </div>
            </div>

            <div className="p-3 sm:p-4 pb-[calc(1rem+var(--safe-area-inset-bottom))] bg-th-card/70 border-t-[3px] border-th-border relative z-20">
                <div className="flex gap-3 max-w-4xl mx-auto">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        className="flex-1 bg-th-bg2 border-[3px] border-th-border rounded-none px-4 py-3 text-th-fg placeholder:text-th-muted focus:outline-none focus:ring-2 focus:ring-th-accent1/20 focus:border-th-accent1 transition-all duration-200"
                        placeholder={isInGame ? "分析局势、询问角色技能、查看对局信息..." : "询问规则或寻求建议..."}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isSendingDisabled}
                        aria-label="发送"
                        className={clsx(
                            "flex shrink-0 items-center rounded-none border-[3px] border-[var(--voxel-ink)] px-6 text-[var(--voxel-ink)] font-bold transition-all active:scale-95",
                            /* 用纸灰底区分「不可发」，而不是整钮 opacity：整体降透明会把箭头一起洗掉，
                               一张看不清图标的按钮比一张明显不可用的按钮更糟 */
                            isSendingDisabled
                                ? "cursor-not-allowed bg-th-muted"
                                : "bg-th-accent1 hover:brightness-110 shadow-[4px_4px_0_var(--voxel-ink)]"
                        )}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AgentView;
