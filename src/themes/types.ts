export type ThemeId = 'voxel-camp';

export type GameViewMode = '2d' | '3d';

export type VoxelHomeStyle = 'block-harbor' | 'survival-camp' | 'redstone-lobby';
export type HomeStyle = VoxelHomeStyle;

export type VoxelCardStyle = 'name-sign' | 'totem-badge' | 'hotbar-strip';
export type PlayerCardStyle = VoxelCardStyle;

export type VoxelLayout = 'block-arena' | 'redstone-hub' | 'survival-log';
export type GameLayout = VoxelLayout;

export type EffectLevel = 'subtle' | 'medium' | 'intense';
export type BorderRadiusStyle = 'sharp' | 'rounded' | 'pill';

export interface ThemeColors {
  bg: string;
  bgSecondary: string;
  fg: string;
  accent1: string;
  accent2: string;
  accent3: string;
  card: string;
  border: string;
  muted: string;
  wolf: string;
  god: string;
  villager: string;
  dead: string;
}

export interface ThemeConfig {
  id: ThemeId;
  label: string;
  colors: ThemeColors;
  fontFamily: {
    display: string;
    body: string;
    mono: string;
  };
  borderRadius: BorderRadiusStyle;
  glow: boolean;
  homeStyles: { id: HomeStyle; label: string; desc: string }[];
  cardStyles: { id: PlayerCardStyle; label: string; desc: string }[];
  gameLayouts: { id: GameLayout; label: string; desc: string }[];
}

export interface UIConfig {
  themeId: ThemeId;
  homeStyle: HomeStyle;
  gameLayout: GameLayout;
  playerCardStyle: PlayerCardStyle;
  effectLevel: EffectLevel;
  gameViewMode: GameViewMode;
  worldAmbientAudioEnabled: boolean;
  worldSkillAudioEnabled: boolean;
  worldAudioVolume: number;
  /** 阶段/技能演出音效(程序化合成) */
  gameSfxEnabled: boolean;
  gameSfxVolume: number;
  /** 对局 BGM(双轨昼夜和弦) */
  bgmEnabled: boolean;
  /** 游戏内显示 AI 人设标记 */
  personaTagsEnabled: boolean;
  /** 每局给 AI 分身随机抽取人设 */
  randomPersonaEachGame: boolean;
}

export const THEME_DEFAULTS: Record<ThemeId, Omit<UIConfig, 'themeId'>> = {
  'voxel-camp': {
    homeStyle: 'block-harbor',
    gameLayout: 'block-arena',
    playerCardStyle: 'name-sign',
    effectLevel: 'subtle',
    gameViewMode: '2d',
    worldAmbientAudioEnabled: true,
    worldSkillAudioEnabled: true,
    worldAudioVolume: 0.35,
    gameSfxEnabled: true,
    gameSfxVolume: 0.5,
    bgmEnabled: true,
    personaTagsEnabled: true,
    randomPersonaEachGame: false,
  },
};

const isValidGameViewMode = (value: unknown): value is GameViewMode =>
  value === '2d' || value === '3d';

// Normalizes a (possibly legacy/partial) persisted UI config into a complete, valid UIConfig.
// - Fills missing fields with theme defaults.
// - Coerces a missing or unknown gameViewMode back to the theme default (2d),
//   so old persisted configs without gameViewMode stay on the classic 2D view.
export const normalizeUiConfig = (config: Partial<UIConfig>): UIConfig => {
  const requestedThemeId = config.themeId;
  const themeId: ThemeId = requestedThemeId && requestedThemeId in THEME_DEFAULTS
    ? requestedThemeId as ThemeId
    : 'voxel-camp';
  const defaults = THEME_DEFAULTS[themeId];
  const gameViewMode: GameViewMode = isValidGameViewMode(config.gameViewMode)
    ? config.gameViewMode
    : defaults.gameViewMode;
  const requestedVolume = typeof config.worldAudioVolume === 'number'
    ? config.worldAudioVolume
    : defaults.worldAudioVolume;
  return {
    ...defaults,
    ...config,
    themeId,
    gameViewMode,
    worldAudioVolume: Math.max(0, Math.min(1, requestedVolume)),
    gameSfxVolume: Math.max(0, Math.min(1, typeof config.gameSfxVolume === 'number' ? config.gameSfxVolume : defaults.gameSfxVolume)),
    gameSfxEnabled: config.gameSfxEnabled ?? defaults.gameSfxEnabled,
    bgmEnabled: config.bgmEnabled ?? defaults.bgmEnabled,
    personaTagsEnabled: config.personaTagsEnabled ?? defaults.personaTagsEnabled,
    randomPersonaEachGame: config.randomPersonaEachGame ?? defaults.randomPersonaEachGame,
  };
};
