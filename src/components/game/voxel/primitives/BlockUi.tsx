// 方块 UI 原语:按钮、面板、模态。统一边框/硬阴影/纸面材质,全项目复用。
import React from 'react';
import { clsx } from 'clsx';
import { VOXEL_TOKENS as T } from '../../../../themes/voxel-tokens';

/** 方块按钮:厚边框 + 硬阴影 + 按下位移。推广为全局按钮基线。 */
export const BlockButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  className?: string;
  /** 自定义底色(默认纸面;active 时火把色) */
  background?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ children, onClick, active, title, disabled, className, background, size = 'md' }) => {
  const pad = size === 'sm' ? 'px-2 py-1 text-[10px]' : size === 'lg' ? 'px-5 py-3 text-sm' : 'px-3 py-1.5 text-[11px]';
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={clsx(
        'border-[3px] font-black shadow-[3px_3px_0_var(--voxel-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-transform',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[3px_3px_0_var(--voxel-ink)]',
        pad,
        className
      )}
      style={{
        background: background ?? (active ? T.torch : T.paper),
        color: T.ink,
        borderColor: T.ink,
      }}
    >
      {children}
    </button>
  );
};

/** 方块面板:厚边框 + 硬阴影 + 材质底色,承载信息。 */
export const BlockPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** 材质:纸面/木面/石面/草面/泥面 */
  material?: 'paper' | 'wood' | 'stone' | 'grass' | 'dirt';
  shadow?: 'sm' | 'md' | 'lg';
  bordered?: boolean;
}> = ({ children, className, material = 'paper', shadow = 'md', bordered = true }) => {
  const bgMap = {
    paper: T.paper,
    wood: T.wood,
    stone: T.stone,
    grass: T.grass,
    dirt: T.dirt,
  };
  const shadowMap = {
    sm: 'shadow-[3px_3px_0_var(--voxel-ink)]',
    md: 'shadow-[4px_4px_0_var(--voxel-ink)]',
    lg: 'shadow-[6px_6px_0_var(--voxel-ink)]',
  };
  return (
    <div
      className={clsx(bordered && 'border-[3px]', shadowMap[shadow], className)}
      style={{ background: bgMap[material], borderColor: T.ink, color: T.ink }}
    >
      {children}
    </div>
  );
};

/** 方块模态:创建世界/结算/退出确认等居中弹窗。 */
export const BlockModal: React.FC<{
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
  maxWidth?: string;
}> = ({ children, onClose, className, maxWidth = 'max-w-2xl' }) => (
  <div
    className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
  >
    <div
      className={clsx('w-full border-[4px] shadow-[8px_8px_0_var(--voxel-ink)]', maxWidth, className)}
      style={{ background: T.paperDim, borderColor: T.ink, color: T.ink }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);
