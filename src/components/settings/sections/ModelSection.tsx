import { useSyncExternalStore } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { globalApiConfigAtom, llmPresetsAtom, llmProvidersAtom } from '../../../store';
import { remoteServerConfigAtom } from '../../../atoms';
import { downloadBuiltinModel, getBuiltinLlmSnapshot, subscribeBuiltinLlm } from '../../../services/builtinLlm';
import { isProviderConfiguredForRuntime } from '../../../utils/llmConfig';
import { SectionLabel, ActionButton } from '../../ui/pixel';
import type { ModelReadiness } from '../useModelReadiness';
import type { SubPage } from '../constants';

interface ModelSectionProps {
    setSubPage: (subPage: SubPage | null) => void;
    readiness: ModelReadiness;
}

// 模型分区只管「大脑」:健康检查、内置小模型、供应商与模型预设。
// 代理/转发属于网络配置(高级),TTS 与朗读属于听感(声音),导入导出属于数据搬家(高级)。
export const ModelSection = ({ setSubPage, readiness }: ModelSectionProps) => {
    const [config] = useAtom(globalApiConfigAtom);
    const [remoteConfig] = useAtom(remoteServerConfigAtom);
    const [llmProviders, setLlmProviders] = useAtom(llmProvidersAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const builtinLlm = useSyncExternalStore(subscribeBuiltinLlm, getBuiltinLlmSnapshot);
    const { modelReady, ttsReady, runtimeProviderReady, effectiveModelReadyCount, builtinReady } = readiness;

    const createProvider = () => {
        const id = `provider-${Date.now()}`;
        setLlmProviders(p => [...p, { id, name: '新建供应商', type: 'openai', baseUrl: '', apiKey: '' }]);
        setTimeout(() => setSubPage({ type: 'PROVIDER_EDIT', id }), 0);
    };

    // 三格合并成三个可悬停的小药丸：原来的 200px 诊断面板和下面的供应商列表抢同一屏，
    // 详细原因挪进 title，鼠标停上去就能看全，版面只留一行结论。
    const checks = [
        {
            label: '供应商',
            ok: runtimeProviderReady,
            summary: remoteConfig.llmProxyEnabled
                ? '代理'
                : `${llmProviders.filter(provider => isProviderConfiguredForRuntime(provider, remoteConfig)).length}/${llmProviders.length}`,
            detail: remoteConfig.llmProxyEnabled ? '使用远程代理' : `${llmProviders.filter(provider => isProviderConfiguredForRuntime(provider, remoteConfig)).length}/${llmProviders.length} 可用`,
        },
        {
            label: '模型',
            ok: modelReady,
            summary: `${effectiveModelReadyCount}`,
            detail: builtinReady && effectiveModelReadyCount <= 1 ? '内置小模型可离线驱动' : `${effectiveModelReadyCount} 个可开局模型`,
        },
        {
            label: '语音',
            ok: ttsReady,
            // 不能只写「开」：开着但没有 edge-tts 引擎时药丸是「!」，和「开」并排会自相矛盾。
            summary: ttsReady ? (config.enabled ? '开' : '关') : '未就绪',
            detail: config.enabled ? 'Edge TTS 已选择（需联网）' : '语音已关闭，文字字幕照常',
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <SectionLabel>开局健康检查</SectionLabel>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-none border-[3px] px-4 py-3"
                    data-testid="model-health"
                    /* 这条横幅讲的是「能不能开局」，而离线大脑永远能开局——框子用红石等于每次进设置都在报错。
                       红/金只留给右侧那几枚检查药丸（它们才是在说「还缺什么」） */
                    style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <span className="h-3 w-3 shrink-0" style={{ background: modelReady ? 'var(--voxel-emerald)' : 'var(--voxel-torch)' }} />
                    {/* min-w 兜底:窄屏下右侧药丸组是 shrink-0 的 max-content,不加会把文字挤成一字一行 */}
                    <div className="min-w-[180px] flex-1">
                        <div className="text-sm font-black leading-tight" style={{ color: 'var(--color-fg)' }}>
                            {modelReady
                                ? (builtinReady && effectiveModelReadyCount <= 1 && llmPresets.length === 0 ? '营地可用内置小模型开局' : '营地可以启动 AI 对局')
                                : '现在就能玩：本局由内置离线大脑驱动；配好模型后 AI 更像真人'}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] leading-snug" style={{ color: 'var(--color-muted)' }}
                            title="只检查配置完整性，不读取或展示 API Key。启动前可在模型详情中进行真实连接验证。">
                            只检查配置完整性，不读取或展示 API Key
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {checks.map(item => (
                            <span key={item.label} title={item.detail}
                                className="inline-flex items-center gap-1.5 border-2 px-2 py-1 text-[11px] font-bold"
                                style={{ borderColor: item.ok ? 'var(--color-accent1)' : 'var(--color-accent2)', color: 'var(--color-fg)', background: 'var(--color-bg)' }}>
                                <span className="grid h-4 w-4 place-items-center text-[10px] font-black"
                                    style={{ background: item.ok ? 'var(--color-accent1)' : 'var(--color-accent2)', color: 'var(--voxel-ink)' }}>{item.ok ? '✓' : '!'}</span>
                                {item.label}
                                <span style={{ color: 'var(--color-muted)' }}>{item.summary}</span>
                            </span>
                        ))}
                    </div>
                    {!modelReady && <ActionButton size="sm" className="shrink-0" onClick={() => {
                        // 之前只在"存在缺 Key 的供应商且未开代理"时才跳转，其余情况点了没反应。
                        const firstMissingProvider = llmProviders.find(provider => !provider.apiKey?.trim());
                        if (firstMissingProvider && !remoteConfig.llmProxyEnabled) { setSubPage({ type: 'PROVIDER_EDIT', id: firstMissingProvider.id }); return; }
                        const firstProvider = llmProviders[0];
                        if (firstProvider && !remoteConfig.llmProxyEnabled) { setSubPage({ type: 'PROVIDER_EDIT', id: firstProvider.id }); return; }
                        if (remoteConfig.llmProxyEnabled) { setSubPage({ type: 'LLM_EDIT', id: llmPresets[0]?.id }); return; }
                        createProvider();
                    }}>
                        {llmPresets.length === 0 ? '不用联网：下载内置小模型' : '去配置模型'}
                    </ActionButton>}
                </div>
            </div>

            <div>
                <SectionLabel>内置小模型（离线兜底）</SectionLabel>
                {/* 说明在左、动作在右：满宽按钮在这条 5xl 栏里会变成一块又高又宽的色块，把供应商列表整屏推下去 */}
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-none border-[3px] p-4"
                    style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold" style={{ color: 'var(--color-fg)' }}>Qwen2.5-0.5B Instruct（约 450MB，一次性下载）</div>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                            下载一次后完全离线可用：没有任何模型配置的电脑上，AI 由它驱动。配置云端 Key 或本机 Ollama 时会自动优先使用它们。
                        </p>
                        {builtinLlm.status === 'downloading' && (
                            <div className="mt-2">
                                <div className="h-3 w-full border-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                                    <div className="h-full" style={{ width: `${Math.round(builtinLlm.progress * 100)}%`, background: 'var(--color-accent1)' }} />
                                </div>
                                <div className="mt-1 text-xs font-black" style={{ color: 'var(--color-muted)' }}>
                                    下载中… {Math.round(builtinLlm.progress * 100)}%（断点会自动续传源重试）
                                </div>
                            </div>
                        )}
                        {builtinLlm.status === 'loading' && (
                            <div className="mt-2 text-xs font-black" style={{ color: 'var(--color-muted)' }}>正在从缓存挂载模型…</div>
                        )}
                        {builtinLlm.status === 'ready' && (
                            <div className="mt-2 text-xs font-black" style={{ color: 'var(--color-accent3)' }}>✓ 内置小模型已就绪（完全离线可用）</div>
                        )}
                        {builtinLlm.status === 'error' && (
                            <div className="mt-2 text-xs font-black" style={{ color: 'var(--color-accent2)' }}>下载失败：{builtinLlm.error}</div>
                        )}
                    </div>
                    <div className="shrink-0">
                        {builtinLlm.status === 'idle' && (
                            <ActionButton width="auto" onClick={() => void downloadBuiltinModel()}>下载并启用（约 450MB）</ActionButton>
                        )}
                        {builtinLlm.status === 'error' && (
                            <ActionButton variant="ghost" size="sm" onClick={() => void downloadBuiltinModel()}>重试下载</ActionButton>
                        )}
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>AI 供应商</SectionLabel>
                <div className="space-y-3">
                    {llmProviders.map(provider => {
                        const modelCount = llmPresets.filter(m => m.providerId === provider.id).length;
                        const isApiKeyMissing = !provider.apiKey?.trim();
                        return (
                            <button type="button" key={provider.id} onClick={() => setSubPage({ type: 'PROVIDER_EDIT', id: provider.id })}
                                className="w-full text-left rounded-none border-[3px] p-4 cursor-pointer transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)] group"
                                style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {/* 头像色只区分供应商类型。原先 Gemini 用红石，与同一行「未配置」红章撞成两个意思 */}
                                        <div className="w-10 h-10 rounded-none flex items-center justify-center text-lg font-bold"
                                            style={{ background: provider.type === 'gemini' ? 'var(--voxel-water)' : 'var(--voxel-torch)', color: 'var(--voxel-ink)', opacity: 0.9 }}>
                                            {provider.type === 'gemini' ? 'G' : 'O'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>{provider.name}</span>
                                                {isApiKeyMissing && (
                                                    <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                                                        style={{ background: 'var(--voxel-redstone-deep)', color: 'var(--voxel-solid-white)' }}>未配置</span>
                                                )}
                                            </div>
                                            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{modelCount} 个模型 · {provider.type === 'gemini' ? 'Gemini' : 'OpenAI 兼容'}</span>
                                        </div>
                                    </div>
                                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </button>
                        );
                    })}
                    <ActionButton variant="dashed" onClick={createProvider}>+ 新供应商</ActionButton>
                </div>
            </div>
        </div>
    );
};
