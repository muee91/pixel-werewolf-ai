// 体素 primitives 库:全项目共享的像素/方块 UI 原语。
// 所有组件从 VOXEL_TOKENS 取色,不再各自硬编码。
export {
  PixelBlock,
  PixelItem,
  DeadStamp,
  PixelGrave,
  PixelCampfire,
  PixelTorch,
  PixelMob,
  PixelMineCart,
  PixelRedstoneRig,
  TerrainStrip,
} from './PixelSprites';
export { PixelAvatar, PixelAvatarHead } from './PixelAvatar';
export type { RoleKit, PixelAvatarProps } from './PixelAvatar';
export { McSpriteCanvas, McIcon, shadeHex } from './McSprite';
export { PixelIcon, type PixelIconName } from './PixelIcon';
export { BlockButton, BlockPanel, BlockModal } from './BlockUi';
