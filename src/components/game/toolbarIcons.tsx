import React from 'react';

/**
 * 对局顶栏按钮的统一图标：全部 16×16、currentColor、像素方块风（直角、少曲线）。
 * 规则：动作按钮 = 图标 + 文字；开面板的按钮文字后再跟 CaretIcon（▼）；
 * 图标不许有的带有的没有，否则整排看起来像没设计过。
 */

type IconProps = { className?: string };

const base = 'h-4 w-4 shrink-0';
const mix = (className?: string) => (className ? `${base} ${className}` : base);

/** 调试：像素小虫 */
export const BugIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M6 1h1.4v2.2H6zM8.6 1H10v2.2H8.6z" />
        <path d="M4.5 3.4h7v2.2h-7z" />
        <path d="M3.5 5.8h9v7h-9z" />
        <path d="M1 6.6h2.5V8H1zM12.5 6.6H15V8h-2.5zM1 10.4h2.5v1.4H1zM12.5 10.4H15v1.4h-2.5z" />
    </svg>
);

/** 声音：喇叭 + 一道声波 */
export const SpeakerIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M2 6h3l4-3v10L5 10H2z" />
        <path d="M11 5.5c1.1.8 1.8 1.7 1.8 2.5s-.7 1.7-1.8 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
);

/** 暂停：两根竖条 */
export const PauseIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M4.5 2.5h2.8v11H4.5zM8.7 2.5h2.8v11H8.7z" />
    </svg>
);

/** 继续：播放三角 */
export const PlayIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M5 2.5l8 5.5-8 5.5z" />
    </svg>
);

/** 布局：四宫格 */
export const GridIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M2.5 2.5h4.7v4.7H2.5zM8.8 2.5h4.7v4.7H8.8zM2.5 8.8h4.7v4.7H2.5zM8.8 8.8h4.7v4.7H8.8z" />
    </svg>
);

/** 运镜：摄像机 */
export const CamcorderIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M2 6h7v4H2zM10 7l4-2v6l-4-2z" />
    </svg>
);

/** 节奏：双快进三角 */
export const FastForwardIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M2 4l5.5 4L2 12zM8.5 4L14 8l-5.5 4z" />
    </svg>
);

/** 人设：像素小人 */
export const PersonIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M5.5 1.5h5v4.5h-5z" />
        <path d="M2.5 14v-1a5.5 5.5 0 0 1 11 0v1z" />
    </svg>
);

/** 说明/术语：对话气泡 */
export const BubbleIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M2 2.5h12v8H8.5L5 13.5v-3H2z" />
    </svg>
);

/** 最小化：一条横杠（用户指定用 — 表示，语义靠 title/aria） */
export const MinusIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="currentColor">
        <path d="M3.5 7h9v2h-9z" />
    </svg>
);

/** 退出：叉 */
export const CloseIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={mix(className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
);

/** 开面板按钮的文字后缀（声音/布局/运镜/说明），表示点开是菜单而不是直接动作 */
export const CaretIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-3 w-3 shrink-0 opacity-75${className ? ` ${className}` : ''}`} fill="currentColor">
        <path d="M8 11.5 3 5.5h10z" />
    </svg>
);
