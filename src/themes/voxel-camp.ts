import type { ThemeConfig } from './types';
import { VOXEL_TOKENS, VOXEL_FONT } from './voxel-tokens';

// 体素营地主题:所有色值引用 VOXEL_TOKENS,保证与游戏房间/首页的硬编码色板一致。
export const voxelCampTheme: ThemeConfig = {
  id: 'voxel-camp',
  label: '方块营地',
  colors: {
    bg: VOXEL_TOKENS.inkSoft,            // 深木色底,与游戏面板 chrome 一致
    bgSecondary: VOXEL_TOKENS.woodDark,  // 次级背景
    fg: VOXEL_TOKENS.paper,              // 纸色文字
    accent1: VOXEL_TOKENS.torch,         // 主强调 = 火把
    accent2: VOXEL_TOKENS.redstone,      // 次强调 = 红石
    accent3: VOXEL_TOKENS.emerald,       // 第三强调 = 绿宝石
    card: VOXEL_TOKENS.woodDark,         // 卡片 = 暗木面（与对局面板同语言，纸色文字在其上可读）
    border: VOXEL_TOKENS.ink,            // 边框 = 墨
    muted: VOXEL_TOKENS.paperDim,        // 弱化文字
    wolf: VOXEL_TOKENS.redstone,
    god: VOXEL_TOKENS.torch,
    villager: VOXEL_TOKENS.emerald,
    dead: VOXEL_TOKENS.dead,
  },
  fontFamily: {
    display: VOXEL_FONT,
    body: VOXEL_FONT,
    mono: VOXEL_FONT,
  },
  borderRadius: 'sharp',
  glow: false,
  homeStyles: [
    { id: 'block-harbor', label: '木板码头', desc: '木板入口、火把灯带、告示牌选局' },
    { id: 'survival-camp', label: '营火据点', desc: '草地方砖、营火中轴、物资热栏' },
    { id: 'redstone-lobby', label: '红石工坊', desc: '红石灯阵、拨杆墙、状态告示牌' },
  ],
  cardStyles: [
    { id: 'name-sign', label: '木牌名签', desc: '木牌标签、昵称优先、席位清楚' },
    { id: 'totem-badge', label: '图腾徽章', desc: '徽章居中、状态简化、色块提示' },
    { id: 'hotbar-strip', label: '背包热栏', desc: '横向槽位、信息密度更高' },
  ],
  gameLayouts: [
    { id: 'block-arena', label: '营火圆台', desc: '营火上屏，发言区做主画面' },
    { id: 'redstone-hub', label: '红石中控', desc: '会话主屏 + 侧边告示牌，层级更清楚' },
    { id: 'survival-log', label: '营地日志墙', desc: '木箱日志墙、热栏状态、像素结算面板' },
  ],
};
