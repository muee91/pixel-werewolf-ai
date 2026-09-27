// 方块狼人杀 · 体素设计令牌(单一真相源)
// 所有体素组件只从这里取色,不再各自硬编码十六进制。
// 同时通过 ThemeProvider 注入为 --voxel-* CSS 变量。

export const VOXEL_TOKENS = {
  // 天空与昼夜
  sky: '#78bce8',       // 白天天空
  skyDeep: '#5fa3d4',
  night: '#0e1830',     // 夜晚天空(比旧值更深,强化氛围)
  nightVeil: '#050a1c',
  dawn: '#f4a261',      // 黎明过渡
  dusk: '#6a4b8a',     // 黄昏过渡

  // 地形材质
  grass: '#4e9a38',
  grassDark: '#2d702e',
  dirt: '#7a4c2a',
  dirtDark: '#4a2d1c',
  stone: '#68717a',
  stoneDark: '#3a3f47',
  wood: '#8b5a2b',
  woodDark: '#4b2d1a',

  // UI 纸面与墨
  paper: '#f2dfaa',     // 主信息底
  paperDim: '#d8c089',
  ink: '#24170e',       // 主文字/边框
  inkSoft: '#3c2617',

  // 强调色(Minecraft 矿物)
  torch: '#f6b443',     // 主强调(火把/选中/白天光)
  redstone: '#d94b3d',  // 危险/狼/出局
  emerald: '#48c774',   // 好人/存活
  water: '#3a84c2',     // 中性/信息
  diamond: '#4dd6e0',   // 神职高亮

  // 状态
  dead: '#596052',
  deadStamp: '#b31923',
} as const;

export type VoxelTokenKey = keyof typeof VOXEL_TOKENS;

// CSS 变量名映射,供 ThemeProvider 注入
export const VOXEL_CSS_VARS: Record<VoxelTokenKey, string> = {
  sky: '--voxel-sky',
  skyDeep: '--voxel-sky-deep',
  night: '--voxel-night',
  nightVeil: '--voxel-night-veil',
  dawn: '--voxel-dawn',
  dusk: '--voxel-dusk',
  grass: '--voxel-grass',
  grassDark: '--voxel-grass-dark',
  dirt: '--voxel-dirt',
  dirtDark: '--voxel-dirt-dark',
  stone: '--voxel-stone',
  stoneDark: '--voxel-stone-dark',
  wood: '--voxel-wood',
  woodDark: '--voxel-wood-dark',
  paper: '--voxel-paper',
  paperDim: '--voxel-paper-dim',
  ink: '--voxel-ink',
  inkSoft: '--voxel-ink-soft',
  torch: '--voxel-torch',
  redstone: '--voxel-redstone',
  emerald: '--voxel-emerald',
  water: '--voxel-water',
  diamond: '--voxel-diamond',
  dead: '--voxel-dead',
  deadStamp: '--voxel-dead-stamp',
};

// 方块边框与硬阴影令牌(方块感的核心)
export const VOXEL_BORDER_W = '3px';
export const VOXEL_BORDER_W_LG = '4px';
export const VOXEL_SHADOW = `3px 3px 0 ${VOXEL_TOKENS.ink}`;
export const VOXEL_SHADOW_LG = `6px 6px 0 ${VOXEL_TOKENS.ink}`;
export const VOXEL_SHADOW_XL = `8px 8px 0 ${VOXEL_TOKENS.ink}`;

// 唯一字体栈
export const VOXEL_FONT = "'Fusion Pixel', 'Courier New', ui-monospace, monospace";
