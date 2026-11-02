import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { uiConfigAtom } from '../../../atoms';
import { THEMES } from '../../../themes/index';
import type { EffectLevel } from '../../../themes/types';
import { OptionCard, SectionLabel } from '../../ui/pixel';
import { CardStylePreview, GameLayoutPreview, HomeStylePreview } from '../previews';
import { SCENE_IDS, SCENES } from '../../game/voxel3d/biomes';

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
    // 决策瞬间只给短提示；完整告警走 title，避免选项卡里出现一堵字
    const viewModeOptions = [
        { id: '2d' as const, label: '经典 2D', desc: '稳定的方块营地界面，适合低性能设备', hint: undefined as string | undefined },
        {
            id: '3d' as const,
            label: '3D RPG',
            desc: modelReady ? '环绕镜头进入森林篝火议会' : '环绕镜头进入森林篝火议会（离线大脑也能演）',
            hint: modelReady ? undefined : '未配置模型时由内置离线大脑发言（决策较简单）；配好模型或下载内置小模型后更像真人',
        },
    ];

    return (
        <div className="space-y-8">
            <div>
                <SectionLabel>对局视角</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                    {viewModeOptions.map(option => (
                        <OptionCard
                            key={option.id}
                            active={uiConfig.gameViewMode === option.id}
                            onClick={() => updateUi('gameViewMode', option.id)}
                        >
                            <div className="p-3 text-center">
                                <div className="text-sm font-bold" style={{ color: 'var(--color-fg)' }}>{option.label}</div>
                                <div className="mt-1 text-xs leading-tight" title={option.hint} style={{ color: 'var(--color-muted)' }}>{option.desc}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>

            <div>
                <SectionLabel>3D 场景</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                    {SCENE_IDS.map(id => {
                        const preset = SCENES[id];
                        return (
                            <OptionCard
                                key={id}
                                active={(uiConfig.sceneId ?? 'forest-camp') === id}
                                onClick={() => updateUi('sceneId', id)}
                            >
                                <div className="p-3 text-center">
                                    <div className="text-xs font-bold" style={{ color: 'var(--color-fg)' }}>{preset.label}</div>
                                    <div className="mt-1 text-xs leading-tight" style={{ color: 'var(--color-muted)' }}>{preset.desc}</div>
                                </div>
                            </OptionCard>
                        );
                    })}
                </div>
                <div className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                    只作用于 3D 视角。五套场景共用同一份地形与光照系统，切换后进入对局即可看到。
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
                                <div className="text-xs leading-tight" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
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
                                <div className="text-xs leading-tight" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>
            )}

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
                                <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
                            </div>
                        </OptionCard>
                    ))}
                </div>
            </div>
        </div>
    );
};
