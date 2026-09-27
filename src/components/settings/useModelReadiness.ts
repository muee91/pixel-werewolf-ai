import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { globalApiConfigAtom, llmPresetsAtom, llmProvidersAtom, ttsPresetsAtom } from '../../store';
import { remoteServerConfigAtom } from '../../atoms';
import { isProviderConfiguredForRuntime } from '../../utils/llmConfig';
import { probeLocalLlm } from '../../utils/localLlmProbe';

export interface ModelReadiness {
    modelReady: boolean;
    runtimeProviderReady: boolean;
    effectiveModelReadyCount: number;
    ttsReady: boolean;
}

// 模型/语音就绪标志的集中计算:Shell 徽章、模型区健康检查、外观区 3D 选项共用同一份结果
export const useModelReadiness = (): ModelReadiness => {
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const config = useAtomValue(globalApiConfigAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const [localModelAvailable, setLocalModelAvailable] = useState(false);

    useEffect(() => {
        const modelReadyCount = llmPresets.filter(preset => {
            const provider = llmProviders.find(item => item.id === preset.providerId);
            return !!preset.modelId.trim() && isProviderConfiguredForRuntime(provider, remoteConfig);
        }).length;
        if (modelReadyCount > 0) return;
        let active = true;
        probeLocalLlm().then(result => {
            if (active) setLocalModelAvailable(!!result);
        });
        return () => { active = false; };
    }, [llmPresets, llmProviders, remoteConfig]);

    const modelReadyCount = llmPresets.filter(preset => {
        const provider = llmProviders.find(item => item.id === preset.providerId);
        return !!preset.modelId.trim() && isProviderConfiguredForRuntime(provider, remoteConfig);
    }).length;
    const modelReady = modelReadyCount > 0 || localModelAvailable;
    const runtimeProviderReady = localModelAvailable || llmProviders.some(provider => isProviderConfiguredForRuntime(provider, remoteConfig));
    const effectiveModelReadyCount = modelReadyCount || (localModelAvailable ? 1 : 0);
    const ttsReady = !config.enabled || ttsPresets.some(preset => preset.provider === 'edge-tts');

    return { modelReady, runtimeProviderReady, effectiveModelReadyCount, ttsReady };
};
