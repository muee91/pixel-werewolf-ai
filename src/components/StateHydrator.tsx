
import { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
    actorProfilesAtom,
    llmPresetsAtom,
    llmProvidersAtom,
    ttsPresetsAtom,
    globalApiConfigAtom,
} from '../store';
import { remoteServerConfigAtom } from '../atoms';
import { isProviderConfiguredForRuntime } from '../utils/llmConfig';

/**
 * Validates and hydrates Jotai storage atoms.
 * This ensures that when we imperatively get() these atoms in callbacks (like initGame),
 * they have definitely loaded their values from localStorage.
 */
const StateHydrator = () => {
    const [actors, setActors] = useAtom(actorProfilesAtom);
    const [llmPresets, setLlmPresets] = useAtom(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    useAtomValue(ttsPresetsAtom);
    useAtomValue(globalApiConfigAtom);

    useEffect(() => {
        // 旧版本会把已下线的 NVIDIA 模型注入每个新用户和每个角色。
        // 只移除仍保持旧默认值的条目；用户改过模型 ID 的自定义配置继续保留。
        const nextPresets = llmPresets.filter(p => !(
            p.id === 'llm-nvidia-default'
            && p.providerId === 'provider-nvidia'
            && p.modelId === 'deepseek-ai/deepseek-v4-flash'
        ));
        const hasPresetChanged = JSON.stringify(nextPresets) !== JSON.stringify(llmPresets);

        if (hasPresetChanged) setLlmPresets(nextPresets);

        const firstConfiguredModelId = nextPresets.find(preset => {
            const provider = llmProviders.find(item => item.id === preset.providerId);
            return !!preset.modelId.trim() && isProviderConfiguredForRuntime(provider, remoteConfig);
        })?.id || '';

        const defaultActorNames: Record<string, string> = {
            a1: '路人甲',
            a2: '路人乙',
            a3: '路人丙',
            a4: '路人丁',
            a5: '路人戊',
            a8: '路人己',
            a9: '路人庚',
            a10: '路人辛',
            a11: '路人壬',
            a12: '路人癸',
            a13: '路人子',
            a14: '路人丑',
        };
        const legacyDefaultNames = new Set([
            'NVIDIA 推荐模型',
            'NVIDIA 推荐模型 (Clone 1)',
            'NVIDIA 推荐模型 (Clone 2)',
            'DeepSeek Chat',
            'DeepSeek R1',
            '路人甲',
            '路人乙',
            '路人丙',
            '路人丁',
            '路人戊',
            '路人己',
            '路人庚',
            '路人辛',
            '路人壬',
        ]);
        const supplementalActors = [
            { id: 'a13', name: defaultActorNames.a13, llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '' },
            { id: 'a14', name: defaultActorNames.a14, llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunxiNeural', stylePrompt: '' },
        ];

        const existingActorIds = new Set(actors.map(actor => actor.id));
        const actorsWithSupplements = [
            ...actors,
            ...supplementalActors.filter(actor => !existingActorIds.has(actor.id))
        ];
        const nextActors = actorsWithSupplements.map(actor => {
            const llm = nextPresets.find(p => p.id === actor.llmPresetId);
            const provider = llmProviders.find(p => p.id === llm?.providerId);
            const shouldUseDefaultName = actor.id in defaultActorNames && legacyDefaultNames.has(actor.name);
            const hasUsableProvider = !!llm && isProviderConfiguredForRuntime(provider, remoteConfig);
            return {
                ...actor,
                name: shouldUseDefaultName ? defaultActorNames[actor.id] : actor.name,
                // 未配置可用通道的角色保持未配置状态，不再静默回退到云端默认模型。
                llmPresetId: hasUsableProvider ? actor.llmPresetId : firstConfiguredModelId
            };
        });
        const hasActorChanged = nextActors.length !== actors.length || nextActors.some((actor, index) =>
            actor.name !== actors[index]?.name || actor.llmPresetId !== actors[index]?.llmPresetId
        );
        if (hasActorChanged) setActors(nextActors);
    }, [actors, llmPresets, llmProviders, remoteConfig, setActors, setLlmPresets]);

    return null;
};

export default StateHydrator;
