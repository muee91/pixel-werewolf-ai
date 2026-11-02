// 像素玩家形象：0x72 DungeonTileset II v1.7 的 4 帧待机动画（16×28，CC0），12 种骨架。
// 缺素材时（没跑 gen:art / 没把 0x72 包放进 assets-src）自动回落到程序化生成的 villagerA/B。
// preview=首页地图预览;dead 灰度并定格、speaking 光环、kit 挂件照常生效。
import React from 'react';
import clsx from 'clsx';
import { VOXEL_TOKENS as T } from '../../../../themes/voxel-tokens';
import {
  buildHeadTint,
  buildSpriteScale,
  buildSpriteTint,
  resolveLook,
  SPRITE_ORDER,
  spriteFrameKeys,
  spriteHeadKey,
  type AvatarLook,
  type AvatarSprite,
} from '../../../../utils/avatarLook';
import { PixelItem } from './PixelSprites';
import { CampSpriteCanvas, CampSpriteFrames } from './CampSprite';
import { CAMP_TILES } from './camp-tiles';

export interface RoleKit {
  item: string;
  color: string;
  label: string;
  shirt: string;
}

export interface PixelAvatarProps {
  seed: number;
  /** 形象（造型 + 配色）。不传则按 seed 派生，与 3D 视角一致。 */
  look?: AvatarLook;
  /** 兼容保留：形象自带配色，不再用于换装 */
  color?: string;
  dead?: boolean;
  speaking?: boolean;
  kit?: RoleKit;
  /** 预览模式:首页地图预览用 */
  preview?: boolean;
  /** 像素倍率（16×28 的矩阵，px=2 → 32×56） */
  px?: number;
}

/** 0x72 角色帧是否已生成（缺 PNG 时生成器会跳过对应角色） */
export const hasCharacterFrames = SPRITE_ORDER.every(sprite => !!CAMP_TILES[spriteFrameKeys(sprite)[0]]);

/** 某个骨架是否有素材；没有就回落到程序化小人，而不是整块空白 */
export const hasSprite = (sprite: AvatarSprite): boolean => !!CAMP_TILES[spriteFrameKeys(sprite)[0]];

export const PixelAvatar: React.FC<PixelAvatarProps> = ({ seed, look: lookInput, dead, speaking, kit, preview, px = 2 }) => {
  const look = resolveLook(lookInput, seed);
  const frames = spriteFrameKeys(look.sprite);
  const tint = buildSpriteTint(look);
  const ready = hasSprite(look.sprite);
  // 体型：tall/stout/child 各自缩一点，让同一张骨架在不同人身上也不一样高。
  // 成人（默认）不加 transform —— 空转的 scale(1,1) 会给每个座位平白多开一层合成层，
  // 12 个座位 × 4 帧 CSS 动画叠加时，无谓的层会明显拖慢渲染。
  const [sx, sy] = buildSpriteScale(look.build);
  const scaled = sx !== 1 || sy !== 1;
  const scaleStyle: React.CSSProperties | undefined = scaled
    ? { transform: `scale(${sx}, ${sy})`, transformOrigin: 'bottom center' }
    : undefined;

  const body = ready
    ? <CampSpriteFrames names={frames} px={px} playing={!dead} tint={tint} />
    : <CampSpriteCanvas name={look.sprite === 'elf' ? 'villagerB' : 'villagerA'} px={px} />;

  if (preview) {
    return (
      <div style={{ ...scaleStyle, imageRendering: 'pixelated' }}>
        {body}
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0"
      style={{ filter: dead ? 'grayscale(1) brightness(0.55)' : 'none', imageRendering: 'pixelated' }}
    >
      <div style={scaleStyle}>
        {body}
        {speaking && <div className="absolute inset-0" style={{ boxShadow: `0 0 0 3px ${T.torch}, 0 0 18px ${T.torch}` }} />}
        {/* 挂件钉在脚下：角色框是 32×56（16×28 @2x），比旧 16×32 矮 8px */}
        {kit && <div className="absolute -right-3 top-[34px] scale-[0.58]"><PixelItem type={kit.item} color={kit.color} small /></div>}
      </div>
    </div>
  );
};

/** 方形小头像:只露像素形象的头部,替代日志/历史页的外网随机照片(离线可用、风格统一) */
export const PixelAvatarHead: React.FC<{
  seed: number;
  /** 形象（与大厅/3D 同一份）。不传则按 seed 派生。 */
  look?: AvatarLook;
  /** 像素倍率：头部精灵是 16×8，px=4 → 64×32。小卡片用 3 才装得下整个头。 */
  px?: number;
  dead?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ seed, look: lookInput, px = 4, dead, className, style }) => {
  const look = resolveLook(lookInput, seed);
  const tint = buildHeadTint(look);
  return (
    <div
      className={clsx('relative overflow-hidden', className)}
      style={{ filter: dead ? 'grayscale(1) brightness(0.55)' : 'none', imageRendering: 'pixelated', background: '#7a5c3a', ...style }}
    >
      {/* px=4 时 16×8 的头部精灵恰好是 64×32，与容器同高；水平居中让头部对准 */}
      <div className="absolute left-1/2 top-0" style={{ transform: 'translateX(-50%)' }}>
        {hasSprite(look.sprite)
          ? <CampSpriteCanvas name={spriteHeadKey(look.sprite)} px={px} tint={tint} />
          : <CampSpriteCanvas name={look.sprite === 'elf' ? 'villagerB' : 'villagerA'} px={px} />}
      </div>
    </div>
  );
};
