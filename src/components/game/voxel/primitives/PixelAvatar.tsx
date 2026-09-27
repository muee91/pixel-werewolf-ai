// 像素玩家头像:原版 Minecraft Steve/Alex 皮肤正视拼装(16×32,逐像素转录)。
// preview=首页地图预览;dead 灰度、speaking 光环、kit 挂件照常生效。
import React from 'react';
import clsx from 'clsx';
import { VOXEL_TOKENS as T } from '../../../../themes/voxel-tokens';
import { PixelItem } from './PixelSprites';
import { McSpriteCanvas } from './McSprite';

export interface RoleKit {
  item: string;
  color: string;
  label: string;
  shirt: string;
}

export interface PixelAvatarProps {
  seed: number;
  /** 兼容保留:原版皮肤自带配色,不再用于换装 */
  color?: string;
  dead?: boolean;
  speaking?: boolean;
  kit?: RoleKit;
  /** 预览模式:首页地图预览用 */
  preview?: boolean;
}

export const PixelAvatar: React.FC<PixelAvatarProps> = ({ seed, dead, speaking, kit, preview }) => {
  const skin = seed % 2 === 0 ? 'steve' : 'alex';

  if (preview) {
    return <McSpriteCanvas name={skin} px={2} />;
  }

  return (
    <div
      className="relative h-16 w-8 shrink-0"
      style={{ filter: dead ? 'grayscale(1) brightness(0.55)' : 'none', imageRendering: 'pixelated' }}
    >
      <McSpriteCanvas name={skin} px={2} />
      {speaking && <div className="absolute inset-0" style={{ boxShadow: `0 0 0 3px ${T.torch}, 0 0 18px ${T.torch}` }} />}
      {kit && <div className="absolute -right-3 top-[36px] scale-[0.58]"><PixelItem type={kit.item} color={kit.color} small /></div>}
    </div>
  );
};

/** 方形小头像:只露 MC 皮肤头部,替代日志/历史页的外网随机照片(离线可用、风格统一) */
export const PixelAvatarHead: React.FC<{
  seed: number;
  dead?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ seed, dead, className, style }) => {
  const skin = seed % 2 === 0 ? 'steve' : 'alex';
  return (
    <div
      className={clsx('relative overflow-hidden', className)}
      style={{ filter: dead ? 'grayscale(1) brightness(0.55)' : 'none', imageRendering: 'pixelated', background: '#7a5c3a', ...style }}
    >
      {/* px=4 时头部恰好充满 32px 见方区域;整体水平居中让头部对准容器 */}
      <div className="absolute left-1/2 top-0" style={{ transform: 'translateX(-50%)' }}>
        <McSpriteCanvas name={skin} px={4} />
      </div>
    </div>
  );
};
