import React, { useEffect, useState } from 'react';
import { PHASE_LABELS, type GamePhase } from '../../../types';

export const PhaseTransitionOverlay: React.FC<{ phase: GamePhase; isNight: boolean }> = ({ phase, isNight }) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        setVisible(true);
        const timer = window.setTimeout(() => setVisible(false), 1900);
        return () => window.clearTimeout(timer);
    }, [phase]);

    if (!visible) return null;

    return (
        <div
            data-testid="phase-transition"
            className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center bg-black/10"
            // 自动消失、不可交互的播报横幅：非模态，用 status/live 让读屏获知阶段切换
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label="阶段播报"
        >
            {/* 底色是压在 3D 场景上的夜幕,与 WorldEffects 同属场景自适应色,不取自 UI 令牌 */}
            <div className="voxel-phase-transition border-y-[3px] border-[rgba(var(--color-accent1-rgb,246,180,67),0.7)] bg-[rgba(17,24,15,0.8)] px-10 py-4 text-center shadow-[0_0_60px_rgba(var(--color-accent1-rgb,246,180,67),0.18)]">
                <div className="text-xs font-black tracking-[0.36em] text-[var(--voxel-paper-dim)]">
                    {isNight ? 'NIGHT WATCH' : 'DAY COUNCIL'}
                </div>
                <div className="mt-1 text-2xl font-black tracking-[0.18em] text-[var(--voxel-paper)] sm:text-4xl">
                    {PHASE_LABELS[phase]}
                </div>
            </div>
        </div>
    );
};

