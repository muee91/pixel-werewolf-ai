import { useState, useSyncExternalStore } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { globalApiConfigAtom, llmPresetsAtom, llmProvidersAtom, ttsPresetsAtom } from '../../../store';
import { remoteServerConfigAtom } from '../../../atoms';
import { downloadBuiltinModel, getBuiltinLlmSnapshot, subscribeBuiltinLlm } from '../../../services/builtinLlm';
import { isProviderConfiguredForRuntime } from '../../../utils/llmConfig';
import { SectionLabel, SettingsInput, Toggle, ActionButton } from '../../ui/pixel';
import type { SettingsImportExportApi } from '../useSettingsImportExport';
import type { ModelReadiness } from '../useModelReadiness';
import type { SubPage } from '../constants';

interface ModelSectionProps {
    setSubPage: (subPage: SubPage | null) => void;
    io: SettingsImportExportApi;
    readiness: ModelReadiness;
}

export const ModelSection = ({ setSubPage, io, readiness }: ModelSectionProps) => {
    const [config, setConfig] = useAtom(globalApiConfigAtom);
    const [remoteConfig, setRemoteConfig] = useAtom(remoteServerConfigAtom);
    const [llmProviders, setLlmProviders] = useAtom(llmProvidersAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const builtinLlm = useSyncExternalStore(subscribeBuiltinLlm, getBuiltinLlmSnapshot);
    const { modelReady, ttsReady, runtimeProviderReady, effectiveModelReadyCount } = readiness;

    const createProvider = () => {
        const id = `provider-${Date.now()}`;
        setLlmProviders(p => [...p, { id, name: 'New Provider', type: 'openai', baseUrl: '', apiKey: '' }]);
        setTimeout(() => setSubPage({ type: 'PROVIDER_EDIT', id }), 0);
    };

    return (
        <div className="space-y-6">
            <div>
                <SectionLabel>开局健康检查</SectionLabel>
                <div className="overflow-hidden rounded-none border-[3px]" style={{ background: 'var(--voxel-wood)', borderColor: modelReady && ttsReady ? 'var(--color-accent1)' : 'var(--color-accent2)' }}>
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-base font-black" style={{ color: 'var(--color-fg)' }}>
                                {modelReady ? '营地可以启动 AI 对局' : '还差一步：配置可用模型'}
                            </div>
                            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                                只检查配置完整性，不读取或展示 API Key。启动前可在模型详情中进行真实连接验证。
                            </div>
                        </div>
                        {!modelReady && <ActionButton size="sm" className="shrink-0" onClick={() => {
                            const firstMissingProvider = llmProviders.find(provider => !provider.apiKey?.trim());
                            if (firstMissingProvider && !remoteConfig.llmProxyEnabled) setSubPage({ type: 'PROVIDER_EDIT', id: firstMissingProvider.id });
                        }}>
                            去配置模型
                        </ActionButton>}
                    </div>
                    <div className="grid border-t-[3px] sm:grid-cols-3" style={{ borderColor: 'var(--color-border)' }}>
                        {[
                            { label: '1 · 供应商', ok: runtimeProviderReady, detail: remoteConfig.llmProxyEnabled ? '使用远程代理' : `${llmProviders.filter(provider => isProviderConfiguredForRuntime(provider, remoteConfig)).length}/${llmProviders.length} 可用` },
                            { label: '2 · 模型', ok: modelReady, detail: `${effectiveModelReadyCount} 个可开局模型` },
                            { label: '3 · 语音', ok: ttsReady, detail: config.enabled ? 'Edge TTS 已选择' : '语音已关闭' },
                        ].map(item => <div key={item.label} className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0" style={{ borderColor: 'var(--color-border)' }}>
                            <span className="grid h-7 w-7 place-items-center rounded-none text-xs font-black" style={{ background: item.ok ? 'var(--color-accent1)' : 'var(--color-accent2)', color: '#fff' }}>{item.ok ? '✓' : '!'}</span>
                            <div><div className="text-xs font-black" style={{ color: 'var(--color-fg)' }}>{item.label}</div><div className="mt-0.5 text-[10px]" style={{ color: 'var(--color-muted)' }}>{item.detail}</div></div>
                        </div>)}
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>全局开关</SectionLabel>
                <div className="rounded-none border-[3px] p-4" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>启用语音 (TTS)</span>
                            <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>需要配置 TTS 引擎的 API Key</span>
                        </div>
                        <Toggle value={config.enabled} onChange={() => setConfig(p => ({ ...p, enabled: !p.enabled }))} />
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>内置小模型（离线兜底）</SectionLabel>
                <div className="rounded-none border-[3px] p-4 space-y-3" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div className="text-sm font-bold" style={{ color: 'var(--color-fg)' }}>Qwen2.5-0.5B Instruct（约 450MB，一次性下载）</div>
                    <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                        下载一次后完全离线可用：没有任何模型配置的电脑上，AI 由它驱动。配置云端 Key 或本机 Ollama 时会自动优先使用它们。
                    </p>
                    {builtinLlm.status === 'idle' && (
                        <ActionButton onClick={() => void downloadBuiltinModel()}>下载并启用内置小模型（约 450MB）</ActionButton>
                    )}
                    {builtinLlm.status === 'downloading' && (
                        <div>
                            <div className="h-3 w-full border-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                                <div className="h-full" style={{ width: `${Math.round(builtinLlm.progress * 100)}%`, background: 'var(--color-accent1)' }} />
                            </div>
                            <div className="mt-1 text-[10px] font-black" style={{ color: 'var(--color-muted)' }}>
                                下载中… {Math.round(builtinLlm.progress * 100)}%（断点会自动续传源重试）
                            </div>
                        </div>
                    )}
                    {builtinLlm.status === 'loading' && (
                        <div className="text-[10px] font-black" style={{ color: 'var(--color-muted)' }}>正在从缓存挂载模型…</div>
                    )}
                    {builtinLlm.status === 'ready' && (
                        <div className="text-[10px] font-black" style={{ color: 'var(--color-accent3)' }}>✓ 内置小模型已就绪（完全离线可用）</div>
                    )}
                    {builtinLlm.status === 'error' && (
                        <div>
                            <div className="text-[10px] font-black" style={{ color: 'var(--color-accent2)' }}>下载失败：{builtinLlm.error}</div>
                            <ActionButton variant="ghost" size="sm" className="mt-2" onClick={() => void downloadBuiltinModel()}>重试下载</ActionButton>
                        </div>
                    )}
                </div>
            </div>

            <div>
                <SectionLabel>LLM 代理</SectionLabel>
                <div className="rounded-none border-[3px] p-4" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>代理服务器</span>
                            <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>通过远程代理转发 LLM 请求</span>
                        </div>
                        <Toggle value={remoteConfig.llmProxyEnabled} onChange={() => setRemoteConfig(p => ({ ...p, llmProxyEnabled: !p.llmProxyEnabled }))} />
                    </div>
                    {remoteConfig.llmProxyEnabled && (
                        <SettingsInput label="代理地址" value={remoteConfig.llmProxyUrl}
                            onChange={(e) => setRemoteConfig(p => ({ ...p, llmProxyUrl: e.target.value }))}
                            placeholder="http://192.168.1.100:8000" sub="LLM 请求将通过此服务器转发" />
                    )}
                </div>
            </div>

            <div>
                <SectionLabel>AI 供应商</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <ActionButton variant="ghost" onClick={io.handleModelConfigExport}>导出模型配置</ActionButton>
                    <ActionButton variant="ghost" onClick={io.handleModelConfigImportClick}>导入模型配置</ActionButton>
                </div>
                <input type="file" ref={io.modelConfigInputRef} onChange={io.handleModelConfigFileChange} accept=".werewolf-model,.json" className="hidden" />
                <div className="space-y-3">
                    {llmProviders.map(provider => {
                        const modelCount = llmPresets.filter(m => m.providerId === provider.id).length;
                        const isApiKeyMissing = !provider.apiKey?.trim();
                        return (
                            <div key={provider.id} onClick={() => setSubPage({ type: 'PROVIDER_EDIT', id: provider.id })}
                                className="rounded-none border-[3px] p-4 cursor-pointer transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)] group"
                                style={{ background: 'var(--voxel-wood)', borderColor: isApiKeyMissing ? 'var(--color-accent2)' : 'var(--color-border)' }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-none flex items-center justify-center text-lg font-bold"
                                            style={{ background: provider.type === 'gemini' ? 'var(--color-accent2)' : 'var(--color-accent1)', color: '#fff', opacity: 0.9 }}>
                                            {provider.type === 'gemini' ? 'G' : 'O'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>{provider.name}</span>
                                                {isApiKeyMissing && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                                        style={{ background: 'var(--color-accent2)', color: '#fff', opacity: 0.8 }}>未配置</span>
                                                )}
                                            </div>
                                            <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{modelCount} 个模型 · {provider.type === 'gemini' ? 'Gemini' : 'OpenAI 兼容'}</span>
                                        </div>
                                    </div>
                                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </div>
                        );
                    })}
                    <ActionButton variant="dashed" onClick={createProvider}>+ 新供应商</ActionButton>
                </div>
            </div>

            <div>
                <SectionLabel>TTS 引擎</SectionLabel>
                <div className="space-y-3">
                    {(() => {
                        const preset = ttsPresets.find(p => p.provider === 'edge-tts');
                        return (
                            <div key="edge-tts"
                                onClick={() => { if (preset) setSubPage({ type: 'TTS_EDIT', id: preset.id }); }}
                                className="rounded-none border-[3px] p-4 cursor-pointer hover:shadow-[3px_3px_0_var(--voxel-ink)] transition-all"
                                style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">🌐</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>Edge TTS</div>
                                        <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>微软 Edge TTS，500+ 音色，需联网</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-accent1)' }} />
                                        <span className="text-[10px] font-bold" style={{ color: 'var(--color-accent1)' }}>可用</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};
