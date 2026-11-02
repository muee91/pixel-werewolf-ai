
import React from 'react';
import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { toastsAtom, type ToastType } from '../atoms';

// 纸面 + 墨描边 + 硬阴影的应用内提示，与 ConfirmDialogHost 同一语言。
// 类型差异只由色块徽章承载：徽章实底色都按对比度铁律配字（火把/黎明/绿宝石压墨字，红石深压纸字）。
const typeConfig: Record<ToastType, { icon: string; chipBg: string; chipFg: string }> = {
    success: {
        icon: '✓',
        chipBg: 'var(--voxel-emerald)',
        chipFg: 'var(--voxel-ink)',
    },
    error: {
        icon: '✕',
        chipBg: 'var(--voxel-redstone-deep)',
        chipFg: 'var(--voxel-solid-white)',
    },
    info: {
        icon: 'ℹ',
        chipBg: 'var(--voxel-torch)',
        chipFg: 'var(--voxel-ink)',
    },
    warning: {
        icon: '⚠',
        chipBg: 'var(--voxel-dawn)',
        chipFg: 'var(--voxel-ink)',
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
                            'min-w-[280px] max-w-[420px]'
                        )}
                        style={{ background: 'var(--voxel-paper)' }}
                    >
                        <span
                            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-none border-2 border-[var(--voxel-ink)] text-sm font-bold"
                            style={{ background: config.chipBg, color: config.chipFg }}
                        >
                            {config.icon}
                        </span>
                        <span className="flex-1 text-sm font-medium leading-snug" style={{ color: 'var(--voxel-ink)' }}>
                            {toast.message}
                        </span>
                        <button
                            onClick={() => setToasts((prev) => prev.filter(t => t.id !== toast.id))}
                            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-none transition-opacity hover:opacity-60 text-xs"
                            style={{ color: 'var(--voxel-ink-soft)' }}
                            aria-label="关闭提示"
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
