import { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import { llmPresetsAtom, llmProvidersAtom, actorProfilesAtom } from '../../../store';
import { remoteServerConfigAtom } from '../../../atoms';
import { validateModelAvailability } from '../../../services/llm';
import { isProviderConfiguredForRuntime } from '../../../utils/llmConfig';
import type { LLMPreset } from '../../../types';
import { ActionButton, BackButton, PixelSelect, SettingsInput, pixelInputClass } from '../../ui/pixel';
import type { SubPage } from '../constants';

interface LlmEditPageProps {
    subPage: Extract<SubPage, { type: 'LLM_EDIT' }>;
    setSubPage: (subPage: SubPage | null) => void;
    providerModelOptions: Record<string, string[]>;
}

export const LlmEditPage = ({ subPage, setSubPage, providerModelOptions }: LlmEditPageProps) => {
    const [llmPresets, setLlmPresets] = useAtom(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const setActors = useSetAtom(actorProfilesAtom);
    const [validatingModelId, setValidatingModelId] = useState<string | null>(null);
    const [modelValidationResults, setModelValidationResults] = useState<Record<string, { ok: boolean; message: string; checkedAt?: number }>>({});

    const llm = llmPresets.find(i => i.id === (subPage as { type: 'LLM_EDIT'; id?: string }).id);
    if (!llm) return null;
    const provider = llmProviders.find(p => p.id === llm.providerId);

    const updateLlm = (id: string, updates: Partial<LLMPreset>) => setLlmPresets(p => p.map(i => i.id === id ? { ...i, ...updates } : i));

    const validateLlmModel = async (llm: LLMPreset) => {
        const provider = llmProviders.find(p => p.id === llm.providerId);
        if (!provider) {
            setModelValidationResults(prev => ({ ...prev, [llm.id]: { ok: false, message: '验证失败：找不到所属供应商。', checkedAt: Date.now() } }));
            return;
        }
        if (!isProviderConfiguredForRuntime(provider, remoteConfig)) {
            setModelValidationResults(prev => ({ ...prev, [llm.id]: { ok: false, message: '验证失败：该供应商未配置 API Key。', checkedAt: Date.now() } }));
            return;
        }
        if (provider.type === 'openai' && !provider.baseUrl?.trim()) {
            setModelValidationResults(prev => ({ ...prev, [llm.id]: { ok: false, message: '验证失败：OpenAI 兼容供应商需要 Base URL。', checkedAt: Date.now() } }));
            return;
        }
        if (!llm.modelId?.trim()) {
            setModelValidationResults(prev => ({ ...prev, [llm.id]: { ok: false, message: '验证失败：模型 ID 不能为空。', checkedAt: Date.now() } }));
            return;
        }
        setValidatingModelId(llm.id);
        setModelValidationResults(prev => ({ ...prev, [llm.id]: { ok: false, message: '正在发送轻量测试请求...' } }));
        try {
            const startedAt = Date.now();
            const text = await validateModelAvailability(llm, provider, 15000, remoteConfig.llmProxyEnabled ? remoteConfig.llmProxyUrl : undefined);
            if (/^\s*Error:/i.test(text)) throw new Error(text.replace(/^Error:\s*/i, ''));
            const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            const responseText = (text || '').trim();
            const isExpected = /\bok\b|true|通过/i.test(responseText);
            const message = isExpected
                ? `验证成功：模型可正常响应，用时 ${elapsedSeconds} 秒。`
                : responseText
                    ? `验证成功：模型有响应，用时 ${elapsedSeconds} 秒；返回内容：${responseText.slice(0, 80)}`
                    : `验证成功：接口已连通，用时 ${elapsedSeconds} 秒。`;
            setModelValidationResults(prev => ({ ...prev, [llm.id]: { ok: true, message, checkedAt: Date.now() } }));
        } catch (error) {
            setModelValidationResults(prev => ({ ...prev, [llm.id]: { ok: false, message: `验证失败：${error instanceof Error ? error.message : String(error)}`, checkedAt: Date.now() } }));
        } finally {
            setValidatingModelId(null);
        }
    };

    const deleteLlm = (id: string) => {
        setActors(prevActors => prevActors.map(actor => {
            if (actor.llmPresetId === id) {
                const safeModel = llmPresets.find(m => m.id !== id);
                return { ...actor, llmPresetId: safeModel?.id || '' };
            }
            return actor;
        }));
        setLlmPresets(p => p.filter(i => i.id !== id));
        setSubPage(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <BackButton onClick={() => setSubPage(provider ? { type: 'PROVIDER_EDIT', id: provider.id } : null)} />
                <span className="text-sm" style={{ color: 'var(--color-muted)' }}>编辑模型</span>
            </div>

            <div className="rounded-none border-[3px] p-5" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                <SettingsInput label="模型昵称" value={llm.name}
                    onChange={(e) => updateLlm(llm.id, { name: e.target.value })}
                    sub="可修改模型列表中显示的默认昵称" />

                <div className="mb-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color: 'var(--color-accent1)' }}>所属供应商</label>
                    <div className="w-full border rounded-none p-3.5 font-medium flex items-center gap-2 text-sm"
                        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: provider?.type === 'gemini' ? 'var(--color-accent2)' : 'var(--color-accent1)' }} />
                        {provider?.name || '未命名供应商'}
                    </div>
                </div>

                <div className="mb-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color: 'var(--color-accent1)' }}>模型 ID</label>
                    {provider && (providerModelOptions[provider.id] || provider.models || []).length > 0 && (
                        <PixelSelect
                            value={llm.modelId}
                            onChange={e => updateLlm(llm.id, { modelId: e.target.value })}
                            mono
                            className="mb-3"
                        >
                            <option value="">-- 从同步列表选择模型 --</option>
                            {(providerModelOptions[provider.id] || provider.models || []).map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </PixelSelect>
                    )}
                    <input value={llm.modelId} onChange={e => updateLlm(llm.id, { modelId: e.target.value })}
                        placeholder="gemini-2.5-flash"
                        className={clsx(pixelInputClass, 'font-mono text-xs')} />
                    <p className="text-[10px] mt-1.5 ml-1" style={{ color: 'var(--color-muted)' }}>可从同步列表选择，也可手动输入</p>
                </div>

                <div className="rounded-none border-[3px] p-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-bold" style={{ color: 'var(--color-fg)' }}>模型可用性验证</div>
                            <div className="text-[10px] mt-1" style={{ color: 'var(--color-muted)' }}>发送轻量测试请求，最多等待 15 秒</div>
                        </div>
                        <ActionButton size="sm" disabled={validatingModelId === llm.id}
                            onClick={() => validateLlmModel(llm)}
                            className={clsx('shrink-0', validatingModelId === llm.id && 'opacity-40 cursor-wait')}>
                            {validatingModelId === llm.id ? '验证中...' : '验证模型'}
                        </ActionButton>
                    </div>
                    {modelValidationResults[llm.id] && (
                        <div className={clsx('mt-3 rounded-none border-[3px] px-3 py-2 text-xs font-bold leading-relaxed',
                            modelValidationResults[llm.id].ok ? '' : '')}
                            style={{
                                background: modelValidationResults[llm.id].ok ? 'var(--color-accent1)' : 'var(--color-accent2)',
                                borderColor: modelValidationResults[llm.id].ok ? 'var(--color-accent1)' : 'var(--color-accent2)',
                                color: '#fff', opacity: 0.9
                            }}>
                            <div>{modelValidationResults[llm.id].message}</div>
                            {modelValidationResults[llm.id].checkedAt && (
                                <div className="mt-1 text-[10px] opacity-70 font-medium">
                                    上次验证：{new Date(modelValidationResults[llm.id].checkedAt!).toLocaleTimeString()}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-6">
                    <ActionButton variant="danger" onClick={() => deleteLlm(llm.id)}>删除模型</ActionButton>
                </div>
            </div>
        </div>
    );
};
