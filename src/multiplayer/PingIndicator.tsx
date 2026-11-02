import React from 'react';
import { clsx } from 'clsx';

interface PingIndicatorProps {
    ping: number | null;
    size?: 'xs' | 'sm';
    variant?: 'dot' | 'text';
    className?: string;
}

// 颜色走体素令牌:多人大厅面板是暗木底,文字用 on-dark 变体保对比度(绿 7:1 / 琥珀 5.2:1 / 红 5.4:1)
const getPingColor = (ping: number): string => {
    if (ping < 50) return 'text-[var(--voxel-emerald-on-dark)]';
    if (ping < 150) return 'text-[var(--voxel-dawn)]';
    return 'text-[var(--voxel-redstone-on-dark)]';
};

const getPingDotColor = (ping: number): string => {
    if (ping < 50) return 'bg-[var(--voxel-emerald)]';
    if (ping < 150) return 'bg-[var(--voxel-dawn)]';
    return 'bg-[var(--voxel-redstone)]';
};

export const PingIndicator: React.FC<PingIndicatorProps> = ({ ping, size = 'xs', variant = 'text', className }) => {
    if (ping === null) return null;

    if (variant === 'dot') {
        return (
            <span className={clsx('inline-flex items-center gap-1', className)}>
                <span className={clsx(
                    'rounded-full animate-pulse',
                    getPingDotColor(ping),
                    size === 'xs' ? 'w-1.5 h-1.5' : 'w-2 h-2'
                )} />
                <span className={clsx(
                    'font-mono text-xs font-bold',
                    getPingColor(ping)
                )}>
                    {ping}ms
                </span>
            </span>
        );
    }

    const color = getPingColor(ping);

    if (size === 'sm') {
        return (
            <span className={clsx('font-mono font-bold', color, className)}>
                {ping}ms
            </span>
        );
    }

    return (
        <span className={clsx('font-mono text-xs font-bold', color, className)}>
            {ping}ms
        </span>
    );
};
