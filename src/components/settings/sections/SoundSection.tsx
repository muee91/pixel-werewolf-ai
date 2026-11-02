import { useAtom, useAtomValue } from 'jotai';
import { globalApiConfigAtom, ttsPresetsAtom } from '../../../store';
import { uiConfigAtom } from '../../../atoms';
import { PixelSlider, SectionLabel, Toggle } from '../../ui/pixel';
import type { SubPage } from '../constants';

interface SoundSectionProps {
    setSubPage: (subPage: SubPage | null) => void;
}

// 声音分区:凡「听得见的」都在这里 —— 三条音轨(环境/技能/阶段)、音乐、音量,
// 以及朗读侧的 TTS 开关、语速和引擎入口。
// 之前这些散在「外观」(音频)与「游戏」(朗读倍速)、「模型与语音」(TTS) 三处。
export const SoundSection = ({ setSubPage }: SoundSectionProps) => {
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);
    const [config, setConfig] = useAtom(globalApiConfigAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const edgePreset = ttsPresets.find(preset => preset.provider === 'edge-tts');

    const updateUi = <K extends keyof typeof uiConfig>(key: K, value: (typeof uiConfig)[K]) => {
        setUiConfig(prev => ({ ...prev, [key]: value }));
    };

    // 四条音轨：环境声 / 技能声只在 3D 视角有；阶段音效与 BGM 两个视角都有。
    // 关掉任意一条都只在设置里留一个灰开关，界面上没有任何"我现在是静音"的信号，
    // 于是很容易被当成"声音坏了"。这里直接报数并点明 2D/3D 的区别。
    const enabledCount = [
        uiConfig.worldAmbientAudioEnabled,
        uiConfig.worldSkillAudioEnabled,
        uiConfig.gameSfxEnabled,
        uiConfig.bgmEnabled,
    ].filter(Boolean).length;
    const mutedTitles = [
        !uiConfig.worldAmbientAudioEnabled && '环境声',
        !uiConfig.worldSkillAudioEnabled && '技能声',
        !uiConfig.gameSfxEnabled && '阶段音效',
        !uiConfig.bgmEnabled && '对局音乐',
    ].filter(Boolean) as string[];

    return (
        <div className="space-y-6">
            <div>
                <SectionLabel>场景与对局音轨</SectionLabel>
                {mutedTitles.length > 0 && (
                    <div
                        data-testid="sound-track-summary"
                        className="mb-2 border-l-[3px] px-2 py-1 text-xs leading-snug"
                        style={{ borderColor: 'var(--color-accent2)', color: 'var(--color-muted)' }}
                    >
                        <b style={{ color: 'var(--color-fg)' }}>{enabledCount}/4 音轨开启</b>
                        ：{mutedTitles.join('、')}是关的。
                        {(!uiConfig.worldAmbientAudioEnabled || !uiConfig.worldSkillAudioEnabled) && ' 环境声与技能声只有在 3D RPG 视角里才听得到。'}
                    </div>
                )}
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>环境声</span>
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>3D 场景底噪：篝火、风声</span>
                            </div>
                            <Toggle value={uiConfig.worldAmbientAudioEnabled} onChange={() => updateUi('worldAmbientAudioEnabled', !uiConfig.worldAmbientAudioEnabled)} />
                        </div>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>技能声</span>
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>3D 世界里技能发动时的提示音</span>
                            </div>
                            <Toggle value={uiConfig.worldSkillAudioEnabled} onChange={() => updateUi('worldSkillAudioEnabled', !uiConfig.worldSkillAudioEnabled)} />
                        </div>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>阶段音效</span>
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>入夜狼嚎、天亮鸡鸣、投票鼓点，以及查验/泡药/盾击/上膛</span>
                            </div>
                            <Toggle value={uiConfig.gameSfxEnabled} onChange={() => updateUi('gameSfxEnabled', !uiConfig.gameSfxEnabled)} />
                        </div>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>对局音乐（BGM）</span>
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>白天明亮 / 夜晚压抑双轨和弦，播报时自动压低</span>
                            </div>
                            <Toggle value={uiConfig.bgmEnabled} onChange={() => updateUi('bgmEnabled', !uiConfig.bgmEnabled)} />
                        </div>
                        <div className="p-4">
                            <PixelSlider
                                label="音量"
                                badge={`${Math.round(uiConfig.gameSfxVolume * 100)}%`}
                                min={0} max={1} step={0.05}
                                value={uiConfig.gameSfxVolume}
                                onChange={e => updateUi('gameSfxVolume', parseFloat(e.target.value))}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>语音朗读</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>启用语音 (TTS)</span>
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Edge TTS 免 Key、需联网；关闭时字幕与演出照常</span>
                            </div>
                            <Toggle value={config.enabled} onChange={() => setConfig(p => ({ ...p, enabled: !p.enabled }))} />
                        </div>
                        <div className="p-4">
                            <PixelSlider
                                label="朗读倍速"
                                badge={`${(config.ttsSpeed || 1.0).toFixed(1)}x`}
                                min={0.5} max={2.0} step={0.1}
                                value={config.ttsSpeed || 1.0}
                                onChange={(e) => setConfig(p => ({ ...p, ttsSpeed: parseFloat(e.target.value) }))}
                                minLabel="0.5x" maxLabel="2.0x"
                            />
                        </div>
                        <button type="button" onClick={() => { if (edgePreset) setSubPage({ type: 'TTS_EDIT', id: edgePreset.id }); }}
                            className="w-full text-left p-4 cursor-pointer hover:shadow-[3px_3px_0_var(--voxel-ink)] transition-all">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">🌐</span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm" style={{ color: 'var(--color-fg)' }}>Edge TTS 引擎</div>
                                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>微软 Edge TTS，500+ 音色，需联网 · 点这里调音色</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full" style={{ background: config.enabled && edgePreset ? 'var(--color-accent1)' : 'var(--color-muted)' }} />
                                    <span className="text-xs font-bold" style={{ color: config.enabled && edgePreset ? 'var(--color-accent1)' : 'var(--color-muted)' }}>
                                        {config.enabled ? (edgePreset ? '已启用' : '缺少引擎配置') : '当前关闭'}
                                    </span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
