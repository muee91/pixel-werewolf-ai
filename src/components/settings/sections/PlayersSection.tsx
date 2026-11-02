import { useAtom, useAtomValue } from 'jotai';
import { globalApiConfigAtom, llmPresetsAtom, ttsPresetsAtom, actorProfilesAtom } from '../../../store';
import { uiConfigAtom } from '../../../atoms';
import { randomVillagerName } from '../../../utils/randomName';
import { getPersonaLabel } from '../../../types';
import { ActionButton, SectionLabel, Toggle } from '../../ui/pixel';
import { PixelAvatar } from '../../game/voxel/primitives';
import { resolveLook, seedFromId } from '../../../utils/avatarLook';
import { ModelMixPanel } from './ModelMixPanel';
import type { SubPage } from '../constants';

interface PlayersSectionProps {
    setSubPage: (subPage: SubPage | null) => void;
}

// 玩家与分身:只管「谁在打、用什么声音」;四组导入导出统一在「高级 · 数据搬家」
export const PlayersSection = ({ setSubPage }: PlayersSectionProps) => {
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
                <button type="button" onClick={() => setSubPage({ type: 'ACTOR_EDIT', id: config.narratorActorId })}
                    className="w-full text-left rounded-none border-[3px] p-4 cursor-pointer transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)] group"
                    style={{ background: 'var(--color-card)', borderColor: 'var(--color-accent1)' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">☁️</span>
                            <div>
                                <div className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>上帝 (旁白) 设置</div>
                                <div className="text-xs" style={{ color: 'var(--color-muted)' }}>设置上帝的声音与风格</div>
                            </div>
                        </div>
                        <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </button>
            </div>

            <div>
                <SectionLabel>玩家列表</SectionLabel>
                {/* 两行一张表：随机人设（整局的风味开关）与模型混搭（谁的大脑）都是"这一桌怎么打"的整体设定，
                    原先各占一个 3px 边框盒子，两行并起来省一块视觉重量。 */}
                <div className="mb-4 rounded-none border-[3px] overflow-hidden"
                    style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                            <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>每局随机人设（直播整活）</span>
                            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>开局给每个 AI 分身随机抽取说话风格：戏精 / 阴阳怪气 / 东北老铁 / 甄嬛体…</span>
                        </div>
                        <Toggle value={uiConfig.randomPersonaEachGame} onChange={() => updateUi('randomPersonaEachGame', !uiConfig.randomPersonaEachGame)} />
                    </div>
                    <div className="border-t-[3px]" style={{ borderColor: 'var(--color-border)' }}>
                        <ModelMixPanel embedded />
                    </div>
                </div>
                {/* 两列网格：12 张卡从 4 屏压到 2 屏。卡片只有名字 + 几个标签，单列纯浪费横向空间。 */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {actors.filter(a => a.id !== config.narratorActorId).map(actor => {
                        const llm = llmPresets.find(l => l.id === actor.llmPresetId);
                        const tts = ttsPresets.find(t => t.id === actor.ttsPresetId);
                        return (
                            <button type="button" key={actor.id} onClick={() => setSubPage({ type: 'ACTOR_EDIT', id: actor.id })}
                                data-testid="player-card"
                                className="w-full text-left rounded-none border-[3px] p-4 cursor-pointer transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)] group"
                                style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        {/* 全身小像：只露头看不出衣服与腿，配色差异就白配了 */}
                                        <span className="flex h-14 w-8 shrink-0 items-end justify-center overflow-hidden border-2"
                                            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                                            <PixelAvatar seed={seedFromId(actor.id)} look={resolveLook(actor.look, seedFromId(actor.id))} px={2} />
                                        </span>
                                        <div className="min-w-0">
                                        <div className="font-bold text-sm truncate" style={{ color: 'var(--color-fg)' }}>{actor.name}</div>
                                        <div className="flex gap-2 mt-1.5 flex-wrap">
                                            <span className="text-xs px-2 py-0.5 rounded font-medium max-w-full truncate"
                                                style={{ background: 'var(--color-bg)', color: 'var(--color-accent1)', border: '1px solid var(--color-border)' }}>
                                                {llm?.name || '未配置 LLM'}
                                            </span>
                                            <span className="text-xs px-2 py-0.5 rounded font-medium max-w-full truncate"
                                                style={{ background: 'var(--color-bg)', color: 'var(--color-accent2)', border: '1px solid var(--color-border)' }}>
                                                {tts?.name || 'Unknown TTS'}
                                            </span>
                                            {getPersonaLabel(actor.stylePrompt) && (
                                                <span className="text-xs px-2 py-0.5 rounded font-bold max-w-full truncate"
                                                    style={{ background: 'var(--color-bg)', color: 'var(--color-accent3)', border: '1px solid var(--color-accent3)' }}>
                                                    🎭 {getPersonaLabel(actor.stylePrompt)}
                                                </span>
                                            )}
                                        </div>
                                        </div>
                                    </div>
                                    <svg className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </button>
                        );
                    })}
                    <div className="sm:col-span-2">
                        <ActionButton onClick={createActor}>+ 添加新玩家</ActionButton>
                    </div>
                </div>
            </div>
        </div>
    );
};
