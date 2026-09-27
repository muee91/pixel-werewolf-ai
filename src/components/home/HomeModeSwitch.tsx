import React from 'react';
import { McIcon } from '../game/voxel/primitives';

interface ModeOption {
    id: 'ai' | 'human' | 'multiplayer';
    title: string;
    subtitle?: string;
    shortLabel?: string;
    accent: string;
    mutedColor: string;
    activeTextColor?: string;
    inactiveTextColor?: string;
    icon?: string;
    activeBackground?: string;
    inactiveBackground?: string;
    activeBorderColor?: string;
    inactiveBorderColor?: string;
    activeBoxShadow?: string;
    inactiveBoxShadow?: string;
    sideDecoration?: React.ReactNode;
    activeOverlay?: React.ReactNode;
}

interface HomeModeSwitchProps {
    /** 当前选中项；传 null 时三张卡片均为中性（不高亮），用于退出后"无进行中对局"的初始态 */
    value: 'ai' | 'human' | 'multiplayer' | null;
    onChange: (mode: 'ai' | 'human' | 'multiplayer') => void;
    options: ModeOption[];
    variant?: 'pill' | 'stacked';
    className?: string;
    buttonClassName?: string;
    containerStyle?: React.CSSProperties;
    buttonStyle?: React.CSSProperties;
    activeIndicatorStyle?: React.CSSProperties;
}

export const HomeModeSwitch: React.FC<HomeModeSwitchProps> = ({
    value,
    onChange,
    options,
    variant = 'pill',
    className,
    buttonClassName,
    containerStyle,
    buttonStyle,
    activeIndicatorStyle,
}) => {
    if (variant === 'stacked') {
        return (
            <div className={className} style={containerStyle}>
                {options.map((option) => {
                    const active = value === option.id;
                    return (
                        <button
                            key={option.id}
                            onClick={() => onChange(option.id)}
                            className={buttonClassName}
                            style={{
                                background: active ? (option.activeBackground || 'transparent') : (option.inactiveBackground || 'transparent'),
                                borderColor: active ? option.activeBorderColor : option.inactiveBorderColor,
                                boxShadow: active ? option.activeBoxShadow : option.inactiveBoxShadow,
                                color: active ? option.accent : option.mutedColor,
                                ...buttonStyle,
                            }}
                        >
                            {option.sideDecoration}
                            <div className="flex items-center gap-2 pr-3">
                                {option.icon ? <McIcon icon={option.icon} px={2} /> : null}
                                <div className="text-left">
                                    <span className="block text-[10px] sm:text-xs font-bold leading-tight">{option.title}</span>
                                    {option.subtitle ? (
                                        <span className="block text-[8px] sm:text-[10px] leading-tight" style={{ color: option.mutedColor }}>{option.subtitle}</span>
                                    ) : null}
                                </div>
                            </div>
                            {active ? option.activeOverlay : null}
                            {active ? <span aria-hidden="true" style={activeIndicatorStyle} /> : null}
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div className={className} style={containerStyle}>
            {options.map((option) => {
                const active = value === option.id;
                return (
                    <button
                        key={option.id}
                        onClick={() => onChange(option.id)}
                        className={buttonClassName}
                        style={{
                            background: active ? option.accent : 'transparent',
                            color: active ? (option.activeTextColor || '#fff') : (option.inactiveTextColor || option.mutedColor),
                            ...buttonStyle,
                        }}
                    >
                        {option.shortLabel ? <span>{option.shortLabel}</span> : null}
                        <span>{option.title}</span>
                    </button>
                );
            })}
        </div>
    );
};
