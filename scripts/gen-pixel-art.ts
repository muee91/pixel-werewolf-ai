/// <reference types="node" />
/**
 * 程序化像素素材生成器（合规版·原创）
 *
 * 为什么用它：仓库原先内嵌的是 Minecraft 逐像素转录数据（分发受 Mojang EULA 限制），
 * 而 Kenney 等 CC0 包里"每个文件一个语义名字"的只有 UI 图标包（gear/star/trophy…），
 * 没有狼人杀需要的道具与方块；按颜色自动挑 tilesheet 又不可靠。
 * 所以道具/头像/方块贴图全部改成**确定性算法生成**：语义由构造保证、风格由统一色阶与光照规则保证、
 * 无第三方位素材可授权负担，任何人 `npm run gen:art` 都能复现同一份像素。
 *
 * 输出：
 *   src/components/game/voxel/primitives/camp-tiles.ts   （道具/头像，接口同旧 McSprite）
 *   src/components/game/voxel3d/camp-blocks.ts           （3D 方块贴图 + 角色正脸）
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

type RGB = [number, number, number];
const hex = (c: RGB) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 每材质 4 阶色阶：[暗, 中暗, 中亮, 高光]，光照规则统一取用 */
const MAT: Record<string, RGB[]> = {
  wood: [[61, 36, 18], [107, 64, 32], [139, 90, 43], [169, 113, 74]],
  bark: [[47, 29, 16], [76, 48, 24], [107, 69, 34], [135, 89, 47]],
  stone: [[58, 64, 72], [91, 101, 112], [129, 139, 150], [170, 178, 187]],
  dirt: [[59, 42, 23], [92, 64, 35], [122, 87, 48], [151, 113, 74]],
  grass: [[44, 92, 34], [63, 127, 46], [95, 163, 60], [130, 194, 85]],
  leaf: [[31, 74, 28], [47, 107, 40], [72, 146, 52], [107, 185, 74]],
  flame: [[122, 31, 0], [201, 59, 6], [240, 127, 17], [255, 210, 90]],
  ember: [[138, 90, 0], [192, 138, 18], [232, 181, 58], [255, 224, 138]],
  steel: [[74, 85, 96], [123, 136, 148], [182, 194, 204], [232, 241, 247]],
  glass: [[43, 74, 99], [63, 113, 150], [121, 180, 212], [207, 234, 247]],
  ruby: [[92, 10, 10], [154, 31, 31], [209, 65, 65], [242, 138, 138]],
  emerald: [[11, 74, 46], [19, 122, 74], [34, 181, 115], [111, 224, 168]],
  skin: [[122, 74, 44], [169, 113, 74], [198, 136, 99], [224, 168, 128]],
  cloth: [[30, 42, 94], [47, 67, 148], [77, 102, 196], [143, 165, 232]],
  bone: [[141, 133, 116], [201, 194, 176], [242, 236, 223], [255, 252, 245]],
  sand: [[138, 122, 74], [192, 173, 106], [221, 202, 143], [242, 230, 184]],
  hay: [[122, 90, 16], [176, 138, 30], [217, 178, 60], [242, 215, 116]],
  ink: [[20, 14, 10], [36, 23, 14], [52, 34, 20], [70, 48, 28]],
  water: [[14, 58, 92], [28, 104, 152], [72, 168, 214], [168, 226, 246]],
};
const TINTS: Record<string, RGB> = {
  grassTop: [145, 189, 89], leaves: [72, 181, 24],
};

class Grid {
  cells: (RGB | null)[][];
  constructor(public w: number, public h: number) { this.cells = Array.from({ length: h }, () => Array<RGB | null>(w).fill(null)); }
  set(x: number, y: number, c: RGB | null) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = c; }
  at(x: number, y: number) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.cells[y][x] : null; }
  filled(x: number, y: number) { return !!this.at(x, y); }
}

/** 光照：左上偏亮、右下偏暗，按色阶取档；允许直接传入单个颜色（描边/裂纹等） */
function lit(g: Grid, mat: RGB[] | RGB, bias: number, gx: number, gy: number) {
  if (typeof mat[0] === 'number') return mat as RGB;
  const ramp = mat as RGB[];
  const t = -0.5 * (gx / (g.w - 1)) + 0.5 * (1 - gy / (g.h - 1));
  const idx = Math.max(0, Math.min(ramp.length - 1, Math.round(1 + bias + t * 2)));
  return ramp[idx];
}
function rect(g: Grid, x: number, y: number, w: number, h: number, mat: RGB[] | RGB, bias = 0) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(x + i, y + j, lit(g, mat, bias, x + i, y + j));
}
function vgrad(g: Grid, x: number, y: number, w: number, h: number, mat: RGB[]) {
  for (let j = 0; j < h; j++) { const idx = Math.min(3, Math.floor((1 - j / Math.max(1, h - 1)) * 4)); for (let i = 0; i < w; i++) g.set(x + i, y + j, mat[idx]); }
}
function disc(g: Grid, cx: number, cy: number, r: number, mat: RGB[] | RGB, bias = 0) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r) g.set(x, y, lit(g, mat, bias, x, y));
  }
}
function tri(g: Grid, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, mat: RGB[] | RGB, bias = 0) {
  const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy);
  const s = (px: number, py: number, q: number, r: number) => (px - r) * (py - q);
  for (let y = Math.floor(mny); y <= Math.ceil(mxy); y++) for (let x = Math.floor(mnx); x <= Math.ceil(mxx); x++) {
    const px = x + .5, py = y + .5;
    const d1 = s(px, py, ax, ay), d2 = s(px, py, bx, by), d3 = s(px, py, cx, cy);
    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) g.set(x, y, lit(g, mat, bias, x, y));
  }
}
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, mat: RGB[] | RGB, thick = 1, bias = 0) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / (n - 1)), y = Math.round(y0 + (y1 - y0) * i / (n - 1));
    for (let t = 0; t < thick; t++) g.set(x + (thick > 1 ? t : 0), y, lit(g, mat, bias, x, y));
  }
}
/** 1px 外描边（暗墨），小图标更清晰 */
function outline(g: Grid, color = MAT.ink[1]) {
  const add: [number, number][] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (g.filled(x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.filled(x + dx, y + dy))) add.push([x, y]);
  }
  add.forEach(([x, y]) => g.set(x, y, color));
}
/** 确定性伪随机（可复现） */
function rng(seed: string) {
  // FNV-1a + xorshift32：相邻 seed 字符串也必须给出互不相关的前几个输出，
  // 否则噪声会变成同心条带（实测 'bark0'..'bark15' 用简单 LCG 时首值只差 0.003）。
  let s = 2166136261 >>> 0;
  for (const ch of seed) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619) >>> 0; }
  s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---------- 道具 16×16 ----------
const ITEMS: Record<string, (g: Grid) => void> = {
  campfire: g => {
    line(g, 2, 12, 12, 9, MAT.wood, 2); line(g, 2, 9, 12, 12, MAT.wood, 2);
    vgrad(g, 4, 3, 8, 7, MAT.flame);
    tri(g, 8, 0, 11, 6, 5, 6, MAT.flame, 1);
    for (let x = 5; x <= 10; x++) if (x % 2) g.set(x, 9, MAT.ember[2]);
  },
  torch: g => {
    rect(g, 7, 7, 2, 8, MAT.wood, -1); rect(g, 6, 6, 4, 1, MAT.stone, 0);
    vgrad(g, 5, 1, 6, 6, MAT.flame); tri(g, 8, 0, 11, 4, 5, 4, MAT.flame, 1);
  },
  sword: g => {
    line(g, 3, 13, 12, 4, MAT.steel, 2, 1);
    g.set(12, 3, MAT.steel[3]); g.set(13, 2, MAT.steel[3]);
    line(g, 2, 12, 5, 15, MAT.ember, 1, 0); line(g, 1, 13, 4, 16, MAT.ember, 1);
    rect(g, 1, 12, 2, 2, MAT.wood, -1);
  },
  bow: g => {
    for (let i = 0; i < 12; i++) { const t = i / 11, x = Math.round(4 + Math.sin(t * Math.PI) * 6), y = 2 + i; g.set(x, y, MAT.wood[2]); }
    line(g, 4, 2, 4, 13, MAT.bone, 1, -1);
    line(g, 4, 7, 12, 7, MAT.wood, 1, 0); g.set(12, 7, MAT.steel[2]);
  },
  potion: g => {
    rect(g, 6, 2, 4, 2, MAT.wood, 0); disc(g, 8, 9, 4.5, MAT.glass, 0);
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) { const c = g.at(x, y); if (c === MAT.glass[1] || c === MAT.glass[2]) g.set(x, y, x < 7 ? MAT.ruby[2] : MAT.ruby[1]); }
    g.set(5, 6, MAT.glass[3]); g.set(6, 6, MAT.glass[3]); g.set(5, 7, MAT.glass[3]);
  },
  spyglass: g => {
    line(g, 2, 13, 12, 3, MAT.wood, 3, 0);
    g.set(12, 3, MAT.glass[2]); g.set(13, 2, MAT.glass[3]); g.set(11, 2, MAT.glass[3]);
    g.set(3, 12, MAT.ember[2]); g.set(4, 13, MAT.ember[1]);
  },
  shield: g => {
    disc(g, 8, 6, 5.6, MAT.stone, 0); tri(g, 2.4, 8, 13.6, 8, 8, 16, MAT.stone, -1);
    rect(g, 7, 3, 2, 8, MAT.ember, 1); rect(g, 4, 6, 8, 2, MAT.ember, 1);
  },
  emerald: g => {
    // 菱形宝石：上亮、中身、下暗，加一条刻面
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (Math.abs(x - 7.5) / 6.6 + Math.abs(y - 7.5) / 7.4 > 1) continue;
      g.set(x, y, MAT.emerald[y < 5 ? 3 : y < 10 ? 2 : 1]);
    }
    line(g, 6, 3, 3, 9, MAT.emerald[3], 1); line(g, 9, 12, 13, 7, MAT.emerald[0], 1);
  },
  shovel: g => {
    rect(g, 7, 2, 2, 10, MAT.wood, 0); rect(g, 5, 11, 6, 4, MAT.stone, 0);
    g.set(5, 14, MAT.stone[0]); g.set(10, 14, MAT.stone[0]);
  },
  bread: g => {
    disc(g, 8, 10, 5.4, MAT.hay, 0); tri(g, 2, 10, 14, 10, 8, 2, MAT.hay, 1);
    line(g, 5, 7, 8, 5, MAT.ink, 1, 1); line(g, 8, 9, 11, 7, MAT.ink, 1, 1);
  },
  heart: g => {
    disc(g, 5.4, 5.4, 4.2, MAT.ruby, 1); disc(g, 10.6, 5.4, 4.2, MAT.ruby, 0);
    tri(g, 1, 7.5, 15, 7.5, 8, 15.5, MAT.ruby, -1);
    g.set(4, 4, MAT.ruby[3]); g.set(5, 3, MAT.ruby[3]); g.set(3, 5, MAT.ruby[3]);
  },
  bone: g => {
    line(g, 4, 11, 11, 4, MAT.bone, 2, 0);
    disc(g, 3.4, 12.4, 2.2, MAT.bone, 1); disc(g, 12.4, 3.4, 2.2, MAT.bone, 1);
    disc(g, 2.4, 9.4, 1.8, MAT.bone, 0); disc(g, 13.4, 6.4, 1.8, MAT.bone, 0);
  },
  redstone: g => {
    for (let i = 0; i < 6; i++) { const r = rng('rs' + i)(); disc(g, 4 + r * 8, 4 + r * 8, 1.6 + r, MAT.ruby, 0); }
    line(g, 3, 12, 13, 3, MAT.ruby[2], 1, 1);
  },
  door: g => {
    rect(g, 3, 1, 10, 15, MAT.wood, 0); rect(g, 3, 1, 10, 1, MAT.bark, 1);
    rect(g, 5, 4, 6, 4, MAT.bark, -1); rect(g, 5, 9, 6, 4, MAT.bark, -1);
    g.set(11, 8, MAT.ember[3]); g.set(11, 9, MAT.ember[2]);
  },
  bookFilled: g => {
    rect(g, 2, 2, 12, 13, MAT.ruby, 0); rect(g, 2, 2, 2, 13, MAT.ink, -1);
    rect(g, 5, 4, 7, 9, MAT.bone, 1); line(g, 6, 6, 11, 6, MAT.ink, 1); line(g, 6, 8, 11, 8, MAT.ink, 1); line(g, 6, 10, 9, 10, MAT.ink, 1);
  },
  book: g => {
    rect(g, 2, 3, 12, 11, MAT.wood, 0); rect(g, 2, 3, 2, 11, MAT.ink, -1);
    rect(g, 5, 5, 7, 7, MAT.bone, 1); line(g, 8, 5, 8, 12, MAT.ink, 1);
    g.set(12, 4, MAT.ember[3]); g.set(13, 5, MAT.ember[2]);
  },
  pickaxe: g => {
    rect(g, 7, 5, 2, 10, MAT.wood, 0);
    tri(g, 2, 5, 8, 1, 9, 6, MAT.stone, 1); tri(g, 14, 5, 8, 1, 7, 6, MAT.stone, 0);
    g.set(8, 4, MAT.stone[3]);
  },
  compass: g => {
    disc(g, 8, 8, 6.4, MAT.ember, 0); disc(g, 8, 8, 4.6, MAT.bone, 1);
    tri(g, 8, 4, 10, 8, 6, 8, MAT.ruby, 1); tri(g, 8, 12, 10, 8, 6, 8, MAT.stone, -1);
    g.set(8, 8, MAT.ink[1]);
  },
  map: g => {
    rect(g, 2, 3, 12, 10, MAT.sand, 0); rect(g, 2, 3, 12, 1, MAT.wood, 1); rect(g, 2, 12, 12, 1, MAT.wood, -1);
    line(g, 4, 9, 8, 6, MAT.grass[1], 1, 1); line(g, 8, 6, 12, 8, MAT.grass[1], 1, 0);
    g.set(6, 10, MAT.ruby[2]); g.set(7, 10, MAT.ruby[2]);
  },
  villagerA: g => { char(g, MAT.cloth, MAT.wood); },
  villagerB: g => { char(g, MAT.grass, MAT.bark); },
};
function char(g: Grid, shirt: RGB[], hair: RGB[]) {
  rect(g, 4, 1, 8, 8, MAT.skin, 0);           // 头
  rect(g, 4, 1, 8, 2, hair, 1);               // 头发
  rect(g, 4, 1, 1, 4, hair, 0); rect(g, 11, 1, 1, 4, hair, 0);
  g.set(6, 4, MAT.bone[2]); g.set(7, 4, MAT.ink[1]); g.set(9, 4, MAT.bone[2]); g.set(10, 4, MAT.ink[1]);
  g.set(7, 7, hair[1]); g.set(8, 7, hair[1]);
  rect(g, 4, 9, 8, 8, shirt, 0);              // 身体
  rect(g, 2, 9, 2, 6, MAT.skin, -1); rect(g, 12, 9, 2, 6, MAT.skin, 1);
  rect(g, 5, 14, 6, 3, MAT.stone, -1);
}

// ---------- 方块 16×16（确定性噪声，可平铺）----------
const BLOCKS: Record<string, (g: Grid) => void> = {
  grassTop: g => noise(g, MAT.grass, 'grassTop'),
  dirt: g => noise(g, MAT.dirt, 'dirt'),
  stone: g => { noise(g, MAT.stone, 'stone'); const r = rng('stone-cr'); line(g, Math.floor(r() * 6) + 2, 3, Math.floor(r() * 6) + 9, 12, MAT.stone[0], 1); },
  cobble: g => { noise(g, MAT.stone, 'cobble'); for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? 0 : 3; x < 16; x += 5) { line(g, x, y, x, y + 3, MAT.ink[0], 1); } for (let x = 0; x < 16; x += 5) line(g, x, 0, x, 15, MAT.ink[0], 1); },
  logSide: g => { for (let x = 0; x < 16; x++) { const r = rng('bark' + x)(); const tone = r < .3 ? 0 : r < .7 ? 1 : r < .92 ? 2 : 3; for (let y = 0; y < 16; y++) g.set(x, y, MAT.bark[tone]); } },
  logTop: g => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); g.set(x, y, MAT.wood[Math.min(3, Math.floor(d / 2.4) % 4)]); } g.set(7, 7, MAT.bark[1]); },
  leaves: g => { noise(g, MAT.leaf, 'leaves'); const r = rng('lv'); for (let i = 0; i < 10; i++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16); g.set(x, y, null); } },
  sand: g => noise(g, MAT.sand, 'sand'),
  birchSide: g => { for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) g.set(x, y, MAT.bone[((x * 7 + y * 3) % 4)]); const r = rng('birch'); for (let i = 0; i < 5; i++) { const y = Math.floor(r() * 15), x = Math.floor(r() * 12); line(g, x, y, x + 2 + Math.floor(r() * 3), y, MAT.ink[0], 1); } },
  hay: g => { noise(g, MAT.hay, 'hay'); for (let y = 2; y < 16; y += 4) line(g, 0, y, 15, y + 1, MAT.hay[0], 1); },
  planks: g => { for (let y = 0; y < 16; y++) { const band = Math.floor(y / 4); for (let x = 0; x < 16; x++) { const r = rng(`pl${band}${x}`)(); g.set(x, y, MAT.wood[r < .55 ? 2 : r < .85 ? 1 : 3]); } line(g, 0, band * 4, 15, band * 4, MAT.bark[0], 1); } for (let b = 0; b < 4; b++) { const x = (b % 2) ? 11 : 4; line(g, x, b * 4 + 1, x, b * 4 + 3, MAT.bark[0], 1); g.set(x, b * 4 + 1, MAT.stone[3]); } },
  grassSide: g => { noise(g, MAT.dirt, 'grassSide'); for (let x = 0; x < 16; x++) { const r = rng('gs' + x)(); const d = 3 + Math.floor(r * 4); for (let y = 0; y < d; y++) g.set(x, y, MAT.grass[y === d - 1 ? 1 : 2]); } },
};
function noise(g: Grid, mat: RGB[], seed: string) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = rng(`${seed}${x},${y}`)();
    const t = r < .18 ? 0 : r < .55 ? 1 : r < .85 ? 2 : 3;
    g.set(x, y, lit(g, mat, t - 2, x, y));
  }
}


/* ---------- 外部 CC0 覆盖：0x72 DungeonTileset II v1.7 ----------
   语义由包内文件名的构造保证（flask/skull/ui_heart/sword/bow 就是它们本身），
   来源、版本与 CC0 依据见 assets-src/0x72_DungeonTilesetII_v1.7/README.md。
   运行时不依赖 PNG：这里只在生成时把它们量化进 palette+rows。

   槽位高度是量出来的，不是估的（2026-10-25 实测）：
   - weapon_regular_sword.png 10×21
   - weapon_bow.png 内容包围盒 7×26（canvas 14×26，左侧留白）
   - characters/knight_m_idle_anim_f*.png 16×28
   所以"道具框"取 16×28：24 只能装下剑（21），弓（26）与人物（28）都装不下。 */
const WEAPON_SLOT = { w: 16, h: 28 };
const EXTERNAL: Record<string, { file: string; slot?: { w: number; h: number }; crop?: 'bbox'; remap?: Record<string, string> }> = {
  potion: { file: 'flask_big_red.png', remap: { '#da4e38': '#d46d49', '#c56025': '#a94725', '#8f4029': '#973716' } },
  bone: { file: 'skull.png' },
  heart: { file: 'ui_heart_full.png' },
  sword: { file: 'weapon_regular_sword.png', slot: WEAPON_SLOT, crop: 'bbox' },
  bow: { file: 'weapon_bow.png', slot: WEAPON_SLOT, crop: 'bbox' },
};
function packCells(cells: (string | null)[][]) {
  const seen = new Map<string, string>(); const palette: Record<string, string> = {}; const rows: string[] = [];
  cells.forEach(row => { let line = ''; row.forEach(c => {
    if (!c) { line += '.'; return; }
    if (!seen.has(c)) { const k = ALPHA[seen.size]; if (!k) throw new Error('色板超出 62 色'); seen.set(c, k); palette[k] = c; }
    line += seen.get(c); }); rows.push(line); });
  return { palette, rows };
}
function readPngCells(file: string, spec: { crop?: 'bbox'; slot?: { w: number; h: number }; remap?: Record<string, string>; bottom?: boolean }) {
  const png: any = PNG.sync.read(fs.readFileSync(file));
  const px = (x: number, y: number) => {
    const i = (png.width * y + x) << 2;
    if (png.data[i + 3] < 128) return null;
    let hex = '#' + [png.data[i], png.data[i + 1], png.data[i + 2]].map((v: number) => v.toString(16).padStart(2, '0')).join('');
    if (spec.remap?.[hex]) hex = spec.remap[hex];
    return hex;
  };
  // 手持物画布带留白（弓的内容只在右半边），按 alpha 包围盒裁剪后再落槽，
  // 否则底中对齐会把弓推到格子右侧
  let x0 = 0, y0 = 0, x1 = png.width, y1 = png.height;
  if (spec.crop === 'bbox') {
    x0 = png.width; y0 = png.height; x1 = -1; y1 = -1;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      if (!px(x, y)) continue;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    x1 += 1; y1 += 1;
  }
  const cw = x1 - x0, ch = y1 - y0;
  const slot = spec.slot ?? { w: 16, h: 16 };
  if (cw > slot.w || ch > slot.h) return { tooBig: `${cw}x${ch}` as const };
  const cells: (string | null)[][] = Array.from({ length: slot.h }, () => Array<string | null>(slot.w).fill(null));
  const ox = Math.floor((slot.w - cw) / 2);
  // 手持物站在格底（有握把），其余居中。
  // 角色必须贴底（bottom）：0x72 的角色画布尺寸并不统一（16×16 小怪 / 16×23 兽人 / 16×28 人形），
  // 居中会让小个子浮在半空、脚对不齐；贴底后所有角色共用同一条脚底基线。
  const oy = spec.bottom || spec.crop === 'bbox' ? slot.h - ch : Math.floor((slot.h - ch) / 2);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const c = px(x0 + x, y0 + y);
    if (c) cells[y + oy][x + ox] = c;
  }
  return { w: slot.w, h: slot.h, ...packCells(cells), offsetY: oy };
}
function externalTile(key: string) {
  const spec = EXTERNAL[key]; if (!spec) return null;
  const file = path.join(ROOT, 'assets-src/0x72_DungeonTilesetII_v1.7', spec.file);
  if (!fs.existsSync(file)) { console.warn(`  跳过 ${key}：缺少 ${spec.file}（请解压 0x72 包到 assets-src/）`); return null; }
  const tile = readPngCells(file, spec);
  if (!tile) return null;
  if ('tooBig' in tile) {
    const slot = spec.slot ?? { w: 16, h: 16 };
    console.warn(`  跳过 ${key}：内容 ${tile.tooBig} 超出 ${slot.w}×${slot.h} 槽位`);
    return null;
  }
  // offsetY 只服务于角色头部裁切，属于生成期中间量，不该写进 camp-tiles.ts
  const { offsetY: _offsetY, ...plain } = tile;
  return plain;
}

/* ---------- 外部 CC0 覆盖：0x72 角色（4 帧待机动画 + 头像裁切） ----------
   人物画布尺寸不统一（实测）：16×28 人形（knight/elf/dwarf/wizzard/lizard）、
   16×23 兽人（orc_warrior/orc_shaman/chort）、16×16 小怪（goblin/imp）。
   因此一律贴底落槽（bottom），否则小个子会浮空、脚对不齐。
   `ogre`(32×36, 内容宽 20) 与 `big_demon`(32×36, 内容宽 23) 超 16 宽槽位，未采用。

   headRows 是**原画布行号**（由 /tmp 测量脚本逐行量出），裁切时再加贴底偏移 offsetY。
   全部统一 8 行高，头像框才能共用 16×8 的规格。 */
const CHARACTER_SRC: Record<string, { prefix: string; headRows: [number, number] }> = {
  // 原有两个：骑士羽饰起于第 10 行、精灵帽子起于第 12 行
  knight: { prefix: 'knight_m_idle_anim_f', headRows: [10, 18] },
  elf: { prefix: 'elf_f_idle_anim_f', headRows: [12, 20] },
  // 新增十个：行区间取自各自的 rowWidths 突变处（肩膀变宽之前）
  knightess: { prefix: 'knight_f_idle_anim_f', headRows: [10, 18] },
  ranger: { prefix: 'elf_m_idle_anim_f', headRows: [9, 17] },
  dwarf: { prefix: 'dwarf_m_idle_anim_f', headRows: [7, 15] },
  wizard: { prefix: 'wizzard_m_idle_anim_f', headRows: [11, 19] },
  lizard: { prefix: 'lizard_m_idle_anim_f', headRows: [11, 19] },
  orc: { prefix: 'orc_warrior_idle_anim_f', headRows: [7, 15] },
  shaman: { prefix: 'orc_shaman_idle_anim_f', headRows: [8, 16] },
  goblin: { prefix: 'goblin_idle_anim_f', headRows: [6, 14] },
  chort: { prefix: 'chort_idle_anim_f', headRows: [5, 13] },
  imp: { prefix: 'imp_idle_anim_f', headRows: [4, 12] },
  zombie: { prefix: 'tiny_zombie_idle_anim_f', headRows: [6, 14] },
};
const CHARACTER_FRAME_COUNT = 4;
function characterTiles() {
  const out: Record<string, unknown> = {};
  const heads: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(CHARACTER_SRC)) {
    const tiles: { palette: Record<string, string>; rows: string[] }[] = [];
    let offsetY = 0;
    let missing = false;
    for (let i = 0; i < CHARACTER_FRAME_COUNT; i++) {
      const file = path.join(ROOT, 'assets-src/0x72_DungeonTilesetII_v1.7/characters', `${spec.prefix}${i}.png`);
      // 缺帧只跳过这一个角色，不连坐后面十个
      if (!fs.existsSync(file)) { console.warn(`  跳过角色 ${key}：缺少 ${path.basename(file)}`); missing = true; break; }
      const tile = readPngCells(file, { slot: { w: 16, h: 28 }, bottom: true });
      if (!tile || 'tooBig' in tile) { console.warn(`  跳过角色 ${key}：${path.basename(file)} 超出 16×28`); missing = true; break; }
      offsetY = tile.offsetY;
      const { offsetY: _o, ...plain } = tile;
      tiles.push({ palette: plain.palette, rows: plain.rows });
    }
    if (missing) continue;
    tiles.forEach((tile, i) => { out[`char_${key}_${i}`] = { w: 16, h: 28, ...tile }; });
    // 头部：按原画布行号切，再补上贴底偏移；裁完仍用首帧的调色板打包
    const [from, to] = spec.headRows;
    const headRows = tiles[0].rows.slice(from + offsetY, to + offsetY);
    heads[`head_${key}`] = {
      w: 16,
      h: headRows.length,
      ...packCells(headRows.map(row => row.split('').map(ch => (ch === '.' ? null : tiles[0].palette[ch])))),
    };
  }
  return { out, heads };
}

// ---------- 导出 ----------
function toData(g: Grid) {
  const seen = new Map<string, string>(); const palette: Record<string, string> = {}; const rows: string[] = [];
  g.cells.forEach(row => {
    let line = '';
    row.forEach(c => {
      if (!c) { line += '.'; return; }
      const h = hex(c);
      if (!seen.has(h)) { const key = ALPHA[seen.size]; seen.set(h, key); palette[key] = h; }
      line += seen.get(h);
    });
    rows.push(line);
  });
  return { palette, rows };
}

const itemOut: Record<string, unknown> = {}, blockOut: Record<string, unknown> = {};
const overridden: string[] = [];
for (const [name, fn] of Object.entries(ITEMS)) {
  const g = new Grid(16, name === 'villagerA' || name === 'villagerB' ? 32 : 16); fn(g); outline(g);
  const ext = externalTile(name);
  if (ext) { itemOut[name] = ext; overridden.push(`${name}←${EXTERNAL[name].file}`); } else itemOut[name] = { w: 16, h: g.h, ...toData(g) };
}
// 0x72 角色：4 帧待机 + 头部裁切（缺 PNG 时整组跳过，渲染端回落到程序化 villagerA/B）
const character = characterTiles();
Object.assign(itemOut, character.out, character.heads);
if (Object.keys(character.out).length) {
  const roles = new Set(Object.keys(character.out).map(k => k.replace(/^char_/, '').replace(/_\d$/, '')));
  overridden.push(`${roles.size} 个角色←${Object.keys(character.out).length} 帧 + ${Object.keys(character.heads).length} 头像`);
}
for (const [name, fn] of Object.entries(BLOCKS)) {
  const g = new Grid(16, 16); fn(g);
  const tint = TINTS[name];
  if (tint) g.cells.forEach((row, y) => row.forEach((c, x) => { if (c) g.set(x, y, mix(c, tint, 0.45)); }));
  blockOut[name] = { ...toData(g) };
}
// 3D 角色正脸（8×8，供 textures.ts 渲染头部正面）
const face = new Grid(8, 8);
rect(face, 0, 0, 8, 8, MAT.skin, 0);
face.set(1, 3, MAT.bone[2]); face.set(2, 3, MAT.ink[1]); face.set(5, 3, MAT.bone[2]); face.set(6, 3, MAT.ink[1]);
face.set(3, 5, MAT.skin[1]); face.set(4, 5, MAT.skin[1]);
face.set(2, 6, MAT.ruby[1]); face.set(3, 6, MAT.ruby[1]); face.set(4, 6, MAT.ruby[1]); face.set(5, 6, MAT.ruby[1]);
rect(face, 0, 0, 8, 1, MAT.bark, 1); face.set(0, 1, MAT.bark[1]); face.set(7, 1, MAT.bark[1]);

const banner = (extra: string) => `// 由 scripts/gen-pixel-art.ts 程序化生成，请勿手改；改动请改生成器后运行 npm run gen:art
// 原为 Minecraft 逐像素转录数据，已替换为项目原创的程序化像素（无第三方位素材、无 EULA 负担）。${extra}`;
const ifaceItem = `export interface CampTile { w: number; h: number; palette: Record<string, string>; rows: string[] }`;
fs.writeFileSync(path.join(ROOT, 'src/components/game/voxel/primitives/camp-tiles.ts'),
  banner('') + '\n' + ifaceItem + '\nexport const CAMP_TILES: Record<string, CampTile> = ' + JSON.stringify(itemOut, null, 2) + ';\n');
const ifaceBlock = `export interface CampBlock { palette: Record<string, string>; rows: string[] }`;
fs.writeFileSync(path.join(ROOT, 'src/components/game/voxel3d/camp-blocks.ts'),
  banner('\n// 草/树叶已按群系色着色，渲染端不再需要乘 tint。') + '\n' + ifaceBlock + '\nexport const CAMP_BLOCKS: Record<string, CampBlock> = ' + JSON.stringify(blockOut, null, 2) +
  '\nexport const CAMP_FACE: CampBlock = ' + JSON.stringify(toData(face), null, 2) + ';\n');

console.log('items', Object.keys(itemOut).length, '| blocks', Object.keys(blockOut).length, '| face 8x8 ok');
const sizes = Object.entries(itemOut).map(([k, v]: any) => `${k}:${new Set(v.rows.join('').split('').filter((c: string) => c !== '.')).size}色`);
console.log(sizes.join(' '));
if (overridden.length) console.log('0x72 覆盖生效：', overridden.join(', '));
