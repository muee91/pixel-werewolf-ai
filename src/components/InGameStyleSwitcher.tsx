import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { createPortal } from 'react-dom';
import { uiConfigAtom } from '../atoms';
import { THEMES } from '../themes';
import type { GameLayout, GameViewMode, PlayerCardStyle } from '../themes/types';
import { GridIcon, CaretIcon } from './game/toolbarIcons';
import { SCENE_IDS, SCENES, resolveSceneId } from './game/voxel3d/biomes';

type Props = {
    placement?: 'top' | 'bottom';
    /** 触发按钮尺寸：compact 贴 3D 顶栏(px-3 py-1.5)，tap 贴 2D 顶栏(≥44px 触控行高) */
    size?: 'compact' | 'tap';
};

const InGameStyleSwitcher: React.FC<Props> = ({ placement = 'bottom', size = 'compact' }) => {
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);
    const [open, setOpen] = useState(false);
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const theme = THEMES[uiConfig.themeId];
    const colors = theme.colors;
    const portalRoot = typeof document !== 'undefined' ? document.body : null;
    const layoutGridCols = theme.gameLayouts.length > 4 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
    const cardGridCols = theme.cardStyles.length > 4 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
    const hasMultipleCardStyles = theme.cardStyles.length > 1;

    const updateLayout = (gameLayout: GameLayout) => {
        setUiConfig(prev => ({ ...prev, gameLayout }));
    };

    const updateCard = (playerCardStyle: PlayerCardStyle) => {
        setUiConfig(prev => ({ ...prev, playerCardStyle }));
    };

    const updateViewMode = (gameViewMode: GameViewMode) => {
        setUiConfig(prev => ({ ...prev, gameViewMode }));
    };

    const updateScene = (sceneId: string) => {
        setUiConfig(prev => ({ ...prev, sceneId }));
    };

    useLayoutEffect(() => {
        if (!open || !triggerRef.current || !panelRef.current) return;

        const updatePosition = () => {
            if (!triggerRef.current || !panelRef.current) return;

            const margin = 12;
            const gap = 8;
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const panelRect = panelRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const maxWidth = Math.min(320, viewportWidth - margin * 2);
            const width = Math.min(panelRect.width || maxWidth, maxWidth);

            let left = triggerRect.right - width;
            left = Math.max(margin, Math.min(left, viewportWidth - width - margin));

            const preferTop = placement === 'top';
            const belowTop = triggerRect.bottom + gap;
            const aboveTop = triggerRect.top - panelRect.height - gap;
            const canOpenBelow = belowTop + panelRect.height <= viewportHeight - margin;
            const canOpenAbove = aboveTop >= margin;

            let top = preferTop ? aboveTop : belowTop;
            if (preferTop && !canOpenAbove && canOpenBelow) top = belowTop;
            if (!preferTop && !canOpenBelow && canOpenAbove) top = aboveTop;

            top = Math.max(margin, Math.min(top, viewportHeight - panelRect.height - margin));

            setPanelStyle({
                position: 'fixed',
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                maxWidth: `calc(100vw - ${margin * 2}px)`,
                maxHeight: `calc(100vh - ${margin * 2}px)`,
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open, placement, uiConfig.themeId, uiConfig.gameLayout, uiConfig.playerCardStyle, uiConfig.gameViewMode]);

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    return (
        <div ref={triggerRef} className="pointer-events-auto relative inline-flex shrink-0" style={{ fontFamily: 'var(--font-active-body)' }}>
            <button
                onClick={() => setOpen(v => !v)}
                title="对局外观"
                aria-expanded={open}
                aria-haspopup="dialog"
                className="border-[3px] px-3 py-1.5 max-sm:px-2 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                style={{
                    background: open ? 'var(--voxel-torch)' : 'var(--voxel-paper)',
                    borderColor: 'var(--voxel-ink)',
                    color: 'var(--voxel-ink)',
                    ...(size === 'tap' ? { minHeight: '2.75rem', display: 'inline-flex', alignItems: 'center' } : null),
                }}
            >
                <span className="flex items-center gap-1.5">
                    <GridIcon />
                    布局
                    <CaretIcon />
                </span>
            </button>

            {open && portalRoot && createPortal(
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="对局外观"
                    className="z-[90] overflow-y-auto p-3 shadow-2xl"
                    style={{
                        ...panelStyle,
                        background: colors.card,
                        color: colors.fg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: theme.borderRadius === 'sharp' ? 0 : 12,
                        boxShadow: theme.glow ? `0 0 28px ${colors.accent1}24` : '0 18px 42px rgba(0,0,0,0.22)',
                    }}
                >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-black tracking-widest" style={{ color: colors.accent1 }}>对局外观</div>
                        <button onClick={() => setOpen(false)} className="px-1.5 text-xs font-black" style={{ color: colors.muted }}>×</button>
                    </div>

                    <div className="mb-3">
                        <div className="mb-1.5 text-xs font-bold" style={{ color: colors.muted }}>对局视角</div>
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                            {([['2d', '经典 2D'], ['3d', '3D RPG']] as const).map(([mode, label]) => {
                                const active = uiConfig.gameViewMode === mode;
                                return (
                                    <button
                                        key={mode}
                                        onClick={() => updateViewMode(mode)}
                                        className="min-w-0 px-2 py-2 text-xs font-bold leading-tight"
                                        style={{
                                            background: active ? `${colors.accent1}22` : 'transparent',
                                            color: active ? colors.accent1 : colors.fg,
                                            border: `1px solid ${active ? colors.accent1 : colors.border}`,
                                            borderRadius: theme.borderRadius === 'sharp' ? 0 : 8,
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 3D 场景：原来只在主页设置里能切，局内想换个地形得退出去；3D 视角下放进「布局」面板随时切 */}
                    {uiConfig.gameViewMode === '3d' && (
                        <div className="mb-3">
                            <div className="mb-1.5 text-xs font-bold" style={{ color: colors.muted }}>3D 场景</div>
                            <div className="grid gap-1.5" style={{ gridTemplateColumns: SCENE_IDS.length > 4 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))' }}>
                                {SCENE_IDS.map(id => {
                                    const preset = SCENES[id];
                                    const active = resolveSceneId(uiConfig.sceneId) === id;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => updateScene(id)}
                                            className="min-w-0 px-2 py-2 text-center text-xs font-bold leading-tight"
                                            style={{
                                                background: active ? `${colors.accent1}22` : 'transparent',
                                                color: active ? colors.accent1 : colors.fg,
                                                border: `1px solid ${active ? colors.accent1 : colors.border}`,
                                                borderRadius: theme.borderRadius === 'sharp' ? 0 : 8,
                                            }}
                                        >
                                            <div>{preset.label}</div>
                                            <div className="text-[11px]" style={{ color: colors.muted }}>{preset.desc}</div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-1.5 text-[11px] leading-tight" style={{ color: colors.muted }}>只作用于 3D 视角，点击立即换场景。</div>
                        </div>
                    )}

                    {/* 游戏布局只作用于经典 2D 视图；3D 的地形/天空由「3D 场景」切换，3D 下隐藏 */}
                    {uiConfig.gameViewMode !== '3d' && (
                        <div className="mb-3">
                            <div className="mb-1.5 text-xs font-bold" style={{ color: colors.muted }}>游戏布局</div>
                            <div className="grid gap-1.5" style={{ gridTemplateColumns: layoutGridCols }}>
                                {theme.gameLayouts.map(item => {
                                    const active = uiConfig.gameLayout === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => updateLayout(item.id)}
                                            className="min-w-0 px-2 py-2 text-xs font-bold leading-tight"
                                            style={{
                                                background: active ? `${colors.accent1}22` : 'transparent',
                                                color: active ? colors.accent1 : colors.fg,
                                                border: `1px solid ${active ? colors.accent1 : colors.border}`,
                                                borderRadius: theme.borderRadius === 'sharp' ? 0 : 8,
                                            }}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 玩家卡片两种视图共用：名签/徽章/热栏在 3D 冒险队伍中同样生效 */}
                    {hasMultipleCardStyles && (
                        <div>
                            <div className="mb-1.5 text-xs font-bold" style={{ color: colors.muted }}>玩家卡片</div>
                            <div className="grid gap-1.5" style={{ gridTemplateColumns: cardGridCols }}>
                                {theme.cardStyles.map(item => {
                                    const active = uiConfig.playerCardStyle === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => updateCard(item.id)}
                                            className="min-w-0 px-2 py-2 text-xs font-bold leading-tight"
                                            style={{
                                                background: active ? `${colors.accent1}22` : 'transparent',
                                                color: active ? colors.accent1 : colors.fg,
                                                border: `1px solid ${active ? colors.accent1 : colors.border}`,
                                                borderRadius: theme.borderRadius === 'sharp' ? 0 : 8,
                                            }}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>,
                portalRoot
            )}
        </div>
    );
};

export default InGameStyleSwitcher;
