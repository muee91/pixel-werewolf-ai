
import React from 'react';
import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { toastsAtom, type ToastType } from '../atoms';

const typeConfig: Record<ToastType, { icon: string; bg: string; border: string; ring: string }> = {
    success: {
        icon: '✓',
        bg: 'bg-th-god/80 backdrop-blur-lg',
        border: 'border-th-god/50',
        ring: 'ring-th-god/30',
    },
    error: {
        icon: '✕',
        bg: 'bg-th-accent2/80 backdrop-blur-lg',
        border: 'border-th-accent2/50',
        ring: 'ring-th-accent2/30',
    },
    info: {
        icon: 'ℹ',
        bg: 'bg-th-accent1/80 backdrop-blur-lg',
        border: 'border-th-accent1/50',
        ring: 'ring-th-accent1/30',
    },
    warning: {
        icon: '⚠',
        bg: 'bg-th-accent3/80 backdrop-blur-lg',
        border: 'border-th-accent3/50',
        ring: 'ring-th-accent3/30',
    },
};

const ToastContainer = () => {
    const [toasts, setToasts] = useAtom(toastsAtom);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
            {toasts.map((toast) => {
                const config = typeConfig[toast.type];
                return (
                    <div
                        key={toast.id}
                        className={clsx(
                            'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-none border-[3px] border-[var(--voxel-ink)] shadow-[4px_4px_0_var(--voxel-ink)]',
                            'animate-[slideDown_0.3s_ease-out]',
                            config.bg,
                            config.border,
                            config.ring,
                            'min-w-[280px] max-w-[420px]'
                        )}
                    >
                        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-sm font-bold text-white bg-white/10">
                            {config.icon}
                        </span>
                        <span className="flex-1 text-sm text-white/90 font-medium leading-snug">
                            {toast.message}
                        </span>
                        <button
                            onClick={() => setToasts((prev) => prev.filter(t => t.id !== toast.id))}
                            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-white/50 hover:text-white/90 hover:bg-white/10 transition-all text-xs"
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export default ToastContainer;
