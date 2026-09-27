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
        >
            <div className="voxel-phase-transition border-y-[3px] border-[#f6b443]/70 bg-[#11180f]/80 px-10 py-4 text-center shadow-[0_0_60px_rgba(246,180,67,0.18)]">
                <div className="text-[10px] font-black tracking-[0.36em] text-[#d8b36d]">
                    {isNight ? 'NIGHT WATCH' : 'DAY COUNCIL'}
                </div>
                <div className="mt-1 text-2xl font-black tracking-[0.18em] text-[#f2dfaa] sm:text-4xl">
                    {PHASE_LABELS[phase]}
                </div>
            </div>
        </div>
    );
};

