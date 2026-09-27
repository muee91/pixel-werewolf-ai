import { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import { Capacitor } from '@capacitor/core';
import { llmPresetsAtom, llmProvidersAtom, actorProfilesAtom } from '../../../store';
import { isLoopbackUrl, toLoopbackGatewayUrl } from '../../../utils/llmConfig';
import type { LLMProviderConfig } from '../../../types';
import { ActionButton, BackButton, OptionCard, SectionLabel, SettingsInput } from '../../ui/pixel';
import type { SubPage } from '../constants';

interface ProviderEditPageProps {
    subPage: Extract<SubPage, { type: 'PROVIDER_EDIT' }>;
    setSubPage: (subPage: SubPage | null) => void;
    // 同步/导入得到的「模型下拉列表」缓存由 Shell 持有,跨供应商与模型编辑页共享
    providerModelOptions: Record<string, string[]>;
    setProviderModelOptions: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

export const ProviderEditPage = ({ subPage, setSubPage, providerModelOptions, setProviderModelOptions }: ProviderEditPageProps) => {
    const [llmProviders, setLlmProviders] = useAtom(llmProvidersAtom);
    const [llmPresets, setLlmPresets] = useAtom(llmPresetsAtom);
    const setActors = useSetAtom(actorProfilesAtom);
    const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);

    const provider = llmProviders.find(i => i.id === (subPage as { type: 'PROVIDER_EDIT'; id?: string }).id);
    if (!provider) return null;
    const isApiKeyMissing = !provider.apiKey?.trim();

    const syncProviderModels = async (provider: LLMProviderConfig) => {
        if (provider.type !== 'openai') { alert('只有 OpenAI 兼容供应商支持自动拉取模型列表。'); return; }
        if (!provider.baseUrl) { alert('请先填写 Base URL。'); return; }
        const isWebNvidiaProxy = provider.baseUrl.replace(/\/+$/, '') === 'https://integrate.api.nvidia.com/v1'
            && !Capacitor.isNativePlatform();
        if (!provider.apiKey && !isWebNvidiaProxy) { alert('请先填写 API Key。'); return; }
        setSyncingProviderId(provider.id);
        try {
            const baseUrl = provider.baseUrl.replace(/\/+$/, '');
            let modelsUrl = `${baseUrl}/models`;
            if (baseUrl === 'https://integrate.api.nvidia.com/v1') {
                if (!Capacitor.isNativePlatform()) modelsUrl = '/api/nvidia-models';
            } else if (!Capacitor.isNativePlatform() && isLoopbackUrl(modelsUrl)) {
                modelsUrl = toLoopbackGatewayUrl(modelsUrl);
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const headers: Record<string, string> = { 'Accept': 'application/json' };
            if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
            const resp = await fetch(modelsUrl, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!resp.ok) { const text = await resp.text(); throw new Error(`${resp.status} ${text}`); }
            const data = await resp.json();
            const models = Array.isArray(data.data)
                ? data.data.map((m: string | { id: string }) => typeof m === 'string' ? m : m.id).filter(Boolean).sort()
                : [];
            if (models.length === 0) { alert('没有从该供应商返回可用模型。'); return; }
            setProviderModelOptions(prev => ({ ...prev, [provider.id]: models }));
            setLlmProviders(prev => prev.map(item => item.id === provider.id ? { ...item, models } : item));
            // 该供应商没有模型预设时,自动用第一个同步到的模型创建;
            // 已有预设但模型 ID 为空的,自动填充第一个模型(同步即完成选择,少一步手工)
            if (!llmPresets.some(m => m.providerId === provider.id)) {
                const id = `llm-${Date.now()}`;
                setLlmPresets(p => [...p, { id, name: models[0], providerId: provider.id, modelId: models[0] }]);
            } else {
                setLlmPresets(p => p.map(m => {
                    if (m.providerId !== provider.id || m.modelId.trim()) return m;
                    return { ...m, modelId: models[0] };
                }));
            }
            alert(`同步成功！已发现 ${models.length} 个模型。`);
        } catch (e) {
            console.error('Model sync error:', e);
            alert(`模型同步失败：${String(e)}`);
        } finally {
            setSyncingProviderId(null);
        }
    };

    const updateProvider = (id: string, updates: Partial<LLMProviderConfig>) =>
        setLlmProviders(p => p.map(i => i.id === id ? { ...i, ...updates } : i));

    const deleteProvider = (id: string) => {
        const modelsToDelete = llmPresets.filter(m => m.providerId === id).map(m => m.id);
        setActors(prevActors => prevActors.map(actor => {
            if (modelsToDelete.includes(actor.llmPresetId)) {
                const safeModel = llmPresets.find(m => !modelsToDelete.includes(m.id) && m.providerId !== id);
                return { ...actor, llmPresetId: safeModel?.id || '' };
            }
            return actor;
        }));
        setLlmPresets(p => p.filter(m => m.providerId !== id));
        setLlmProviders(p => p.filter(i => i.id !== id));
        setSubPage(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <BackButton onClick={() => setSubPage(null)} />
                <span className="text-sm" style={{ color: 'var(--color-muted)' }}>供应商详情</span>
            </div>

            <div className="rounded-none border-[3px] p-5" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                <SettingsInput label="供应商名称" value={provider.name}
                    onChange={(e) => updateProvider(provider.id, { name: e.target.value })} placeholder="例如: OpenRouter" />

                <div className="mb-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2 ml-1" style={{ color: 'var(--color-accent1)' }}>接口类型</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <OptionCard active={provider.type === 'gemini'} onClick={() => updateProvider(provider.id, { type: 'gemini' })}>
                            <div className="p-3 text-center text-sm font-bold"
                                style={{ color: provider.type === 'gemini' ? 'var(--color-accent2)' : 'var(--color-muted)' }}>
                                Google Gemini
                            </div>
                        </OptionCard>
                        <OptionCard active={provider.type === 'openai'} onClick={() => updateProvider(provider.id, { type: 'openai' })}>
                            <div className="p-3 text-center text-sm font-bold"
                                style={{ color: provider.type === 'openai' ? 'var(--color-accent1)' : 'var(--color-muted)' }}>
                                OpenAI 兼容
                            </div>
                        </OptionCard>
                    </div>
                </div>

                {provider.type === 'openai' && (
                    <SettingsInput label="基础 URL" value={provider.baseUrl || ''}
                        onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1" sub="请输入 API 基础地址" />
                )}

                <SettingsInput label="API 密钥" type="password" value={provider.apiKey || ''}
                    onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                    placeholder="sk-..." sub="仅存储在本地浏览器中" />

                {provider.type === 'openai' && (
                    <div className="mt-5 rounded-none border-[3px] p-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold" style={{ color: 'var(--color-fg)' }}>模型下拉列表</div>
                                <div className="text-[10px] mt-1" style={{ color: 'var(--color-muted)' }}>
                                    已同步 {(providerModelOptions[provider.id] || provider.models || []).length} 个模型
                                </div>
                            </div>
                            <ActionButton size="sm" disabled={syncingProviderId === provider.id}
                                onClick={() => syncProviderModels(provider)}
                                className={clsx('shrink-0', syncingProviderId === provider.id && 'opacity-40 cursor-wait')}>
                                {syncingProviderId === provider.id ? '同步中...' : '同步模型列表'}
                            </ActionButton>
                        </div>
                    </div>
                )}
            </div>

            <div>
                <SectionLabel>模型列表</SectionLabel>
                <div className="space-y-2">
                    {llmPresets.filter(m => m.providerId === provider.id).map(llm => (
                        <div key={llm.id} onClick={() => setSubPage({ type: 'LLM_EDIT', id: llm.id })}
                            className="rounded-none border-[3px] p-3 cursor-pointer transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)] flex justify-between items-center group"
                            style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-none flex items-center justify-center font-bold text-xs"
                                    style={{ background: 'var(--color-bg)', color: 'var(--color-accent1)', border: '1px solid var(--color-border)' }}>M</div>
                                <div>
                                    <div className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>{llm.name}</div>
                                    <div className="text-[10px] font-mono" style={{ color: 'var(--color-muted)' }}>{llm.modelId}</div>
                                </div>
                            </div>
                            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    ))}
                    <ActionButton variant="dashed" onClick={() => {
                        const id = `llm-${Date.now()}`;
                        setLlmPresets(p => [...p, { id, name: '新模型', providerId: provider.id, modelId: '' }]);
                        setSubPage({ type: 'LLM_EDIT', id });
                    }}>+ 添加模型 ID</ActionButton>
                </div>
            </div>

            <ActionButton variant="danger" onClick={() => deleteProvider(provider.id)}>删除此供应商</ActionButton>
        </div>
    );
};
