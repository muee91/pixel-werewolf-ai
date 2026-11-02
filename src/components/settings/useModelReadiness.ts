import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAtomValue } from 'jotai';
import { globalApiConfigAtom, llmPresetsAtom, llmProvidersAtom, ttsPresetsAtom } from '../../store';
import { remoteServerConfigAtom } from '../../atoms';
import { isProviderConfiguredForRuntime } from '../../utils/llmConfig';
import { probeLocalLlm } from '../../utils/localLlmProbe';
import { getBuiltinLlmSnapshot, subscribeBuiltinLlm } from '../../services/builtinLlm';

export interface ModelReadiness {
    modelReady: boolean;
    runtimeProviderReady: boolean;
    effectiveModelReadyCount: number;
    ttsReady: boolean;
    /** 内置小模型（Qwen GGUF）是否已下载就绪，可离线驱动 AI */
    builtinReady: boolean;
}

// 模型/语音就绪标志的集中计算:Shell 徽章、模型区健康检查、外观区 3D 选项共用同一份结果
export const useModelReadiness = (): ModelReadiness => {
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const config = useAtomValue(globalApiConfigAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const [localModelAvailable, setLocalModelAvailable] = useState(false);
    const builtinLlm = useSyncExternalStore(subscribeBuiltinLlm, getBuiltinLlmSnapshot);
    const builtinReady = builtinLlm.status === 'ready';

    useEffect(() => {
        const modelReadyCount = llmPresets.filter(preset => {
            const provider = llmProviders.find(item => item.id === preset.providerId);
            return !!preset.modelId.trim() && isProviderConfiguredForRuntime(provider, remoteConfig);
        }).length;
        if (modelReadyCount > 0 || getBuiltinLlmSnapshot().status === 'ready') return;
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
    // 三条真能开局的路：云端预设、本机 Ollama/LM Studio、已下载的内置小模型
    const modelReady = modelReadyCount > 0 || localModelAvailable || builtinReady;
    const runtimeProviderReady = localModelAvailable || builtinReady || llmProviders.some(provider => isProviderConfiguredForRuntime(provider, remoteConfig));
    const effectiveModelReadyCount = modelReadyCount || (localModelAvailable || builtinReady ? 1 : 0);
    const ttsReady = !config.enabled || ttsPresets.some(preset => preset.provider === 'edge-tts');

    return { modelReady, runtimeProviderReady, effectiveModelReadyCount, ttsReady, builtinReady };
};
