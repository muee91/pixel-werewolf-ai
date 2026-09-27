import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { sharedMat, texturedMat, blockMat } from './materials';
import { skinNoiseTexture, faceTexture } from './textures';
import type { AvatarDescriptor } from './sceneModel';

// ── Shared geometry pool (reused across characters) ──────

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const SHIRT_COLORS = ['#4aa3df', '#7b2f2a', '#5943a8', '#6e3f91', '#8a4f2d', '#315f93', '#3d9172', '#717984', '#9b4470', '#347d55', '#5a5146', '#794820'];
const SKIN_COLORS = ['#b98255', '#c89462', '#8b5a42', '#d0a06f'];
const PANTS_COLORS = ['#2f4f79', '#39455f', '#355b42', '#5a4f79'];

const HAIR_COLORS = ['#2b2118', '#4a3320', '#111418', '#5a4632', '#7a5a3a', '#3a3f45'];
const TOMBSTONE_COLOR = '#6f7680';
const TOMBSTONE_DARK = '#343a40';

interface VoxelCharacterProps {
  descriptor: AvatarDescriptor;
  position: [number, number, number];
  selected?: boolean;
  rotationY?: number;
  onClick?: (playerId: number) => void;
  isCasting?: boolean;
  isTargeted?: boolean;
  /** 受惊演出:有人出局时存活玩家跳起举手 */
  startle?: boolean;
}

// ── Tombstone (death marker) ─────────────────────────────

const Tombstone: React.FC<{ seed: number }> = ({ seed }) => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // 墓碑从地里缓缓升起
    if (groupRef.current.scale.y < 1) {
      groupRef.current.scale.y = Math.min(1, groupRef.current.scale.y + delta * 2.2);
    }
  });
  return (
    <group ref={groupRef} scale={[1, 0.05, 1]}>
      {/* Main stone slab */}
      <mesh geometry={boxGeo} position={[0, 0.5, 0]} scale={[0.6, 1, 0.3]} castShadow material={sharedMat(TOMBSTONE_COLOR)} />
      {/* Cross bar */}
      <mesh geometry={boxGeo} position={[0, 0.7, 0]} scale={[0.8, 0.08, 0.32]} material={sharedMat(TOMBSTONE_DARK)} />
      {/* Base */}
      <mesh geometry={boxGeo} position={[0, 0.05, 0]} scale={[0.7, 0.1, 0.35]} material={sharedMat(TOMBSTONE_DARK)} />
      {/* Number */}
      <mesh geometry={boxGeo} position={[0, 0.3, 0.16]} scale={[0.25, 0.2, 0.02]} material={sharedMat('#1d2430')} />
    </group>
  );
};

// ── Living character (low-poly voxel human) ──────────────

const LivingCharacter: React.FC<{
  avatarSeed: number;
  isSpeaking: boolean;
  isHuman: boolean;
  concealed: boolean;
  startle: boolean;
}> = ({ avatarSeed, isSpeaking, isHuman, concealed, startle }) => {
  const shirt = useMemo(() => SHIRT_COLORS[avatarSeed % SHIRT_COLORS.length], [avatarSeed]);
  const skin = useMemo(() => SKIN_COLORS[avatarSeed % SKIN_COLORS.length], [avatarSeed]);
  const pants = useMemo(() => PANTS_COLORS[avatarSeed % PANTS_COLORS.length], [avatarSeed]);
  const visibleShirt = concealed ? '#101010' : shirt;
  const visibleSkin = concealed ? '#181818' : skin;
  const visiblePants = concealed ? '#080808' : pants;

  // 像素皮肤：脸（含眼睛）、衣服、裤子的噪点纹理
  const hair = HAIR_COLORS[avatarSeed % HAIR_COLORS.length];
  const visibleHair = concealed ? '#101010' : hair;
  const faceTex = useMemo(() => faceTexture(visibleSkin, visibleHair), [visibleSkin, visibleHair]);
  const skinTex = useMemo(() => skinNoiseTexture(visibleSkin), [visibleSkin]);
  const hairTex = useMemo(() => skinNoiseTexture(visibleHair), [visibleHair]);
  const shirtTex = useMemo(() => skinNoiseTexture(visibleShirt), [visibleShirt]);
  const pantsTex = useMemo(() => skinNoiseTexture(visiblePants), [visiblePants]);
  const headMats = useMemo(() => [
    texturedMat(hairTex),   // +x 侧面为头发
    texturedMat(hairTex),   // -x
    texturedMat(hairTex),   // +y 头顶
    texturedMat(hairTex),   // -y
    texturedMat(faceTex),   // +z 正面（原版五官）
    texturedMat(hairTex),   // -z 后脑勺
  ], [hairTex, faceTex]);

  // 头部组:说话点头/转向,平时四处张望
  const headRef = useRef<THREE.Group>(null);
  // 手臂以肩为轴
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  // 身体组:呼吸/前倾
  const bodyRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const phase = t * 0.7 + avatarSeed * 1.37;

    // 手臂:发言时双臂交替挥动(一上一下),受惊双手举过头顶,平时轻微摆动
    if (leftArmRef.current && rightArmRef.current) {
      if (startle) {
        const up = -2.35 + Math.sin(t * 14) * 0.12;
        leftArmRef.current.rotation.z = -up;
        rightArmRef.current.rotation.z = up;
      } else if (isSpeaking) {
        // 发言手势:小幅单臂比划,不跳舞
        const gest = Math.sin(t * 2.6) * 0.14 + 0.18;
        leftArmRef.current.rotation.z = 0.1 + gest * 0.35;
        rightArmRef.current.rotation.z = -0.08 - Math.sin(t * 1.8) * 0.08;
      } else {
        const idle = Math.sin(t * 1.6 + avatarSeed) * 0.06;
        leftArmRef.current.rotation.z = idle;
        rightArmRef.current.rotation.z = -idle;
      }
    }

    // 头部:发言时点头+朝向左右转动;平时缓慢张望
    if (headRef.current) {
      if (startle) {
        headRef.current.rotation.x = -0.15;
        headRef.current.rotation.y = Math.sin(t * 10) * 0.1;
      } else if (isSpeaking) {
        headRef.current.rotation.x = Math.sin(t * 3.1) * 0.14;
        headRef.current.rotation.y = Math.sin(t * 0.9) * 0.28;
      } else {
        headRef.current.rotation.x = Math.sin(t * 0.5 + avatarSeed) * 0.05;
        headRef.current.rotation.y = Math.sin(t * 0.35 + avatarSeed * 2) * 0.45;
      }
    }

    // 身体:发言前倾,受惊后仰,平时呼吸起伏
    if (bodyRef.current) {
      if (startle) {
        bodyRef.current.rotation.x = -0.12;
      } else if (isSpeaking) {
        bodyRef.current.rotation.x = 0.06 + Math.sin(t * 2.6) * 0.03;
      } else {
        bodyRef.current.rotation.x = Math.sin(t * 1.1 + avatarSeed) * 0.02;
      }
    }
  });

  return (
    <group>
      <group ref={bodyRef}>
        {/* Head（1.45..1.95，MC 比例大头像，正面带像素脸） */}
        <group ref={headRef} position={[0, 1.45, 0]}>
          <mesh geometry={boxGeo} position={[0, 0.25, 0]} scale={[0.5, 0.5, 0.5]} castShadow material={headMats} />
          {/* Hair（发色随座位变化，增加识别度） */}
          <mesh geometry={boxGeo} position={[0, 0.47, -0.02]} scale={[0.56, 0.12, 0.56]} castShadow material={texturedMat(hairTex)} />
          <mesh geometry={boxGeo} position={[0, 0.27, -0.26]} scale={[0.56, 0.36, 0.04]} material={texturedMat(hairTex)} />
        </group>
        {/* Body（0.75..1.5） */}
        <mesh geometry={boxGeo} position={[0, 1.125, 0]} scale={[0.5, 0.75, 0.26]} castShadow material={texturedMat(shirtTex)} />
        {/* Arms（肩枢轴 1.42） */}
        <group ref={leftArmRef} position={[-0.37, 1.42, 0]}>
          <mesh geometry={boxGeo} position={[0, -0.28, 0]} scale={[0.2, 0.66, 0.2]} castShadow material={texturedMat(skinTex)} />
        </group>
        <group ref={rightArmRef} position={[0.37, 1.42, 0]}>
          <mesh geometry={boxGeo} position={[0, -0.28, 0]} scale={[0.2, 0.66, 0.2]} castShadow material={texturedMat(skinTex)} />
        </group>
        {/* Legs（0..0.75，双脚精确落地） */}
        <mesh geometry={boxGeo} position={[-0.125, 0.375, 0]} scale={[0.24, 0.75, 0.24]} castShadow material={texturedMat(pantsTex)} />
        <mesh geometry={boxGeo} position={[0.125, 0.375, 0]} scale={[0.24, 0.75, 0.24]} castShadow material={texturedMat(pantsTex)} />
      </group>
      {/* 发言指示:旋转的光点环(替代贴地黄板) */}
      {isSpeaking && <SpeakingRing />}
      {/* Human indicator — small diamond above head */}
      {isHuman && !concealed && (
        <mesh geometry={boxGeo} position={[0, 2.3, 0]} scale={[0.12, 0.12, 0.12]} rotation={[0, 0, Math.PI / 4]} material={sharedMat('#f6b443', { emissive: '#f6b443', emissiveIntensity: 2 })} />
      )}
    </group>
  );
};

// ── 发言指示环:六枚光点绕角色旋转,呼吸式脉动 ──────────────

const SpeakingRing: React.FC = () => {
  const ringRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.y = clock.elapsedTime * 1.6;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    ringRef.current.scale.set(pulse, 1, pulse);
  });
  return (
    <group ref={ringRef}>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={boxGeo}
            position={[Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5]}
            scale={[0.1, 0.06, 0.1]}
            material={sharedMat('#f6b443', { emissive: '#f6b443', emissiveIntensity: 2.2, transparent: true, opacity: 0.85 })}
          />
        );
      })}
    </group>
  );
};

// ── Main component ───────────────────────────────────────

export const VoxelCharacter: React.FC<VoxelCharacterProps> = React.memo(
  ({ descriptor, position, selected = false, rotationY = 0, onClick, isCasting = false, isTargeted = false, startle = false }) => {
    const groupRef = useRef<THREE.Group>(null);

    const handleClick = () => {
      onClick?.(descriptor.playerId);
    };

    useFrame((state) => {
      if (!groupRef.current) return;
      const time = state.clock.elapsedTime;
      // 站立即站立,不再原地蹦跳;表现力交给手势/点头/听讲转向
      const shock = startle ? Math.abs(Math.sin(time * 9)) * 0.18 : 0;
      const cast = isCasting ? Math.abs(Math.sin(time * 7)) * 0.14 : 0;
      groupRef.current.position.y = position[1] + cast + shock;
      groupRef.current.rotation.z = isTargeted ? Math.sin(time * 8) * 0.045 : startle ? Math.sin(time * 11) * 0.06 : 0;
    });

    return (
      <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} onClick={handleClick}>
        {selected && (
          <mesh geometry={boxGeo} position={[0, 0.015, 0]} scale={[1.05, 0.03, 1.05]}>
            <meshStandardMaterial color="#48c774" emissive="#48c774" emissiveIntensity={1.8} transparent opacity={0.82} />
          </mesh>
        )}
        {descriptor.isDead ? (
          <Tombstone seed={descriptor.avatarSeed} />
        ) : (
          <LivingCharacter
            avatarSeed={descriptor.avatarSeed}
            isSpeaking={descriptor.isSpeaking}
            isHuman={descriptor.isHuman}
            concealed={descriptor.concealed}
            startle={startle}
          />
        )}
        {!descriptor.concealed && !descriptor.hideLabel && <Html
          center
          position={[0, descriptor.isDead ? 1.35 : 2.25, 0]}
          distanceFactor={9}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        >
          <div
            className="border-2 border-[#21150d] bg-[#f2dfaa]/95 px-2 py-0.5 text-[10px] font-black text-[#24170e] shadow-[2px_2px_0_#21150d]"
          >
            {descriptor.seatNumber}号 {descriptor.displayName || '旅人'}
            {descriptor.isSpeaking && <span className="ml-1 text-[#b31923]">发言中</span>}
          </div>
        </Html>}
      </group>
    );
  },
);

VoxelCharacter.displayName = 'VoxelCharacter';
