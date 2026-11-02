// 相机避让：营地里的木屋、瞭望塔、水井本身就立在座位圈外面，
// 一旦机位绕到它们背后，画面前景就是一堵木板墙/一根柱子，把营火和角色挡个干净。
//
// 这里只做一件事：给定「看哪里」和「机位」，算出一个 0~1 的比例，把机位沿视线拉近到
// 第一个挡在中间的柱体之前。纯数学、无 three 依赖，可以直接单测。
//
// 判据是柱体（俯视是圆、侧面是竖直的圆柱），不是精确网格：营地道具都是方方正正的，
// 用外接圆包一层既够用又便宜（每次每帧几十次求交，可忽略）。

export interface CameraBlocker {
  /** 世界坐标 x */
  x: number;
  /** 世界坐标 z */
  z: number;
  /** 俯视外接圆半径 */
  radius: number;
  /** 顶端高度（米）；视线在该处高于它就不算被挡 */
  height: number;
}

export interface ClearanceOptions {
  /** 额外余量：机位停在挡物体表面外多远 */
  margin?: number;
  /** 最近能拉到多近，避免钻进角色脑袋 */
  minDistance?: number;
}

const DEFAULTS: Required<ClearanceOptions> = { margin: 0.7, minDistance: 3.2 };

/**
 * 返回机位应乘的比例（1 = 不动，越小越靠近 look）。
 * 多个遮挡物取最严格的那个。
 */
export function getClearanceFactor(
  look: { x: number; y: number; z: number },
  cam: { x: number; y: number; z: number },
  blockers: readonly CameraBlocker[],
  options: ClearanceOptions = {},
): number {
  const { margin, minDistance } = { ...DEFAULTS, ...options };
  const dx = cam.x - look.x;
  const dy = cam.y - look.y;
  const dz = cam.z - look.z;
  const flatLen2 = dx * dx + dz * dz;
  if (flatLen2 < 1e-6) return 1;
  const fullLen = Math.hypot(dx, dy, dz);
  if (fullLen < minDistance) return 1;

  let best = 1;
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    const r = b.radius + margin;
    const ox = look.x - b.x;
    const oz = look.z - b.z;
    // |look + t*(cam-look) - b|^2 = r^2，只解水平面
    const a = flatLen2;
    const half = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - r * r;
    // 起点就在圆内（例如看的人本身站得离道具很近）：不算遮挡，否则机位会缩到脸上
    if (c <= 0) continue;
    const disc = half * half - a * c;
    if (disc <= 0) continue;
    const sq = Math.sqrt(disc);
    const tEnter = (-half - sq) / a;
    if (tEnter <= 0.02 || tEnter >= best) continue;
    // 视线在那个距离处的高度：高过遮挡物顶端就不算挡
    const yAtHit = look.y + dy * tEnter;
    if (yAtHit > b.height) continue;
    // margin 已经算进半径里了（相当于停在表面外 0.7m），这里不要再减一次
    const factor = Math.max(minDistance, fullLen * tEnter) / fullLen;
    if (factor < best) best = factor;
  }
  return Math.max(0.08, best);
}

/** 把机位沿 look→cam 方向缩到比例 f 处（就地返回新值，不改入参） */
export function applyClearance(
  look: { x: number; y: number; z: number },
  cam: { x: number; y: number; z: number },
  f: number,
): { x: number; y: number; z: number } {
  if (f >= 1) return { x: cam.x, y: cam.y, z: cam.z };
  return {
    x: look.x + (cam.x - look.x) * f,
    y: look.y + (cam.y - look.y) * f,
    z: look.z + (cam.z - look.z) * f,
  };
}

// ── 室内房间边界 ────────────────────────────────────────────
//
// 室内场景和营地不一样：营地外圈是开阔地形，机位爱退多远都只是"看到更多树"；
// 石殿是一间有墙有顶的房子，玩家把镜头往外一拉就会**穿墙 / 钻进穹顶**——
// 钻进去之后视野被屋顶内表面接管，画面上只剩名称牌和背景色，看起来像渲染崩了。
//
// 所以室内必须给机位一个硬边界：水平半径不进柱圈、高度不越过檐口。
// 这里只做几何裁剪，不依赖 three，可以直接单测。

export interface RoomBounds {
  /** 机位允许的最大水平半径（离房间中轴；一般取"柱圈半径 - 余量"） */
  maxRadius: number;
  /** 允许的最高机位高度（一般取"檐口 - 余量"，确保还在屋顶下方） */
  maxHeight: number;
  /** 允许的最低机位高度（别沉到地板下面） */
  minHeight: number;
}

/**
 * 把机位夹回房间内。
 * 水平方向按比例缩到 maxRadius（保持方位不变，看起来像"被墙挡住"），高度单独夹紧。
 */
export function clampCameraToRoom(
  cam: { x: number; y: number; z: number },
  bounds: RoomBounds,
): { x: number; y: number; z: number } {
  let { x, z } = cam;
  const r = Math.hypot(x, z);
  if (r > bounds.maxRadius && r > 1e-6) {
    const k = bounds.maxRadius / r;
    x *= k;
    z *= k;
  }
  const y = Math.min(bounds.maxHeight, Math.max(bounds.minHeight, cam.y));
  return { x, y, z };
}
