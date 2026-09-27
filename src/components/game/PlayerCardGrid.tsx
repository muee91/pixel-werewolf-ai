import React from 'react';
import { clsx } from 'clsx';

/** 玩家卡片条目:2D / 3D 共用的数据模型 */
export interface PlayerCardItem {
    key: string | number;
    seat: number;
    name: string;
    /** 权限解析后的职业标签(未知职业或真实职业) */
    roleLabel: string;
    /** 职业色(有权限时) */
    roleColor?: string;
    /** 道具名(可选,如 狼爪) */
    itemLabel?: string;
    itemIcon?: React.ReactNode;
    /** 人设标签(可选) */
    personaLabel?: string;
    alive?: boolean;
    /** 正在发言(高亮) */
    speaking?: boolean;
    onClick?: () => void;
    /** 死亡印章/碎裂等覆盖层 */
    overlay?: React.ReactNode;
}

/** 布局:名签横排(name-sign) / 图腾徽章竖排(totem-badge) / 背包热栏单行(hotbar-strip) */
export type PlayerCardLayout = 'name-sign' | 'totem-badge' | 'hotbar-strip';

export interface PlayerCardGridProps {
    items: PlayerCardItem[];
    layout?: PlayerCardLayout;
    /** 列数(1-4) */
    columns?: 1 | 2 | 3 | 4;
    onItemClick?: (item: PlayerCardItem) => void;
    className?: string;
}

const COLS_CLASS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
};

/** 玩家卡片:三种布局共用同一套结构,2D / 3D 各自传入配色即可 */
const PlayerCard: React.FC<{
    item: PlayerCardItem;
    layout: PlayerCardLayout;
    onItemClick?: (item: PlayerCardItem) => void;
}> = ({ item, layout, onItemClick }) => {
    const dead = item.alive === false;
    return (
        <div
            className={clsx(
                'vw-player-card relative min-w-0 border-[3px] shadow-[3px_3px_0_var(--voxel-ink)]',
                dead && 'opacity-80',
                item.speaking && 'vw-card-lit vw-card-pulse z-10',
                layout === 'name-sign' && 'flex items-center gap-2 p-2 text-left',
                layout === 'totem-badge' && 'flex flex-col items-center gap-1 p-1.5 text-center',
                layout === 'hotbar-strip' && 'flex items-center gap-1.5 px-1.5 py-1 text-left',
            )}
            style={{
                background: dead ? '#40463d' : 'linear-gradient(180deg, var(--voxel-wood), var(--voxel-wood-dark))',
                borderColor: item.speaking ? 'var(--voxel-torch)' : 'var(--voxel-ink)',
                color: 'var(--voxel-paper)',
            }}
            onClick={item.onClick}
        >
            {/* 座号角标 */}
            <span
                className={clsx(
                    'inline-flex shrink-0 items-center justify-center border-2 bg-[var(--voxel-paper)] text-[10px] font-black text-[var(--voxel-ink)]',
                    layout === 'totem-badge' && 'absolute left-1 top-1 h-5 w-5 rounded-full',
                    layout !== 'totem-badge' && 'h-6 w-6',
                )}
            >
                {item.seat}
            </span>
            <div className="min-w-0 flex-1">
                <div className={clsx('truncate text-[11px] font-black leading-tight', dead && 'line-through opacity-60')}>
                    {item.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] font-black">
                    {item.roleColor && <span className="inline-block h-2.5 w-2.5 border border-black/30" style={{ background: item.roleColor }} />}
                    <span className="truncate" style={{ color: dead ? '#9aa092' : undefined }}>{dead ? '死亡' : item.roleLabel}</span>
                </div>
                {item.itemLabel && (
                    <div className="truncate text-[9px] font-bold opacity-70">{item.itemLabel}</div>
                )}
                {item.personaLabel && (
                    <div className="truncate text-[9px] font-bold text-[#7fd67f]" title={item.personaLabel}>🎭 {item.personaLabel}</div>
                )}
            </div>
            {item.overlay}
        </div>
    );
};

export const PlayerCardGrid: React.FC<PlayerCardGridProps> = ({
    items,
    layout = 'name-sign',
    columns = 2,
    onItemClick,
    className,
}) => (
    <div
        className={clsx(
            'grid content-start gap-1.5 overflow-y-auto custom-scrollbar auto-rows-min',
            columns === 1 && 'grid-cols-1',
            columns === 2 && 'grid-cols-2',
            columns === 3 && 'grid-cols-3',
            columns === 4 && 'grid-cols-4',
            className,
        )}
    >
        {items.map(item => (
            <PlayerCard key={item.key} item={item} layout={layout} onItemClick={onItemClick} />
        ))}
    </div>
);
