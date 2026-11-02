// 营地像素贴图渲染器：canvas 逐像素绘制，CSS 放大保持硬边（数据来自 scripts/gen-pixel-art.ts）
import React, { useEffect, useRef } from 'react';
import { CAMP_TILES } from './camp-tiles';

export const shadeHex = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

export const CampSpriteCanvas: React.FC<{
  name: string;
  px: number;
  tint?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
}> = ({ name, px, tint, className, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = CAMP_TILES[name];
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

// 图标兼容层: 'tile:xxx' 渲染营地贴图,其余按文本显示
export const CampIcon: React.FC<{
  icon?: string;
  px?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ icon, px = 2, className, style }) => {
  if (icon?.startsWith('tile:')) {
    return <CampSpriteCanvas name={icon.slice('tile:'.length)} px={px} className={className} style={{ display: 'inline-block', verticalAlign: 'middle', ...style }} />;
  }
  return <span className={className} style={style}>{icon}</span>;
};

/**
 * 多帧精灵（0x72 角色待机动画）：把 4 帧竖排画进一张 canvas，
 * 再用 CSS steps 整条上移裁切 —— 逐帧 setState 会让 12 个座位每秒重渲染上百次，
 * 而 transform 由合成器处理，代价接近 0。
 */
export const CampSpriteFrames: React.FC<{
  names: string[];
  px: number;
  fps?: number;
  playing?: boolean;
  /** 调色板重映射：把矩阵里的色键换成自定义色（换装/换肤色），键是原色值 */
  tint?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
}> = ({ names, px, fps = 4, playing = true, tint, className, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprites = names.map(name => CAMP_TILES[name]).filter(Boolean);
  const first = sprites[0];
  const key = names.join('|');
  // tint 是对象，用内容做依赖键，避免每次渲染都是新引用导致重绘
  const tintKey = tint ? JSON.stringify(tint) : '';

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !first) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, first.w, first.h * sprites.length);
    sprites.forEach((sprite, index) => {
      sprite.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const color = sprite.palette[row[x]];
          if (!color) continue;
          ctx.fillStyle = tint?.[color] ?? color;
          ctx.fillRect(x, y + index * first.h, 1, 1);
        }
      });
    });
    // sprites 由 key 决定，key/tintKey 变了才重绘
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tintKey, first]);

  if (!first) return null;
  const animated = playing && sprites.length > 1;
  return (
    <div className={className} style={{ width: first.w * px, height: first.h * px, overflow: 'hidden', ...style }}>
      <canvas
        ref={ref}
        width={first.w}
        height={first.h * sprites.length}
        style={{
          display: 'block',
          width: first.w * px,
          height: first.h * sprites.length * px,
          imageRendering: 'pixelated',
          animation: animated ? `vw-sprite-strip ${(sprites.length / fps).toFixed(2)}s steps(${sprites.length}) infinite` : 'none',
        }}
      />
    </div>
  );
};
