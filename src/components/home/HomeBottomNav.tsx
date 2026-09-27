import React from 'react';
import { McIcon } from '../game/voxel/primitives';

type ScreenTarget = 'MULTIPLAYER' | 'RULES' | 'HISTORY' | 'SETTINGS' | 'AGENT';

interface HomeBottomNavItem {
    screen: ScreenTarget;
    label: string;
    icon?: string;
}

interface HomeBottomNavProps {
    items: HomeBottomNavItem[];
    onNavigate: (screen: ScreenTarget) => void;
    className?: string;
    itemClassName?: string;
    labelClassName?: string;
    separator?: React.ReactNode;
    itemStyle?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
    iconClassName?: string;
    iconStyle?: React.CSSProperties;
}

export const HomeBottomNav: React.FC<HomeBottomNavProps> = ({
    items,
    onNavigate,
    className,
    itemClassName,
    labelClassName,
    separator,
    itemStyle,
    labelStyle,
    iconClassName,
    iconStyle,
}) => {
    return (
        <div className={className}>
            {items.map((item, idx) => (
                <React.Fragment key={item.screen}>
                    <button
                        onClick={() => onNavigate(item.screen)}
                        className={itemClassName}
                        style={itemStyle}
                    >
                        {item.icon ? <McIcon icon={item.icon} px={2} className={iconClassName} style={iconStyle} /> : null}
                        <span className={labelClassName} style={labelStyle}>
                            {item.label}
                        </span>
                    </button>
                    {separator && idx < items.length - 1 ? separator : null}
                </React.Fragment>
            ))}
        </div>
    );
};
