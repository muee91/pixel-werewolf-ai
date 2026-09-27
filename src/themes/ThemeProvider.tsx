import React, { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { uiConfigAtom } from '../atoms';
import { THEMES } from './index';
import type { BorderRadiusStyle, EffectLevel } from './types';
import { VOXEL_TOKENS, VOXEL_CSS_VARS, VOXEL_FONT, VOXEL_BORDER_W, VOXEL_BORDER_W_LG, VOXEL_SHADOW, VOXEL_SHADOW_LG, VOXEL_SHADOW_XL } from './voxel-tokens';

const BORDER_RADIUS_MAP: Record<BorderRadiusStyle, string> = {
  sharp: '2px',
  rounded: '8px',
  pill: '9999px',
};

const EFFECT_DURATION_MAP: Record<EffectLevel, string> = {
  subtle: '0.15s',
  medium: '0.3s',
  intense: '0.5s',
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const uiConfig = useAtomValue(uiConfigAtom);
  const theme = THEMES[uiConfig.themeId] ?? THEMES['voxel-camp'];

  useEffect(() => {
    const root = document.documentElement;
    const c = theme.colors;

    root.style.setProperty('--color-bg', c.bg);
    root.style.setProperty('--color-bg-secondary', c.bgSecondary);
    root.style.setProperty('--color-fg', c.fg);
    root.style.setProperty('--color-accent1', c.accent1);
    root.style.setProperty('--color-accent2', c.accent2);
    root.style.setProperty('--color-accent3', c.accent3);
    root.style.setProperty('--color-card', c.card);
    root.style.setProperty('--color-border', c.border);
    root.style.setProperty('--color-muted', c.muted);
    root.style.setProperty('--color-wolf', c.wolf);
    root.style.setProperty('--color-god', c.god);
    root.style.setProperty('--color-villager', c.villager);
    root.style.setProperty('--color-dead', c.dead);

    root.style.setProperty('--font-display', theme.fontFamily.display);
    root.style.setProperty('--font-body', theme.fontFamily.body);
    root.style.setProperty('--font-mono', theme.fontFamily.mono);
    // 字体固定走主题（voxel-camp 全部为 Courier New），不再有 fontScheme 选项。
    root.style.setProperty('--font-active-display', theme.fontFamily.display);
    root.style.setProperty('--font-active-body', theme.fontFamily.body);
    root.style.setProperty('--font-active-mono', theme.fontFamily.mono);

    root.style.setProperty('--radius', BORDER_RADIUS_MAP[theme.borderRadius]);
    root.style.setProperty('--glow', theme.glow ? '1' : '0');

    root.style.setProperty('--effect-duration', EFFECT_DURATION_MAP[uiConfig.effectLevel]);
    root.style.setProperty('--effect-level', uiConfig.effectLevel);

    // ===== 体素设计令牌注入(单一真相源) =====
    // 把 VOXEL_TOKENS 写成 --voxel-* CSS 变量,所有体素组件优先消费这些变量,
    // 不再各自硬编码十六进制。同时注入方块边框与硬阴影令牌。
    (Object.keys(VOXEL_TOKENS) as Array<keyof typeof VOXEL_TOKENS>).forEach((key) => {
      root.style.setProperty(VOXEL_CSS_VARS[key], VOXEL_TOKENS[key]);
    });
    root.style.setProperty('--voxel-border-w', VOXEL_BORDER_W);
    root.style.setProperty('--voxel-border-w-lg', VOXEL_BORDER_W_LG);
    root.style.setProperty('--voxel-shadow', VOXEL_SHADOW);
    root.style.setProperty('--voxel-shadow-lg', VOXEL_SHADOW_LG);
    root.style.setProperty('--voxel-shadow-xl', VOXEL_SHADOW_XL);
    root.style.setProperty('--voxel-font', VOXEL_FONT);

    root.setAttribute('data-theme', uiConfig.themeId);
    root.setAttribute('data-effect', uiConfig.effectLevel);
  }, [theme, uiConfig]);

  return <>{children}</>;
};
