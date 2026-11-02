// 深渊圣殿（Crypt Hall）的布局数据：纯数字，不引 three，可直接单测。
//
// 为什么单独拆一份模型：营地那套是"方块地形 + 一圈木屋"，坐标散在 ForestCampScene 的
// CAMP_LAYOUT 里够用；圣殿是八边形柱廊 + 拱券 + 穹顶，柱位、墙段、窗、火盆之间有严格角度关系，
// 写在 JSX 里就没法验证"柱子有没有压住座位、火盆有没有挡机位"了。

import type { CameraBlocker } from './cameraClearance';

/**
 * 八边形大厅的边心距（= 地面/墙的内切半径）。
 *
 * 14.2 → 20.5：14.2 那版整个厅只有 28m 对径，玩家把镜头往外一拉就穿墙/钻屋顶，
 * 因为机位在墙内根本没有可退的空间。坐到 20.5 之后柱圈在 17.4、墙内表面 20.07，
 * 机位从中心可以一路退到 15m 还留在柱廊里侧。
 */
export const HALL_RADIUS = 20.5;
/** 墙高（到起拱线以上、穹顶落下的位置）。空间变大后墙也要跟着长，否则比例会被压扁 */
export const WALL_HEIGHT = 10.8;
/** 穹顶半球半径与起算高度 */
export const DOME_RADIUS = HALL_RADIUS;
export const DOME_BASE_Y = WALL_HEIGHT;
/**
 * 穹顶竖向压扁系数。
 * 半径 20.5 的半球有 20.5m 高，顶点会到 31m —— 从厅内看那已经超出雾距，
 * 抬头只剩一片空。压到 0.62（12.7m 高的浅穹顶）才符合"人站在 41m 见方的厅里"的观感。
 */
export const DOME_SQUASH = 0.62;
/** 墙厚 */
export const WALL_THICKNESS = 0.85;
/** 墙面内表面到中心的边心距 */
export const WALL_INNER_APOTHEM = HALL_RADIUS - WALL_THICKNESS / 2;


/** 穹顶采光孔（oculus）：顶部开口半角。半径与孔口高度由它推出 */
export const OCULUS_ANGLE = 0.125;
export const OCULUS_RADIUS = DOME_RADIUS * Math.sin(OCULUS_ANGLE);
/** 孔口高度要按压扁系数算，否则石环会浮在穹顶上方 8m 的空中 */
export const OCULUS_Y = DOME_BASE_Y + DOME_RADIUS * Math.cos(OCULUS_ANGLE) * DOME_SQUASH;

/** 柱廊：8 根八角柱，柱心半径比墙略内收，柱顶低于墙顶（留出檐口） */
export const COLUMN_COUNT = 8;
export const COLUMN_RADIUS = 17.4;
export const COLUMN_HEIGHT = 9.6;
export const COLUMN_SHAFT_RADIUS = 0.78;

/**
 * 柱间拱券：跨两柱的半圆环，压扁到 ARCADE_FLATTEN。
 * 拱顶必须留在檐口（WALL_HEIGHT）以下，否则拱肋会从屋顶里穿出去。
 */
export const ARCADE_RADIUS = COLUMN_RADIUS * Math.sin(Math.PI / COLUMN_COUNT);
export const ARCADE_SPRING_Y = 8.9;
/** 跨度从 9.3m 涨到 13.3m，压扁比也要跟着收（3.2 → 2.2 分之一），否则拱顶顶穿檐口 */
export const ARCADE_FLATTEN = 0.2;
export const ARCADE_HALF_SPAN = ARCADE_RADIUS;

/**
 * 八边形柱体的"顶点半径"：CylinderGeometry 的 radius 落在顶点上，
 * 而墙是按边心距（平面到中心）定义的。直接拿边心距当 radius 会让墙裙/檐口缩进墙里，
 * 这条换算不写清楚就会反复踩。
 */
export const octVertexRadius = (apothem: number): number => apothem / Math.cos(Math.PI / COLUMN_COUNT);

/** 尖拱窗：窗台高度 / 起拱高度 / 半宽（尖顶高度由半宽推出） */
export const ARCH = {
    halfWidth: 1.55,
    sill: 2.4,
    spring: 6.4,
} as const;

/**
 * 尖拱（lancet arch）的尖顶高度。
 * 两段圆弧圆心在对面肩点、半径 = 2×半宽，交汇点正好在 spring + √3×halfWidth。
 * 这个关系式是尖拱的几何定义，不是凑出来的：写错就会变成"圆拱"或两条接不上的弧。
 */
export const ARCH_APEX = ARCH.spring + Math.sqrt(3) * ARCH.halfWidth;

/** 地心祭坛（原营火的位置）：三层石台 + 铁火盆 */
export const ALTAR = {
    /** 台阶外径。2.4 时会顶着发言机位（机位半径 3.4），只剩 1m 间距，
     *  铁盆会糊在画面左下角占掉四分之一屏。收到 1.9 留出 1.5m。 */
    baseRadius: 1.9,
    /** 火盆口径。0.85 才像"一口祭器"，1.0 在发言机位左下角是一整块黑 */
    bowlRadius: 0.85,
    /** 火盆沿高（火焰从这儿往上长）。压到 1.15，坐在对面的人下半身才不被盆沿切掉 */
    rimY: 1.15,
} as const;

/** 四角火盆：立在柱间空当的地面石墩上 */
export const BRAZIER_COUNT = 4;
/** 座位圈外面一圈：座位最大 4.8m，火盆放到 9.8 才在人群外侧照明 */
export const BRAZIER_RING_RADIUS = 9.8;
export const BRAZIER_HEIGHT = 1.95;

/** 墙段/柱/火盆共用的方位角：墙段与柱同方位（柱 = 壁柱），火盆落在柱间空当 */
const segStep = (Math.PI * 2) / COLUMN_COUNT;
/** 从 22.5° 起排，避开 9 人桌的 0° 座位（正北）——柱脚不会顶在某个人的椅背上 */
const SEG_START = segStep / 2;

export const getColumnAngle = (i: number): number => SEG_START + i * segStep;
/**
 * 火盆落在柱间空当，但从 0° 起排（而不是 45°）。
 * 全景机位在 46.8° 方向、约 11m 外，45° 那盏火盆正好卡在镜头正下方被画面下沿切一半；
 * 从 0° 起排后，最近的也在水平视野 38° 之外，画面前景是干净的地面。
 */
export const getBrazierAngle = (i: number): number => (i / BRAZIER_COUNT) * Math.PI * 2;

export const getColumnPosition = (i: number): { x: number; z: number } => {
    const a = getColumnAngle(i);
    return { x: Math.cos(a) * COLUMN_RADIUS, z: Math.sin(a) * COLUMN_RADIUS };
};

export const getBrazierPosition = (i: number): { x: number; z: number } => {
    const a = getBrazierAngle(i);
    return { x: Math.cos(a) * BRAZIER_RING_RADIUS, z: Math.sin(a) * BRAZIER_RING_RADIUS };
};

/** 每段墙的中点在墙半径上、朝向中心 */
export const getWallSegment = (i: number): { x: number; z: number; angle: number; width: number } => {
    const a = getColumnAngle(i);
    // 八边形弦长 = 2R·sin(π/8)
    const width = 2 * HALL_RADIUS * Math.sin(Math.PI / COLUMN_COUNT);
    return {
        x: Math.cos(a) * HALL_RADIUS,
        z: Math.sin(a) * HALL_RADIUS,
        // 墙面法线朝内 → 几何体绕 Y 转 -(a - π/2)，让 extrude 的 +Y 面贴住八边形边
        angle: -a + Math.PI / 2,
        width,
    };
};

/**
 * 挡视线的柱体（供相机避让）：柱、祭坛、地面火盆。
 * 注意机位在 9.6m 之内、柱在 12.2m —— 视线朝中心时柱总在机位**背后**，
 * 所以这几条只在 top-down / 手拖绕到柱外时才会真的生效。
 */
export const CRYPT_BLOCKERS: readonly CameraBlocker[] = [
    ...Array.from({ length: COLUMN_COUNT }, (_, i) => {
        const p = getColumnPosition(i);
        return { x: p.x, z: p.z, radius: COLUMN_SHAFT_RADIUS + 0.3, height: COLUMN_HEIGHT };
    }),
    // 高度只算到盆沿：火焰是半透明的，不该把发言镜头拉近
    { x: 0, z: 0, radius: ALTAR.baseRadius, height: ALTAR.rimY },
    ...Array.from({ length: BRAZIER_COUNT }, (_, i) => {
        const p = getBrazierPosition(i);
        return { x: p.x, z: p.z, radius: 0.62, height: BRAZIER_HEIGHT };
    }),
];

/** 圣殿是平地：所有道具/角色的落地高度一律 0 */
export const cryptHeightAt = (): number => 0;

/**
 * 室内机位的硬边界。
 *
 * 三条依据：
 * - 水平：停在柱圈里侧 2.4m（15.0m）。再往外一帧就会切进柱子，远景变成一根石柱的特写；
 * - 上限：檐口下方 1.5m（9.3m）。升到 WALL_HEIGHT 以上就进了穹顶内部，
 *   视野被屋顶内表面接管，画面只剩名称牌和背景色（实测 11m 全空）；
 * - 下限：0.9m。低于这个高度会切到石板地面里。
 */
export const CRYPT_ROOM_BOUNDS = {
    maxRadius: COLUMN_RADIUS - 2.4,
    maxHeight: WALL_HEIGHT - 1.5,
    minHeight: 0.9,
} as const;
