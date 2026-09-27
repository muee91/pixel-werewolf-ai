export * from './types';
export { voxelCampTheme } from './voxel-camp';

import { voxelCampTheme } from './voxel-camp';
import type { ThemeConfig, ThemeId } from './types';

export const THEMES: Record<ThemeId, ThemeConfig> = {
  'voxel-camp': voxelCampTheme,
} as Record<ThemeId, ThemeConfig>;

export const THEME_LIST: ThemeConfig[] = Object.values(THEMES);
