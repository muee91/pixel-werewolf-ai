import React from 'react';
import { clsx } from 'clsx';

interface PingIndicatorProps {
    ping: number | null;
    size?: 'xs' | 'sm';
    variant?: 'dot' | 'text';
    className?: string;
}

const getPingColor = (ping: number): string => {
    if (ping < 50) return 'text-emerald-500';
    if (ping < 150) return 'text-amber-500';
    return 'text-red-500';
};

const getPingDotColor = (ping: number): string => {
    if (ping < 50) return 'bg-emerald-500';
    if (ping < 150) return 'bg-amber-500';
    return 'bg-red-500';
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
                    'font-mono font-bold',
                    getPingColor(ping),
                    size === 'xs' ? 'text-[9px]' : 'text-xs'
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
        <span className={clsx('font-mono text-[9px] font-bold', color, className)}>
            {ping}ms
        </span>
    );
};
