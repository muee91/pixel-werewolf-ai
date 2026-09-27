import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { uiConfigAtom } from '../../../atoms';
import { THEMES } from '../../../themes/index';
import type { EffectLevel } from '../../../themes/types';
import { OptionCard, PixelSlider, SectionLabel, Toggle } from '../../ui/pixel';
import { CardStylePreview, GameLayoutPreview, HomeStylePreview } from '../previews';

interface AppearanceSectionProps {
    // 3D 视角选项的提示文案依赖「是否已有可开局模型」
    modelReady: boolean;
}

export const AppearanceSection = ({ modelReady }: AppearanceSectionProps) => {
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);

    const updateUi = <K extends keyof typeof uiConfig>(key: K, value: (typeof uiConfig)[K]) => {
        setUiConfig(prev => ({ ...prev, [key]: value }));
    };

    const currentTheme = THEMES[uiConfig.themeId];
    const homeStyleOptions = currentTheme.homeStyles;
    const gameLayoutOptions = currentTheme.gameLayouts;
    const playerCardOptions = currentTheme.cardStyles;
    const effectLevelOptions: { id: EffectLevel; label: string; desc: string }[] = [
        { id: 'subtle', label: '克制', desc: '最小动画' },
        { id: 'medium', label: '适中', desc: '平衡体验' },
        { id: 'intense', label: '全开', desc: '全部特效' },
    ];

    return (
        <div className="space-y-8">
            <div>
                <SectionLabel>对局视角</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                    {([
                        { id: '2d' as const, label: '经典 2D', desc: '稳定的方块营地界面，适合低性能设备' },
                        { id: '3d' as const, label: '3D RPG', desc: modelReady ? '环绕镜头进入森林篝火议会' : '环绕镜头进入森林篝火议会（未配置可用模型时 AI 将无法发言，建议先在模型区完成配置）' },
                    ]).map(option => (
                        <OptionCard
                            key={option.id}
                            active={uiConfig.gameViewMode === option.id}
                            onClick={() => updateUi('gameViewMode', option.id)}
                        >
                            <div className="p-3 text-center">
                                <div className="text-sm font-bold" style={{ color: 'var(--color-fg)' }}>{option.label}</div>
                                <div className="mt-1 text-[10px] leading-tight" style={{ color: 'var(--color-muted)' }}>{option.desc}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>

            <div>
                <SectionLabel>首页风格</SectionLabel>
                <div className="grid gap-3" style={{ gridTemplateColumns: gameLayoutOptions.length > 4 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))' }}>
                    {homeStyleOptions.map(opt => (
                        <OptionCard key={opt.id} active={uiConfig.homeStyle === opt.id}
                            onClick={() => updateUi('homeStyle', opt.id)}>
                            <div className="p-3 text-center">
                                <HomeStylePreview id={opt.id} />
                                <div className="text-xs font-bold mb-1" style={{ color: 'var(--color-fg)' }}>{opt.label}</div>
                                <div className="text-[10px] leading-tight" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>

            <div>
                <SectionLabel>游戏布局</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                    {gameLayoutOptions.map(opt => (
                        <OptionCard key={opt.id} active={uiConfig.gameLayout === opt.id}
                            onClick={() => updateUi('gameLayout', opt.id)}>
                            <div className="p-3 text-center">
                                <GameLayoutPreview id={opt.id} />
                                <div className="text-xs font-bold" style={{ color: 'var(--color-fg)' }}>{opt.label}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>

            {playerCardOptions.length > 1 && (
            <div>
                <SectionLabel>玩家卡片</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                    {playerCardOptions.map(opt => (
                        <OptionCard key={opt.id} active={uiConfig.playerCardStyle === opt.id}
                            onClick={() => updateUi('playerCardStyle', opt.id)}>
                            <div className="p-3 text-center">
                                <CardStylePreview id={opt.id} />
                                <div className="text-xs font-bold mb-1" style={{ color: 'var(--color-fg)' }}>{opt.label}</div>
                                <div className="text-[10px] leading-tight" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>
            )}

            <div>
                <SectionLabel>演出音频</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>环境声</span>
                                <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>篝火、风声等场景环境音</span>
                            </div>
                            <Toggle value={uiConfig.worldAmbientAudioEnabled} onChange={() => updateUi('worldAmbientAudioEnabled', !uiConfig.worldAmbientAudioEnabled)} />
                        </div>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>技能声</span>
                                <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>技能发动时的音效提示</span>
                            </div>
                            <Toggle value={uiConfig.worldSkillAudioEnabled} onChange={() => updateUi('worldSkillAudioEnabled', !uiConfig.worldSkillAudioEnabled)} />
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>对局音效与音乐</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>阶段与技能音效</span>
                                <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>入夜狼嚎、天亮鸡鸣、投票鼓点、查验/泡药/盾击/上膛</span>
                            </div>
                            <Toggle value={uiConfig.gameSfxEnabled} onChange={() => updateUi('gameSfxEnabled', !uiConfig.gameSfxEnabled)} />
                        </div>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>对局音乐（BGM）</span>
                                <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>白天明亮 / 夜晚压抑双轨和弦，播报时自动压低</span>
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
                <SectionLabel>特效等级</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                    {effectLevelOptions.map(opt => (
                        <OptionCard key={opt.id} active={uiConfig.effectLevel === opt.id}
                            onClick={() => updateUi('effectLevel', opt.id)}>
                            <div className="p-3 text-center">
                                <div className="flex items-center justify-center gap-0.5 mb-2">
                                    {[1, 2, 3].map(level => (
                                        <div key={level}
                                            className={clsx(
                                                'w-2 h-2 rounded-full transition-all',
                                                opt.id === 'subtle' && level <= 1 && 'bg-[var(--color-accent1)]',
                                                opt.id === 'subtle' && level > 1 && 'bg-[var(--color-border)]',
                                                opt.id === 'medium' && level <= 2 && 'bg-[var(--color-accent1)]',
                                                opt.id === 'medium' && level > 2 && 'bg-[var(--color-border)]',
                                                opt.id === 'intense' && 'bg-[var(--color-accent1)]',
                                            )}
                                        />
                                    ))}
                                </div>
                                <div className="text-xs font-bold" style={{ color: 'var(--color-fg)' }}>{opt.label}</div>
                                <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>
        </div>
    );
};
