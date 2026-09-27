import React, { useMemo, useCallback, useRef, useLayoutEffect, useState, useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  buildSeatPlacements,
  buildVisibleAvatarDescriptor,
  getWorldTerrain,
  type WorldTerrain,
  type VisiblePlayer,
} from './sceneModel';
import { VoxelCharacter } from './VoxelCharacter';
import { WorldEffects } from './WorldEffects';
import { SceneDirector } from './SceneDirector';
import { SkillEffects } from './SkillEffects';
import type { CameraStyle } from './cameraDirectorModel';
import { sharedMat, blockMat } from './materials';
import type { SkillEffectEvent } from './skillEffectModel';

// ── Shared geometry/material pools ───────────────────────

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// 配色由方块贴图（textures.ts + materials.ts）提供，这里不再维护色板常量。

interface ForestCampSceneProps {
  players: VisiblePlayer[];
  currentSpeakerId: number | null;
  isNight: boolean;
  effectLevel: 'subtle' | 'medium' | 'intense';
  manualControlActive?: boolean;
  controlsRef?: RefObject<OrbitControlsImpl | null>;
  selectedPlayerId?: number | null;
  onNpcClick?: (playerId: number) => void;
  skillEvents?: SkillEffectEvent[];
  dialogueMode?: boolean;
  dialogueConcealed?: boolean;
  snapDialogueCamera?: boolean;
  /** 运镜方式 */
  cameraStyle?: CameraStyle;
}

// ── Campfire（火星上升 + 烟雾 + 多层火苗摆动） ────────────

// ── MC 原版火焰:交叉双面片 + 程序化逐帧火焰纹理 ──────────
// 原版算法:16×16 纹理,每列火舌高度随机游走 + 邻列平滑,
// 火苗底部白黄、中段橙、尖端红且透明渐隐;以 ~11fps 逐帧重绘。

let fireCanvas: HTMLCanvasElement | null = null;
// Node 环境(单测导入)不触 DOM,首次绘制时才创建
const getFireCanvas = (): HTMLCanvasElement => {
    if (!fireCanvas) {
        fireCanvas = document.createElement('canvas');
        fireCanvas.width = 16;
        fireCanvas.height = 16;
    }
    return fireCanvas;
};

const drawFireFrame = (heights: Float32Array) => {
    const ctx = getFireCanvas().getContext('2d')!;
    ctx.clearRect(0, 0, 16, 16);
    for (let x = 0; x < 16; x++) {
        const h = Math.round(heights[x]);
        for (let y = 0; y < h; y++) {
            const frac = (h - y) / h;            // 0=尖端 1=根部
            ctx.fillStyle = frac > 0.8 ? '#fff3b0'
                : frac > 0.5 ? '#ffd45a'
                : frac > 0.25 ? '#f6923a'
                : '#e0401a';
            ctx.globalAlpha = frac > 0.92 ? 0.5 : Math.min(1, 0.35 + frac * 0.75);
            ctx.fillRect(x, 15 - y, 1, 1);
        }
    }
    ctx.globalAlpha = 1;
};

const Campfire: React.FC = () => {
  const flameTex = useMemo(() => {
      const tex = new THREE.CanvasTexture(fireCanvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
  }, []);
  const accRef = useRef(0);
  const heightsRef = useRef(new Float32Array(16));
  const sparksRef = useRef<THREE.InstancedMesh>(null);
  const embersRef = useRef<THREE.InstancedMesh>(null);
  const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ camera, clock }, delta) => {
      // 朝向相机交叉成 X 形(MC 火焰块的双面片布局)
      const yaw = Math.atan2(camera.position.x, camera.position.z);
      accRef.current += delta;
      // ~11fps 重绘火焰纹理,与原版节奏一致
      if (accRef.current >= 0.09) {
          accRef.current = 0;
          const heights = heightsRef.current;
          const frame = Math.floor(performance.now() / 90);
          for (let x = 0; x < 16; x++) {
              const wave = 5 + 4 * Math.abs(Math.sin(x * 0.8 + Math.floor(frame / 3) * 1.7));
              const jitter = Math.random() * 3.2;
              heights[x] = Math.max(1, Math.min(16, wave + jitter));
          }
          for (let x = 1; x < 15; x++) {
              heights[x] = (heights[x - 1] + heights[x] * 2 + heights[x + 1]) / 4;
          }
          drawFireFrame(heights);
          flameTex.needsUpdate = true;
      }
      // 火星:循环上升、逐渐缩小（用缩放代替透明度，保持共享材质）
      if (sparksRef.current) {
        for (let i = 0; i < 14; i++) {
          const phase = (i * 0.618) % 1;
          const life = (clock.elapsedTime * 0.4 + phase) % 1;
          dummy.position.set(
            Math.sin(clock.elapsedTime * 2 + i * 2.1) * 0.14 + Math.sin(i * 5.3) * 0.18,
            0.6 + life * 2.6,
            Math.cos(clock.elapsedTime * 1.7 + i * 1.3) * 0.14 + Math.cos(i * 3.7) * 0.18,
          );
          const s = Math.max(0.02, 0.085 * (1 - life));
          dummy.scale.set(s, s * 1.7, s);
          dummy.rotation.set(0, clock.elapsedTime + i, 0);
          dummy.updateMatrix();
          sparksRef.current.setMatrixAt(i, dummy.matrix);
        }
        sparksRef.current.instanceMatrix.needsUpdate = true;
      }
      // 余烬床:贴地红热点随机明灭
      if (embersRef.current) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.3;
          const glow = 0.5 + 0.5 * Math.sin(clock.elapsedTime * (2.2 + i * 0.7) + i * 1.9);
          dummy.position.set(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55);
          const s = 0.05 + glow * 0.04;
          dummy.scale.set(s, s * 0.5, s);
          dummy.updateMatrix();
          embersRef.current.setMatrixAt(i, dummy.matrix);
        }
        embersRef.current.instanceMatrix.needsUpdate = true;
      }
      // 烟：上升 + 膨胀 + 轻微摆动
      smokeRefs.current.forEach((mesh, i) => {
        if (!mesh) return;
        const phase = (i * 0.37) % 1;
        const life = (clock.elapsedTime * 0.16 + phase) % 1;
        mesh.position.y = 1.9 + life * 3.6;
        mesh.position.x = Math.sin(clock.elapsedTime * 0.6 + i * 2.4) * 0.34 * life;
        mesh.scale.setScalar(0.2 + life * 0.9);
        mesh.rotation.y = clock.elapsedTime * 0.4 + i;
      });
  });

  return <group position={[0, 0, 0]}>
    {Array.from({ length: 10 }, (_, index) => {
      const angle = index / 10 * Math.PI * 2;
      return (
        <mesh
          key={index}
          geometry={boxGeo}
          position={[Math.cos(angle) * 0.82, 0.12, Math.sin(angle) * 0.82]}
          scale={[0.38, 0.24, 0.3]}
          rotation={[0, -angle, 0]}
          material={blockMat('cobble', 1, 1)}
        />
      );
    })}
    {/* Log base */}
    <mesh geometry={boxGeo} position={[-0.3, 0.15, 0]} scale={[0.8, 0.2, 0.2]} rotation={[0, 0.4, 0]} material={blockMat('log', 1, 1)} />
    <mesh geometry={boxGeo} position={[0.2, 0.15, 0.1]} scale={[0.7, 0.2, 0.2]} rotation={[0, -0.3, 0]} material={blockMat('log', 1, 1)} />
    {/* 余烬床:贴地红热点 */}
    <instancedMesh ref={embersRef} args={[boxGeo, sharedMat('#e0431f', { emissive: '#e0431f', emissiveIntensity: 2.4 }), 8]} frustumCulled={false} />
    {/* MC 火焰:交叉双面片,双面渲染 + 发光 */}
    <mesh position={[0, 0.85, 0]}>
        <planeGeometry args={[1.5, 1.7]} />
        <meshBasicMaterial map={flameTex} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0.85, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.5, 1.7]} />
        <meshBasicMaterial map={flameTex} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
    {/* 火星 */}
    <instancedMesh ref={sparksRef} args={[boxGeo, sharedMat('#ffd27a', { emissive: '#ffb84d', emissiveIntensity: 3 }), 14]} frustumCulled={false} />
    {/* 烟 */}
    {Array.from({ length: 6 }, (_, i) => (
      <mesh
        key={`smoke-${i}`}
        ref={(el) => { smokeRefs.current[i] = el; }}
        geometry={boxGeo}
        position={[0, 2, 0]}
        material={sharedMat('#9aa2a8', { roughness: 1, transparent: true, opacity: 0.16 })}
      />
    ))}
  </group>;
};

// ── Torch（火光微摆） ─────────────────────────────────────

const Torch: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const headRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!headRef.current) return;
    const t = clock.elapsedTime;
    headRef.current.scale.y = 0.2 + Math.sin(t * 8.5 + position[0]) * 0.045;
    headRef.current.position.x = Math.sin(t * 5.1 + position[2]) * 0.015;
  });
  return (
    <group position={position}>
      <mesh geometry={boxGeo} position={[0, 0.5, 0]} scale={[0.08, 1, 0.08]} material={blockMat('log', 1, 1)} />
      <mesh ref={headRef} geometry={boxGeo} position={[0, 1.1, 0]} scale={[0.18, 0.2, 0.18]} material={sharedMat('#e05a2f', { emissive: '#e05a2f', emissiveIntensity: 1.5 })} />
      <mesh geometry={boxGeo} position={[0, 1.25, 0]} scale={[0.1, 0.15, 0.1]} material={sharedMat('#fff0a2', { emissive: '#fff0a2', emissiveIntensity: 2 })} />
    </group>
  );
};

// ── Forest valley terrain ────────────────────────────────

// ── 草丛（外围环带，InstancedMesh，避免与座位环重叠） ─────

const GrassTufts: React.FC<{ heightAt: (x: number, z: number) => number }> = ({ heightAt }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < 64; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 5.8 + Math.random() * 24;
      const gx = Math.cos(angle) * radius;
      const gz = Math.sin(angle) * radius;
      dummy.position.set(gx, heightAt(gx, gz) + 0.18, gz);
      dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
      const s = 0.6 + Math.random() * 0.8;
      dummy.scale.set(0.16 * s, 0.24 * s, 0.16 * s);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      color.set(Math.random() < 0.5 ? '#3fa03c' : '#57b549');
      ref.current.setColorAt(i, color);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[boxGeo, sharedMat('#ffffff', { roughness: 1 }), 64]} frustumCulled={false} />
  );
};

// ── Wooden cabin (background decoration) ─────────────────

const Cabin: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    <mesh geometry={boxGeo} position={[0, 0.6, 0]} scale={[2, 1.2, 1.6]} castShadow material={blockMat('planks', 2, 1)} />
    <mesh geometry={boxGeo} position={[0, 1.6, 0]} scale={[2.3, 0.4, 1.8]} rotation={[0, 0, 0]} castShadow material={blockMat('log', 3, 1)} />
    <mesh geometry={boxGeo} position={[0, 0.4, 0.81]} scale={[0.5, 0.7, 0.02]} material={sharedMat('#2a1a11')} />
    {/* 烟囱 */}
    <mesh geometry={boxGeo} position={[0.7, 1.9, -0.4]} scale={[0.3, 0.9, 0.3]} castShadow material={blockMat('cobble', 1, 2)} />
  </group>
);

// ── 方块世界（InstancedMesh 渲染，数千方块仅数次 draw call） ──

const BlockyWorld: React.FC<{ terrain: WorldTerrain; focusPoints: { x: number; y: number; z: number }[] }> = ({ terrain, focusPoints }) => {
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const dirtRef = useRef<THREE.InstancedMesh>(null);
  const waterRef = useRef<THREE.InstancedMesh>(null);
  const sandRef = useRef<THREE.InstancedMesh>(null);
  const stoneRef = useRef<THREE.InstancedMesh>(null);
  const logRef = useRef<THREE.InstancedMesh>(null);
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const birchRef = useRef<THREE.InstancedMesh>(null);

  const scales = useRef<number[]>([]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const fill = (
      ref: { current: THREE.InstancedMesh | null },
      list: { x: number; y: number; z: number }[],
    ) => {
      if (!ref.current) return;
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ref.current.setMatrixAt(i, dummy.matrix);
      });
      ref.current.instanceMatrix.needsUpdate = true;
    };
    fill(grassRef, terrain.grass);
    fill(dirtRef, terrain.dirt);
    fill(waterRef, terrain.water);
    fill(sandRef, terrain.sand);
    fill(stoneRef, terrain.stone);
    fill(logRef, terrain.log);
    fill(birchRef, terrain.birchLog);
    fill(leavesRef, terrain.leaves);
    scales.current = new Array(terrain.trees.length).fill(1);
  }, [terrain]);

  // 树木遮挡沉降:树心挡在"相机→关注点(营地/任一座位)"连线上时整树缩没,转开后长回。
  // 只沉真正挡人的树,远景树不受影响;触碰过的树恢复到精确 1 才停,杜绝悬空树冠。
  useFrame(({ camera, clock }, delta) => {
    const trees = terrain.trees;
    if (!trees.length) return;
    if (scales.current.length !== trees.length) scales.current = new Array(trees.length).fill(1);
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const k = 1 - Math.exp(-delta * 9);
    let dirty = false;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      let target = 1;
      // 树冠中部高度(y≈4.2)到各视线段的最近距离
      const tx = t.x - camX;
      const tz = t.z - camZ;
      for (let p = 0; p < focusPoints.length; p++) {
        const fp = focusPoints[p];
        const sx = fp.x - camX;
        const sy = fp.y - camY;
        const sz = fp.z - camZ;
        const len2 = sx * sx + sy * sy + sz * sz || 1;
        const proj = (tx * sx + (4.2 - camY) * sy + tz * sz) / len2;
        if (proj <= 0.05 || proj >= 1) continue;
        const dx = tx - sx * proj;
        const dy = 4.2 - camY - sy * proj;
        const dz = tz - sz * proj;
        if (dx * dx + dy * dy + dz * dz < 2.2 * 2.2) {
          target = 0;
          break;
        }
      }
      const cur = scales.current[i];
      let next = cur + (target - cur) * k;
      // 收敛判定:足够接近目标时钉死在目标值,保证恢复一定完成
      if (Math.abs(target - next) < 0.01) next = target;
      if (next !== cur) {
        scales.current[i] = next;
        dirty = true;
      }
    }
    if (!dirty) return;
    const apply = (ref: React.RefObject<THREE.InstancedMesh | null>, blocks: { x: number; y: number; z: number; t?: number }[]) => {
      const mesh = ref.current;
      if (!mesh) return;
      const dummy = new THREE.Object3D();
      blocks.forEach((b, i) => {
        const s = b.t == null ? 1 : scales.current[b.t];
        // 只有被沉降触碰过(≠1)的方块才写矩阵;写矩阵必然把 scale 精确放回 1 后才停止
        if (s === undefined || s === 1) return;
        dummy.position.set(b.x, b.y, b.z);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    apply(logRef, terrain.log);
    apply(birchRef, terrain.birchLog);
    apply(leavesRef, terrain.leaves);
  });

  return (
    <>
      <instancedMesh ref={grassRef} args={[boxGeo, blockMat('grass', 1, 1), Math.max(1, terrain.grass.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={dirtRef} args={[boxGeo, blockMat('dirt', 1, 1), Math.max(1, terrain.dirt.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={waterRef} args={[boxGeo, sharedMat('#3d86ad', { transparent: true, opacity: 0.75, roughness: 0.3 }), Math.max(1, terrain.water.length)]} frustumCulled={false} />
      <instancedMesh ref={sandRef} args={[boxGeo, blockMat('sand', 1, 1), Math.max(1, terrain.sand.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={stoneRef} args={[boxGeo, blockMat('stone', 1, 1), Math.max(1, terrain.stone.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={logRef} args={[boxGeo, blockMat('log', 1, 1), Math.max(1, terrain.log.length)]} castShadow frustumCulled={false} />
      <instancedMesh ref={birchRef} args={[boxGeo, blockMat('birch', 1, 1), Math.max(1, terrain.birchLog.length)]} castShadow frustumCulled={false} />
      <instancedMesh ref={leavesRef} args={[boxGeo, blockMat('leaves', 1, 1), Math.max(1, terrain.leaves.length)]} castShadow frustumCulled={false} />
      {terrain.rocks.map((r, i) => (
        <mesh
          key={`rock-${i}`}
          geometry={boxGeo}
          position={[r.x, r.y, r.z]}
          scale={[r.s, r.s * 0.6, r.s * 0.8]}
          rotation={[0, i * 1.7, 0]}
          castShadow
          material={blockMat('cobble', 1, 1)}
        />
      ))}
    </>
  );
};

// ── 村落群：房屋 / 水井 / 瞭望塔 / 农田 / 灯火柱 ───────────

const HouseMC: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  w?: number;
  d?: number;
  h?: number;
}> = ({ position, rotationY = 0, w = 4, d = 3, h = 2 }) => (
  <group position={position} rotation={[0, rotationY, 0]}>
    <mesh geometry={boxGeo} position={[0, h / 2, 0]} scale={[w, h, d]} castShadow material={blockMat('planks', Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)))} />
    {[[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([cx, cz], i) => (
      <mesh key={i} geometry={boxGeo} position={[cx, h / 2 + 0.1, cz]} scale={[0.24, h + 0.2, 0.24]} castShadow material={blockMat('log', 1, Math.round(h * 2))} />
    ))}
    <mesh geometry={boxGeo} position={[0, 0.55, d / 2 + 0.02]} scale={[0.6, 1.1, 0.06]} material={sharedMat('#3a2517')} />
    <mesh geometry={boxGeo} position={[w / 2 - 0.7, h * 0.6, d / 2 + 0.02]} scale={[0.5, 0.5, 0.04]} material={sharedMat('#f6d78a', { emissive: '#f6d78a', emissiveIntensity: 0.9 })} />
    <mesh geometry={boxGeo} position={[0, h + 0.18, 0]} scale={[w + 0.5, 0.36, d + 0.5]} castShadow material={blockMat('log', Math.max(1, Math.round(w / 2)), 1)} />
    <mesh geometry={boxGeo} position={[0, h + 0.52, 0]} scale={[w - 0.6, 0.32, d - 0.3]} castShadow material={blockMat('planks', Math.max(1, Math.round(w / 2)), 1)} />
  </group>
);

const Well: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {[[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]].map(([cx, cz], i) => (
      <mesh key={i} geometry={boxGeo} position={[cx, 0.3, cz]} scale={[0.5, 0.6, 0.5]} castShadow material={blockMat('cobble', 1, 1)} />
    ))}
    <mesh geometry={boxGeo} position={[0, 0.42, 0]} scale={[0.62, 0.1, 0.62]} material={sharedMat('#3d86ad', { transparent: true, opacity: 0.85 })} />
    <mesh geometry={boxGeo} position={[-0.55, 0.9, 0]} scale={[0.1, 1.2, 0.1]} castShadow material={blockMat('log', 1, 2)} />
    <mesh geometry={boxGeo} position={[0.55, 0.9, 0]} scale={[0.1, 1.2, 0.1]} castShadow material={blockMat('log', 1, 2)} />
    <mesh geometry={boxGeo} position={[0, 1.55, 0]} scale={[1.4, 0.16, 0.9]} castShadow material={blockMat('planks', 1, 1)} />
  </group>
);

const WatchTower: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {[[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([cx, cz], i) => (
      <mesh key={i} geometry={boxGeo} position={[cx, 2.25, cz]} scale={[0.22, 4.5, 0.22]} castShadow material={blockMat('log', 1, 5)} />
    ))}
    <mesh geometry={boxGeo} position={[0, 4.65, 0]} scale={[2.2, 0.24, 2.2]} castShadow material={blockMat('planks', 2, 2)} />
    <mesh geometry={boxGeo} position={[0, 5.05, 0]} scale={[1.9, 0.5, 1.9]} castShadow material={blockMat('planks', 2, 1)} />
    <mesh geometry={boxGeo} position={[0, 5.4, 0]} scale={[2.4, 0.14, 2.4]} castShadow material={blockMat('log', 2, 1)} />
    <mesh geometry={boxGeo} position={[0, 5.85, 0.7]} scale={[0.14, 0.7, 0.14]} material={blockMat('log', 1, 1)} />
  </group>
);

const FarmPlot: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    <mesh geometry={boxGeo} position={[0, 0.06, 0]} scale={[7, 0.12, 3.4]} receiveShadow material={blockMat('dirt', 4, 2)} />
    {[-2.4, -1.2, 0, 1.2, 2.4].map((x, i) => (
      <mesh key={i} geometry={boxGeo} position={[x, 0.28, 0]} scale={[0.55, 0.34, 2.9]} material={sharedMat(i % 2 ? '#d4a843' : '#c69a38')} />
    ))}
    {[-3.6, 3.6].map((z, i) => (
      <group key={`fence-${i}`}>
        {[-3.2, -1.6, 0, 1.6, 3.2].map((x, j) => (
          <mesh key={j} geometry={boxGeo} position={[x, 0.5, z]} scale={[0.12, 1, 0.12]} material={blockMat('log', 1, 1)} />
        ))}
        <mesh geometry={boxGeo} position={[0, 0.85, z]} scale={[7, 0.1, 0.12]} material={blockMat('planks', 4, 1)} />
      </group>
    ))}
  </group>
);

const LanternPost: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    <mesh geometry={boxGeo} position={[0, 1.1, 0]} scale={[0.12, 2.2, 0.12]} castShadow material={blockMat('log', 1, 2)} />
    <mesh geometry={boxGeo} position={[0, 2.3, 0]} scale={[0.3, 0.34, 0.3]} material={sharedMat('#f6d78a', { emissive: '#ffd27a', emissiveIntensity: 1.6 })} />
    <mesh geometry={boxGeo} position={[0, 2.52, 0]} scale={[0.38, 0.08, 0.38]} castShadow material={blockMat('cobble', 1, 1)} />
  </group>
);

const Pond: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    <mesh geometry={boxGeo} position={[0, -0.32, 0]} scale={[6, 0.36, 4]} material={blockMat('dirt', 3, 2)} />
    <mesh geometry={boxGeo} position={[0, -0.12, 0]} scale={[5.2, 0.12, 3.2]} material={sharedMat('#3d86ad', { transparent: true, opacity: 0.8, roughness: 0.3 })} />
  </group>
);

// ── Main scene ───────────────────────────────────────────

export const ForestCampScene: React.FC<ForestCampSceneProps> = ({
  players,
  currentSpeakerId,
  isNight,
  effectLevel,
  manualControlActive = false,
  controlsRef,
  selectedPlayerId = null,
  onNpcClick,
  skillEvents = [],
  dialogueMode = false,
  dialogueConcealed = false,
  snapDialogueCamera = false,
  cameraStyle = 'auto',
}) => {
  const seatPlacements = useMemo(() => buildSeatPlacements(players), [players]);
  const terrain = useMemo(() => getWorldTerrain(), []);

  const focusPoints = useMemo(() => [
    { x: 0, y: 1, z: 0 },
    ...seatPlacements.map(seat => ({ x: seat.x, y: seat.y, z: seat.z })),
  ], [seatPlacements]);

  const descriptorsBySeat = useMemo(
    () => new Map(players.map((player) => [
      player.seatNumber,
      buildVisibleAvatarDescriptor(player),
    ])),
    [players],
  );

  // 死亡惊吓:有人出局时,存活者集体跳起举手 1.6 秒
  const [startleActive, setStartleActive] = useState(false);
  const aliveIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const aliveNow = new Set(players.filter(p => p.status === 'ALIVE').map(p => p.id));
    const died = [...aliveIdsRef.current].filter(id => !aliveNow.has(id));
    aliveIdsRef.current = aliveNow;
    if (died.length === 0) return;
    setStartleActive(true);
    const timer = window.setTimeout(() => setStartleActive(false), 1600);
    return () => window.clearTimeout(timer);
  }, [players]);

  // Camera focus belongs exclusively to the RPG dialogue lane.  Game actions
  // can still render their effects, but a silent decision must never jerk the
  // audience away from the overview camera.
  const speakerSeat = useMemo(() => {
    if (currentSpeakerId == null) return null;
    const speaker = players.find((player) => player.id === currentSpeakerId);
    if (!speaker) return null;
    return seatPlacements.find((seat) => seat.seatNumber === speaker.seatNumber) ?? null;
  }, [currentSpeakerId, players, seatPlacements]);

  const focusX = dialogueMode && dialogueConcealed ? 0 : speakerSeat?.x ?? null;
  const focusZ = dialogueMode && dialogueConcealed ? 2.8 : speakerSeat?.z ?? null;

  const playerPositions = useMemo(() => {
    const positions = new Map<number, { x: number; y: number; z: number }>();
    for (const player of players) {
      const seat = seatPlacements.find(item => item.seatNumber === player.seatNumber);
      if (seat) positions.set(player.id, seat);
    }
    return positions;
  }, [players, seatPlacements]);

  const handleNpcClick = useCallback(
    (playerId: number) => {
      onNpcClick?.(playerId);
    },
    [onNpcClick],
  );

  // 火炬立在营地四角地面（N/E/S/W），与座位圈保持距离
  const torchPositions: [number, number, number][] = useMemo(
    () => [[5.8, 0, 0], [0, 0, 5.8], [-5.8, 0, 0], [0, 0, -5.8]],
    [],
  );

  return (
    <>
      {/* Camera director */}
      <SceneDirector
        focusSeatX={focusX}
        focusSeatZ={focusZ}
        isNight={isNight}
        manualControlActive={manualControlActive}
        controlsRef={controlsRef}
        dialogueMode={dialogueMode}
        snapDialogueCamera={snapDialogueCamera}
        cameraStyle={cameraStyle}
      />

      {/* Lighting, fog, particles */}
      <WorldEffects isNight={isNight} effectLevel={effectLevel} />

      {/* The world remains present during dialogue shots: characters speak in a
          blocky forest, not against an empty stage.  Only foreground
          players and active effects are isolated below. */}
      <BlockyWorld terrain={terrain} focusPoints={focusPoints} />
      {<GrassTufts heightAt={terrain.heightAt} />}
      {(
        <>
          <HouseMC position={[13, terrain.heightAt(13, -5), -5]} rotationY={-0.25} />
          <HouseMC position={[-12, terrain.heightAt(-12, -12), -12]} rotationY={0.5} w={4} d={3} h={1.8} />
          <WatchTower position={[15, terrain.heightAt(15, 11), 11]} />
          <Well position={[-8, terrain.heightAt(-8, 12), 12]} />
          <FarmPlot position={[2, terrain.heightAt(2, -16), -16]} />
          <LanternPost position={[-8, terrain.heightAt(-8, 5), 5]} />
          <LanternPost position={[8.5, terrain.heightAt(8.5, 5.5), 5.5]} />
          <LanternPost position={[6, terrain.heightAt(6, -10.5), -10.5]} />
          <LanternPost position={[-6, terrain.heightAt(-6, -10), -10]} />
          <Pond position={[-17, terrain.heightAt(-17, 10), 10]} />
        </>
      )}

      {/* Campfire at centre */}
      <Campfire />

      {/* 夜晚隐名:不再凭空生成"神秘发言者"NPC——发言者就在篝火圈中但不做任何标记,镜头对准营火中心 */}

      <SkillEffects events={skillEvents} playerPositions={playerPositions} effectLevel={effectLevel} />

      {/* Torches around fire */}
      {torchPositions.map((pos, i) => (
        <Torch key={`torch-${i}`} position={pos} />
      ))}

      {/* Cabin */}
      {<Cabin position={[5, 0, -5]} />}

      {/* Player characters */}
      {seatPlacements.map((seat) => {
        const desc = descriptorsBySeat.get(seat.seatNumber);
        if (!desc) return null;
        // 听讲转向:别人发言时转身面向发言人(默认面向营火中心)
        const listening = dialogueMode && !!speakerSeat && seat.seatNumber !== speakerSeat.seatNumber;
        const faceX = listening && speakerSeat ? speakerSeat.x : 0;
        const faceZ = listening && speakerSeat ? speakerSeat.z : 0;
        return (
          <React.Fragment key={desc.seatNumber}>
            <VoxelCharacter
              descriptor={desc}
              position={[seat.x, seat.y, seat.z]}
              rotationY={Math.atan2(faceX - seat.x, faceZ - seat.z)}
              startle={startleActive && !desc.isDead}
              selected={desc.playerId === selectedPlayerId}
              isCasting={skillEvents.some(event => event.casterId === desc.playerId)}
              isTargeted={skillEvents.some(event => event.targetIds?.includes(desc.playerId))}
              onClick={handleNpcClick}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

ForestCampScene.displayName = 'ForestCampScene';
