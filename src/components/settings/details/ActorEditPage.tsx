import { useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import { globalApiConfigAtom, llmPresetsAtom, llmProvidersAtom, ttsPresetsAtom, actorProfilesAtom, edgeTtsVoicesAtom } from '../../../store';
import { remoteServerConfigAtom } from '../../../atoms';
import { randomVillagerName } from '../../../utils/randomName';
import { AudioService } from '../../../audio';
import { isBridgeAlive } from '../../../services/mcpBrain';
import { BUILTIN_LLM_PRESET_ID } from '../../../services/builtinLlm';
import { PERSONA_PRESETS } from '../../../types';
import type { ActorProfile } from '../../../types';
import { ActionButton, BackButton, OptionCard, PixelSelect, PixelSlider, pixelInputClass } from '../../ui/pixel';
import type { SubPage } from '../constants';

interface ActorEditPageProps {
    subPage: Extract<SubPage, { type: 'ACTOR_EDIT' }>;
    setSubPage: (subPage: SubPage | null) => void;
}

export const ActorEditPage = ({ subPage, setSubPage }: ActorEditPageProps) => {
    const [actors, setActors] = useAtom(actorProfilesAtom);
    const config = useAtomValue(globalApiConfigAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const voices = useAtomValue(edgeTtsVoicesAtom);
    const [mcpBridgeUp, setMcpBridgeUp] = useState<boolean | null>(null);
    const [inviteCopiedName, setInviteCopiedName] = useState<string | null>(null);

    const actor = actors.find(i => i.id === (subPage as { type: 'ACTOR_EDIT'; id?: string }).id);
    const mcpActorSelected = actor?.brain === 'mcp';

    // MCP 外脑桥健康状态:选中 MCP 大脑的分身编辑页实时显示
    useEffect(() => {
        if (!mcpActorSelected) {
            setMcpBridgeUp(null);
            return;
        }
        let stopped = false;
        const poll = async () => {
            const up = await isBridgeAlive();
            if (!stopped) setMcpBridgeUp(up);
        };
        void poll();
        const timer = window.setInterval(poll, 3000);
        return () => {
            stopped = true;
            window.clearInterval(timer);
        };
    }, [mcpActorSelected]);

    if (!actor) return null;
    const llm = llmPresets.find(p => p.id === actor.llmPresetId);
    const isNarrator = actor.id === config.narratorActorId;
    const tts = ttsPresets.find(t => t.id === actor.ttsPresetId);

    const updateActor = (id: string, updates: Partial<ActorProfile>) => setActors(p => p.map(i => i.id === id ? { ...i, ...updates } : i));

    const cloneActor = (sourceId: string) => {
        const source = actors.find(a => a.id === sourceId);
        if (!source) return;
        const id = `a-${Date.now()}`;
        setActors(p => [...p, { ...source, id, name: `${source.name} (分身)` }]);
    };

    const deleteActor = (id: string) => { setActors(p => p.filter(i => i.id !== id)); setSubPage(null); };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <BackButton onClick={() => setSubPage(null)} />
                <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{isNarrator ? '设置上帝' : '编辑玩家'}</span>
            </div>

            <div className="rounded-none border-[3px] p-5" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                <div className="mb-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color: 'var(--color-accent1)' }}>
                        {isNarrator ? '旁白称呼' : '玩家名称'}
                    </label>
                    <div className="flex gap-2">
                        <input value={actor.name} onChange={(e) => updateActor(actor.id, { name: e.target.value })}
                            className={clsx(pixelInputClass, 'flex-1')} />
                        <button onClick={() => updateActor(actor.id, { name: randomVillagerName(actor.name) })}
                            title="随机起名"
                            className="shrink-0 w-[52px] rounded-none border-[3px] text-xl transition-all active:scale-95"
                            style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>🎲</button>
                    </div>
                </div>

                <div className="mb-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color: 'var(--color-accent1)' }}>大脑 (Brain)</label>
                    <div className="grid grid-cols-2 gap-3">
                        <OptionCard active={(actor.brain ?? 'llm') === 'llm'} onClick={() => updateActor(actor.id, { brain: 'llm' })}>
                            <div className="p-3 text-center text-sm font-bold"
                                style={{ color: (actor.brain ?? 'llm') === 'llm' ? 'var(--color-accent1)' : 'var(--color-muted)' }}>
                                LLM 模型
                            </div>
                        </OptionCard>
                        <OptionCard active={actor.brain === 'mcp'} onClick={() => updateActor(actor.id, { brain: 'mcp' })}>
                            <div className="p-3 text-center text-sm font-bold"
                                style={{ color: actor.brain === 'mcp' ? 'var(--color-accent2)' : 'var(--color-muted)' }}>
                                MCP 外脑
                            </div>
                        </OptionCard>
                    </div>
                    {actor.brain === 'mcp' && (
                        <div className="mt-2 flex items-start justify-between gap-3">
                            <div className="flex-1">
                                <div className="mb-1 text-[10px] font-black" style={{
                                    color: mcpBridgeUp === null
                                        ? 'var(--color-muted)'
                                        : mcpBridgeUp ? 'var(--color-accent3)' : 'var(--color-accent2)',
                                }}>
                                    外脑桥状态：{mcpBridgeUp === null ? '检测中…' : mcpBridgeUp ? '已连接（localhost:3015）' : '未运行'}
                                </div>
                                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                                    该分身的每次发言/投票/技能都交给外部 AI 决策。外脑超时会自动回退上方模型。
                                </p>
                            </div>
                            <button onClick={async () => {
                                // Electron 会注入安装路径;纯浏览器(如局域网成员)降级为查找指令
                                const root = (window as any).__WEREWOLF_PROJECT_ROOT__ as string | undefined;
                                const rootLine = root
                                    ? `项目根目录: ${root}（所有命令先 cd 到这里）`
                                    : '先定位本机的方块狼人杀项目根目录（含 mcp/standalone-bridge.mjs 与 package.json）';
                                const prompt = [
                                    `你来担任单机狼人杀里「${actor.name}」的外脑（座位号与身份在对局中获知）。`,
                                    rootLine,
                                    '步骤：',
                                    '1. 检查枢纽是否在跑（GET http://localhost:3015/health），没跑就用后台任务执行：node mcp/standalone-hub.mjs',
                                    '2. 把 mcp/standalone-agent.mjs（stdio 传输）注册为本会话的 MCP 服务「werewolf-standalone」，只在本次游戏期间使用。',
                                    '3. 先调用 claim_seat 认领分身，name 参数填「' + actor.name + '」。',
                                    '4. 循环调用 wait_for_my_turn 领取决策，用 submit_action 认真提交：发言要有身份感与逻辑，投票/技能要有理由。提示词里已包含你需要的全部上下文；你只会看到自己分身的信息。',
                                    '返回 {waiting:true} 是阶段间隙,继续轮询;只有 {ended:true} 才是对局结束,之后就停止,不要继续调用游戏工具。',
                                ].join('\n');
                                try {
                                    await navigator.clipboard.writeText(prompt);
                                } catch {
                                    const ta = document.createElement('textarea');
                                    ta.value = prompt;
                                    document.body.appendChild(ta);
                                    ta.select();
                                    document.execCommand('copy');
                                    ta.remove();
                                }
                                setInviteCopiedName(actor.id);
                                setTimeout(() => setInviteCopiedName(null), 2000);
                            }} className="shrink-0 rounded-none border px-2 py-1 text-[10px] font-bold transition-all"
                                style={{ background: 'var(--color-accent1)', color: '#fff', borderColor: 'var(--color-border)' }}>
                                {inviteCopiedName === actor.id ? '✓ 已复制' : '📋 复制邀请提示词'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="mb-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color: 'var(--color-accent1)' }}>人设（直播整活）</label>
                    <PixelSelect
                        value={PERSONA_PRESETS.find(p => p.prompt === (actor.stylePrompt ?? ''))?.id ?? (actor.stylePrompt ? 'custom' : 'none')}
                        onChange={e => {
                            const preset = PERSONA_PRESETS.find(p => p.id === e.target.value);
                            if (preset) updateActor(actor.id, { stylePrompt: preset.prompt });
                        }}
                    >
                        {PERSONA_PRESETS.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                        <option value="custom">自定义</option>
                    </PixelSelect>
                    {!PERSONA_PRESETS.some(p => p.prompt === (actor.stylePrompt ?? '')) && (actor.stylePrompt ?? '') !== '' && (
                        <div className="mt-1 text-[10px] leading-snug" style={{ color: 'var(--color-muted)' }}>自定义人设：{actor.stylePrompt}</div>
                    )}
                </div>
                <div className={clsx('grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6', actor.brain === 'mcp' && 'opacity-50')}>
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color: 'var(--color-accent1)' }}>基础模型 (回退用)</label>
                        <PixelSelect
                            value={actor.llmPresetId}
                            onChange={e => updateActor(actor.id, { llmPresetId: e.target.value })}
                        >
                            <option value={BUILTIN_LLM_PRESET_ID}>内置小模型（离线，无需配置）</option>
                            <option value="">未配置模型</option>
                            {llmProviders.map(provider => (
                                <optgroup key={provider.id} label={provider.name}>
                                    {llmPresets.filter(p => p.providerId === provider.id).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </optgroup>
                            ))}
                            {llmPresets.filter(p => !llmProviders.find(prov => prov.id === p.providerId)).length > 0 && (
                                <optgroup label="其他">
                                    {llmPresets.filter(p => !llmProviders.find(prov => prov.id === p.providerId)).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </PixelSelect>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color: 'var(--color-accent2)' }}>TTS 引擎 (语音)</label>
                        <PixelSelect
                            value={actor.ttsPresetId}
                            onChange={e => updateActor(actor.id, { ttsPresetId: e.target.value })}
                            labelColor="var(--color-accent2)"
                        >
                            {ttsPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </PixelSelect>
                    </div>
                </div>

                <div className="rounded-none border-[3px] p-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-accent1)' }}>音色设置 (Voice)</label>

                    {tts?.provider === 'edge-tts' && voices.length > 0 && (
                        <div className="mb-4">
                            <PixelSelect
                                value={actor.voiceId}
                                onChange={e => updateActor(actor.id, { voiceId: e.target.value })}
                            >
                                <option value="">-- 选择音色 --</option>
                                {Array.from(new Set(voices.map(v => v.Locale))).sort().map(locale => (
                                    <optgroup key={locale} label={locale}>
                                        {voices.filter(v => v.Locale === locale).map(v => (
                                            <option key={v.ShortName} value={v.ShortName}>
                                                {v.FriendlyName.replace('Microsoft ', '').replace('Online (Natural) - ', '')} ({v.Gender})
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </PixelSelect>
                        </div>
                    )}



                    <div className="flex flex-col sm:flex-row gap-3 mb-3">
                        <input value={actor.voiceId} onChange={e => updateActor(actor.id, { voiceId: e.target.value })}
                            className={clsx(pixelInputClass, 'flex-1 p-3 font-mono text-xs')}
                            placeholder="zh-CN-XiaoxiaoNeural" />
                        <button onClick={async () => {
                            await AudioService.getInstance().playOrGenerate(
                                `你好，我是${actor.name}。很高兴见到大家。`,
                                actor.voiceId, `test-${Date.now()}`, tts, undefined, undefined,
                                config.ttsSpeed || 1.0, remoteConfig, actor.fineTune
                            );
                        }} className="px-4 py-2 text-xs rounded-none font-bold transition-all active:scale-[0.98] bg-[var(--color-accent1)] hover:brightness-110 text-white shadow-[4px_4px_0_var(--voxel-ink)] shrink-0">
                            试听
                        </button>
                    </div>

                    {tts && (
                        <div className="mt-4 p-3 rounded-none border-[3px]" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>🎛️ 玩家语音微调</span>
                                {actor.fineTune && (
                                    <button onClick={() => updateActor(actor.id, { fineTune: undefined })}
                                        className="text-[10px] font-bold transition-colors" style={{ color: 'var(--color-muted)' }}>重置</button>
                                )}
                            </div>
                            <p className="text-[9px] mb-2" style={{ color: 'var(--color-muted)' }}>覆盖引擎默认值，为此玩家单独定制语音效果</p>
                            {tts.provider === 'edge-tts' && (
                                <div className="space-y-2">
                                    <PixelSlider
                                        label="语速 (Rate)"
                                        badge={actor.fineTune?.rate || tts.fineTune?.rate || '+0%'}
                                        min={-50} max={50} step={1}
                                        value={parseInt(actor.fineTune?.rate || tts.fineTune?.rate || '+0%')}
                                        onChange={e => updateActor(actor.id, { fineTune: { ...actor.fineTune, rate: `${parseInt(e.target.value) > 0 ? '+' : ''}${e.target.value}%` } })}
                                    />
                                    <PixelSlider
                                        label="音调 (Pitch)"
                                        badge={actor.fineTune?.pitch || tts.fineTune?.pitch || '+0Hz'}
                                        min={-50} max={50} step={1}
                                        value={parseInt(actor.fineTune?.pitch || tts.fineTune?.pitch || '+0Hz')}
                                        onChange={e => updateActor(actor.id, { fineTune: { ...actor.fineTune, pitch: `${parseInt(e.target.value) > 0 ? '+' : ''}${e.target.value}Hz` } })}
                                    />
                                </div>
                            )}

                        </div>
                    )}

                    {tts?.provider === 'edge-tts' && (
                        <div className="mt-4">
                            <label className="block text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>推荐音色</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女)' },
                                    { id: 'zh-CN-YunxiNeural', name: '云希 (男)' },
                                    { id: 'zh-CN-YunjianNeural', name: '云健 (男-稳重)' },
                                    { id: 'zh-CN-XiaoyiNeural', name: '晓伊 (女-资讯)' },
                                    { id: 'zh-CN-YunyangNeural', name: '云扬 (男-新闻)' },
                                    { id: 'en-US-AriaNeural', name: 'Aria (EN-F)' },
                                ].map(v => (
                                    <button key={v.id} onClick={() => updateActor(actor.id, { voiceId: v.id })}
                                        className={clsx('px-3 py-1.5 rounded-none text-[10px] font-bold transition-all border',
                                            actor.voiceId === v.id ? '' : '')}
                                        style={{
                                            background: actor.voiceId === v.id ? 'var(--color-accent1)' : 'var(--voxel-wood)',
                                            borderColor: actor.voiceId === v.id ? 'var(--color-accent1)' : 'var(--color-border)',
                                            color: actor.voiceId === v.id ? '#fff' : 'var(--color-muted)',
                                        }}>
                                        {v.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="text-[10px] mt-3 ml-1 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                        {tts?.provider === 'edge-tts' && '使用微软 Edge TTS 引擎。同步后可选择全量音色。'}
                        {!tts?.provider && '请先选择 TTS 引擎。'}
                    </p>
                </div>

                {!isNarrator && (
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6">
                        <ActionButton className="flex-1" onClick={() => { cloneActor(actor.id); setSubPage(null); }}>
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                创建分身
                            </span>
                        </ActionButton>
                        <ActionButton variant="danger" className="flex-1" onClick={() => deleteActor(actor.id)}>删除玩家</ActionButton>
                    </div>
                )}
            </div>
        </div>
    );
};
