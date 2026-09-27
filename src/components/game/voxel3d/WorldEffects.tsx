import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getLightingPreset } from './sceneModel';

interface WorldEffectsProps {
  isNight: boolean;
  effectLevel: 'subtle' | 'medium' | 'intense';
}

// ── 渐变天穹（日夜两套顶/底色，按 nightAmount 插值） ──────

const SKY_DAY = { top: new THREE.Color('#6fc0f2'), bottom: new THREE.Color('#d8eef9') };
const SKY_NIGHT = { top: new THREE.Color('#101f3e'), bottom: new THREE.Color('#33518a') };

const skyVertexShader = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFragmentShader = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  varying vec3 vPos;
  void main() {
    float h = clamp(normalize(vPos).y * 0.6 + 0.42, 0.0, 1.0);
    gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.85)), 1.0);
  }
`;

const SkyDome: React.FC<{ nightAmountRef: React.MutableRefObject<number> }> = ({ nightAmountRef }) => {
  const uniforms = useMemo(() => ({
    topColor: { value: SKY_NIGHT.top.clone() },
    bottomColor: { value: SKY_NIGHT.bottom.clone() },
  }), []);
  useFrame(() => {
    const n = nightAmountRef.current;
    uniforms.topColor.value.lerpColors(SKY_DAY.top, SKY_NIGHT.top, n);
    uniforms.bottomColor.value.lerpColors(SKY_DAY.bottom, SKY_NIGHT.bottom, n);
  });
  return (
    <mesh scale={[110, 110, 110]}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
};

// ── 星空（仅夜间淡入） ───────────────────────────────────

const Stars: React.FC<{ nightAmountRef: React.MutableRefObject<number> }> = ({ nightAmountRef }) => {
  const matRef = useRef<THREE.PointsMaterial>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(140 * 3);
    for (let i = 0; i < 140; i++) {
      // 均匀散布在上半球，半径 ~95（远于雾但贴着天穹内侧）
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const r = 95;
      arr[i * 3] = Math.cos(theta) * Math.sin(phi + 0.12) * r;
      arr[i * 3 + 1] = Math.cos(phi) * r * 0.9 + 8;
      arr[i * 3 + 2] = Math.sin(theta) * Math.sin(phi + 0.12) * r;
    }
    return arr;
  }, []);
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const twinkle = 0.75 + Math.sin(clock.elapsedTime * 1.7) * 0.25;
    matRef.current.opacity = nightAmountRef.current * twinkle;
  });
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={140} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial ref={matRef} color="#e8f1ff" size={1.6} sizeAttenuation={false} transparent opacity={0} fog={false} depthWrite={false} />
    </points>
  );
};

// ── 月亮（夜）/ 太阳（日） ───────────────────────────────

const MoonSun: React.FC<{ nightAmountRef: React.MutableRefObject<number> }> = ({ nightAmountRef }) => {
  const moonMat = useRef<THREE.MeshBasicMaterial>(null);
  const sunMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const n = nightAmountRef.current;
    if (moonMat.current) moonMat.current.opacity = n;
    if (sunMat.current) sunMat.current.opacity = 1 - n;
  });
  return (
    <group>
      {/* 月亮：像素感的方块叠合，挂在远处夜空 */}
      <group position={[-42, 40, -52]}>
        <mesh>
          <boxGeometry args={[4, 4, 0.6]} />
          <meshBasicMaterial ref={moonMat} color="#f2eecd" transparent fog={false} depthWrite={false} />
        </mesh>
        <mesh position={[-2.6, -1.2, -0.4]}>
          <boxGeometry args={[1.4, 1.4, 0.6]} />
          <meshBasicMaterial transparent opacity={0} fog={false} depthWrite={false} />
        </mesh>
      </group>
      {/* 太阳：白天的暖色方块 */}
      <group position={[44, 44, -46]}>
        <mesh>
          <boxGeometry args={[5, 5, 0.6]} />
          <meshBasicMaterial ref={sunMat} color="#ffd45a" transparent fog={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
};

// ── 萤火虫（夜间漂移 + 上下浮动） ────────────────────────

const Fireflies: React.FC<{ count: number; nightAmountRef: React.MutableRefObject<number> }> = ({ count, nightAmountRef }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const { base, phases } = useMemo(() => {
    const base = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (Math.random() - 0.5) * 16;
      base[i * 3 + 1] = 0.5 + Math.random() * 3;
      base[i * 3 + 2] = (Math.random() - 0.5) * 16;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { base, phases };
  }, [count]);

  const matRef = useRef<THREE.PointsMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (matRef.current) matRef.current.opacity = nightAmountRef.current * (0.55 + Math.sin(t * 2.3) * 0.25);
    const points = pointsRef.current;
    if (!points) return;
    const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      attr.setX(i, base[i * 3] + Math.sin(t * 0.35 + phases[i]) * 0.7);
      attr.setY(i, base[i * 3 + 1] + Math.sin(t * 0.9 + phases[i] * 2) * 0.35);
      attr.setZ(i, base[i * 3 + 2] + Math.cos(t * 0.3 + phases[i]) * 0.7);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={base.slice()} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial ref={matRef} color="#f6e680" size={0.09} transparent opacity={0} sizeAttenuation depthWrite={false} />
    </points>
  );
};

// ── 方块云（MC 标志性的平流白云） ────────────────────────

const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
const cloudMat = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.8,
  fog: false,
  depthWrite: false,
});

const Clouds: React.FC = () => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    x: (Math.random() - 0.5) * 130,
    z: (Math.random() - 0.5) * 130,
    y: 21 + Math.random() * 7 + (i % 3),
    sx: 4 + Math.random() * 6,
    sz: 2.5 + Math.random() * 4,
    speed: 0.25 + Math.random() * 0.25,
  })), []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    seeds.forEach((c, i) => {
      // 慢速平流，越界后从另一侧回来
      const x = ((c.x + t * c.speed + 75) % 150) - 75;
      dummy.position.set(x, c.y, c.z);
      dummy.scale.set(c.sx, 0.5, c.sz);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[cloudGeo, cloudMat, 14]} frustumCulled={false} />
  );
};

// ── 主组件：平滑日夜过渡的光照系统 ──────────────────────

export const WorldEffects: React.FC<WorldEffectsProps> = ({ isNight, effectLevel }) => {
  const preset = useMemo(() => getLightingPreset(!isNight), [isNight]);
  const nightAmountRef = useRef(isNight ? 1 : 0);
  const { scene } = useThree();

  // 昼夜两套光照参数只算一次，帧内仅做插值，避免每帧分配
  const presets = useMemo(() => ({ day: getLightingPreset(true), night: getLightingPreset(false) }), []);

  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const fireRef = useRef<THREE.PointLight>(null);
  const fogRef = useRef<THREE.Fog | null>(null);

  // 颜色对象复用，避免每帧分配
  const tmp = useMemo(() => ({
    ambient: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    sun: new THREE.Color(),
    fog: new THREE.Color(),
    nvidiaAmbient: new THREE.Color('#b5c9f3'),
    nvidiaHemiSky: new THREE.Color('#a9c0ed'),
    nvidiaHemiGround: new THREE.Color('#213b22'),
    nvidiaSun: new THREE.Color('#aabbdd'),
    nvidiaFog: new THREE.Color('#29466e'),
  }), []);

  useFrame(({ clock }, delta) => {
    const target = isNight ? 1 : 0;
    const cur = nightAmountRef.current;
    // 约 2 秒完成日夜过渡
    nightAmountRef.current = cur + (target - cur) * Math.min(1, delta * 1.6);
    const n = nightAmountRef.current;
    const day = presets.day;
    const night = presets.night;

    if (ambientRef.current) {
      ambientRef.current.intensity = day.ambientIntensity + (night.ambientIntensity - day.ambientIntensity) * n;
      ambientRef.current.color.copy(tmp.ambient.set('#ffffff').lerp(tmp.nvidiaAmbient, n));
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = 0.45 + (0.82 - 0.45) * n;
      hemiRef.current.color.copy(tmp.hemiSky.set('#dff3ff').lerp(tmp.nvidiaHemiSky, n));
      hemiRef.current.groundColor.copy(tmp.hemiGround.set('#55753b').lerp(tmp.nvidiaHemiGround, n));
    }
    if (dirRef.current) {
      dirRef.current.intensity = day.directionalIntensity + (night.directionalIntensity - day.directionalIntensity) * n;
      dirRef.current.color.copy(tmp.sun.set('#fff5e0').lerp(tmp.nvidiaSun, n));
      // 太阳/月亮方位随昼夜轻微移动
      dirRef.current.position.set(5 - n * 7, 8 + n * 2, 3 - n * 5);
    }
    if (fireRef.current) {
      // 篝火光在夜里更亮，且带轻微闪烁
      const flicker = 0.86 + Math.sin(clock.elapsedTime * 11) * 0.07 + Math.sin(clock.elapsedTime * 23 + 1.7) * 0.07;
      fireRef.current.intensity = (day.firelightIntensity + (night.firelightIntensity - day.firelightIntensity) * n) * flicker;
    }
    // 雾：颜色/距离随昼夜插值（数值来自光照预设，照顾远山景深）
    if (!fogRef.current) fogRef.current = (scene.fog as THREE.Fog) ?? null;
    if (fogRef.current) {
      fogRef.current.color.copy(tmp.fog.set('#c8e6f0').lerp(tmp.nvidiaFog, n));
      fogRef.current.near = presets.day.fogNear + (presets.night.fogNear - presets.day.fogNear) * n;
      fogRef.current.far = presets.day.fogFar + (presets.night.fogFar - presets.day.fogFar) * n;
    }
  });

  const fireflyCount = effectLevel === 'intense' ? 30 : effectLevel === 'medium' ? 15 : 6;

  return (
    <>
      <SkyDome nightAmountRef={nightAmountRef} />
      <Stars nightAmountRef={nightAmountRef} />
      <MoonSun nightAmountRef={nightAmountRef} />
      <Clouds />

      <ambientLight ref={ambientRef} intensity={preset.ambientIntensity} />
      <hemisphereLight ref={hemiRef} intensity={0.45} />

      {/* 主方向光（太阳/月亮） */}
      <directionalLight
        ref={dirRef}
        position={[5, 8, 3]}
        intensity={preset.directionalIntensity}
        castShadow={effectLevel !== 'subtle'}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={48}
        shadow-bias={-0.0015}
      />

      {/* 篝火点光源（带闪烁） */}
      <pointLight ref={fireRef} position={[0, 1.2, 0]} intensity={preset.firelightIntensity} color={preset.firelightColor} distance={12} decay={2} />

      {/* 雾由 VoxelRpgRoom 挂载？——本组件负责创建并逐帧插值 */}
      <fog attach="fog" args={[preset.fogColor, preset.fogNear, preset.fogFar]} />

      {isNight && effectLevel !== 'subtle' && <Fireflies count={fireflyCount} nightAmountRef={nightAmountRef} />}
    </>
  );
};

WorldEffects.displayName = 'WorldEffects';
