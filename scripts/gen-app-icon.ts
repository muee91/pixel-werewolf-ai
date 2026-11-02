/// <reference types="node" />
/**
 * App 图标生成器（合规版·原创）
 * ⚠️ 当前仓库里 build/icon.icns 是**旧版 Steve 脸 + Minecraft 狼**（作者指定恢复），
 *    不是本脚本的产物。若运行 npm run gen:icon，会把它覆盖成「夜色渐变 + 营火」。
 *    两者的取舍：旧图标辨识度高，但元素来自 Minecraft（受 Mojang EULA 约束），
 *    对外分发有风险；篝火版是本脚本程序化生成、元素全部自有，可安全分发。
 *    运行：npm run gen:icon（需要 macOS 的 iconutil）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { CAMP_TILES } from '../src/components/game/voxel/primitives/camp-tiles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = 16;
const type: any = PNG;
const canvas = new type({ width: S, height: S });
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const night = rgb('#20304a'), ember = rgb('#7a3f16'), gold = rgb('#f6b443'), ink = rgb('#24170e');
const put = (x: number, y: number, c: number[]) => { const i = (S * y + x) << 2; canvas.data[i] = c[0]; canvas.data[i + 1] = c[1]; canvas.data[i + 2] = c[2]; canvas.data[i + 3] = 255; };

// 背景：夜空→余烬的竖向渐变 + 几颗星
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const t = y / (S - 1);
  put(x, y, [night[0] + (ember[0] - night[0]) * t, night[1] + (ember[1] - night[1]) * t, night[2] + (ember[2] - night[2]) * t]);
}
[[2, 2], [12, 1], [9, 3], [4, 4]].forEach(([x, y]) => put(x, y, [232, 236, 240]));

// 营火贴图压在中央
const fire = CAMP_TILES.campfire;
fire.rows.forEach((row: string, y: number) => [...row].forEach((ch: string, x: number) => {
  if (ch === '.') return;
  const c = rgb((fire.palette as any)[ch]);
  put(x, y + 1, c);
}));
// 1px 金色内框（小尺寸下更醒目）
for (let i = 0; i < S; i++) { put(i, 0, gold); put(i, S - 1, ink); put(0, i, gold); put(S - 1, i, ink); }

const sizes = [16, 32, 64, 128, 256, 512, 1024];
const tmp = fs.mkdtempSync('/tmp/campicon-');
const dir = path.join(tmp, 'icon.iconset');
fs.mkdirSync(dir, { recursive: true });
const scale = (n: number) => {
  const out = new type({ width: n, height: n });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sx = Math.floor(x / n * S), sy = Math.floor(y / n * S);
    const si = (S * sy + sx) << 2, oi = (n * y + x) << 2;
    for (let k = 0; k < 4; k++) out.data[oi + k] = canvas.data[si + k];
  }
  return out;
};
sizes.forEach(n => {
  const file = path.join(dir, `icon_${n}x${n}.png`);
  fs.writeFileSync(file, type.sync.write(scale(n)));
  if (n * 2 <= 1024) fs.writeFileSync(path.join(dir, `icon_${n}x${n}@2x.png`), type.sync.write(scale(n * 2)));
});
fs.writeFileSync(path.join(ROOT, 'build/icon-1024.png'), type.sync.write(scale(1024)));
try {
  execFileSync('iconutil', ['-c', 'icns', dir, '-o', path.join(ROOT, 'build/icon.icns')], { stdio: 'inherit' });
  console.log('build/icon.icns 已重生成（原创营火徽记）');
} catch (e) {
  console.log('iconutil 不可用，已写出 PNG 图标组：', dir);
}
fs.rmSync(tmp, { recursive: true, force: true });
