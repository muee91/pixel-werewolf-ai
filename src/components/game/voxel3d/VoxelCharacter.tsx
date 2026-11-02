import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { sharedMat, texturedMat } from './materials';
import { skinNoiseTexture, faceTexture, limbTexture, torsoTexture } from './textures';
import type { AvatarDescriptor } from './sceneModel';
import { VOXEL_TOKENS as T } from '../../../themes/voxel-tokens';
import { buildScale, resolveLook, type AvatarLook } from '../../../utils/avatarLook';
import { KayKitCharacter } from './KayKitActor';
import { KAYKIT_LABEL_Y } from './kaykitModel';
import { getGlowTexture } from './fireTextures';

// ── Shared geometry pool (reused across characters) ──────

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// 上衣/皮肤/裤/发的色板已迁到 utils/avatarLook（2D 精灵与 3D 体素共用一套），
// 这里只留靴子：它跟随副色暗化即可，不必单独开放成第五个色槽。
const BOOTS_COLORS = ['#3a2c22', '#1d1d22', '#2c2438', '#23301f', '#4a3728', '#22262c'];
const TOMBSTONE_COLOR = '#6f7680';
const TOMBSTONE_DARK = '#343a40';

/** 由上衣色派生腰带/领口色（收敛到角色调色板内，不引入新色相漂移） */
const derive = (hex: string, mode: 'dark' | 'light', concealed: boolean): string => {
    if (concealed) return mode === 'dark' ? '#050505' : '#2a2a2a';
    const c = new THREE.Color(hex);
    return mode === 'dark'
        ? `#${c.multiplyScalar(0.45).getHexString()}`
        : `#${c.lerp(new THREE.Color('#ffffff'), 0.4).getHexString()}`;
};

// 减少动态偏好：模块级读取一次；减弱时循环动效（待机呼吸/张望/发言环旋转/蹦跳）定格在可见静止状态，
// 状态信息（发言手势、受惊举手、施法姿态）以静态姿态保留；Node 测试环境无 matchMedia 时安全回退为 false
const prefersReducedMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

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

const Tombstone: React.FC<{ seed: number }> = () => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // 墓碑从地里缓缓升起；减弱动态时直接到位（出现状态本身不取消）
    if (prefersReducedMotion) {
      groupRef.current.scale.y = 1;
      return;
    }
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

/**
 * 原来的 3D 角色本体：7 个盒子 + 正弦波抖动手臂，没有骨骼。
 *
 * 现在它的正式身份是**兜底**：KayKit 模型还没加载完（或是这台设备的 WebGL
 * 装不下蒙皮）时，座位上至少站着一个人形，而不是一个空位。
 * `markers=false` 时不再画发言环/"人类"菱形 —— 那两个标记已经提到外层，
 * 两套模型共用一份，不然切模型时会闪出两个环。
 */
const LivingCharacter: React.FC<{
  avatarSeed: number;
  look?: AvatarLook;
  isSpeaking: boolean;
  isHuman: boolean;
  concealed: boolean;
  startle: boolean;
  markers?: boolean;
}> = ({ avatarSeed, look: lookInput, isSpeaking, isHuman, concealed, startle, markers = true }) => {
  // 形象优先用分身配置，未配置才按座位 seed 派生 —— 2D 精灵读的是同一份 look
  const look = useMemo(() => resolveLook(lookInput, avatarSeed), [lookInput, avatarSeed]);
  const shirt = look.primary;
  const skin = look.skin;
  const pants = look.secondary;
  const boots = BOOTS_COLORS[avatarSeed % BOOTS_COLORS.length];
  const visibleShirt = concealed ? '#101010' : shirt;
  const visibleSkin = concealed ? '#181818' : skin;
  const visiblePants = concealed ? '#080808' : pants;
  const visibleBoots = concealed ? '#050505' : boots;
  const [scaleX, scaleY] = buildScale(look.build);

  // 像素皮肤：脸（含眼睛）、衣服、裤子的噪点纹理
  const visibleHair = concealed ? '#101010' : look.hair;
  const faceTex = useMemo(() => faceTexture(visibleSkin, visibleHair), [visibleSkin, visibleHair]);
  const hairTex = useMemo(() => skinNoiseTexture(visibleHair), [visibleHair]);
  // 服饰细节烘进贴图：袖子/靴子分段 + 腰带/领口镶边，网格数与 draw call 不变
  const beltColor = derive(visibleShirt, 'dark', concealed);
  const accentColor = derive(visibleShirt, 'light', concealed);
  const torsoTex = useMemo(() => torsoTexture(visibleShirt, beltColor, accentColor), [visibleShirt, beltColor, accentColor]);
  const armTex = useMemo(() => limbTexture(visibleShirt, visibleSkin, 0.42), [visibleShirt, visibleSkin]);
  const legTex = useMemo(() => limbTexture(visiblePants, visibleBoots, 0.82), [visiblePants, visibleBoots]);
  // 发型：由 look 决定（自定义或 seed 派生），纯外观差异，不携带任何身份信息
  const hairStyle = look.hairStyle;
  const headMats = useMemo(() => [
    texturedMat(hairTex),   // +x 侧面为头发
    texturedMat(hairTex),   // -x
    texturedMat(hairTex),   // +y 头顶
    texturedMat(hairTex),   // -y
    texturedMat(faceTex),   // +z 正面（营地村民五官）
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
    if (prefersReducedMotion) {
      // 待机呼吸/张望等循环动画停用；发言/受惊用静态状态姿态表达（信息仍可见）
      if (leftArmRef.current && rightArmRef.current) {
        if (startle) {
          leftArmRef.current.rotation.z = 2.35;
          rightArmRef.current.rotation.z = -2.35;
        } else if (isSpeaking) {
          leftArmRef.current.rotation.z = 0.16;
          rightArmRef.current.rotation.z = -0.12;
        } else {
          leftArmRef.current.rotation.z = 0;
          rightArmRef.current.rotation.z = 0;
        }
      }
      if (headRef.current) {
        headRef.current.rotation.x = startle ? -0.15 : 0;
        headRef.current.rotation.y = 0;
      }
      if (bodyRef.current) {
        bodyRef.current.rotation.x = startle ? -0.12 : isSpeaking ? 0.06 : 0;
      }
      return;
    }
    const t = clock.elapsedTime;

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
    <group scale={[scaleX, scaleY, scaleX]}>
      <group ref={bodyRef}>
        {/* Head（1.45..1.95，MC 比例大头像，正面带像素脸） */}
        <group ref={headRef} position={[0, 1.45, 0]}>
          <mesh geometry={boxGeo} position={[0, 0.25, 0]} scale={[0.5, 0.5, 0.5]} castShadow material={headMats} />
          {/* Hair：发色随座位变化；发型按 avatarSeed 分 4 款（纯外观剪影差异） */}
          <mesh geometry={boxGeo} position={[0, 0.47, -0.02]} scale={[0.56, 0.12, 0.56]} castShadow material={texturedMat(hairTex)} />
          {hairStyle === 0 && (
            <mesh geometry={boxGeo} position={[0, 0.27, -0.26]} scale={[0.56, 0.36, 0.04]} material={texturedMat(hairTex)} />
          )}
          {hairStyle === 1 && (
            <>
              <mesh geometry={boxGeo} position={[0, 0.44, 0.245]} scale={[0.56, 0.12, 0.06]} material={texturedMat(hairTex)} />
              <mesh geometry={boxGeo} position={[0, 0.3, -0.26]} scale={[0.5, 0.24, 0.04]} material={texturedMat(hairTex)} />
            </>
          )}
          {hairStyle === 2 && (
            <mesh geometry={boxGeo} position={[0, 0.18, -0.27]} scale={[0.56, 0.64, 0.07]} material={texturedMat(hairTex)} />
          )}
          {hairStyle === 3 && (
            <>
              <mesh geometry={boxGeo} position={[0, 0.27, -0.26]} scale={[0.56, 0.36, 0.04]} material={texturedMat(hairTex)} />
              <mesh geometry={boxGeo} position={[-0.34, 0.4, -0.06]} scale={[0.16, 0.18, 0.18]} material={texturedMat(hairTex)} />
              <mesh geometry={boxGeo} position={[0.34, 0.4, -0.06]} scale={[0.16, 0.18, 0.18]} material={texturedMat(hairTex)} />
            </>
          )}
        </group>
        {/* Body（0.75..1.5）：腰带/领口烘进 torsoTex */}
        <mesh geometry={boxGeo} position={[0, 1.125, 0]} scale={[0.5, 0.75, 0.26]} castShadow material={texturedMat(torsoTex)} />
        {/* Arms（肩枢轴 1.42）：上段袖子、下段皮肤烘进 armTex */}
        <group ref={leftArmRef} position={[-0.37, 1.42, 0]}>
          <mesh geometry={boxGeo} position={[0, -0.28, 0]} scale={[0.2, 0.66, 0.2]} castShadow material={texturedMat(armTex)} />
        </group>
        <group ref={rightArmRef} position={[0.37, 1.42, 0]}>
          <mesh geometry={boxGeo} position={[0, -0.28, 0]} scale={[0.2, 0.66, 0.2]} castShadow material={texturedMat(armTex)} />
        </group>
        {/* Legs（0..0.75）：裤腿 + 靴子烘进 legTex */}
        <mesh geometry={boxGeo} position={[-0.125, 0.375, 0]} scale={[0.24, 0.75, 0.24]} castShadow material={texturedMat(legTex)} />
        <mesh geometry={boxGeo} position={[0.125, 0.375, 0]} scale={[0.24, 0.75, 0.24]} castShadow material={texturedMat(legTex)} />
      </group>
      {/* 发言指示:旋转的光点环(替代贴地黄板) */}
      {markers && isSpeaking && <SpeakingRing />}
      {/* Human indicator — small diamond above head */}
      {markers && isHuman && !concealed && (
        <mesh geometry={boxGeo} position={[0, 2.3, 0]} scale={[0.12, 0.12, 0.12]} rotation={[0, 0, Math.PI / 4]} material={sharedMat(T.torch, { emissive: T.torch, emissiveIntensity: 2 })} />
      )}
    </group>
  );
};

// ── 发言指示环:六枚光点绕角色旋转,呼吸式脉动 ──────────────

const SpeakingRing: React.FC = () => {
  const ringRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    // 减弱动态：光点环定格在初始相位，仍然可见（发言状态不丢）
    const t = prefersReducedMotion ? 0 : clock.elapsedTime;
    ringRef.current.rotation.y = t * 1.6;
    const pulse = 1 + Math.sin(t * 4) * 0.08;
    ringRef.current.scale.set(pulse, 1, pulse);
  });
  return (
    <group ref={ringRef}>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        // 原先是 6 个 emissive 小方块。方块在体素营地里还说得过去，
        // 搬进低多边形石殿后就成了一地白色骰子（近景特别明显）。
        // 换成柔光点：同样是"谁在发言"的标记，但不再有硬边。
        return (
          <sprite key={i} position={[Math.cos(a) * 0.52, 0.1, Math.sin(a) * 0.52]} scale={[0.26, 0.26, 1]}>
            <spriteMaterial
              map={getGlowTexture()}
              color="#ffc06a"
              transparent
              opacity={0.72}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
        );
      })}
    </group>
  );
};

// ── Main component ───────────────────────────────────────

export const VoxelCharacter: React.FC<VoxelCharacterProps> = React.memo(
  ({ descriptor, position, selected = false, rotationY = 0, onClick, isCasting = false, isTargeted = false, startle = false }) => {
    const groupRef = useRef<THREE.Group>(null);
    const look = useMemo(
      () => resolveLook(descriptor.look, descriptor.avatarSeed),
      [descriptor.look, descriptor.avatarSeed],
    );

    const handleClick = () => {
      onClick?.(descriptor.playerId);
    };

    // 名牌跟着体型走：高个的名牌抬高、少年压低，否则名牌会插进别人脑袋里。
    // 固定屏幕字号之后还要再抬一点，否则牌子正好压在对方脸上。
    const labelY = useMemo(
      () => (descriptor.isDead ? 1.5 : KAYKIT_LABEL_Y * buildScale(look.build)[1] + 0.28),
      [descriptor.isDead, look.build],
    );

    useFrame((state) => {
      if (!groupRef.current) return;
      if (prefersReducedMotion) {
        // 不循环蹦跳/摇摆；施法与被点选用静态位姿保留状态信息
        groupRef.current.position.y = position[1] + (isCasting ? 0.07 : startle ? 0.1 : 0);
        groupRef.current.rotation.z = isTargeted ? 0.045 : 0;
        return;
      }
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
            <meshStandardMaterial color={T.emerald} emissive={T.emerald} emissiveIntensity={1.8} transparent opacity={0.82} />
          </mesh>
        )}
        {descriptor.isDead ? (
          <Tombstone seed={descriptor.avatarSeed} />
        ) : (
          <>
            <KayKitCharacter
              look={look}
              isSpeaking={descriptor.isSpeaking}
              isCasting={isCasting}
              concealed={descriptor.concealed}
              startle={startle}
              reducedMotion={prefersReducedMotion}
              fallback={
                <LivingCharacter
                  avatarSeed={descriptor.avatarSeed}
                  look={look}
                  isSpeaking={descriptor.isSpeaking}
                  isHuman={false}
                  concealed={descriptor.concealed}
                  startle={startle}
                  markers={false}
                />
              }
            />
            {/* 发言环与"人类"菱形由两套模型共用：放在外层，切模型时不会闪出两个 */}
            {descriptor.isSpeaking && <SpeakingRing />}
            {descriptor.isHuman && !descriptor.concealed && (
              <mesh
                geometry={boxGeo}
                position={[0, 2.3 * buildScale(look.build)[1], 0]}
                scale={[0.12, 0.12, 0.12]}
                rotation={[0, 0, Math.PI / 4]}
                material={sharedMat(T.torch, { emissive: T.torch, emissiveIntensity: 2 })}
              />
            )}
          </>
        )}
        {!descriptor.concealed && !descriptor.hideLabel && <Html
          center
          position={[0, labelY, 0]}
          // 不随距离缩：distanceFactor=9 时，20m 外的名牌只剩 ~5px，9 个人在场时根本认不出谁是谁
          // （玩家原话"广角下读不出名字"）。固定屏幕尺寸后，远近都保持 text-xs 的可读字号。
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        >
          <div
            className="border-2 border-[var(--voxel-ink)] bg-[#f2dfaa]/95 px-1.5 py-0.5 text-center text-[10px] font-black leading-tight text-[var(--voxel-ink)] shadow-[2px_2px_0_var(--voxel-ink)]"
          >
            <div>
              {descriptor.seatNumber}号 {descriptor.displayName || '旅人'}
              {descriptor.isSpeaking && <span className="ml-1 text-[var(--voxel-dead-stamp)]">发言中</span>}
            </div>
            {/* 模型名只在"这一局混用了多个模型"时才有信息量，但两行会把角色整个盖住；
                名册右侧本来就列着模型，这里不再重复 */}
          </div>
        </Html>}
      </group>
    );
  },
);

VoxelCharacter.displayName = 'VoxelCharacter';
