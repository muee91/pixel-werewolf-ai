import * as THREE from 'three';
import { pixelTexture, type TexName } from './textures';

// 共享材质池：按「颜色 + 粗糙度 + 自发光」缓存材质实例。
// 场景里有数百个 mesh，各自内联 <meshStandardMaterial> 会产生同等数量的材质实例；
// 池化后相同外观的 mesh 共享同一份材质，显著降低切换开销与内存，也让调色保持一致。
const cache = new Map<string, THREE.MeshStandardMaterial>();

export interface SharedMatOptions {
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export function sharedMat(color: string, opts?: SharedMatOptions): THREE.MeshStandardMaterial {
  const key = `${color}|${opts?.roughness ?? 0.9}|${opts?.emissive ?? ''}|${opts?.emissiveIntensity ?? 1}|${opts?.transparent ? 1 : 0}|${opts?.opacity ?? 1}`;
  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: opts?.roughness ?? 0.9,
      metalness: 0,
      emissive: opts?.emissive ?? '#000000',
      emissiveIntensity: opts?.emissiveIntensity ?? 1,
      transparent: opts?.transparent ?? false,
      opacity: opts?.opacity ?? 1,
    });
    cache.set(key, mat);
  }
  return mat;
}

// ── 方块贴图材质（MC 风格） ──────────────────────────────
// 按「类型 + 平铺次数」缓存；grass 是多面材质（顶面草、侧面草皮、底面土）。

const blockCache = new Map<string, THREE.Material | THREE.Material[]>();

export type BlockKind = 'grass' | 'dirt' | 'stone' | 'cobble' | 'log' | 'leaves' | 'planks' | 'birch' | 'hay' | 'sand';

export function blockMat(kind: BlockKind, rx = 1, rz = 1): THREE.Material | THREE.Material[] {
  const key = `${kind}|${rx}|${rz}`;
  let m = blockCache.get(key);
  if (!m) {
    const tiled = (name: TexName, rxx = rx, rzz = rz) => {
      const t = pixelTexture(name).clone();
      t.needsUpdate = true;
      t.repeat.set(rxx, rzz);
      return t;
    };
    const std = (tex: THREE.Texture) =>
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    if (kind === 'grass') {
      // 面序：+x -x +y -y +z -z
      m = [
        std(tiled('grassSide')),
        std(tiled('grassSide')),
        std(tiled('grassTop')),
        std(tiled('dirt')),
        std(tiled('grassSide')),
        std(tiled('grassSide')),
      ];
    } else {
      const name: TexName =
        kind === 'log' ? 'logSide' :
        kind === 'dirt' ? 'dirt' :
        kind === 'stone' ? 'stone' :
        kind === 'cobble' ? 'cobble' :
        kind === 'leaves' ? 'leaves' :
        kind === 'birch' ? 'birchSide' :
        kind === 'hay' ? 'hay' :
        kind === 'sand' ? 'sand' : 'planks';
      m = std(tiled(name));
    }
    blockCache.set(key, m);
  }
  return m;
}

// ── 贴图材质（按纹理实例缓存） ────────────────────────────

const texMatCache = new Map<THREE.Texture, THREE.MeshStandardMaterial>();

export function texturedMat(tex: THREE.Texture): THREE.MeshStandardMaterial {
  let m = texMatCache.get(tex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    texMatCache.set(tex, m);
  }
  return m;
}
