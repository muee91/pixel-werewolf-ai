import React, { useMemo, useCallback, useRef, useLayoutEffect, useState, useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  buildSeatPlacements,
  buildVisibleAvatarDescriptor,
  getSeatRadius,
  getWorldTerrain,
  type WorldTerrain,
  type VisiblePlayer,
} from './sceneModel';
import { VoxelCharacter } from './VoxelCharacter';
import { preloadKayKitModels } from './KayKitActor';
import { WorldEffects } from './WorldEffects';
import { SceneDirector } from './SceneDirector';
import { SkillEffects } from './SkillEffects';
import type { CameraStyle } from './cameraDirectorModel';
import { sharedMat, blockMat } from './materials';
import type { SkillEffectEvent } from './skillEffectModel';
import { DEFAULT_SCENE_ID, SCENES, type ScenePreset } from './biomes';
import type { CameraBlocker } from './cameraClearance';
import { KayKitPropGroup, preloadKayKitProps, type KayKitPropSpec } from './KayKitProps';
import { createFireTexture, drawFireFrame, getGlowTexture, FIRE_TEX_SIZE } from './fireTextures';
import { CryptHall } from './CryptHall';
import { CRYPT_BLOCKERS, cryptHeightAt } from './cryptHallModel';

// ── 营地固定道具坐标 ─────────────────────────────────────
// 一份数据两处用：这里渲模型，同时换算成相机避让的柱体（cameraClearance.ts）。
// 全部道具都在 12.5m 开外 —— 默认巡游机位在 11.5m，永远站在道具圈**里侧**，
// 不会出现"镜头前杵着半座瞭望塔"。原先小木屋在 (5,-5)、离营火才 7m，正好卡在
// 机位和营火之间，是玩家截图里那块黑色挡板的主要来源，已挪到西北角。
const CAMP_LAYOUT = {
  houseA: { x: 14, z: -6 },
  houseB: { x: -12, z: -12 },
  tower: { x: 15, z: 11 },
  well: { x: -8, z: 12 },
  farm: { x: 2, z: -16 },
  cabin: { x: -13.5, z: 5.5 },
  pond: { x: -17, z: 10 },
  lanterns: [[-8, 5], [8.5, 5.5], [6, -10.5], [-6, -10]] as [number, number][],
};

/** 会把视线切开的道具（俯视外接圆 + 顶端高度），供镜头避让用 */
const CAMP_BLOCKERS: CameraBlocker[] = [
  { x: CAMP_LAYOUT.houseA.x, z: CAMP_LAYOUT.houseA.z, radius: 2.6, height: 3.4 },
  { x: CAMP_LAYOUT.houseB.x, z: CAMP_LAYOUT.houseB.z, radius: 2.1, height: 3.0 },
  { x: CAMP_LAYOUT.tower.x, z: CAMP_LAYOUT.tower.z, radius: 1.4, height: 6.2 },
  { x: CAMP_LAYOUT.well.x, z: CAMP_LAYOUT.well.z, radius: 0.9, height: 1.7 },
  { x: CAMP_LAYOUT.cabin.x, z: CAMP_LAYOUT.cabin.z, radius: 1.5, height: 2.3 },
  ...CAMP_LAYOUT.lanterns.map(([x, z]) => ({ x, z, radius: 0.45, height: 2.6 })),
];

// 营地小道具（CC0）：摆在座位圈外、巡游机位里侧（r≈6~9），
// 这样全景镜头里看得见，又不至于挡住营火；再往外就永远在镜头背后了。
const CAMP_PROP_SPECS: KayKitPropSpec[] = [
  { name: 'barrel_large', x: 7.4, z: -3.6, height: 1.15, rotationY: 0.35 },
  { name: 'crates_stacked', x: 8.3, z: 2.2, height: 1.35, rotationY: -0.22 },
  { name: 'keg', x: -6.6, z: -4.4, height: 1.0, rotationY: 0.5 },
  { name: 'table_small', x: -7.4, z: 3.0, height: 0.78, rotationY: 0.25 },
  { name: 'stool', x: -6.2, z: 3.9, height: 0.55, rotationY: 1.1 },
  { name: 'barrel_small_stack', x: -3.4, z: 6.8, height: 1.2, rotationY: 0.8 },
  { name: 'chest', x: 5.6, z: 5.6, height: 0.8, rotationY: -0.6 },
  { name: 'trunk_medium_A', x: 3.4, z: 5.4, height: 0.72, rotationY: 0.4 },
];

// 圣殿里"有人在这儿待过"的痕迹：补给全堆在祭坛背后（-x / -z 一侧）。
// 三个约束：① 避开四角火盆（r=7.1，0°/90°/180°/270°）；
// ② 避开柱脚（r=12.2，22.5°+45°k）→ 落点半径压到 10.5~10.8；
// ③ 不能进全景机位（46.8°、11m 外）的正前方 —— 否则一进场景就是一口木箱怼在镜头上。
const CRYPT_PROP_SPECS: KayKitPropSpec[] = [
  { name: 'barrel_large', x: -9.2, z: -5.6, height: 1.15, rotationY: 0.4 },
  { name: 'chest', x: -10.3, z: -2.6, height: 0.8, rotationY: -0.5 },
  { name: 'crates_stacked', x: -9.6, z: -4.4, height: 1.35, rotationY: 0.3 },
  { name: 'keg', x: -10.3, z: -3.1, height: 1.0, rotationY: 0.6 },
  { name: 'barrel_small_stack', x: -4.4, z: -9.5, height: 1.2, rotationY: -0.3 },
  { name: 'trunk_medium_A', x: -3.2, z: -10.2, height: 0.72, rotationY: 0.8 },
];

// ── Shared geometry/material pools ───────────────────────

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// 配色由方块贴图（textures.ts + materials.ts）提供，这里不再维护色板常量。

// 减少动态偏好：模块级读取一次；减弱时循环动效定格在可见状态（火仍在、只是不闪），
// Node 测试环境无 matchMedia 时安全回退为 false
const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

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
  /** 场景预设（群系）：决定地表方块/树种/水色/天空与雾 */
  scene?: ScenePreset;
}

// ── Campfire（火星上升 + 烟雾 + 多层火苗摆动） ────────────

// 营火火焰的贴图（画布/渐变）已抽到 fireTextures.ts —— 石殿祭坛要用同一套火。
// 这里只留"营火怎么摆"：木柴环 + 交叉双面片 + 光晕 + 火星 + 烟。

const Campfire: React.FC = () => {
  const flameTex = useMemo(() => createFireTexture(), []);
  const accRef = useRef(0);
  const staticDrawnRef = useRef(false);
  const heightsRef = useRef(new Float32Array(FIRE_TEX_SIZE));
  const sparksRef = useRef<THREE.Points>(null);
  const sparkPositions = useMemo(() => new Float32Array(14 * 3), []);
  const embersRef = useRef<THREE.InstancedMesh>(null);
  const smokeRefs = useRef<(THREE.Sprite | null)[]>([]);
  const glowRef = useRef<THREE.Sprite | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }, delta) => {
      // 朝向相机交叉成 X 形(MC 火焰块的双面片布局)
      // 减弱动态时冻结时间轴：下方循环动效全部取定格 t，火/火星/烟仍渲染但不再动
      const t = prefersReducedMotion ? 0 : clock.elapsedTime;
      const drawFlame = () => {
          const heights = heightsRef.current;
          const frame = prefersReducedMotion ? 0 : Math.floor(performance.now() / 90);
          for (let x = 0; x < FIRE_TEX_SIZE; x++) {
              const wave = 5 + 4 * Math.abs(Math.sin(x * 0.8 + Math.floor(frame / 3) * 1.7));
              const jitter = Math.random() * 3.2;
              heights[x] = Math.max(1, Math.min(FIRE_TEX_SIZE, wave + jitter));
          }
          for (let x = 1; x < FIRE_TEX_SIZE - 1; x++) {
              heights[x] = (heights[x - 1] + heights[x] * 2 + heights[x + 1]) / 4;
          }
          drawFireFrame(heights);
          flameTex.needsUpdate = true;
      };
      if (prefersReducedMotion) {
          // 只画一帧静态火苗,之后不再重绘
          if (!staticDrawnRef.current) {
              staticDrawnRef.current = true;
              drawFlame();
          }
      } else {
          accRef.current += delta;
          // ~11fps 重绘火焰纹理
          if (accRef.current >= 0.09) {
              accRef.current = 0;
              drawFlame();
          }
      }
      // 火星:循环上升的点精灵（原来是发光小方块，在夜里看着像一张张小纸片贴在空中的）
      if (sparksRef.current) {
        for (let i = 0; i < 14; i++) {
          const phase = (i * 0.618) % 1;
          const life = (t * 0.4 + phase) % 1;
          sparkPositions[i * 3] = Math.sin(t * 2 + i * 2.1) * 0.14 + Math.sin(i * 5.3) * 0.18;
          sparkPositions[i * 3 + 1] = 0.6 + life * 2.2;
          sparkPositions[i * 3 + 2] = Math.cos(t * 1.7 + i * 1.3) * 0.14 + Math.cos(i * 3.7) * 0.18;
        }
        const attr = sparksRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
        attr.needsUpdate = true;
      }
      // 余烬床:贴地红热点随机明灭
      if (embersRef.current) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.3;
          const glow = 0.5 + 0.5 * Math.sin(t * (2.2 + i * 0.7) + i * 1.9);
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
        const life = (t * 0.16 + phase) % 1;
        mesh.position.y = 1.9 + life * 3.6;
        mesh.position.x = Math.sin(t * 0.6 + i * 2.4) * 0.34 * life;
        mesh.scale.setScalar(0.2 + life * 0.9);
        mesh.rotation.y = t * 0.4 + i;
      });
      // 光晕跟着火苗一起呼吸（减弱动态时定在不闪的中值）
      if (glowRef.current) {
        const breath = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * 6.3) * 0.12 + Math.sin(t * 13.1) * 0.05;
        glowRef.current.material.opacity = 0.24 + breath * 0.14;
        const s = 3.8 + breath * 0.4;
        glowRef.current.scale.set(s, s, 1);
      }
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
    {/* 火光光晕：始终朝向相机，远处也能看出这儿有堆火 */}
    <sprite ref={glowRef} position={[0, 1.05, 0]} scale={[3.8, 3.8, 1]} renderOrder={3}>
      <spriteMaterial
        map={getGlowTexture()}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        opacity={0.4}
      />
    </sprite>
    {/* 火星：点精灵 + 发光贴图，烧成一粒粒暖色光点 */}
    <points ref={sparksRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[sparkPositions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={getGlowTexture()}
        color="#ffb45a"
        size={0.36}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
    {/* 烟：六张朝向相机的软面片。
        原来是不透明度 0.16 的方块，夜里就成了一串飘在空中的白方块（玩家眼里的"UFO"）；
        换成径向渐变面片 + 普通混合，才是烟该有的样子。 */}
    {Array.from({ length: 6 }, (_, i) => (
      <sprite
        key={`smoke-${i}`}
        ref={(el) => { smokeRefs.current[i] = el; }}
        position={[0, 2, 0]}
        scale={[0.6, 0.6, 1]}
      >
        <spriteMaterial
          map={getGlowTexture()}
          color="#8d959c"
          transparent
          opacity={0.22}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    ))}
  </group>;
};

// ── Torch（火光微摆） ─────────────────────────────────────

const Torch: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const headRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!headRef.current) return;
    if (prefersReducedMotion) {
      // 减弱动态:火把定格在静止姿态(火光仍在,只是不摆)
      headRef.current.scale.y = 0.2;
      headRef.current.position.x = 0;
      return;
    }
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

const BlockyWorld: React.FC<{
  terrain: WorldTerrain;
  focusPoints: { x: number; y: number; z: number }[];
  scene: ScenePreset;
}> = ({ terrain, focusPoints, scene }) => {
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const dirtRef = useRef<THREE.InstancedMesh>(null);
  const waterRef = useRef<THREE.InstancedMesh>(null);
  const sandRef = useRef<THREE.InstancedMesh>(null);
  const stoneRef = useRef<THREE.InstancedMesh>(null);
  const logRef = useRef<THREE.InstancedMesh>(null);
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const birchRef = useRef<THREE.InstancedMesh>(null);

  const scales = useRef<number[]>([]);
  const waterAcc = useRef(0);
  const waterDummy = useMemo(() => new THREE.Object3D(), []);

  // 水面不再是一块死贴图：逐块上下浮动一点点（±5cm、错相位），夜里再靠自发光留一点月光反照。
  // 逐帧写上千个矩阵太贵，压到约 16fps 更新，肉眼看不出台阶。
  useFrame(({ clock }, delta) => {
    const mesh = waterRef.current;
    if (!mesh) return;
    waterAcc.current += delta;
    if (waterAcc.current < 0.06) return;
    waterAcc.current = 0;
    const t = prefersReducedMotion ? 0 : clock.elapsedTime;
    const list = terrain.water;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      waterDummy.position.set(b.x, b.y + Math.sin(t * 1.5 + b.x * 0.6 + b.z * 0.45) * 0.05, b.z);
      waterDummy.rotation.set(0, 0, 0);
      waterDummy.scale.set(1, 1, 1);
      waterDummy.updateMatrix();
      mesh.setMatrixAt(i, waterDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const fill = (
      ref: { current: THREE.InstancedMesh | null },
      list: { x: number; y: number; z: number }[],
    ) => {
      const mesh = ref.current;
      if (!mesh) return;
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
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
  useFrame(({ camera }, delta) => {
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
      <instancedMesh ref={grassRef} args={[boxGeo, blockMat(scene.ground, 1, 1), Math.max(1, terrain.grass.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={dirtRef} args={[boxGeo, blockMat(scene.sub, 1, 1), Math.max(1, terrain.dirt.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={waterRef} args={[boxGeo, scene.water
        ? sharedMat(scene.water.color, { transparent: true, opacity: scene.water.opacity, roughness: 0.18, emissive: scene.water.emissive, emissiveIntensity: 0.55 })
        : sharedMat('#000000', { transparent: true, opacity: 0 }), Math.max(1, terrain.water.length)]} frustumCulled={false} />
      <instancedMesh ref={sandRef} args={[boxGeo, blockMat(scene.shore, 1, 1), Math.max(1, terrain.sand.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={stoneRef} args={[boxGeo, blockMat(scene.stone, 1, 1), Math.max(1, terrain.stone.length)]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={logRef} args={[boxGeo, blockMat(scene.log, 1, 1), Math.max(1, terrain.log.length)]} castShadow frustumCulled={false} />
      <instancedMesh ref={birchRef} args={[boxGeo, blockMat(scene.birch, 1, 1), Math.max(1, terrain.birchLog.length)]} castShadow frustumCulled={false} />
      <instancedMesh ref={leavesRef} args={[boxGeo, blockMat(scene.leaves ?? 'leaves', 1, 1), Math.max(1, terrain.leaves.length)]} castShadow frustumCulled={false} />
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

// 每帧把 renderer.info 发布到 window，供 canvas 检查器读取真实渲染预算
// （calls/triangles/geometries/textures）。useFrame 跑在 gl.render 之前，
// three 的 info.reset() 在 render() 开头执行，因此这里读到的是上一帧完整计数。
// 字段写入稳定对象，避免逐帧分配。
const RenderDiagnostics: React.FC = () => {
  const gl = useThree(state => state.gl);
  useFrame(() => {
    const info = gl.info;
    const diagnostics = (window.__THREE_GAME_DIAGNOSTICS__ ??= {});
    const renderer = (diagnostics.renderer ??= {});
    renderer.calls = info.render.calls;
    renderer.triangles = info.render.triangles;
    renderer.geometries = info.memory.geometries;
    renderer.textures = info.memory.textures;
  });
  return null;
};

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
  scene = SCENES[DEFAULT_SCENE_ID],
}) => {
  const seatPlacements = useMemo(() => buildSeatPlacements(players), [players]);
  /** 圣殿：另一整套世界构造，不生成方块地形、不用营火/木屋/火把 */
  const isCrypt = scene.style === 'crypt';
  const terrain = useMemo(() => getWorldTerrain(20260911, scene), [scene]);
  // 进场景就把五只角色模型排队下下来（本地静态文件，1.7 MB），
  // 免得切座位时先看到体素兜底再"跳"成模型
  useMemo(() => preloadKayKitModels(), []);
  useMemo(() => preloadKayKitProps(), []);

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
      {/* 渲染预算诊断（canvas 检查器读取） */}
      <RenderDiagnostics />

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
        indoor={scene.indoor}
        blockers={isCrypt ? CRYPT_BLOCKERS : CAMP_BLOCKERS}
        seatRadius={getSeatRadius(players.length)}
        seatCount={players.length}
      />

      {/* Lighting, fog, particles */}
      <WorldEffects isNight={isNight} effectLevel={effectLevel} scene={scene} />

      {/* 世界本体：两套完全不同的构造。
          深渊圣殿用 CryptHall 现搭曲线几何（柱廊/尖拱窗/穹顶/铁火盆），
          其余群系仍是程序化方块地形 + 木构营地。 */}
      {isCrypt ? (
        <CryptHall />
      ) : (
        <>
          {/* The world remains present during dialogue shots: characters speak in a
              blocky forest, not against an empty stage.  Only foreground
              players and active effects are isolated below. */}
          <BlockyWorld key={scene.id} terrain={terrain} focusPoints={focusPoints} scene={scene} />
          {/* 草丛与野花只属于有草的场景：雪原/荒漠里长绿草会非常跳戏 */}
          {(scene.id === 'forest-camp' || scene.id === 'autumn-camp') && <GrassTufts heightAt={terrain.heightAt} />}
          {!scene.indoor && (
            <>
              <HouseMC position={[CAMP_LAYOUT.houseA.x, terrain.heightAt(CAMP_LAYOUT.houseA.x, CAMP_LAYOUT.houseA.z), CAMP_LAYOUT.houseA.z]} rotationY={-0.25} />
              <HouseMC position={[CAMP_LAYOUT.houseB.x, terrain.heightAt(CAMP_LAYOUT.houseB.x, CAMP_LAYOUT.houseB.z), CAMP_LAYOUT.houseB.z]} rotationY={0.5} w={4} d={3} h={1.8} />
              <WatchTower position={[CAMP_LAYOUT.tower.x, terrain.heightAt(CAMP_LAYOUT.tower.x, CAMP_LAYOUT.tower.z), CAMP_LAYOUT.tower.z]} />
              <Well position={[CAMP_LAYOUT.well.x, terrain.heightAt(CAMP_LAYOUT.well.x, CAMP_LAYOUT.well.z), CAMP_LAYOUT.well.z]} />
              {scene.id !== 'desert-ruins' && <FarmPlot position={[CAMP_LAYOUT.farm.x, terrain.heightAt(CAMP_LAYOUT.farm.x, CAMP_LAYOUT.farm.z), CAMP_LAYOUT.farm.z]} />}
              <LanternPost position={[CAMP_LAYOUT.lanterns[0][0], terrain.heightAt(CAMP_LAYOUT.lanterns[0][0], CAMP_LAYOUT.lanterns[0][1]), CAMP_LAYOUT.lanterns[0][1]]} />
              <LanternPost position={[CAMP_LAYOUT.lanterns[1][0], terrain.heightAt(CAMP_LAYOUT.lanterns[1][0], CAMP_LAYOUT.lanterns[1][1]), CAMP_LAYOUT.lanterns[1][1]]} />
              <LanternPost position={[CAMP_LAYOUT.lanterns[2][0], terrain.heightAt(CAMP_LAYOUT.lanterns[2][0], CAMP_LAYOUT.lanterns[2][1]), CAMP_LAYOUT.lanterns[2][1]]} />
              <LanternPost position={[CAMP_LAYOUT.lanterns[3][0], terrain.heightAt(CAMP_LAYOUT.lanterns[3][0], CAMP_LAYOUT.lanterns[3][1]), CAMP_LAYOUT.lanterns[3][1]]} />
              {scene.water && <Pond position={[CAMP_LAYOUT.pond.x, terrain.heightAt(CAMP_LAYOUT.pond.x, CAMP_LAYOUT.pond.z), CAMP_LAYOUT.pond.z]} />}
            </>
          )}

          {/* Campfire at centre */}
          <Campfire />

          {/* 夜晚隐名:不再凭空生成"神秘发言者"NPC——发言者就在篝火圈中但不做任何标记,镜头对准营火中心 */}

          {/* Torches around fire */}
          {torchPositions.map((pos, i) => (
            <Torch key={`torch-${i}`} position={pos} />
          ))}
          {/* 室内没有天光，四支火把要真的发光，否则石厅就是一间黑屋 */}
          {scene.indoor && torchPositions.map((pos, i) => (
            <pointLight
              key={`torch-light-${i}`}
              position={[pos[0], 1.3, pos[2]]}
              color="#ffb066"
              intensity={22}
              distance={18}
              decay={2}
            />
          ))}

          {/* 小木屋：户外场景才有 */}
          {!scene.indoor && (
            <Cabin position={[CAMP_LAYOUT.cabin.x, terrain.heightAt(CAMP_LAYOUT.cabin.x, CAMP_LAYOUT.cabin.z), CAMP_LAYOUT.cabin.z]} />
          )}
        </>
      )}

      <SkillEffects events={skillEvents} playerPositions={playerPositions} effectLevel={effectLevel} />

      {/* 生活道具（CC0 模型）：营地摆酒桶/木箱/酒桌，圣殿靠柱脚堆补给 */}
      <KayKitPropGroup
        specs={isCrypt ? CRYPT_PROP_SPECS : CAMP_PROP_SPECS}
        heightAt={isCrypt ? cryptHeightAt : terrain.heightAt}
      />

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
