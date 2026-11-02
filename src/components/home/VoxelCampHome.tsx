import React, { Suspense, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { appScreenAtom, gameConfigAtom, initGameAtom, isHumanModeAtom, minimizedGameAtom, multiplayerStateAtom, playersAtom, gamePhaseAtom } from '../../store';
import { uiConfigAtom } from '../../atoms';
import { ThreeSceneErrorBoundary } from '../game/voxel3d/ThreeSceneErrorBoundary';
import { GAME_PRESETS, GamePhase, type GamePreset } from '../../types';
import { HomeModeSwitch } from './HomeModeSwitch';
import { HomeBottomNav } from './HomeBottomNav';
import { HomeFullscreenButton } from './HomeFullscreenButton';
// 3D 预览按需加载：纯 2D 用户打开首页时不再拉取 three.js chunk（原静态导入会让
// ForestCampScene/three chunk 随首页一起下载，即使 3D 预览根本不渲染）
const VoxelHomeWorldPreview = React.lazy(() =>
    import('./VoxelHomeWorldPreview').then(module => ({ default: module.VoxelHomeWorldPreview })));
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';
import { PixelBlock, CampSpriteCanvas } from '../game/voxel/primitives';
import { useModelReadiness } from '../settings/useModelReadiness';
import { PreGameSetupPanel, type SetupDraft } from './PreGameSetupPanel';
import { HomeLaunchAside } from './HomeLaunchAside';
import { HomePresetList } from './HomePresetList';
import { summarizeLineup, validateLineup } from '../../utils/gameSetup';

// 推荐组:默认开局的 9 人经典、明示新手的入门局、八人标准局;其余板子按人数分组浏览
const RECOMMENDED_KEYS = ['9-v1', '6-seer-witch', '8-standard'];

const CampfireDecoration: React.FC = () => (
    <div className="vw-campfire">
        <div className="glow" />
        <CampSpriteCanvas name="campfire" px={7} className="pixel-flame" style={{ width: "74.7%", height: "74.7%" }} />
        {[0, 0.6, 1.2].map(delay => <div key={delay} className="ember" style={{ animationDelay: `${delay}s` }} />)}
    </div>
);

export const VoxelCampHome: React.FC = () => {
    const initGame = useSetAtom(initGameAtom);
    const setScreen = useSetAtom(appScreenAtom);
    const setGameConfig = useSetAtom(gameConfigAtom);
    const [isHumanMode, setIsHumanMode] = useAtom(isHumanModeAtom);
    const [minimizedGame, setMinimizedGame] = useAtom(minimizedGameAtom);
    const multiplayerState = useAtomValue(multiplayerStateAtom);
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);
    const [players] = useAtom(playersAtom);
    const [phase] = useAtom(gamePhaseAtom);
    const [selectedKey, setSelectedKey] = useState(GAME_PRESETS[0]?.key || '');
    const [group, setGroup] = useState<'recommended' | number>('recommended');
    const [isNight, setIsNight] = useState(false);
    // 开局前配置：null = 一切按板子默认；有值 = 玩家这一局改过的阵容/上警
    const [setupDraft, setSetupDraft] = useState<SetupDraft | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);
    // 覆盖最小化对局前的应用内确认(替代 window.confirm)
    const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);

    const selectedPreset = GAME_PRESETS.find(preset => preset.key === selectedKey) || GAME_PRESETS[0];
    const presets = useMemo(() => group === 'recommended'
        ? RECOMMENDED_KEYS.map(key => GAME_PRESETS.find(preset => preset.key === key)).filter((preset): preset is GamePreset => preset !== undefined)
        : GAME_PRESETS.filter(preset => preset.playerCount === group), [group]);
    const hasMinimized = minimizedGame.enabled && players.length > 0 && phase !== GamePhase.SETUP;
    const isThreeDimensional = uiConfig.gameViewMode === '3d';
    // 首页风格变体:三种风格改变 2D 场景的天地色、灯火与点缀物(3D 预览暂共用森林营地)
    const homeStyle = uiConfig.homeStyle;
    const isHarborHome = homeStyle === 'block-harbor';
    const isRedstoneHome = homeStyle === 'redstone-lobby';
    const scene = isHarborHome
        ? {
            day: `linear-gradient(180deg, ${T.woodDark} 0%, ${T.wood} 60%, #a5713a 100%)`,
            night: 'linear-gradient(180deg, #1d1209 0%, #3a2413 100%)',
            lamp: T.torch,
            lampGlow: 'rgba(var(--color-accent1-rgb), 0.35)',
            ground: '#a5713a', ground2: '#6b4423',
            dirt: T.woodDark, dirtDark: '#3a2413',
        }
        : isRedstoneHome
            ? {
                day: `linear-gradient(180deg, #1f242b 0%, ${T.stoneDark} 60%, #4a5058 100%)`,
                night: 'linear-gradient(180deg, #0f1216 0%, #23272e 100%)',
                lamp: T.redstone,
                lampGlow: 'color-mix(in srgb, var(--voxel-redstone) 40%, transparent)',
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
    // 就绪口径与设置页共用同一个 hook（含云端预设 / 本机模型 / 已下载的内置小模型三条路），
    // 之前这里自己算一份，漏掉内置小模型，导致玩家下载完 450MB 仍显示"未配置模型"。
    const { modelReady } = useModelReadiness();

    const selectPreset = (preset: GamePreset) => {
        setSelectedKey(preset.key);
        // 换板子 = 换默认配置；上一张板子改过的神职不该带过来
        setSetupDraft(null);
        setGameConfig(prev => ({
            ...prev,
            playerCount: preset.playerCount,
            roles: preset.roles,
            sheriffEnabled: preset.rules.sheriffElection,
            voteDetailPublic: preset.rules.voteDetailPublic,
            rules: preset.rules,
        }));
    };

    // 这一局真正要用的配置：改过就是改过的，没改就是板子默认
    const activeRoles = setupDraft?.roles ?? selectedPreset?.roles ?? [];
    const activeSheriff = setupDraft?.sheriffEnabled ?? selectedPreset?.rules.sheriffElection ?? true;
    const activeDraft: SetupDraft = { roles: activeRoles, sheriffEnabled: activeSheriff };
    const setupIssues = validateLineup(activeRoles, selectedPreset?.playerCount ?? 0);
    const activeSummary = summarizeLineup(activeRoles);
    const selectCount = (count: number) => {
        const next = GAME_PRESETS.find(item => item.playerCount === count);
        if (next) selectPreset(next);
    };

    // 出发：侧栏那颗「点燃营火」唯一的主行动
    const startGame = () => {
        if (!selectedPreset) return;
        if (setupIssues.length > 0) {
            setSetupOpen(true);
            return;
        }
        // 有最小化进行中的对局时，新开局会静默覆盖它，必须先确认
        if (minimizedGame.enabled) {
            setRestartConfirmOpen(true);
            return;
        }
        // 零配置也可开局:无模型时由内置离线大脑驱动;想上真 LLM 再去设置
        if (!modelReady) {
            sessionStorage.setItem('werewolf-settings-section', 'model');
        }
        initGame({
            presetKey: selectedPreset.key,
            roles: activeRoles,
            sheriffEnabled: activeSheriff,
            rules: { ...selectedPreset.rules, sheriffElection: activeSheriff },
        });
    };

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden" style={{ color: T.ink, fontFamily: 'var(--voxel-font)', imageRendering: 'pixelated', background: sceneBg }}>
            {/* 3D 预览崩溃时一键回 2D，不让主页跟着 WebGL 一起挂掉 */}
            {isThreeDimensional ? (
                <ThreeSceneErrorBoundary onReturnTo2D={() => setUiConfig(prev => ({ ...prev, gameViewMode: '2d' }))}>
                    <Suspense fallback={null}>
                        <VoxelHomeWorldPreview isNight={isNight} />
                    </Suspense>
                </ThreeSceneErrorBoundary>
            ) : <>
                <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="absolute left-[7%] top-[9%] h-20 w-20" style={{ background: lampColor, boxShadow: 'inset -10px -10px 0 rgba(0,0,0,0.12), 0 6px 50px ' + lampGlow }} />
                {/* 白天像素云缓慢漂移(码头/红石为室内场景,不出云) */}
                {!isNight && !scene && [[10, 95, -12], [55, 130, -60]].map(([top, dur, delay], i) => (
                    <div key={`home-cloud-${i}`} className="vw-cloud" style={{ top: `${top}%`, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
                        <div style={{ width: 88, height: 16, background: '#f6fafce6', boxShadow: '20px -10px 0 #f6fafce6, -16px -6px 0 #ffffffb3, 6px 6px 0 color-mix(in srgb, var(--voxel-ink) 6%, transparent)' }} />
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
                                <div className="mx-auto h-3 w-0.5" style={{ background: T.ink }} />
                                <div className="h-3 w-3" style={{ background: T.torch, border: `1px solid ${T.ink}`, boxShadow: '0 2px 14px rgba(var(--color-accent1-rgb), 0.85)' }} />
                            </div>
                        ))}
                        <div className="absolute bottom-1 left-[6%] h-8 w-1.5" style={{ background: '#5a3a1e' }} />
                        <div className="absolute bottom-[36px] left-[4.6%] h-3 w-3.5" style={{ background: T.torch, border: `1px solid ${T.ink}`, boxShadow: '0 2px 16px rgba(var(--color-accent1-rgb), 0.85)' }} />
                        <div className="absolute bottom-1 right-[9%] h-8 w-1.5" style={{ background: '#5a3a1e' }} />
                        <div className="absolute bottom-[36px] right-[7.6%] h-3 w-3.5" style={{ background: T.torch, border: `1px solid ${T.ink}`, boxShadow: '0 2px 16px rgba(var(--color-accent1-rgb), 0.85)' }} />
                    </>
                )}
                {isRedstoneHome && (
                    <>
                        {[8, 18, 62, 74].map((l, i) => (
                            <div key={`rs-lamp-${i}`} className="absolute bottom-1 h-5 w-5" style={{ left: `${l}%`, background: i === 1 || i === 2 ? T.redstone : '#7a2a22', border: `2px solid ${T.ink}`, boxShadow: i === 1 || i === 2 ? '0 0 16px color-mix(in srgb, var(--voxel-redstone) 85%, transparent)' : undefined }} />
                        ))}
                        {[86, 92].map((l, i) => (
                            <div key={`rs-lever-${i}`} className="absolute bottom-2 h-2 w-4" style={{ left: `${l}%`, background: i === 0 ? '#c9ced6' : '#7a5f35', border: `1px solid ${T.ink}` }} />
                        ))}
                    </>
                )}
            </>}

            {/* 左上角原本是三个各自带边框/阴影的方块（全屏、昼夜、"3D 森林山谷 · 营地预览"），
                高度与底色三种、还飘在草地上没有归属；那个"营地预览"长得像按钮却点不动。
                现在收成一条 44px 工具条：无边框子按钮 + 4px 分隔线，最后一个分段是真开关。 */}
            <div
                role="group"
                aria-label="首页场景"
                className="absolute left-4 top-4 z-40 flex w-max shrink-0 items-stretch overflow-hidden border-4 shadow-[4px_4px_0_var(--voxel-ink)]"
                style={{ borderColor: T.ink, background: `${T.paperDim}f2` }}
            >
                <HomeFullscreenButton
                    onClick={() => document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : document.documentElement.requestFullscreen().catch(() => {})}
                    className="flex min-h-11 w-11 shrink-0 items-center justify-center"
                    style={{ color: T.ink }}
                />
                <span aria-hidden="true" className="w-1 shrink-0 self-stretch" style={{ background: T.ink }} />
                <button
                    type="button"
                    onClick={() => setIsNight(v => !v)}
                    aria-pressed={isNight}
                    data-testid="home-daynight-toggle"
                    title={isNight ? '切换为白天' : '切换为夜晚'}
                    className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap px-3 text-xs font-black"
                    style={{ background: isNight ? T.night : T.paper, color: isNight ? T.paper : T.ink }}
                >
                    <span aria-hidden="true">{isNight ? '🌙' : '☀'}</span>
                    {isNight ? '夜晚' : '白天'}
                </button>
                <span aria-hidden="true" className="w-1 shrink-0 self-stretch" style={{ background: T.ink }} />
                {([['2d', '2D', '2D 营地预览'], ['3d', '3D', '3D 森林山谷预览']] as const).map(([mode, label, ariaLabel]) => {
                    const active = (uiConfig.gameViewMode === '3d') === (mode === '3d');
                    return (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setUiConfig(prev => ({ ...prev, gameViewMode: mode }))}
                            aria-pressed={active}
                            aria-label={ariaLabel}
                            data-testid={`home-view-${mode}`}
                            title={ariaLabel}
                            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 px-2 text-xs font-black"
                            style={{ background: active ? T.torch : 'transparent', color: T.ink }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            <main className="relative z-10 mx-auto flex h-full max-w-7xl flex-col px-5 pb-32 pt-[5.25rem]">
                {/* min-h-0 只在 lg 双列时需要（内层滚动收容）；移动端无 min-h-0 时
                    grid 自动行会被 stretch 均分并压碎两栏，左栏内容溢出盖住人数下拉（亲自上场被「N人」拦截）。移动端改为自然行高+本层滚动 */}
                <div className="grid flex-1 gap-5 max-lg:overflow-y-auto lg:min-h-0 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
                    <section className="flex flex-col justify-between border-4 p-4 shadow-[8px_8px_0_var(--voxel-ink)] lg:min-h-0" style={{ background: `${T.paperDim}f0`, borderColor: T.ink }}>
                        <div>
                            <div className="flex items-center gap-2">
                                <PixelBlock style={{ background: T.grass, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                                <PixelBlock style={{ background: T.dirt, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                                <PixelBlock style={{ background: T.stone, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                                <PixelBlock style={{ background: T.torch, boxShadow: `inset -3px -3px 0 rgba(0,0,0,0.2), inset 3px 3px 0 rgba(255,255,255,0.16), 0 0 0 2px ${T.ink}` }} />
                            </div>
                            <h1 className="mt-5 text-4xl font-black leading-none md:text-5xl" style={{ textShadow: '3px 3px 0 #6b4226, 6px 6px 0 color-mix(in srgb, var(--voxel-ink) 22%, transparent)' }}>
                                方块狼人杀
                            </h1>
                            <div className="mt-3 border-4 p-3 text-sm font-black leading-relaxed shadow-[4px_4px_0_rgba(43,26,16,0.6)]" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>
                                {isThreeDimensional ? '森林山谷营地已点亮。选地图、点燃营火，进入可观战的 AI 篝火议会。' : '生存世界营地已生成。选地图、点燃营火，玩家像素分身会围着主会话区开局。'}
                            </div>
                        </div>

                        {/* 营火装饰：吃掉标题与身份选择之间的剩余高度。
                            原来是 my-auto + <720 高整块 hidden，1080×675 的窗口里这一整块直接消失，
                            左栏中间留下 200px 空白；现在它自己 flex-1，矮窗口只是变小，不会留下空洞。 */}
                        <div aria-hidden="true" className="hidden flex-1 items-center justify-center py-3 lg:flex">
                            <CampfireDecoration />
                        </div>

                        <div className="mt-5">
                            <span className="text-xs font-black">本局身份</span>
                            <div role="group" aria-label="本局身份" className="mt-2">
                                <HomeModeSwitch
                                    value={isHumanMode ? 'human' : 'ai'}
                                    onChange={(mode) => { setIsHumanMode(mode === 'human'); }}
                                    options={[
                                        { id: 'ai', title: '旁观生存', subtitle: '看 AI 玩', icon: 'tile:pickaxe', accent: T.ink, mutedColor: T.ink, activeBackground: T.paper, inactiveBackground: T.woodMid, activeBorderColor: T.ink, inactiveBorderColor: T.ink },
                                        { id: 'human', title: '亲自上场', subtitle: '抽牌上场', icon: 'tile:door', accent: T.ink, mutedColor: T.ink, activeBackground: T.paper, inactiveBackground: T.woodMid, activeBorderColor: T.ink, inactiveBorderColor: T.ink },
                                    ]}
                                    variant="stacked"
                                    className="grid grid-cols-2 gap-2"
                                    buttonClassName="border-4 font-black shadow-[4px_4px_0_var(--voxel-ink)]"
                                    buttonStyle={{ borderRadius: 0, padding: '10px' }}
                                />
                            </div>
                        </div>

                        {hasMinimized && (
                            <div className="mt-4 border-4 p-3 shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: T.paper, borderColor: T.ink }}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-xs font-black">进行中的对局</div>
                                        <div className="mt-1 truncate text-xs font-bold opacity-75">
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

                    <section className="relative flex flex-col border-4 p-4 shadow-[8px_8px_0_var(--voxel-ink)] lg:min-h-0" style={{ background: '#6d8f3feb', borderColor: T.ink }}>
                        <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor="home-map-filter" className="text-xs font-black">板子分组</label>
                            <select
                                id="home-map-filter"
                                data-testid="home-map-filter-select"
                                value={group === 'recommended' ? 'recommended' : String(group)}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setGroup(value === 'recommended' ? 'recommended' : Number(value));
                                }}
                                className="min-h-11 border-4 px-2 py-1.5 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]"
                                style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                            >
                                <option value="recommended">推荐板子</option>
                                {[6, 7, 8, 9, 10, 11, 12].map(count => (
                                    <option key={count} value={count}>{count}人</option>
                                ))}
                            </select>
                            <span className="border-2 px-1.5 py-0.5 text-xs font-black" style={{ background: T.ink, borderColor: T.ink, color: T.paper }}>{presets.length}款</span>
                        </div>

                        <div className="mt-4 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:grid-rows-1">
                            <HomePresetList presets={presets} selectedKey={selectedKey} onSelect={selectPreset} />

                                <HomeLaunchAside
                                    preset={selectedPreset}
                                    roles={activeRoles}
                                    summary={activeSummary}
                                    sheriffEnabled={activeSheriff}
                                    isHumanMode={isHumanMode}
                                    modelReady={modelReady}
                                    setupIssues={setupIssues}
                                    onOpenSetup={() => setSetupOpen(true)}
                                    onOpenModelSettings={() => {
                                        sessionStorage.setItem('werewolf-settings-section', 'model');
                                        setScreen('SETTINGS');
                                    }}
                                    onStart={startGame}
                                />
                        </div>
                    </section>
                </div>
            </main>

            {/* 居中悬浮底栏:不贴底、半透明木面,按钮等宽并排 */}
            <div className="fixed left-1/2 z-30 -translate-x-1/2" style={{ bottom: 'calc(1rem + var(--safe-area-inset-bottom))' }}>
                <div className="border-4 px-3 py-2 shadow-[6px_6px_0_var(--voxel-ink)]" style={{ background: `${T.woodDark}d8`, borderColor: T.ink, backdropFilter: 'blur(2px)' }}>
                    <HomeBottomNav
                        items={[
                            { screen: 'MULTIPLAYER', icon: 'tile:door', label: '联机' },
                            { screen: 'RULES', icon: 'tile:book', label: '规则' },
                            { screen: 'HISTORY', icon: 'tile:bookFilled', label: '历史' },
                            { screen: 'SETTINGS', icon: 'tile:compass', label: '设置' },
                            { screen: 'AGENT', icon: 'tile:map', label: '助手' },
                        ]}
                        onNavigate={setScreen}
                        className="flex w-[min(28rem,92vw)] items-center justify-center gap-2"
                        itemClassName="flex-1 min-h-11 border-4 px-2 py-1.5 text-center text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]"
                        itemStyle={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                        iconClassName="block text-base"
                        labelClassName="block text-xs"
                    />
                </div>
            </div>

            {setupOpen && selectedPreset && (
                <PreGameSetupPanel
                    preset={selectedPreset}
                    draft={activeDraft}
                    onChange={setSetupDraft}
                    onSelectCount={selectCount}
                    onReset={() => setSetupDraft({
                        roles: selectedPreset.roles,
                        sheriffEnabled: selectedPreset.rules.sheriffElection,
                    })}
                    onClose={() => setSetupOpen(false)}
                />
            )}

            {restartConfirmOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/72" onClick={() => setRestartConfirmOpen(false)} />
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="重新开局确认"
                        className="relative border-4 p-5 w-full max-w-md shadow-[8px_8px_0_var(--voxel-ink)]"
                        style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                    >
                        <div className="text-lg font-black mb-2">重新开局？</div>
                        <p className="text-sm font-bold leading-relaxed">
                            当前有一局进行中（已最小化），重新开局将放弃该局。确定继续？
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setRestartConfirmOpen(false)}
                                className="border-[3px] px-4 py-2.5 text-sm font-black transition-all hover:brightness-110"
                                style={{ background: T.paperDim, borderColor: T.ink, color: T.ink }}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                autoFocus
                                onClick={() => {
                                    setRestartConfirmOpen(false);
                                    if (!selectedPreset) return;
                                    if (!modelReady) {
                                        sessionStorage.setItem('werewolf-settings-section', 'model');
                                    }
                                    initGame({
                                        presetKey: selectedPreset.key,
                                        roles: activeRoles,
                                        sheriffEnabled: activeSheriff,
                                        rules: { ...selectedPreset.rules, sheriffElection: activeSheriff },
                                    });
                                }}
                                className="border-[3px] px-4 py-2.5 text-sm font-black transition-all hover:brightness-110"
                                style={{ background: T.redstoneDeep, borderColor: T.ink, color: 'var(--voxel-solid-white)' }}
                            >
                                放弃并重开
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
