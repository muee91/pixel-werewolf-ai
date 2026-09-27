import React, { useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { appScreenAtom, gameConfigAtom, initGameAtom, isHumanModeAtom, minimizedGameAtom, multiplayerStateAtom, playersAtom, gamePhaseAtom, llmPresetsAtom, llmProvidersAtom } from '../../store';
import { remoteServerConfigAtom, uiConfigAtom } from '../../atoms';
import { ThreeSceneErrorBoundary } from '../game/voxel3d/ThreeSceneErrorBoundary';
import { GAME_PRESETS, GamePhase, GOD_ROLES, ROLE_INFO, WOLF_ROLES, type GamePreset } from '../../types';
import { HomeModeSwitch } from './HomeModeSwitch';
import { HomeBottomNav } from './HomeBottomNav';
import { HomeFullscreenButton } from './HomeFullscreenButton';
import { VoxelHomeWorldPreview } from './VoxelHomeWorldPreview';
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';
import { PixelBlock, PixelAvatar, BlockButton, McSpriteCanvas, McIcon, PixelIcon } from '../game/voxel/primitives';
import { isProviderConfiguredForRuntime } from '../../utils/llmConfig';
import { probeLocalLlm } from '../../utils/localLlmProbe';

type CompositionTeam = 'wolf' | 'god' | 'villager';

const teamOf = (role: GamePreset['roles'][number]): CompositionTeam => {
    if (WOLF_ROLES.includes(role)) return 'wolf';
    if (GOD_ROLES.includes(role)) return 'god';
    return 'villager';
};

// 阵营配色:狼=红石 神=钻石 民=绿宝石
const TEAM_STYLE: Record<CompositionTeam, { background: string; color: string }> = {
    wolf: { background: T.redstone, color: T.paper },
    god: { background: T.diamond, color: T.ink },
    villager: { background: T.emerald, color: T.ink },
};

const TEAM_NAMES: Record<CompositionTeam, string> = { wolf: '狼人', god: '神职', villager: '村民' };
const TEAM_ORDER: CompositionTeam[] = ['wolf', 'god', 'villager'];

const CampfireDecoration: React.FC = () => (
    <div className="vw-campfire">
        <div className="glow" />
        <McSpriteCanvas name="campfire" px={7} />
        {[0, 0.6, 1.2].map(delay => <div key={delay} className="ember" style={{ animationDelay: `${delay}s` }} />)}
    </div>
);

// 完整角色名的阵容构成,按 狼人阵营→神职→村民 排序
const composition = (preset: GamePreset) => {
    const counts = new Map<string, { count: number; team: CompositionTeam }>();
    preset.roles.forEach(role => {
        const label = ROLE_INFO[role]?.label || String(role);
        const prev = counts.get(label);
        counts.set(label, { count: (prev?.count || 0) + 1, team: teamOf(role) });
    });
    return [...counts.entries()]
        .map(([label, { count, team }]) => ({ label, count, team }))
        .sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || b.count - a.count);
};

// 卡片底部一行:阵营人数汇总
const teamLine = (preset: GamePreset) =>
    TEAM_ORDER
        .map(team => {
            const n = preset.roles.filter(role => teamOf(role) === team).length;
            return n ? `${TEAM_NAMES[team]}×${n}` : '';
        })
        .filter(Boolean)
        .join(' · ');

export const VoxelCampHome: React.FC = () => {
    const initGame = useSetAtom(initGameAtom);
    const setScreen = useSetAtom(appScreenAtom);
    const [gameConfig, setGameConfig] = useAtom(gameConfigAtom);
    const [isHumanMode, setIsHumanMode] = useAtom(isHumanModeAtom);
    const [minimizedGame, setMinimizedGame] = useAtom(minimizedGameAtom);
    const multiplayerState = useAtomValue(multiplayerStateAtom);
    // 模式卡选中态：仅高亮"进行中的对局"的模式或本次会话内用户的显式选择；
    // 退出对局回主页时为中性（三张卡都不亮），不再显示一个莫名的"旁观生存"选中项
    const [selectedMode, setSelectedMode] = useState<'ai' | 'human' | 'multiplayer' | null>(
        minimizedGame.enabled ? (isHumanMode ? 'human' : 'ai') : null
    );
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const [players] = useAtom(playersAtom);
    const [phase] = useAtom(gamePhaseAtom);
    const [selectedKey, setSelectedKey] = useState(GAME_PRESETS[0]?.key || '');
    const [filter, setFilter] = useState<number | null>(null);
    const [isNight, setIsNight] = useState(false);
    const [localModelAvailable, setLocalModelAvailable] = useState(false);

    const selectedPreset = GAME_PRESETS.find(preset => preset.key === selectedKey) || GAME_PRESETS[0];
    const presets = useMemo(() => filter ? GAME_PRESETS.filter(preset => preset.playerCount === filter) : GAME_PRESETS, [filter]);
    const hasMinimized = minimizedGame.enabled && players.length > 0 && phase !== GamePhase.SETUP;
    const isThreeDimensional = uiConfig.gameViewMode === '3d';
    // 首页风格变体:三种风格改变 2D 场景的天地色、灯火与点缀物(3D 预览暂共用森林营地)
    const homeStyle = uiConfig.homeStyle;
    const isHarborHome = homeStyle === 'block-harbor';
    const isRedstoneHome = homeStyle === 'redstone-lobby';
    const scene = isHarborHome
        ? {
            day: 'linear-gradient(180deg, #4b2d1a 0%, #8b5a2b 60%, #a5713a 100%)',
            night: 'linear-gradient(180deg, #1d1209 0%, #3a2413 100%)',
            lamp: '#f6b443',
            lampGlow: 'rgba(246,180,67,0.35)',
            ground: '#a5713a', ground2: '#6b4423',
            dirt: '#4b2d1a', dirtDark: '#3a2413',
        }
        : isRedstoneHome
            ? {
                day: 'linear-gradient(180deg, #1f242b 0%, #3a3f47 60%, #4a5058 100%)',
                night: 'linear-gradient(180deg, #0f1216 0%, #23272e 100%)',
                lamp: '#d94b3d',
                lampGlow: 'rgba(217,75,61,0.4)',
                ground: '#4a5058', ground2: '#343a40',
                dirt: '#2b3037', dirtDark: '#22262c',
            }
            : null; // survival-camp = 经典营地(草地方砖)
    const groundTop = scene?.ground ?? T.grass;
    const groundBottom = scene?.ground2 ?? T.grassDark;
    const dirtTop = scene?.dirt ?? T.dirt;
    const dirtBottom = scene?.dirtDark ?? T.dirtDark;
    const sceneBg = scene ? (isNight ? scene.night : scene.day) : (isNight ? T.night : T.sky);
    const lampColor = scene ? scene.lamp : (isNight ? T.paper : '#ffd45a');
    const lampGlow = scene ? scene.lampGlow : 'rgba(255,212,90,0.35)';
    const configuredModelReady = useMemo(() => llmPresets.some(preset => {
        const provider = llmProviders.find(item => item.id === preset.providerId);
        return !!preset.modelId.trim() && isProviderConfiguredForRuntime(provider, remoteConfig);
    }), [llmPresets, llmProviders, remoteConfig]);
    const modelReady = localModelAvailable || configuredModelReady;

    useEffect(() => {
        if (configuredModelReady) return;
        let active = true;
        probeLocalLlm().then(result => {
            if (active) setLocalModelAvailable(!!result);
        });
        return () => { active = false; };
    }, [configuredModelReady]);

    const selectPreset = (preset: GamePreset) => {
        setSelectedKey(preset.key);
        setGameConfig(prev => ({
            ...prev,
            playerCount: preset.playerCount,
            roles: preset.roles,
            sheriffEnabled: preset.rules.sheriffElection,
            voteDetailPublic: preset.rules.voteDetailPublic,
            rules: preset.rules,
        }));
    };

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden" style={{ color: T.ink, fontFamily: 'var(--voxel-font)', imageRendering: 'pixelated', background: sceneBg }}>
            {/* 3D 预览崩溃时一键回 2D，不让主页跟着 WebGL 一起挂掉 */}
            {isThreeDimensional ? (
                <ThreeSceneErrorBoundary onReturnTo2D={() => setUiConfig(prev => ({ ...prev, gameViewMode: '2d' }))}>
                    <VoxelHomeWorldPreview isNight={isNight} />
                </ThreeSceneErrorBoundary>
            ) : <>
                <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="absolute left-[7%] top-[9%] h-20 w-20" style={{ background: lampColor, boxShadow: 'inset -10px -10px 0 rgba(0,0,0,0.12), 0 0 50px ' + lampGlow }} />
                {/* 白天像素云缓慢漂移(码头/红石为室内场景,不出云) */}
                {!isNight && !scene && [[10, 95, -12], [55, 130, -60]].map(([top, dur, delay], i) => (
                    <div key={`home-cloud-${i}`} className="vw-cloud" style={{ top: `${top}%`, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
                        <div style={{ width: 88, height: 16, background: '#f6fafce6', boxShadow: '20px -10px 0 #f6fafce6, -16px -6px 0 #ffffffb3, 6px 6px 0 rgba(36,23,14,0.06)' }} />
                    </div>
                ))}
                {/* 夜晚氛围:星空 + 萤火虫 */}
                {isNight && (
                    <>
                        {[[14, 30], [26, 18], [38, 36], [50, 22], [62, 32], [74, 16], [86, 28]].map(([l, t], i) => (
                            <div key={`home-star-${i}`} className="vw-star" style={{ left: `${l}%`, top: `${t}%` }} />
                        ))}
                        {[[20, 60], [44, 56], [68, 58]].map(([l, t], i) => (
                            <div key={`home-fly-${i}`} className="vw-firefly" style={{ left: `${l}%`, top: `${t}%`, animationDuration: `${3 + i * 0.8}s`, animationDelay: `${-i * 1.4}s` }} />
                        ))}
                    </>
                )}
                <div className="absolute left-0 right-0 top-[48%] h-24" style={{ background: `linear-gradient(180deg, ${groundTop}, ${groundBottom})`, clipPath: 'polygon(0 45%, 10% 28%, 20% 42%, 32% 18%, 44% 38%, 56% 22%, 70% 45%, 82% 30%, 100% 42%, 100% 100%, 0 100%)' }} />
                <div className="absolute bottom-0 left-0 right-0 h-[34%]" style={{ backgroundColor: dirtTop, backgroundImage: `linear-gradient(45deg, ${dirtBottom} 25%, transparent 25%), linear-gradient(-45deg, ${dirtBottom} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${dirtBottom} 75%), linear-gradient(-45deg, transparent 75%, ${dirtBottom} 75%)`, backgroundSize: '32px 32px', backgroundPosition: '0 0, 0 16px, 16px -16px, -16px 0' }} />
                {/* 风格点缀:码头吊灯+灯桩 / 红石灯阵+拨杆(经典营地保持原样)。放在面板未覆盖的上下边缘带才可见 */}
                {isHarborHome && (
                    <>
                        {[28, 62].map((l, i) => (
                            <div key={`hb-lantern-${i}`} className="absolute" style={{ left: `${l}%`, top: 0 }}>
                                <div className="mx-auto h-3 w-0.5" style={{ background: '#24170e' }} />
                                <div className="h-3 w-3" style={{ background: '#f6b443', border: '1px solid #24170e', boxShadow: '0 0 14px rgba(246,180,67,0.85)' }} />
                            </div>
                        ))}
                        <div className="absolute bottom-1 left-[6%] h-8 w-1.5" style={{ background: '#5a3a1e' }} />
                        <div className="absolute bottom-[36px] left-[4.6%] h-3 w-3.5" style={{ background: '#f6b443', border: '1px solid #24170e', boxShadow: '0 0 16px rgba(246,180,67,0.85)' }} />
                        <div className="absolute bottom-1 right-[9%] h-8 w-1.5" style={{ background: '#5a3a1e' }} />
                        <div className="absolute bottom-[36px] right-[7.6%] h-3 w-3.5" style={{ background: '#f6b443', border: '1px solid #24170e', boxShadow: '0 0 16px rgba(246,180,67,0.85)' }} />
                    </>
                )}
                {isRedstoneHome && (
                    <>
                        {[8, 18, 62, 74].map((l, i) => (
                            <div key={`rs-lamp-${i}`} className="absolute bottom-1 h-5 w-5" style={{ left: `${l}%`, background: i === 1 ? '#d94b3d' : i === 2 ? '#d94b3d' : '#7a2a22', border: '2px solid #24170e', boxShadow: i === 1 || i === 2 ? '0 0 16px rgba(217,75,61,0.85)' : undefined }} />
                        ))}
                        {[86, 92].map((l, i) => (
                            <div key={`rs-lever-${i}`} className="absolute bottom-2 h-2 w-4" style={{ left: `${l}%`, background: i === 0 ? '#c9ced6' : '#7a5f35', border: '1px solid #24170e' }} />
                        ))}
                    </>
                )}
            </>}

            <div className="absolute left-4 top-4 z-40 flex items-center gap-2">
                <HomeFullscreenButton onClick={() => document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : document.documentElement.requestFullscreen().catch(() => {})} className="border-4 bg-[var(--voxel-paper-dim)] p-2 shadow-[4px_4px_0_var(--voxel-ink)]" style={{ borderColor: T.ink }} />
                <BlockButton onClick={() => setIsNight(v => !v)} className="border-4 px-3 py-2 text-xs">{isNight ? '白天' : '夜晚'}</BlockButton>
                {isThreeDimensional && <div className="hidden border-4 px-3 py-2 text-[10px] font-black tracking-[0.12em] shadow-[4px_4px_0_var(--voxel-ink)] sm:block" style={{ background: '#1e3824e6', borderColor: T.ink, color: T.paper }}>
                    3D 森林山谷 · 营地预览
                </div>}
            </div>

            <main className="relative z-10 mx-auto flex h-full max-w-7xl flex-col px-5 pb-24 pt-10">
                <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
                    <section className="flex min-h-0 flex-col justify-between border-4 p-4 shadow-[8px_8px_0_var(--voxel-ink)]" style={{ background: `${T.paperDim}f0`, borderColor: T.ink }}>
                        <div>
                            <div className="flex items-center gap-2">
                                <PixelBlock style={{ background: T.grass, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                                <PixelBlock style={{ background: T.dirt, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                                <PixelBlock style={{ background: T.stone, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                                <PixelBlock style={{ background: T.torch, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                            </div>
                            <h1 className="mt-5 text-4xl font-black leading-none md:text-5xl" style={{ textShadow: '3px 3px 0 #6b4226, 6px 6px 0 rgba(36,23,14,0.22)' }}>
                                方块狼人杀
                            </h1>
                            <div className="mt-3 border-4 p-3 text-sm font-black leading-relaxed shadow-[4px_4px_0_rgba(43,26,16,0.6)]" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>
                                {isThreeDimensional ? '森林山谷营地已点亮。选地图、点燃营火，进入可观战的 AI 篝火议会。' : '生存世界营地已生成。选地图、点燃营火，玩家像素分身会围着主会话区开局。'}
                            </div>
                        </div>

                        {/* 营火装饰:呼应"点燃营火"主题,居中填充面板留白(矮视口自动隐藏) */}
                        <div aria-hidden="true" className="my-auto hidden justify-center pt-4 [@media(min-height:720px)]:flex">
                            <CampfireDecoration />
                        </div>

                        <div className="mt-5">
                            <HomeModeSwitch
                                value={selectedMode}
                                onChange={(mode) => {
                                    if (mode === 'multiplayer') {
                                        setScreen('MULTIPLAYER');
                                        return;
                                    }
                                    setIsHumanMode(mode === 'human');
                                    setSelectedMode(mode);
                                }}
                                options={[
                                    { id: 'ai', title: '旁观生存', subtitle: 'AI 自动推进', icon: 'mc:pickaxe', accent: T.grass, mutedColor: T.ink, activeBackground: T.paper, inactiveBackground: '#b78345', activeBorderColor: T.ink, inactiveBorderColor: T.ink },
                                    { id: 'human', title: '亲自上场', subtitle: '单机扮演一个村民', icon: 'mc:door', accent: T.torch, mutedColor: T.ink, activeBackground: T.paper, inactiveBackground: '#b78345', activeBorderColor: T.ink, inactiveBorderColor: T.ink },
                                    { id: 'multiplayer', title: '联机服务器', subtitle: '好友一起进服', icon: 'mc:redstone', accent: T.redstone, mutedColor: T.ink, activeBackground: T.paper, inactiveBackground: '#b78345', activeBorderColor: T.ink, inactiveBorderColor: T.ink },
                                ]}
                                variant="stacked"
                                className="grid gap-2"
                                buttonClassName="border-4 font-black shadow-[4px_4px_0_var(--voxel-ink)]"
                                buttonStyle={{ borderRadius: 0, padding: '10px' }}
                            />
                        </div>

                        {hasMinimized && (
                            <div className="mt-4 border-4 p-3 shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: T.paper, borderColor: T.ink }}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-xs font-black">进行中的对局</div>
                                        <div className="mt-1 truncate text-[10px] font-bold opacity-75">
                                            DAY {minimizedGame.turnCount || 1} · {minimizedGame.aliveCount || players.length} 人仍在世界
                                        </div>
                                    </div>
                                    <button onClick={() => {
                                        // 联机对局的引擎/WS 只挂在 MULTIPLAYER 屏，继续必须回房间而不是裸 GAME 视图
                                        setMinimizedGame({ ...minimizedGame, enabled: false });
                                        setScreen(multiplayerState.status === 'IN_GAME' ? 'MULTIPLAYER' : 'GAME');
                                    }} className="shrink-0 border-4 px-3 py-2 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]" style={{ background: T.emerald, borderColor: T.ink, color: T.ink }}>
                                        继续
                                    </button>
                                </div>

                            </div>
                        )}
                    </section>

                    <section className="relative min-h-0 border-4 p-4 shadow-[8px_8px_0_var(--voxel-ink)]" style={{ background: '#6d8f3feb', borderColor: T.ink }}>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => setFilter(null)} className="border-4 px-3 py-1 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]" style={{ background: filter === null ? T.torch : T.paper, borderColor: T.ink, color: T.ink }}>全部地图</button>
                                {[6, 7, 8, 9, 10, 11, 12].map(count => (
                                    <button key={count} onClick={() => setFilter(filter === count ? null : count)} className="border-4 px-3 py-1 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]" style={{ background: filter === count ? T.torch : T.paper, borderColor: T.ink, color: T.ink }}>{count}人</button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4 grid h-[calc(100%-4.25rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:grid-rows-1">
                            <div className="custom-scrollbar grid min-h-0 auto-rows-max content-start grid-cols-1 gap-3 overflow-y-auto pr-2 sm:grid-cols-2">
                                {presets.map((preset, index) => {
                                    const active = selectedKey === preset.key;
                                    return (
                                        <button key={preset.key} onClick={() => selectPreset(preset)} className="animate-fade-in-up relative flex min-w-0 flex-col border-4 p-3 text-left transition-transform hover:-translate-y-1" style={{ borderColor: active ? 'var(--color-accent1)' : T.ink, background: active ? T.paper : '#b57a42', color: T.ink, boxShadow: `5px 5px 0 var(--voxel-ink), inset 0 3px 0 rgba(255,255,255,0.24), inset 0 -3px 0 rgba(0,0,0,0.18)`, animationDelay: `${Math.min(index, 12) * 45}ms`, animationFillMode: 'backwards' }}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="text-3xl"><McIcon icon={preset.icon} px={3} /></div>
                                            {active && (
                                                <span className="absolute right-1 top-1" style={{ color: 'var(--color-accent1)' }}>
                                                    <PixelIcon name="check" px={3} />
                                                </span>
                                            )}
                                                <div className="shrink-0 border-4 px-2 py-1 text-[10px] font-black" style={{ background: active ? T.redstone : T.grassDark, borderColor: T.ink, color: T.paper }}>
                                                    {preset.playerCount}人{active ? ' · 已选' : ''}
                                                </div>
                                            </div>
                                            <div className="mt-2 text-sm font-black leading-snug">{preset.label}</div>
                                            <div className="mt-1 line-clamp-2 break-all text-[10px] font-bold leading-snug opacity-80">{preset.description}</div>
                                            <div className="mt-auto border-t-2 pt-2 text-[10px] font-black tracking-tight" style={{ borderColor: 'rgba(36,23,14,0.3)' }}>{teamLine(preset)}</div>
                                        </button>
                                    );
                                })}
                            </div>

                                <aside className="flex min-w-0 flex-col border-4 p-3 shadow-[5px_5px_0_var(--voxel-ink)] lg:p-4" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>
                                    <div className="flex min-w-0 items-start gap-3 lg:block">
                                        <div className="text-xs font-black">当前地图</div>
                                        <div className="mt-0 text-2xl lg:mt-3"><McIcon icon={selectedPreset?.icon} px={2} /></div>
                                        <div className="min-w-0 flex-1">
                                            <div className="mt-0 line-clamp-1 break-all text-base font-black leading-tight lg:mt-2 lg:line-clamp-2 lg:text-xl">{selectedPreset?.label}</div>
                                            <div className="mt-1 hidden line-clamp-4 break-all text-xs font-bold leading-relaxed lg:block">{selectedPreset?.description}</div>
                                        </div>
                                    </div>
                                    {selectedPreset && (
                                        <div className="mt-3 hidden lg:block">
                                            <div className="text-xs font-black">阵容组成</div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {composition(selectedPreset).map(item => (
                                                    <span key={item.label} className="border-2 px-1.5 py-0.5 text-[10px] font-black" style={{ background: TEAM_STYLE[item.team].background, borderColor: T.ink, color: TEAM_STYLE[item.team].color }}>
                                                        {item.label}×{item.count}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                <div className="mt-3 hidden grid-cols-3 items-end gap-2 rounded-md p-2 lg:grid" style={{ background: T.grassDark }}>
                                    {Array.from({ length: Math.min(selectedPreset?.playerCount || 0, 12) }, (_, i) => <PixelAvatar key={i} seed={i} preview />)}
                                </div>
                                <button
                                    data-testid="ignite-campfire-button"
                                    onClick={async () => {
                                        if (!selectedPreset) return;
                                        // 有最小化进行中的对局时，新开局会静默覆盖它，必须先确认
                                        if (minimizedGame.enabled && !window.confirm('当前有一局进行中（已最小化），重新开局将放弃该局。确定继续？')) return;
                                        // 零配置也可开局:无模型时由内置离线大脑驱动;想上真 LLM 再去设置
                                        if (!modelReady && !(localModelAvailable || !!(await probeLocalLlm()))) {
                                            sessionStorage.setItem('werewolf-settings-section', 'model');
                                        }
                                        initGame(selectedPreset.key);
                                    }}
                                    className="mt-3 flex w-full items-center justify-center gap-2 border-4 px-4 py-3 text-base font-black shadow-[4px_4px_0_var(--voxel-ink)] transition-transform hover:-translate-y-0.5 active:-translate-y-0.5 active:shadow-[2px_2px_0_var(--voxel-ink)] lg:mt-auto"
                                    style={{ background: T.torch, borderColor: T.ink, color: T.ink }}
                                >
                                    <span aria-hidden="true">🔥</span>
                                    点燃营火
                                </button>
                                {!modelReady && (
                                    <div role="status" className="mt-2 border-2 px-2 py-1 text-center text-[10px] font-black" style={{ borderColor: T.ink, background: `${T.redstone}22`, color: T.ink }}>
                                        未配置模型：本局由内置离线大脑驱动；想要完整 AI 体验请到设置填写模型 API
                                    </div>
                                )}
                            </aside>
                        </div>
                    </section>
                </div>
            </main>

            {/* 居中悬浮底栏:不贴底、半透明木面,按钮等宽并排 */}
            <div className="fixed left-1/2 z-30 -translate-x-1/2" style={{ bottom: 'calc(1rem + var(--safe-area-inset-bottom))' }}>
                <div className="border-4 px-3 py-2 shadow-[6px_6px_0_var(--voxel-ink)]" style={{ background: `${T.woodDark}d8`, borderColor: T.ink, backdropFilter: 'blur(2px)' }}>
                    <HomeBottomNav
                        items={[
                            { screen: 'MULTIPLAYER', icon: 'mc:door', label: '联机' },
                            { screen: 'RULES', icon: 'mc:book', label: '规则' },
                            { screen: 'HISTORY', icon: 'mc:bookFilled', label: '历史' },
                            { screen: 'SETTINGS', icon: 'mc:compass', label: '设置' },
                            { screen: 'AGENT', icon: 'mc:map', label: '助手' },
                        ]}
                        onNavigate={setScreen}
                        className="flex w-[min(28rem,92vw)] items-center justify-center gap-2"
                        itemClassName="flex-1 border-4 px-2 py-1.5 text-center text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]"
                        itemStyle={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                        iconClassName="block text-base"
                        labelClassName="block text-[10px]"
                    />
                </div>
            </div>
        </div>
    );
};
