import type { BlockKind } from './materials';

/**
 * 3D 场景预设。
 *
 * 两套构造逻辑并存：
 * - `style: 'blocky'` —— 程序化方块地形（森林/雪原/秋林/荒漠），共用同一套方块世界，
 *   差别只在地表方块、树种、水色、天空色温。
 * - `style: 'crypt'` —— 非方块的低多边形室内（深渊圣殿，见 CryptHall.tsx）：
 *   八边形柱廊 / 尖拱窗 / 穹顶 / 铁火盆，不生成任何方块地形。
 */
export type SceneId = 'forest-camp' | 'snow-camp' | 'autumn-camp' | 'desert-ruins' | 'dungeon-hall';

/** 场景的构造逻辑（决定渲染哪一整套世界） */
export type SceneStyle = 'blocky' | 'crypt';

export interface ScenePreset {
  id: SceneId;
  label: string;
  desc: string;
  /** 世界构造方式：方块地形 or 非方块石殿 */
  style: SceneStyle;
  /** 地表主层（草皮/雪/沙/地牢砖） */
  ground: BlockKind;
  /** 地表下层（土/砂岩/石） */
  sub: BlockKind;
  /** 水岸一圈用什么 */
  shore: BlockKind;
  /** 石头/山体用哪种（荒漠是砂岩、地牢是石砖墙） */
  stone: BlockKind;
  /** 树冠；null = 不长树冠（枯树/无树场景） */
  leaves: BlockKind | null;
  log: BlockKind;
  birch: BlockKind;
  /** 水；null = 这个场景没有水（水面高度会压到地下） */
  water: { color: string; opacity: number; emissive: string } | null;
  trees: 'forest' | 'pine' | 'dead' | 'none';
  /** heightAmp：地形起伏倍率；walls：四面石墙（室内） */
  terrain: { heightAmp: number; walls: boolean };
  sky: { dayTop: string; dayBottom: string; nightTop: string; nightBottom: string };
  fog: { day: string; night: string; dayNear: number; dayFar: number; nightNear: number; nightFar: number };
  /** 光照倍率，乘在既有昼夜预设上；fire 是篝火色 */
  light: { ambient: number; directional: number; fire: string };
  fireflies: boolean;
  /** 室内：不画太阳/月亮/星空/云，天空穹顶压到近黑 */
  indoor: boolean;
}

export const SCENES: Record<SceneId, ScenePreset> = {
  'forest-camp': {
    id: 'forest-camp',
    style: 'blocky',
    label: '森林营地',
    desc: '默认场景：草地、橡树、湖边篝火。',
    ground: 'grass',
    sub: 'dirt',
    shore: 'sand',
    stone: 'stone',
    leaves: 'leaves',
    log: 'log',
    birch: 'birch',
    water: { color: '#3d86ad', opacity: 0.78, emissive: '#0d2233' },
    trees: 'forest',
    terrain: { heightAmp: 1, walls: false },
    sky: { dayTop: '#6fc0f2', dayBottom: '#d8eef9', nightTop: '#101f3e', nightBottom: '#33518a' },
    fog: { day: '#c8e6f0', night: '#29466e', dayNear: 26, dayFar: 140, nightNear: 20, nightFar: 105 },
    light: { ambient: 1, directional: 1, fire: '#f6a623' },
    fireflies: true,
    indoor: false,
  },
  'snow-camp': {
    id: 'snow-camp',
    style: 'blocky',
    label: '雪原营地',
    desc: '积雪、雪压松林、结冰的湖面，天光偏冷。',
    ground: 'snow',
    sub: 'packedSnow',
    shore: 'snow',
    stone: 'stone',
    leaves: 'snowLeaves',
    log: 'birch',
    birch: 'birch',
    water: { color: '#9fc6d8', opacity: 0.86, emissive: '#1b3446' },
    trees: 'pine',
    terrain: { heightAmp: 1.15, walls: false },
    sky: { dayTop: '#b9d7ef', dayBottom: '#eef6ff', nightTop: '#0b1626', nightBottom: '#2b4463' },
    fog: { day: '#e4eef8', night: '#263a52', dayNear: 18, dayFar: 96, nightNear: 14, nightFar: 74 },
    // 雪面反光强，环境光给高一点；篝火在雪地上的光池更亮
    light: { ambient: 1.12, directional: 0.95, fire: '#ffb457' },
    fireflies: false,
    indoor: false,
  },
  'autumn-camp': {
    id: 'autumn-camp',
    style: 'blocky',
    label: '秋日枫林',
    desc: '枯草、橙红枫叶、低角度暖阳。',
    ground: 'dry',
    sub: 'dirt',
    shore: 'sand',
    stone: 'stone',
    leaves: 'mapleLeaves',
    log: 'log',
    birch: 'birch',
    water: { color: '#4a7d92', opacity: 0.8, emissive: '#122a33' },
    trees: 'forest',
    terrain: { heightAmp: 0.9, walls: false },
    sky: { dayTop: '#c98a4a', dayBottom: '#f7dfb4', nightTop: '#1a1426', nightBottom: '#3d2b3c' },
    fog: { day: '#eccfa0', night: '#33262f', dayNear: 24, dayFar: 130, nightNear: 18, nightFar: 96 },
    light: { ambient: 1.02, directional: 1.12, fire: '#ff9b3d' },
    fireflies: true,
    indoor: false,
  },
  'desert-ruins': {
    id: 'desert-ruins',
    style: 'blocky',
    label: '荒漠废墟',
    desc: '沙丘、砂岩残柱、枯树与干涸的河床。',
    ground: 'sand',
    sub: 'sand',
    shore: 'sandstone',
    stone: 'sandstone',
    leaves: null,
    log: 'log',
    birch: 'log',
    water: null,
    trees: 'dead',
    terrain: { heightAmp: 0.75, walls: false },
    sky: { dayTop: '#a9cfe0', dayBottom: '#f3e2b8', nightTop: '#181a2a', nightBottom: '#463a44' },
    fog: { day: '#e6d3a8', night: '#4a3a34', dayNear: 20, dayFar: 105, nightNear: 14, nightFar: 78 },
    light: { ambient: 1.26, directional: 1.16, fire: '#ffab45' },
    fireflies: false,
    indoor: false,
  },
  'dungeon-hall': {
    id: 'dungeon-hall',
    style: 'crypt',
    label: '深渊圣殿',
    desc: '八边形柱廊、尖拱窗透下冷月光、铁火盆照明的封闭石殿。',
    ground: 'dungeonFloor',
    sub: 'dungeonFloor',
    shore: 'dungeonWall',
    stone: 'dungeonWall',
    leaves: null,
    log: 'log',
    birch: 'log',
    water: null,
    trees: 'none',
    // 圣殿根本不生成方块地形（见 CryptHall.tsx），这两项只为类型完整
    terrain: { heightAmp: 0, walls: false },
    sky: { dayTop: '#0b0e13', dayBottom: '#161b23', nightTop: '#05070a', nightBottom: '#0b0f15' },
    // 室内最远也就 30m（对角柱），雾按室外那套给会把石墙糊成一片灰
    fog: { day: '#131822', night: '#080a0e', dayNear: 12, dayFar: 78, nightNear: 10, nightFar: 62 },
    // 全靠火盆与窗光：环境光压到能看清石质轮廓，方向光只留一点，别把穹顶打成白天
    light: { ambient: 1.05, directional: 0.2, fire: '#ff9a2e' },
    fireflies: false,
    indoor: true,
  },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

export const DEFAULT_SCENE_ID: SceneId = 'forest-camp';

export const resolveSceneId = (id: string | undefined | null): SceneId =>
  id && id in SCENES ? (id as SceneId) : DEFAULT_SCENE_ID;
