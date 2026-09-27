import React from 'react';

interface MultiplayerShellProps {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
    backLabel?: string;
    onBack: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export const MultiplayerShell: React.FC<MultiplayerShellProps> = ({
    title,
    subtitle,
    right,
    backLabel = '返回',
    onBack,
    children,
    footer,
}) => {
    return (
        <div
            className="w-full flex flex-col relative overflow-hidden"
            style={{
                height: '100dvh',
                background: 'linear-gradient(180deg, var(--voxel-ink-soft), var(--voxel-wood-dark))',
            }}
        >
            {/* 体素感底纹：淡可可色扇形铺在角落 */}
            <div className="absolute inset-0 opacity-25 pointer-events-none" style={{
                backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 2px, transparent 2px, transparent 8px)',
            }} />

            <div className="relative z-10 px-4 py-4 flex items-start justify-between gap-3 border-b-[3px]"
                style={{ borderColor: 'var(--voxel-ink)', background: 'var(--voxel-wood-dark)' }}>
                <div className="flex items-start gap-3 min-w-0">
                    <button
                        onClick={onBack}
                        className="shrink-0 border-[3px] px-3 py-2 text-xs font-black transition-all active:translate-x-[2px] active:translate-y-[2px]"
                        style={{ borderColor: 'var(--voxel-ink)', color: 'var(--voxel-ink)', background: 'var(--voxel-paper)', boxShadow: '3px 3px 0 var(--voxel-ink)' }}
                    >
                        {backLabel}
                    </button>
                    <div className="min-w-0">
                        <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--voxel-torch)' }}>
                            Multiplayer
                        </div>
                        <div className="mt-1 text-lg sm:text-xl font-black truncate" style={{ color: 'var(--voxel-paper)' }}>{title}</div>
                        {subtitle ? (
                            <div className="mt-1 text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--voxel-paper-dim)' }}>
                                {subtitle}
                            </div>
                        ) : null}
                    </div>
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto relative z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-6 pb-32">
                    {children}
                </div>
            </div>

            {footer ? (
                <div className="absolute bottom-0 left-0 right-0 z-10 p-4 border-t-[3px]"
                    style={{ borderColor: 'var(--voxel-ink)', background: 'var(--voxel-wood-dark)', paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom))' }}>
                    <div className="max-w-5xl mx-auto">
                        {footer}
                    </div>
                </div>
            ) : null}
        </div>
    );
};
