import { useAtom, useAtomValue } from 'jotai';
import { globalApiConfigAtom, llmPresetsAtom, ttsPresetsAtom, actorProfilesAtom } from '../../../store';
import { uiConfigAtom } from '../../../atoms';
import { randomVillagerName } from '../../../utils/randomName';
import { getPersonaLabel } from '../../../types';
import { ActionButton, SectionLabel, Toggle } from '../../ui/pixel';
import type { SettingsImportExportApi } from '../useSettingsImportExport';
import type { SubPage } from '../constants';

interface PlayersSectionProps {
    setSubPage: (subPage: SubPage | null) => void;
    io: SettingsImportExportApi;
}

export const PlayersSection = ({ setSubPage, io }: PlayersSectionProps) => {
    const [config] = useAtom(globalApiConfigAtom);
    const [actors, setActors] = useAtom(actorProfilesAtom);
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);

    const updateUi = <K extends keyof typeof uiConfig>(key: K, value: (typeof uiConfig)[K]) => {
        setUiConfig(prev => ({ ...prev, [key]: value }));
    };

    const createActor = () => {
        const id = `a-${Date.now()}`;
        setActors(p => [...p, {
            id, name: randomVillagerName(), llmPresetId: llmPresets[0]?.id || '',
            ttsPresetId: ttsPresets[0]?.id || 'tts-1', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: ''
        }]);
        setSubPage({ type: 'ACTOR_EDIT', id });
    };

    return (
        <div className="space-y-6">
            <div>
                <SectionLabel>上帝 (旁白)</SectionLabel>
                <div onClick={() => setSubPage({ type: 'ACTOR_EDIT', id: config.narratorActorId })}
                    className="rounded-none border-[3px] p-4 cursor-pointer transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)] group"
                    style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-accent1)' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">☁️</span>
                            <div>
                                <div className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>上帝 (旁白) 设置</div>
                                <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>设置上帝的声音与风格</div>
                            </div>
                        </div>
                        <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>玩家列表</SectionLabel>
                <div className="rounded-none border-[3px] p-4 mb-4 flex items-center justify-between gap-3" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div>
                        <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>每局随机人设（直播整活）</span>
                        <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>开局给每个 AI 分身随机抽取说话风格：戏精 / 阴阳怪气 / 东北老铁 / 甄嬛体…</span>
                    </div>
                    <Toggle value={uiConfig.randomPersonaEachGame} onChange={() => updateUi('randomPersonaEachGame', !uiConfig.randomPersonaEachGame)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <ActionButton variant="ghost" onClick={io.handleActorsExport}>导出玩家配置</ActionButton>
                    <ActionButton variant="ghost" onClick={io.handleActorsImportClick}>导入玩家配置</ActionButton>
                </div>
                <input type="file" ref={io.actorsFileInputRef} onChange={io.handleActorsFileChange} accept=".werewolf-actors,.json" className="hidden" />
                <div className="space-y-3">
                    {actors.filter(a => a.id !== config.narratorActorId).map(actor => {
                        const llm = llmPresets.find(l => l.id === actor.llmPresetId);
                        const tts = ttsPresets.find(t => t.id === actor.ttsPresetId);
                        return (
                            <div key={actor.id} onClick={() => setSubPage({ type: 'ACTOR_EDIT', id: actor.id })}
                                className="rounded-none border-[3px] p-4 cursor-pointer transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)] group"
                                style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>{actor.name}</div>
                                        <div className="flex gap-2 mt-1.5 flex-wrap">
                                            <span className="text-[10px] px-2 py-0.5 rounded font-medium"
                                                style={{ background: 'var(--color-bg)', color: 'var(--color-accent1)', border: '1px solid var(--color-border)' }}>
                                                {llm?.name || '未配置 LLM'}
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 rounded font-medium"
                                                style={{ background: 'var(--color-bg)', color: 'var(--color-accent2)', border: '1px solid var(--color-border)' }}>
                                                {tts?.name || 'Unknown TTS'}
                                            </span>
                                            {getPersonaLabel(actor.stylePrompt) && (
                                                <span className="text-[10px] px-2 py-0.5 rounded font-bold"
                                                    style={{ background: 'var(--color-bg)', color: 'var(--color-accent3)', border: '1px solid var(--color-accent3)' }}>
                                                    🎭 {getPersonaLabel(actor.stylePrompt)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </div>
                        );
                    })}
                    <ActionButton onClick={createActor}>+ 添加新玩家</ActionButton>
                </div>
            </div>
        </div>
    );
};
