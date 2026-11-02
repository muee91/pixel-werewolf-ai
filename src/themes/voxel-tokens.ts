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
  woodMid: '#b78345',    // 暗木面板上的"未选中"底(主页模式切换/板子列表共用)

  // UI 纸面与墨
  paper: '#f2dfaa',     // 主信息底
  paperDim: '#d8c089',
  ink: '#24170e',       // 主文字/边框
  inkSoft: '#3c2617',

  // 强调色（营地矿物/余烬）
  torch: '#f6b443',     // 主强调(火把/选中/白天光)
  redstone: '#d94b3d',  // 危险/狼/出局
  emerald: '#48c774',   // 好人/存活
  water: '#3a84c2',     // 中性/信息
  diamond: '#4dd6e0',   // 神职高亮

  // 状态
  dead: '#596052',
  deadStamp: '#b31923',

  // 纸面文字墨色(纸底 #f2dfaa 上的小字,均 ≥4.5:1;仅用于纸/奶油底,填色/边框仍用纯强调色)
  redstoneInk: '#9e3127',  // 纸上红石字 5.44:1
  torchInk: '#7f5210',     // 纸上火把字 5.10:1
  emeraldInk: '#256b38',    // 纸上绿宝石字 4.91:1
  waterInk: '#2b5880',      // 纸上水色字 5.66:1

  // 暗面(木深 #4b2d1a)强调字变体
  redstoneOnDark: '#ff8a7a',  // 暗木上的狼红字 5.43:1
  emeraldOnDark: '#7fd67f',   // 暗木上的绿字(人格标签)7.00:1

  // 实心色块上的白字 / 结算与闪光
  redstoneDeep: '#c0392b',  // 深红石底(白字 5.44:1)
  sheriffGold: '#b8860b',    // 警徽金底(大白字 3.25:1)
  solidWhite: '#ffffff',     // 实心深底上的白字(深红石上 5.44:1)——唯一允许的纯白,仅作深底文字用

  // 死亡卡
  deadCard: '#40463d',   // 死亡卡底
  deadText: '#c2c8ba',   // 死亡卡上的字 5.67:1(带死色相,不用灰)

  // 暖色浮雕(MC GUI 致敬,玩家输入面板专用;斜面高光/外描边直接复用 paper/ink)
  mcPanel: '#c9b995',       // 暖石灰面板底(原 #c6c6c6 的暖化,ink 字 8.7:1)
  mcField: '#1a1008',       // 凹陷输入井底(比 ink 更深的暖黑,paper 字 12:1)
  mcInsetShadow: '#3a2415', // 输入井内上侧阴影(原 #3a3a3a 的暖化)
  mcBevelDark: '#6b5535',   // 浮雕右下暗棱(原 #555555/#6e6e6e 的暖化)
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
  woodMid: '--voxel-wood-mid',
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
  redstoneInk: '--voxel-redstone-ink',
  torchInk: '--voxel-torch-ink',
  emeraldInk: '--voxel-emerald-ink',
  waterInk: '--voxel-water-ink',
  redstoneOnDark: '--voxel-redstone-on-dark',
  emeraldOnDark: '--voxel-emerald-on-dark',
  redstoneDeep: '--voxel-redstone-deep',
  sheriffGold: '--voxel-sheriff-gold',
  solidWhite: '--voxel-solid-white',
  deadCard: '--voxel-dead-card',
  deadText: '--voxel-dead-text',
  mcPanel: '--voxel-mc-panel',
  mcField: '--voxel-mc-field',
  mcInsetShadow: '--voxel-mc-inset-shadow',
  mcBevelDark: '--voxel-mc-bevel-dark',
};

// 方块边框与硬阴影令牌(方块感的核心)
export const VOXEL_BORDER_W = '3px';
export const VOXEL_BORDER_W_LG = '4px';
export const VOXEL_SHADOW = `3px 3px 0 ${VOXEL_TOKENS.ink}`;
export const VOXEL_SHADOW_LG = `6px 6px 0 ${VOXEL_TOKENS.ink}`;
export const VOXEL_SHADOW_XL = `8px 8px 0 ${VOXEL_TOKENS.ink}`;

// 唯一字体栈
export const VOXEL_FONT = "'Fusion Pixel', 'Courier New', ui-monospace, monospace";
