// 原版贴图渲染器:canvas 逐像素绘制,CSS 放大保持硬边
import React, { useEffect, useRef } from 'react';
import { MC_SPRITES } from './mc-sprites';

export const shadeHex = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

export const McSpriteCanvas: React.FC<{
  name: string;
  px: number;
  tint?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
}> = ({ name, px, tint, className, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = MC_SPRITES[name];
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !sprite) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, sprite.w, sprite.h);
    sprite.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = sprite.palette[row[x]];
        if (!color) continue;
        ctx.fillStyle = tint?.[color] ?? color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  }, [sprite, tint]);
  if (!sprite) return null;
  return (
    <canvas
      ref={ref}
      width={sprite.w}
      height={sprite.h}
      className={className}
      style={{ width: sprite.w * px, height: sprite.h * px, imageRendering: 'pixelated', ...style }}
    />
  );
};

// 图标兼容层: 'mc:xxx' 渲染原版贴图,其余按文本显示
export const McIcon: React.FC<{
  icon?: string;
  px?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ icon, px = 2, className, style }) => {
  if (icon?.startsWith('mc:')) {
    return <McSpriteCanvas name={icon.slice(3)} px={px} className={className} style={{ display: 'inline-block', verticalAlign: 'middle', ...style }} />;
  }
  return <span className={className} style={style}>{icon}</span>;
};
