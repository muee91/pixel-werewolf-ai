import React from 'react';

interface HomeFullscreenButtonProps {
    onClick: () => void;
    className?: string;
    style?: React.CSSProperties;
    iconClassName?: string;
    strokeWidth?: number;
}

export const HomeFullscreenButton: React.FC<HomeFullscreenButtonProps> = ({
    onClick,
    className,
    style,
    iconClassName = 'w-4 h-4 sm:w-5 sm:h-5',
    strokeWidth = 2,
}) => {
    return (
        <button onClick={onClick} className={className} style={style} aria-label="切换全屏">
            <svg className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
        </button>
    );
};
