import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { sharedMat } from './materials';
import { getColdGlowTexture, getGlowTexture } from './fireTextures';
import {
    ALTAR,
    ARCADE_FLATTEN,
    ARCADE_RADIUS,
    ARCADE_SPRING_Y,
    ARCH,
    BRAZIER_COUNT,
    BRAZIER_HEIGHT,
    COLUMN_COUNT,
    COLUMN_HEIGHT,
    COLUMN_RADIUS,
    COLUMN_SHAFT_RADIUS,
    DOME_BASE_Y,
    DOME_RADIUS,
    DOME_SQUASH,
    HALL_RADIUS,
    OCULUS_ANGLE,
    OCULUS_RADIUS,
    OCULUS_Y,
    WALL_HEIGHT,
    WALL_INNER_APOTHEM,
    WALL_THICKNESS,
    octVertexRadius,
    getBrazierPosition,
    getColumnAngle,
    getColumnPosition,
    getWallSegment,
} from './cryptHallModel';

/**
 * 深渊圣殿（Crypt Hall）—— 一整套非方块的低多边形室内。
 *
 * 与方块营地是两套构造逻辑，不是换贴图：
 * - 地面是八边形石板 + 同心铺装环 + 放射石缝，不是 1×1×1 方块阵列；
 * - 围合是 8 段带尖拱窗洞的挤出墙体（真·拱形洞口），不是四面 Box 墙；
 * - 顶部是半球穹顶 + 8 条肋，不是"没有屋顶"；
 * - 光源是中央铁火盆 + 四角石墩火盆 + 8 盏柱壁灯，不是营火 + 四支火把；
 * - 冷蓝月光从拱窗斜射成光柱，与暖橙火光对撞 —— 这是营地里不可能有的光照关系。
 *
 * 角色、座位、技能特效、镜头仍然是共享的（同一个人在同一个世界规则下说话），
 * 换的只是"这个房间长什么样"。
 */

const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

// ── 石色板（冷灰蓝，与营地暖木色完全分开） ────────────────
const C = {
    floor: '#6b7280',
    floorDark: '#565d69',
    floorLine: '#7d8592',
    inlay: '#8a7a5f',
    wall: '#616977',
    wallInner: '#727b8a',
    column: '#6e7784',
    columnDark: '#535b67',
    iron: '#33373f',
    ember: '#e0431f',
    moon: '#8fb6d9',
};

// flat: true —— 低多边形风格的关键。CylinderGeometry 默认把 8 段侧面平滑成一圈渐变，
// 八角柱会变成一根圆管；平面着色才能看见每一道棱。
const stoneFloor = () => sharedMat(C.floor, { roughness: 0.96, flat: true });
const stoneDark = () => sharedMat(C.floorDark, { roughness: 0.97, flat: true });
const stoneWall = () => sharedMat(C.wall, { roughness: 0.95, flat: true });
const stoneColumn = () => sharedMat(C.column, { roughness: 0.9, flat: true });
const stoneColumnDark = () => sharedMat(C.columnDark, { roughness: 0.9, flat: true });
const ironMat = () => sharedMat(C.iron, { roughness: 0.42, metalness: 0.65, flat: true });
/** 盆体（openEnded 圆柱）必须双面：单面从内侧看是被剔除的，火盆会变成一张黑边剪纸 */
const IRON_DOUBLE = new THREE.MeshStandardMaterial({
    color: C.iron,
    // 盆内壁会被火光正面照射：metalness 给高会打出一圈镜面条纹，
    // 斜视时整只盆看着像一牙橙色轮子。压到 0.2 当磨砂铁。
    roughness: 0.68,
    metalness: 0.2,
    flatShading: true,
    side: THREE.DoubleSide,
});
/** 窗玻璃：不受光照的纯色（MeshBasicMaterial）——
 *  洞口里没有光能照到它，Standard 材质只会得到一片黑，看着像没挖通。
 *  这是"外面的夜空"，本来就不该受室内光照影响。 */
const GLASS_MATERIAL = new THREE.MeshBasicMaterial({
    color: '#a9c8e4',
    toneMapped: false,
    // ShapeGeometry 的法线朝墙外，单面材质从厅内看会被整个剔除（洞口纯黑）
    side: THREE.DoubleSide,
});
/** 穹顶内表面：必须 BackSide，否则从厅内看整个屋顶是被剔除的（一个洞） */
const DOME_MATERIAL = new THREE.MeshStandardMaterial({
    color: '#5b6474',
    roughness: 1,
    metalness: 0,
    // 穹顶内表面朝下，拿不到半球光的天光，纯靠反射就是一口黑锅；
    // 给一点自发光当"石头的环境散射"，肋骨的明暗关系才出得来。
    emissive: '#333c48',
    emissiveIntensity: 1.1,
    side: THREE.BackSide,
});

// ── 几何：全部模块级构建一次 ──────────────────────────────

/** 尖拱窗洞轮廓（三段：矩形 + 两段半径 2×半宽的圆弧，标准 lancet 拱）。
 *  返回 Shape 而不是 Path：既能当墙上的 hole，也能直接 ShapeGeometry 做窗玻璃。 */
const makeArchPath = (): THREE.Shape => {
    const hw = ARCH.halfWidth;
    const p = new THREE.Shape();
    p.moveTo(-hw, ARCH.sill);
    p.lineTo(hw, ARCH.sill);
    p.lineTo(hw, ARCH.spring);
    // 右肩 → 尖顶：圆心在左肩，半径 2hw
    p.absarc(-hw, ARCH.spring, 2 * hw, 0, Math.PI / 3, false);
    // 尖顶 → 左肩：圆心在右肩，半径 2hw
    p.absarc(hw, ARCH.spring, 2 * hw, (Math.PI * 2) / 3, Math.PI, false);
    p.closePath();
    return p;
};

const makeWallShape = (width: number, withWindow: boolean): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-width / 2, 0);
    s.lineTo(width / 2, 0);
    s.lineTo(width / 2, WALL_HEIGHT);
    s.lineTo(-width / 2, WALL_HEIGHT);
    s.closePath();
    if (withWindow) s.holes.push(makeArchPath());
    return s;
};

const WALL_SEGMENT_WIDTH = getWallSegment(0).width;

/** 带窗的墙段（4 段）与实墙段（4 段）交替，避免 8 个窗把大厅烧成温室 */
const WALL_GEO_WINDOW = new THREE.ExtrudeGeometry(makeWallShape(WALL_SEGMENT_WIDTH, true), {
    depth: WALL_THICKNESS,
    bevelEnabled: false,
    curveSegments: 12,
});
const WALL_GEO_SOLID = new THREE.ExtrudeGeometry(makeWallShape(WALL_SEGMENT_WIDTH, false), {
    depth: WALL_THICKNESS,
    bevelEnabled: false,
    curveSegments: 12,
});

/** 窗玻璃：和窗洞同轮廓的实心薄片，贴在墙体中间，看上去是"外面的冷光" */
const WINDOW_GEO = new THREE.ShapeGeometry(makeArchPath(), 12);

// 檐口：墙顶一圈出挑的石线脚。没有它，画面上方就是"墙突然没了"，
// 有了它才有"屋顶从这儿起"的建筑语言（穹顶本身在常规机位里是看不到的）。
const CORNICE_OUTER_GEO = new THREE.CylinderGeometry(
    octVertexRadius(WALL_INNER_APOTHEM + 0.18),
    octVertexRadius(WALL_INNER_APOTHEM + 0.3),
    0.5, 8, 1, true,
);
const CORNICE_INNER_GEO = new THREE.CylinderGeometry(
    octVertexRadius(WALL_INNER_APOTHEM - 0.05),
    octVertexRadius(WALL_INNER_APOTHEM + 0.2),
    0.34, 8, 1, false,
);

// 墙裙与腰线：让墙不再是一块平板，有了"下重上轻"的垂直层次
const SKIRTING_GEO = new THREE.CylinderGeometry(
    octVertexRadius(WALL_INNER_APOTHEM - 0.02),
    octVertexRadius(WALL_INNER_APOTHEM - 0.02),
    1.25, 8, 1, true,
);
const WAIST_GEO = new THREE.CylinderGeometry(
    octVertexRadius(WALL_INNER_APOTHEM + 0.06),
    octVertexRadius(WALL_INNER_APOTHEM + 0.06),
    0.2, 8, 1, true,
);

/** 穹顶：从采光孔边缘起，到赤道止（thetaStart 让出顶部的洞） */
const DOME_GEO = new THREE.SphereGeometry(
    DOME_RADIUS, 28, 14, 0, Math.PI * 2, OCULUS_ANGLE, Math.PI / 2 - OCULUS_ANGLE,
);
/** 穹顶肋：从赤道拉上来，停在采光孔边 */
const RIB_GEO = new THREE.TorusGeometry(DOME_RADIUS - 0.08, 0.19, 4, 22, Math.PI / 2 - OCULUS_ANGLE);
/** 采光孔的石环 */
const OCULUS_RING_GEO = new THREE.TorusGeometry(OCULUS_RADIUS + 0.1, 0.18, 6, 40);
/** 孔口的天光片（朝下的圆盘） */
const OCULUS_SKY_GEO = new THREE.CircleGeometry(OCULUS_RADIUS + 0.35, 32);

/** 柱间拱券：半圆环压扁成"扁尖拱"，跨度 = 柱间距 */
const ARCADE_GEO = new THREE.TorusGeometry(ARCADE_RADIUS, 0.17, 5, 18, Math.PI);

// 柱高一律由常量推：COLUMN_HEIGHT 改一次，柱身/柱头/方板的高度与 y 全部跟着走，
// 不能再把 3.73 / 7.15 / 7.48 这种数字散在 JSX 里（改尺寸必错）。
const COLUMN_BASE_H = 0.55;
const COLUMN_CAPITAL_H = 0.5;
const COLUMN_ABACUS_H = 0.16;
const COLUMN_SHAFT_H = COLUMN_HEIGHT - COLUMN_BASE_H - COLUMN_CAPITAL_H;
const COLUMN_BASE_GEO = new THREE.CylinderGeometry(COLUMN_SHAFT_RADIUS * 1.55, COLUMN_SHAFT_RADIUS * 1.75, COLUMN_BASE_H, 8);
const COLUMN_SHAFT_GEO = new THREE.CylinderGeometry(COLUMN_SHAFT_RADIUS, COLUMN_SHAFT_RADIUS * 1.07, COLUMN_SHAFT_H, 8);
const COLUMN_CAPITAL_GEO = new THREE.CylinderGeometry(COLUMN_SHAFT_RADIUS * 1.5, COLUMN_SHAFT_RADIUS, COLUMN_CAPITAL_H, 8);
const COLUMN_ABACUS_GEO = new THREE.CylinderGeometry(COLUMN_SHAFT_RADIUS * 1.6, COLUMN_SHAFT_RADIUS * 1.6, COLUMN_ABACUS_H, 8);
const COLUMN_SHAFT_Y = COLUMN_BASE_H + COLUMN_SHAFT_H / 2;
const COLUMN_CAPITAL_Y = COLUMN_HEIGHT - COLUMN_CAPITAL_H / 2;
const COLUMN_ABACUS_Y = COLUMN_HEIGHT + COLUMN_ABACUS_H / 2;

const BRAZIER_STONE_GEO = new THREE.CylinderGeometry(0.62, 0.8, 1.35, 8);
const BRAZIER_BOWL_GEO = new THREE.CylinderGeometry(0.8, 0.5, 0.42, 16, 1, true);
const BRAZIER_RIM_GEO = new THREE.TorusGeometry(0.8, 0.07, 5, 16);

const ALTAR_STEP_A = new THREE.CylinderGeometry(ALTAR.baseRadius, ALTAR.baseRadius + 0.14, 0.24, 8);
const ALTAR_STEP_B = new THREE.CylinderGeometry(ALTAR.baseRadius * 0.9, ALTAR.baseRadius * 0.96, 0.28, 8);
const ALTAR_STEP_C = new THREE.CylinderGeometry(ALTAR.baseRadius * 0.78, ALTAR.baseRadius * 0.83, 0.34, 8);
const ALTAR_BOWL = new THREE.CylinderGeometry(ALTAR.bowlRadius, ALTAR.bowlRadius * 0.78, 0.66, 24, 1, true);
const ALTAR_RIM = new THREE.TorusGeometry(ALTAR.bowlRadius, 0.085, 6, 24);

const FLOOR_RING_A = new THREE.RingGeometry(8.8, 9.02, 56);
const FLOOR_RING_B = new THREE.RingGeometry(14.2, 14.36, 64);
const FLOOR_RING_C = new THREE.RingGeometry(17.0, 17.14, 72);
/** 中央铺装圆盘半径（比 RING_B 略小，让环线压在外面） */
const FLOOR_DISC_RADIUS = 14.2;
const FLOOR_CREST = new THREE.RingGeometry(2.7, 3.05, 8);

const ROCK_GEO = new THREE.IcosahedronGeometry(0.34, 0);
const CHAIN_LINK_GEO = new THREE.TorusGeometry(0.17, 0.048, 4, 9);

/** 确定性伪随机：碎石/断柱每次进房间都在同一处（不会一进门就换一套废墟） */
const mulberry32 = (seed: number) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// ── 火焰核心（祭坛与四角火盆共用） ────────────────────────

/**
 * 低多边形火苗：一簇会呼吸、会自转的五棱锥。
 *
 * 营地那堆火用的是 16×16 像素火焰贴图（MC 风），在方块世界里是对的；
 * 搬进这套光滑石殿就成了"贴纸"——方块的锯齿和低多边形的棱线放在一起，两种语言打架。
 * 所以这里整个换掉：三支大小不同的锥体 + 内焰，逐帧抖动缩放，不加载任何贴图。
 */
// 半透明锥体，**普通混合**保留橙色。
// 一开始用的加色混合：在暗背景上 RGB 相加会把橙色冲成白色，火焰看起来像一根白蜡烛。
// 只有最里面的芯用加色，负责"亮"，外壳用普通混合负责"色"。
const fireMat = (color: string, opacity: number) => new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
});
// 不透明度压到 0.7 上下：火本来就该能透过去看到对面的人，
// 全实心的话发言镜头正好隔着火盆看发言人，人会缺一半。
const FIRE_BODY = fireMat('#ff6a10', 0.62);
const FIRE_SIDE = fireMat('#ff8c22', 0.55);
const FIRE_TIP = fireMat('#ffae3d', 0.62);
const FIRE_CORE = new THREE.MeshBasicMaterial({
    color: '#ffd166',
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
});

const FlameCluster: React.FC<{ base: number; scale: number }> = ({ base, scale }) => {
    const groupRef = useRef<THREE.Group>(null);
    const tongues = useRef<(THREE.Mesh | null)[]>([]);

    useFrame(({ clock }) => {
        const t = prefersReducedMotion ? 0 : clock.elapsedTime;
        tongues.current.forEach((m, i) => {
            if (!m) return;
            const ph = i * 1.7;
            const breath = prefersReducedMotion ? 1 : 0.86 + Math.sin(t * 7.3 + ph) * 0.16 + Math.sin(t * 13.1 + ph) * 0.07;
            m.scale.set(scale * (0.94 + Math.sin(t * 9.1 + ph * 1.4) * 0.08), scale * breath, scale * (0.94 + Math.cos(t * 8.3 + ph) * 0.08));
            // 记住 JSX 里给的基准高度：每支焰的位置不一样，逐帧覆盖会把错落感抹平
            if (m.userData.y0 === undefined) m.userData.y0 = m.position.y;
            m.position.y = (m.userData.y0 as number) + (prefersReducedMotion ? 0 : Math.sin(t * 6.2 + ph) * 0.045);
            if (!prefersReducedMotion) m.rotation.y = t * (0.7 + i * 0.35);
        });
    });

    return (
        <group ref={groupRef}>
            {/* 一支主焰 + 三支高低错落的侧焰 + 内芯。
                单锥从 10m 外看就是一个实心三角；轮廓要有分叉才像火。 */}
            <mesh ref={(el) => { tongues.current[0] = el; }} position={[0, base, 0]} material={FIRE_BODY}>
                <coneGeometry args={[0.34 * scale, 1.9 * scale, 5]} />
            </mesh>
            <mesh ref={(el) => { tongues.current[1] = el; }} position={[0.34 * scale, base * 0.82, 0.1 * scale]} rotation={[0.1, 0, -0.2]} material={FIRE_SIDE}>
                <coneGeometry args={[0.18 * scale, 1.3 * scale, 4]} />
            </mesh>
            <mesh ref={(el) => { tongues.current[2] = el; }} position={[-0.3 * scale, base * 0.88, -0.12 * scale]} rotation={[-0.14, 0, 0.24]} material={FIRE_SIDE}>
                <coneGeometry args={[0.16 * scale, 1.1 * scale, 4]} />
            </mesh>
            <mesh ref={(el) => { tongues.current[3] = el; }} position={[0.12 * scale, base * 0.72, -0.32 * scale]} rotation={[-0.22, 0, 0.06]} material={FIRE_TIP}>
                <coneGeometry args={[0.12 * scale, 0.78 * scale, 4]} />
            </mesh>
            <mesh position={[-0.1 * scale, base * 0.66, 0.3 * scale]} rotation={[0.24, 0, -0.08]} material={FIRE_TIP}>
                <coneGeometry args={[0.1 * scale, 0.66 * scale, 4]} />
            </mesh>
            <mesh ref={(el) => { tongues.current[4] = el; }} position={[0.02 * scale, base * 0.9, 0.06 * scale]} material={FIRE_CORE}>
                <coneGeometry args={[0.12 * scale, 1.1 * scale, 5]} />
            </mesh>
        </group>
    );
};

const FireCore: React.FC<{
    /** 火焰面片尺寸 */
    width: number;
    height: number;
    /** 光晕大小 */
    glow: number;
}> = ({ height, glow }) => {
    const glowMatRef = useRef<THREE.SpriteMaterial>(null);
    useFrame(({ clock }) => {
        if (!glowMatRef.current) return;
        const t = prefersReducedMotion ? 0 : clock.elapsedTime;
        const breath = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * 6.1) * 0.13 + Math.sin(t * 12.7) * 0.05;
        glowMatRef.current.opacity = 0.26 + breath * 0.16;
    });
    return (
        <group>
            {/* base 抬到半个锥高：圆锥的原点在中心，不抬的话半截会插进盆里 */}
            <FlameCluster base={height * 0.5} scale={height / 1.9} />
            <sprite scale={[glow, glow, 1]} renderOrder={3}>
                <spriteMaterial
                    ref={glowMatRef}
                    map={getGlowTexture()}
                    transparent
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                    opacity={0.4}
                />
            </sprite>
        </group>
    );
};

// ── 中央祭坛（取代营火：三层石台 + 铁盆 + 火星 + 烟） ──────

/**
 * 中央祭坛：三层石台 + 铁火盆。
 *
 * **盆里不生明火**。玩家反馈"火太强"：一团 2m 高的橙火在 41m 见方的厅里过于抢眼，
 * 而且把围坐的人挡掉一半、把整间屋子照成一片橙。一口黑铁盆本身已经够有仪式感 ——
 * 光交给四角火盆和拱窗，中心只留暗红余烬，明灭很慢，不抢戏。
 */
const AltarBrazier: React.FC = () => {
    const emberMat = useRef<THREE.MeshStandardMaterial>(null);

    useFrame(({ clock }) => {
        if (!emberMat.current) return;
        const t = prefersReducedMotion ? 0 : clock.elapsedTime;
        // 余烬呼吸：0.3~0.42 之间缓慢起伏，周期约 6s（明火是 13Hz 的跳动，这里刻意慢下来）
        emberMat.current.emissiveIntensity = prefersReducedMotion
            ? 0.36
            : 0.36 + Math.sin(t * 1.05) * 0.05 + Math.sin(t * 2.3) * 0.02;
    });

    return (
        <group>
            {/* 三层八角石台 */}
            <mesh geometry={ALTAR_STEP_A} position={[0, 0.11, 0]} material={stoneDark()} receiveShadow />
            <mesh geometry={ALTAR_STEP_B} position={[0, 0.34, 0]} material={stoneFloor()} receiveShadow />
            <mesh geometry={ALTAR_STEP_C} position={[0, 0.61, 0]} material={stoneDark()} receiveShadow />
            {/* 铁火盆（玩家点名要留的"那口锅"） */}
            <mesh geometry={ALTAR_BOWL} position={[0, 0.92, 0]} material={IRON_DOUBLE} castShadow />
            <mesh geometry={ALTAR_RIM} position={[0, ALTAR.rimY, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ironMat()} />
            {/* 盆底余烬：只有它亮，且亮得很低 */}
            <mesh position={[0, 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.86, 20]} />
                <meshStandardMaterial
                    ref={emberMat}
                    color="#3a1a12"
                    emissive="#c8401a"
                    emissiveIntensity={0.36}
                    roughness={1}
                />
            </mesh>
            {/* 余烬的微光：只要让盆沿挂一圈暖边，不参与整个房间的照明 */}
            <pointLight position={[0, ALTAR.rimY + 0.45, 0]} color="#ff7a34" intensity={18} distance={16} decay={2} />
        </group>
    );
};

// ── 四角地面火盆（厅里唯一的明火，与中央祭坛的余烬形成对照） ──────

const GroundBrazier: React.FC<{ x: number; z: number }> = ({ x, z }) => (
    <group position={[x, 0, z]}>
        <mesh geometry={BRAZIER_STONE_GEO} position={[0, 0.675, 0]} material={stoneColumnDark()} castShadow receiveShadow />
        <mesh geometry={BRAZIER_BOWL_GEO} position={[0, 1.5, 0]} material={IRON_DOUBLE} />
        <mesh geometry={BRAZIER_RIM_GEO} position={[0, BRAZIER_HEIGHT, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ironMat()} />
        <mesh position={[0, 1.46, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.7, 16]} />
            <meshStandardMaterial color={C.ember} emissive={C.ember} emissiveIntensity={1.7} roughness={1} />
        </mesh>
        <group position={[0, BRAZIER_HEIGHT + 0.34, 0]}>
            <FireCore width={1.15} height={1.2} glow={2.9} />
        </group>
        <pointLight position={[0, BRAZIER_HEIGHT + 0.8, 0]} color="#ffa64d" intensity={42} distance={26} decay={2} />
    </group>
);

// ── 柱壁灯（8 盏，纯自发光 + 光晕，不再加实光以免光源超预算） ──

const Sconce: React.FC<{ x: number; z: number; angle: number }> = ({ x, z, angle }) => (
    // group 的 +Z 朝厅外，所以灯托往 -Z 伸（朝厅心）
    <group position={[x, 0, z]} rotation={[0, -angle + Math.PI / 2, 0]}>
        <mesh position={[0, 5.24, -0.3]} rotation={[Math.PI / 2, 0, 0]} material={ironMat()}>
            <cylinderGeometry args={[0.055, 0.055, 0.8, 5]} />
        </mesh>
        <mesh position={[0, 5.6, -0.66]} material={ironMat()}>
            <coneGeometry args={[0.24, 0.34, 6]} />
        </mesh>
        <mesh position={[0, 5.38, -0.66]}>
            <sphereGeometry args={[0.185, 8, 6]} />
            <meshStandardMaterial color="#ffcf7a" emissive="#ffb457" emissiveIntensity={2.6} toneMapped={false} />
        </mesh>
        <sprite position={[0, 5.38, -0.66]} scale={[2.0, 2.0, 1]}>
            <spriteMaterial
                map={getColdGlowTexture()}
                color="#ffb45a"
                transparent
                opacity={0.3}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
            />
        </sprite>
    </group>
);

// ── 地面符阵：内环刻度 + 外环卢恩 ──────────────────────────
//
// 一笔一个扁平面片，全部塞进一台 InstancedMesh —— 40 条刻痕只花 1 个 draw call。
// 卢恩没有真实字库，用 4 组"笔画组合"轮换，再按八方位旋转，
// 看上去就是 8 个不同的符号（写死 8 套笔画反而更假，因为人会看出重复）。

const GLYPH_PLANE = new THREE.PlaneGeometry(1, 1);
const GLYPH_MAT = new THREE.MeshBasicMaterial({
    color: '#8ef0e0',
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
});

/** dr = 径向偏移(米)，dt = 切向偏移(米)，rot = 相对切向的转角(0=切向, π/2=径向) */
interface RuneStroke { dr: number; dt: number; len: number; rot: number; w: number }

const RUNE_PATTERNS: RuneStroke[][] = [
    [{ dr: -0.2, dt: 0, len: 0.62, rot: 0, w: 0.09 }, { dr: 0.22, dt: 0, len: 0.5, rot: 0, w: 0.09 }, { dr: 0.02, dt: 0, len: 0.5, rot: 0.9, w: 0.08 }],
    [{ dr: 0, dt: -0.16, len: 0.66, rot: 1.45, w: 0.09 }, { dr: 0.02, dt: 0.16, len: 0.44, rot: 0.2, w: 0.08 }, { dr: 0.2, dt: 0.14, len: 0.3, rot: 1.2, w: 0.07 }],
    [{ dr: -0.22, dt: -0.12, len: 0.5, rot: 0.15, w: 0.09 }, { dr: -0.22, dt: 0.12, len: 0.5, rot: -0.15, w: 0.09 }, { dr: 0.12, dt: 0, len: 0.66, rot: 1.4, w: 0.09 }],
    [{ dr: 0, dt: 0, len: 0.72, rot: 1.5, w: 0.1 }, { dr: 0.16, dt: -0.12, len: 0.36, rot: 0.7, w: 0.08 }, { dr: 0.16, dt: 0.12, len: 0.36, rot: -0.7, w: 0.08 }],
];

const TICK_COUNT = 16;
const RUNE_COUNT = 8;
const GLYPH_COUNT = TICK_COUNT + RUNE_COUNT * 3;

const FloorGlyphs: React.FC = () => {
    const ref = useRef<THREE.InstancedMesh>(null);

    React.useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh) return;
        const dummy = new THREE.Object3D();
        const basis = new THREE.Matrix4();
        const vx = new THREE.Vector3();
        const vy = new THREE.Vector3();
        const vz = new THREE.Vector3(0, 1, 0);
        let idx = 0;

        // 把面片平铺在地面上：局部 +X 对齐切向，局部 +Z（法线）朝上
        const put = (x: number, z: number, angle: number, w: number, len: number) => {
            vx.set(Math.cos(angle), 0, Math.sin(angle));
            vy.crossVectors(vz, vx);
            basis.makeBasis(vx, vy, vz);
            dummy.position.set(x, 0.026, z);
            dummy.quaternion.setFromRotationMatrix(basis);
            dummy.scale.set(w, len, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(idx++, dummy.matrix);
        };

        for (let i = 0; i < TICK_COUNT; i++) {
            const a = (i / TICK_COUNT) * Math.PI * 2 + Math.PI / TICK_COUNT;
            put(Math.cos(a) * 5.18, Math.sin(a) * 5.18, a + Math.PI / 2, 0.07, 0.55);
        }

        const R = 6.95;
        for (let i = 0; i < RUNE_COUNT; i++) {
            const base = (i / RUNE_COUNT) * Math.PI * 2 + Math.PI / 16;
            for (const st of RUNE_PATTERNS[i % RUNE_PATTERNS.length]) {
                const ang = base + st.dt / R;
                const rr = R + st.dr;
                put(
                    Math.cos(ang) * rr,
                    Math.sin(ang) * rr,
                    // 切向角 - rot：rot=0 是沿环写，rot=π/2 是沿半径写
                    base + Math.PI / 2 - st.rot,
                    st.w,
                    st.len,
                );
            }
        }

        mesh.instanceMatrix.needsUpdate = true;
    }, []);

    return <instancedMesh ref={ref} args={[GLYPH_PLANE, GLYPH_MAT, GLYPH_COUNT]} frustumCulled={false} />;
};

// ── 地面：八边形石板 + 同心铺装 + 放射石缝（全部是圆/环/线，没有方块） ──

const HallFloor: React.FC = () => {
    // 圆盘要按"边心距 = HALL_RADIUS"换算顶点半径，否则八边形的边会缩进墙里
    const discRadius = HALL_RADIUS / Math.cos(Math.PI / COLUMN_COUNT);
    const spokes = useMemo(
        () => Array.from({ length: COLUMN_COUNT }, (_, i) => (i / COLUMN_COUNT) * Math.PI * 2 + Math.PI / COLUMN_COUNT / 2),
        [],
    );
    return (
        <group>
            {/* 石基底（八边形棱柱，顶面刚好 y=0） */}
            <mesh position={[0, -0.45, 0]} material={stoneDark()} receiveShadow>
                <cylinderGeometry args={[discRadius, discRadius + 0.5, 0.9, COLUMN_COUNT]} />
            </mesh>
            {/* 中央铺装圆盘 */}
            <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stoneFloor()} receiveShadow>
                <circleGeometry args={[FLOOR_DISC_RADIUS, 64]} />
            </mesh>
            {/* 同心铺装环 */}
            <mesh geometry={FLOOR_RING_A} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stoneDark()} />
            <mesh geometry={FLOOR_RING_B} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stoneDark()} />
            <mesh geometry={FLOOR_RING_C} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stoneDark()} />
            {/* 中央八角纹章 */}
            <mesh
                geometry={FLOOR_CREST}
                position={[0, 0.016, 0]}
                rotation={[-Math.PI / 2, 0, Math.PI / 8]}
                material={sharedMat(C.inlay, { roughness: 0.7 })}
            />
            {/* 放射石缝：从纹章外缘射向墙脚 */}
            {spokes.map((a, i) => (
                <mesh
                    key={`spoke-${i}`}
                    position={[Math.cos(a) * 14.3, 0.008, Math.sin(a) * 14.3]}
                    rotation={[0, -a, 0]}
                    material={stoneDark()}
                >
                    <boxGeometry args={[10.6, 0.012, 0.09]} />
                </mesh>
            ))}
            {/* 封印符印：一圈冷青刻痕环。营地地板上不可能出现这个，
                它一眼就把"祭坛"和"围着火聊天"区分开。 */}
            <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[4.86, 5.02, 72]} />
                <meshBasicMaterial
                    color="#6fd8c8"
                    transparent
                    opacity={0.34}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[5.34, 5.4, 72]} />
                <meshBasicMaterial
                    color="#6fd8c8"
                    transparent
                    opacity={0.18}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
            <FloorGlyphs />

            {/* 火光照在地面上的暖色池（叠加在石面之上，不是光源） */}
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[6.2, 48]} />
                <meshBasicMaterial
                    map={getGlowTexture()}
                    color="#ff9a44"
                    transparent
                    opacity={0.22}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
};

// ── 柱廊 ──────────────────────────────────────────────────

const Colonnade: React.FC = () => (
    <>
        {Array.from({ length: COLUMN_COUNT }, (_, i) => {
            const p = getColumnPosition(i);
            const a = getColumnAngle(i);
            return (
                <React.Fragment key={`col-${i}`}>
                    <group position={[p.x, 0, p.z]}>
                        <mesh geometry={COLUMN_BASE_GEO} position={[0, 0.275, 0]} material={stoneColumnDark()} castShadow receiveShadow />
                        <mesh geometry={COLUMN_SHAFT_GEO} position={[0, COLUMN_SHAFT_Y, 0]} material={stoneColumn()} castShadow receiveShadow />
                        <mesh geometry={COLUMN_CAPITAL_GEO} position={[0, COLUMN_CAPITAL_Y, 0]} material={stoneColumn()} castShadow />
                        <mesh geometry={COLUMN_ABACUS_GEO} position={[0, COLUMN_ABACUS_Y, 0]} material={stoneColumnDark()} castShadow />
                    </group>
                    <Sconce
                        x={Math.cos(a) * (COLUMN_RADIUS - 0.72)}
                        z={Math.sin(a) * (COLUMN_RADIUS - 0.72)}
                        angle={a}
                    />
                </React.Fragment>
            );
        })}
    </>
);

// ── 墙体（8 段挤出折线，4 段带尖拱窗） + 窗光 + 光柱 ──────

/** 8 段墙全部开窗；只有 4 段配光柱，避免整间屋子被冷光切碎 */
const WINDOW_SEGMENT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];
const RAY_SEGMENT_INDICES = [0, 2, 4, 6];

const Walls: React.FC = () => {
    const segments = useMemo(
        () => Array.from({ length: COLUMN_COUNT }, (_, i) => getWallSegment(i)),
        [],
    );
    // 光柱：从窗口斜插到地面，方向/长度/朝向一次算好
    const rays = useMemo(
        () => RAY_SEGMENT_INDICES.map(i => {
            const a = getColumnAngle(i);
            // 起点贴住拱窗（半径 ≈ 墙内表面），终点落在祭坛外圈
            const from = new THREE.Vector3(Math.cos(a) * 19.4, 7.0, Math.sin(a) * 19.4);
            const to = new THREE.Vector3(Math.cos(a) * 3.6, 0.15, Math.sin(a) * 3.6);
            const dir = to.clone().sub(from);
            const len = dir.length();
            return {
                key: `ray-${i}`,
                mid: from.clone().add(to).multiplyScalar(0.5),
                len,
                quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
            };
        }),
        [],
    );

    const glassMat = useMemo(() => GLASS_MATERIAL, []);
    const rayMat = useMemo(() => new THREE.MeshBasicMaterial({
        color: C.moon,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
    }), []);

    return (
        <group>
            {segments.map((seg, i) => {
                const hasWindow = WINDOW_SEGMENT_INDICES.includes(i);
                return (
                    <group
                        key={`wall-${i}`}
                        position={[Math.cos(getColumnAngle(i)) * (HALL_RADIUS - WALL_THICKNESS / 2), 0, Math.sin(getColumnAngle(i)) * (HALL_RADIUS - WALL_THICKNESS / 2)]}
                        rotation={[0, seg.angle, 0]}
                    >
                        <mesh
                            geometry={hasWindow ? WALL_GEO_WINDOW : WALL_GEO_SOLID}
                            material={stoneWall()}
                            castShadow
                            receiveShadow
                        />
                        {hasWindow && (
                            <mesh geometry={WINDOW_GEO} position={[0, 0, WALL_THICKNESS * 0.16]} material={glassMat} />
                        )}
                        {/* 墙脚线脚：一段横向石条，压住地面与墙的接缝 */}
                        <mesh position={[0, 0.22, WALL_THICKNESS * 0.5 + 0.06]} material={stoneColumnDark()}>
                            <boxGeometry args={[seg.width, 0.44, 0.12]} />
                        </mesh>
                    </group>
                );
            })}
            {rays.map(r => (
                <mesh key={r.key} position={r.mid} quaternion={r.quaternion} material={rayMat}>
                    <cylinderGeometry args={[0.85, 3.4, r.len, 10, 1, true]} />
                </mesh>
            ))}
            {/* 只给对角的两个窗配实光：4 盏冷光够把地面切成冷暖两半，
                全配会让整间屋子发蓝，火光就没戏了（也省 2 个逐帧光源） */}
            {[0, 4].map(i => {
                const a = getColumnAngle(i);
                return (
                    <pointLight
                        key={`moon-${i}`}
                        position={[Math.cos(a) * 16.6, 6.8, Math.sin(a) * 16.6]}
                        color="#8fb6d9"
                        intensity={26}
                        distance={26}
                        decay={2}
                    />
                );
            })}
        </group>
    );
};

/**
 * 室内外壳：一个包住整间厅的暗色球（只画内表面）。
 *
 * 穹顶是半球、赤道在墙顶，仰角一大视线就会从穹顶边缘**上方**穿出去，
 * 露出的就是场景背景色（一片纯黑），看起来像屋顶破了个洞。
 * 壳子不是拿来"看"的，是兜底：任何角度穿出去看到的都是石色，而不是天空。
 */
const SHELL_RADIUS = 46;
const SHELL_MATERIAL = new THREE.MeshBasicMaterial({
    color: '#232833',
    side: THREE.BackSide,
    toneMapped: false,
});

const InteriorShell: React.FC = () => (
    <mesh material={SHELL_MATERIAL} frustumCulled={false}>
        <sphereGeometry args={[SHELL_RADIUS, 24, 16]} />
    </mesh>
);

// ── 穹顶 ──────────────────────────────────────────────────

const Dome: React.FC = () => (
    <group position={[0, DOME_BASE_Y, 0]}>
        {/* 半径 20.5 的正半球有 20.5m 高、顶点到 31m，从厅内看超出雾距只剩一片空。
            整组按 DOME_SQUASH 压扁成 12.7m 的浅穹顶（肋、采光孔一起压，否则肋会浮在顶外）。 */}
        <group scale={[1, DOME_SQUASH, 1]}>
            <mesh geometry={DOME_GEO} material={DOME_MATERIAL} />
            {Array.from({ length: COLUMN_COUNT }, (_, i) => (
                <mesh
                    key={`rib-${i}`}
                    geometry={RIB_GEO}
                    rotation={[0, (i / COLUMN_COUNT) * Math.PI * 2 + Math.PI / COLUMN_COUNT / 2, 0]}
                    material={stoneColumnDark()}
                />
            ))}
        </group>
        {/* 檐口（墙顶线脚） */}
        <mesh geometry={CORNICE_OUTER_GEO} position={[0, -0.25, 0]} material={stoneColumn()} />
        <mesh geometry={CORNICE_INNER_GEO} position={[0, -0.5, 0]} material={stoneColumnDark()} />
        {/* 穹顶顶心的铁环（把视线收住，穹顶不至于是一片空壳）。
            高度必须按压扁后的穹顶算，否则铁环会挂在 20m 的空中。 */}
        <mesh position={[0, DOME_RADIUS * DOME_SQUASH - 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ironMat()}>
            <torusGeometry args={[1.5, 0.09, 5, 24]} />
        </mesh>
    </group>
);

// ── 柱间拱券 ──────────────────────────────────────────────

const Arcade: React.FC = () => (
    <>
        {Array.from({ length: COLUMN_COUNT }, (_, i) => {
            // 柱间中点：柱位角 + 半个柱间角
            const m = getColumnAngle(i) + Math.PI / COLUMN_COUNT;
            return (
                <group
                    key={`arcade-${i}`}
                    position={[Math.cos(m) * COLUMN_RADIUS, ARCADE_SPRING_Y, Math.sin(m) * COLUMN_RADIUS]}
                    rotation={[0, m + Math.PI / 2, 0]}
                >
                    {/* 半圆环压扁成扁拱：不压扁的话 9.3m 的跨度会把拱顶顶穿檐口 */}
                    <mesh geometry={ARCADE_GEO} scale={[1, ARCADE_FLATTEN, 1]} material={stoneColumnDark()} castShadow />
                </group>
            );
        })}
    </>
);

// ── 墙裙 / 腰线 ────────────────────────────────────────────

const WallBands: React.FC = () => (
    <>
        <mesh geometry={SKIRTING_GEO} position={[0, 0.8, 0]} material={stoneColumnDark()} receiveShadow />
        <mesh geometry={WAIST_GEO} position={[0, 5.8, 0]} material={stoneColumn()} />
    </>
);

// ── 穹顶采光孔：一束冷光垂直落在祭坛火上 ──────────────────

const DUST_COUNT = 72;

const OculusLight: React.FC = () => {
    const dustRef = useRef<THREE.Points>(null);
    const dust = useMemo(() => {
        const rnd = mulberry32(4471);
        const pos = new Float32Array(DUST_COUNT * 3);
        const speed = new Float32Array(DUST_COUNT);
        for (let i = 0; i < DUST_COUNT; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd()) * 7.0;
            pos[i * 3] = Math.cos(a) * r;
            pos[i * 3 + 1] = rnd() * OCULUS_Y;
            pos[i * 3 + 2] = Math.sin(a) * r;
            speed[i] = 0.18 + rnd() * 0.34;
        }
        return { pos, speed };
    }, []);

    useFrame((_, delta) => {
        const pts = dustRef.current;
        if (!pts) return;
        const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < DUST_COUNT; i++) {
            // 尘埃在光柱里缓缓下沉，到底就回到顶上（循环）
            let y = dust.pos[i * 3 + 1] - (prefersReducedMotion ? 0 : delta * dust.speed[i]);
            if (y < 0.2) y = OCULUS_Y - 0.5;
            dust.pos[i * 3 + 1] = y;
            attr.setY(i, y);
        }
        attr.needsUpdate = true;
    });

    return (
        <group>
            {/* 孔口石环 */}
            <mesh
                geometry={OCULUS_RING_GEO}
                position={[0, OCULUS_Y, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                material={stoneColumnDark()}
            />
            {/* 孔外的天光片：从厅内透过洞看到的"天" */}
            <mesh geometry={OCULUS_SKY_GEO} position={[0, OCULUS_Y + 0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <meshBasicMaterial color="#c3daf1" toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            {/* 两道光柱：外层散开、内层更亮 */}
            <mesh position={[0, OCULUS_Y / 2, 0]}>
                <cylinderGeometry args={[OCULUS_RADIUS * 0.92, 7.6, OCULUS_Y, 20, 1, true]} />
                <meshBasicMaterial
                    color="#86b0d6"
                    transparent
                    opacity={0.019}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[0, OCULUS_Y / 2, 0]}>
                <cylinderGeometry args={[OCULUS_RADIUS * 0.6, 4.4, OCULUS_Y, 16, 1, true]} />
                <meshBasicMaterial
                    color="#b6d3ee"
                    transparent
                    opacity={0.032}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                />
            </mesh>
            {/* 地面光斑 */}
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[7.2, 48]} />
                <meshBasicMaterial
                    map={getColdGlowTexture()}
                    color="#a8c9e6"
                    transparent
                    opacity={0.12}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
            {/* 光柱里的浮尘：光要"有体积"，靠的是这些尘埃 */}
            <points ref={dustRef} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[dust.pos, 3]} />
                </bufferGeometry>
                <pointsMaterial
                    // 必须给贴图：没有 map 的 pointsMaterial 渲染的是**方形**点，
                    // 近景看就是一圈小白方块撒在角色脚边（像骰子）
                    map={getGlowTexture()}
                    color="#dcecff"
                    size={0.075}
                    sizeAttenuation
                    transparent
                    opacity={0.3}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </points>
        </group>
    );
};

// ── 废墟细节：碎石、断柱、铁链 ────────────────────────────

const DEBRIS_ROCK_COUNT = 46;
const DEBRIS_LINK_COUNT = 26;

const Debris: React.FC = () => {
    const rocksRef = useRef<THREE.InstancedMesh>(null);
    const linksRef = useRef<THREE.InstancedMesh>(null);

    const broken = useMemo(() => {
        const rnd = mulberry32(70311);
        return Array.from({ length: 3 }, () => {
            const a = rnd() * Math.PI * 2;
            const r = 12.6 + rnd() * 3.2;
            return {
                x: Math.cos(a) * r,
                z: Math.sin(a) * r,
                rot: rnd() * Math.PI,
                len: 1.8 + rnd() * 1.6,
            };
        });
    }, []);

    React.useLayoutEffect(() => {
        const rnd = mulberry32(9182);
        const dummy = new THREE.Object3D();
        if (rocksRef.current) {
            for (let i = 0; i < DEBRIS_ROCK_COUNT; i++) {
                const a = rnd() * Math.PI * 2;
                const r = 10.5 + rnd() * 7.2;
                dummy.position.set(Math.cos(a) * r, 0.06 + rnd() * 0.1, Math.sin(a) * r);
                dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
                const s = 0.28 + rnd() * 0.62;
                dummy.scale.set(s, s * 0.55, s * 1.1);
                dummy.updateMatrix();
                rocksRef.current.setMatrixAt(i, dummy.matrix);
            }
            rocksRef.current.instanceMatrix.needsUpdate = true;
        }
        if (linksRef.current) {
            const a0 = 2.1;
            for (let i = 0; i < DEBRIS_LINK_COUNT; i++) {
                const t = i / DEBRIS_LINK_COUNT;
                const r = 9.0 + t * 5.6;
                const a = a0 + Math.sin(t * 3.4) * 0.35;
                dummy.position.set(Math.cos(a) * r, 0.055, Math.sin(a) * r);
                dummy.rotation.set(Math.PI / 2, t * 9, 0);
                dummy.scale.setScalar(0.85 + rnd() * 0.2);
                dummy.updateMatrix();
                linksRef.current.setMatrixAt(i, dummy.matrix);
            }
            linksRef.current.instanceMatrix.needsUpdate = true;
        }
    }, []);

    return (
        <group>
            <instancedMesh
                ref={rocksRef}
                args={[ROCK_GEO, sharedMat('#33383f', { roughness: 1, flat: true }), DEBRIS_ROCK_COUNT]}
                castShadow
                frustumCulled={false}
            />
            <instancedMesh ref={linksRef} args={[CHAIN_LINK_GEO, ironMat(), DEBRIS_LINK_COUNT]} frustumCulled={false} />
            {broken.map((b, i) => (
                <mesh
                    key={`broken-${i}`}
                    position={[b.x, 0.5, b.z]}
                    rotation={[0, b.rot, Math.PI / 2]}
                    material={stoneColumn()}
                    castShadow
                >
                    <cylinderGeometry args={[COLUMN_SHAFT_RADIUS * 0.9, COLUMN_SHAFT_RADIUS, b.len, 8]} />
                </mesh>
            ))}
        </group>
    );
};

// ── 导出 ──────────────────────────────────────────────────

export const CryptHall: React.FC = () => (
    <group>
        <InteriorShell />
        <HallFloor />
        <Colonnade />
        <Walls />
        <Dome />
        <Arcade />
        <WallBands />
        <OculusLight />
        <AltarBrazier />
        {Array.from({ length: BRAZIER_COUNT }, (_, i) => {
            const p = getBrazierPosition(i);
            return <GroundBrazier key={`brazier-${i}`} x={p.x} z={p.z} />;
        })}
        <Debris />
    </group>
);

CryptHall.displayName = 'CryptHall';
