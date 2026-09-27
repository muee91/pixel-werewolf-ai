// Pure, testable scene model — no React, no Three.js, no hidden identity reads.

export interface SeatPlacement {
  seatNumber: number;
  x: number;
  y: number;
  z: number;
}

export interface VisiblePlayer {
  id: number;
  seatNumber: number;
  displayName?: string;
  status: string;
  avatarSeed: number;
  isSpeaking: boolean;
  isHuman?: boolean;
  speechText?: string;
  concealed?: boolean;
  hideLabel?: boolean;
}

export interface AvatarDescriptor {
  playerId: number;
  seatNumber: number;
  displayName?: string;
  avatarSeed: number;
  isDead: boolean;
  avatarType: 'character' | 'tombstone';
  isSpeaking: boolean;
  isHuman: boolean;
  speechText?: string;
  concealed: boolean;
  hideLabel: boolean;
}

export interface LightingPreset {
  isNight: boolean;
  ambientIntensity: number;
  directionalIntensity: number;
  skyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  firelightColor: string;
  firelightIntensity: number;
}

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: CameraTarget;
  target: CameraTarget;
}

// ── 方块地形（MC 风格，纯数据，确定性生成） ────────────────

export interface BlockPos {
  x: number;
  y: number;
  z: number;
  /** 所属树索引(仅树木方块携带,供相机遮挡沉降使用) */
  t?: number;
}

export interface BlockyRock {
  x: number;
  y: number;
  z: number;
  s: number;
}

export interface WorldTerrain {
  /** 草地表层方块（中心 y = h - 0.5，顶面 = h） */
  grass: BlockPos[];
  /** 水：半透明水面方块 */
  water: BlockPos[];
  /** 沙：水岸方块 */
  sand: BlockPos[];
  /** 水下/高地泥土 */
  dirt: BlockPos[];
  /** 石头（天际线山体柱） */
  stone: BlockPos[];
  /** 树干（橡木） */
  log: BlockPos[];
  /** 白桦树干 */
  birchLog: BlockPos[];
  /** 树冠 */
  leaves: BlockPos[];
  /** 半埋圆石 */
  rocks: BlockyRock[];
  /** 树干位置（供摆饰/避障参考） */
  trees: { x: number; z: number }[];
  /** 取世界坐标的地面高度（即角色应站立的 y） */
  heightAt: (x: number, z: number) => number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成 MC 风格的方块地形数据（全部 1×1×1 方块，顶面 = y 0）：
 * - 半径 23.5 的草地圆盘（营地内圈 r<3 为泥地）；
 * - r≈26 的天际线：石柱 + 草皮帽，高度按角度噪声起伏；
 * - 外圈橡树/松树/枯树混布（树干进 log、树冠进 leaves）；
 * - 散石与泥土边带做过渡。
 * 确定性：同种子每次生成一致。
 */
export function getWorldTerrain(seed = 20260911): WorldTerrain {
  const rnd = mulberry32(seed);
  const AREA = 34;                 // 世界半径（方块数）
  const WATER_LEVEL = -1;          // 水面高度（陆地 h ≥ 0，营地高地在上）
  const CAMP_R = 7;                // 营地平整半径
  const CAMP_H = 0;                // 营地平台高度

  // 1) 值噪声高度场（粗网格 + 平滑插值，确定性）
  const cell = 9;
  const n = Math.ceil((AREA * 2) / cell) + 3;
  const coarse: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => rnd()),
  );
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const heightRaw = (wx: number, wz: number): number => {
    const gx = (wx + AREA) / cell + 1;
    const gz = (wz + AREA) / cell + 1;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const sx = smooth(gx - x0);
    const sz = smooth(gz - z0);
    const v = (a: number, b: number) => coarse[b]?.[a] ?? 0.5;
    const top = v(x0, z0) * (1 - sx) + v(x0 + 1, z0) * sx;
    const bot = v(x0, z0 + 1) * (1 - sx) + v(x0 + 1, z0 + 1) * sx;
    return top * (1 - sz) + bot * sz;
  };

  // 营地平台向自然地形平滑过渡
  const heightAt = (wx: number, wz: number): number => {
    const d = Math.hypot(wx, wz);
    const raw = -2 + Math.round(heightRaw(wx, wz) * 7); // -2..5
    if (d <= CAMP_R) return CAMP_H;
    if (d >= CAMP_R + 5) return raw;
    const t = smooth((d - CAMP_R) / 5);
    return Math.round(CAMP_H * (1 - t) + raw * t);
  };

  const grass: BlockPos[] = [];
  const dirt: BlockPos[] = [];
  const water: BlockPos[] = [];
  const sand: BlockPos[] = [];
  const log: BlockPos[] = [];
  const birchLog: BlockPos[] = [];
  const stone: BlockPos[] = [];
  const leaves: BlockPos[] = [];
  const rocks: BlockyRock[] = [];
  const trees: { x: number; z: number }[] = [];

  // 2) 逐柱生成：草地/水/沙 + 表层方块
  for (let x = -AREA; x <= AREA; x++) {
    for (let z = -AREA; z <= AREA; z++) {
      const h = heightAt(x, z);
      if (h <= WATER_LEVEL) {
        // 水面统一高度；湖床比水面低时才生成（避免与水面共面闪烁）
        water.push({ x, y: WATER_LEVEL - 0.5, z });
        if (h < WATER_LEVEL) dirt.push({ x, y: h - 0.5, z });
        continue;
      }
      // 水岸一圈沙
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => heightAt(x + dx, z + dz) <= WATER_LEVEL);
      if (nearWater) {
        sand.push({ x, y: h - 0.5, z });
        continue;
      }
      grass.push({ x, y: h - 0.5, z });
    }
  }

  // 3) 树：落在高地上，间隔疏密自然（营地与水边除外）。
  //    人群半径外留出净空带；近圈（r<16）只允许小树，避免高树压在人群视野里。
  const occupied: { x: number; z: number }[] = [];
  const farEnough = (x: number, z: number, min: number) =>
    !occupied.some(o => Math.hypot(o.x - x, o.z - z) < min);
  let attempts = 0;
  let planted = 0;
  while (planted < 42 && attempts < 600) {
    attempts++;
    const a = rnd() * Math.PI * 2;
    const r = 12 + rnd() * (AREA - 15);
    const x = Math.round(Math.cos(a) * r * 10) / 10;
    const z = Math.round(Math.sin(a) * r * 10) / 10;
    if (heightAt(x, z) <= WATER_LEVEL || !farEnough(x, z, 2.6)) continue;
    occupied.push({ x, z });
    planted++;
    const treeIdx = planted - 1;
    trees.push({ x, z });
    const roll = rnd();
    // 净空带（r<20）只长矮树；大树一律放到 20 格以外
    const near = r < 20;
    const grand = !near && rnd() < 0.18;
    const scale = grand ? 1.3 : 0.7 + rnd() * (near ? 0.15 : 0.55);
    const groundY = heightAt(x, z);
    if (roll < 0.12) {
      // 枯树
      const h = Math.round(4 * scale);
      for (let y = 0; y < h; y++) log.push({ x, y: groundY + y + 0.5, z, t: treeIdx });
      log.push({ x: x + 0.6 * scale, y: groundY + h + 0.2, z, t: treeIdx });
      log.push({ x: x - 0.5 * scale, y: groundY + h + 0.8, z: z + 0.4, t: treeIdx });
      continue;
    }
    if (roll < 0.3) {
      // 白桦
      const h = Math.round(4 * scale) + 1;
      for (let y = 0; y < h; y++) birchLog.push({ x, y: groundY + y + 0.5, z, t: treeIdx });
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (Math.abs(dx) + Math.abs(dz) === 2) continue;
          leaves.push({ x: x + dx, y: groundY + h + 0.4, z: z + dz, t: treeIdx });
        }
      }
      leaves.push({ x, y: groundY + h + 1.3, z, t: treeIdx });
      continue;
    }
    const trunkH = Math.round((roll < 0.62 ? 4 : 5) * scale);
    for (let y = 0; y < trunkH; y++) log.push({ x, y: groundY + y + 0.5, z, t: treeIdx });
    if (roll < 0.62) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          leaves.push({ x: x + dx, y: groundY + trunkH + 0.5, z: z + dz, t: treeIdx });
          if (!(Math.abs(dx) === 1 && Math.abs(dz) === 1)) {
            leaves.push({ x: x + dx, y: groundY + trunkH + 1.5, z: z + dz, t: treeIdx });
          }
        }
      }
      leaves.push({ x, y: groundY + trunkH + 2.5, z, t: treeIdx });
    } else {
      const rings = [
        { r: 2, y: trunkH - 1, n: 12 },
        { r: 1.4, y: trunkH, n: 8 },
        { r: 0.9, y: trunkH + 1, n: 4 },
      ];
      for (const ring of rings) {
        for (let k = 0; k < ring.n; k++) {
          const a2 = (k / ring.n) * Math.PI * 2;
          leaves.push({
            x: Math.round((x + Math.cos(a2) * ring.r) * 10) / 10,
            y: groundY + ring.y + 0.5,
            z: Math.round((z + Math.sin(a2) * ring.r) * 10) / 10,
            t: treeIdx,
          });
        }
      }
    }
  }

  // 3.5) 石质天际线（r≈40，高度 6..16 起伏 + 草皮帽，围合世界边缘）
  const SKYLINE_SEGS = 200;
  for (let i = 0; i < SKYLINE_SEGS; i++) {
    const a = (i / SKYLINE_SEGS) * Math.PI * 2;
    const noise = Math.sin(a * 6.1) * 0.5 + Math.sin(a * 11.7 + 2.1) * 0.5;
    const h = 6 + Math.round((noise * 0.5 + 0.5) * 10);
    const nx = Math.cos(a) * 40;
    const nz = Math.sin(a) * 40;
    for (let y = 0; y < h; y++) {
      stone.push({ x: Math.round(nx * 10) / 10, y: y + 0.5, z: Math.round(nz * 10) / 10 });
    }
    grass.push({ x: Math.round(nx * 10) / 10, y: h + 0.5, z: Math.round(nz * 10) / 10 });
  }

  // 3.6) 远景大山脉（阶梯石山 + 草皮顶，撑起地平线；雾气中呈剪影层次）
  const peakDefs: [number, number, number][] = [
    [-62, -46, 18], [42, -64, 22], [66, -22, 15],
    [-72, 10, 19], [16, 70, 16], [-40, 62, 14], [58, 48, 12],
    [-20, -70, 15], [70, 20, 13], [-78, -18, 12], [30, 78, 11],
  ];
  for (const [mx, mz, ph] of peakDefs) {
    const h = ph + Math.floor(rnd() * 3);
    const layers = [
      { half: 3, base: 0, top: Math.ceil(h * 0.5) },
      { half: 2, base: Math.ceil(h * 0.5), top: Math.ceil(h * 0.78) },
      { half: 1, base: Math.ceil(h * 0.78), top: h },
    ];
    for (const layer of layers) {
      for (let y = layer.base; y < layer.top; y++) {
        for (let dx = -layer.half; dx <= layer.half; dx++) {
          for (let dz = -layer.half; dz <= layer.half; dz++) {
            stone.push({ x: mx + dx, y: y + 0.5, z: mz + dz });
          }
        }
      }
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        grass.push({ x: mx + dx, y: h + 0.5, z: mz + dz });
      }
    }
  }

  // 4) 散石
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 7 + rnd() * 22;
    const x = Math.round(Math.cos(a) * r * 10) / 10;
    const z = Math.round(Math.sin(a) * r * 10) / 10;
    rocks.push({ x, y: heightAt(x, z) - 0.2, z, s: 0.4 + rnd() * 0.45 });
  }

  return {
    grass, dirt, stone, water, sand, log, birchLog, leaves, rocks,
    trees,
    heightAt,
  };
}

// ── Constants ────────────────────────────────────────────

const CIRCLE_RADIUS = 4.0;
const SEAT_Y = 0;

const isEffectivelyAlive = (status: string): boolean =>
  status === 'ALIVE' || status === 'IDIOT_REVEALED';

// ── buildSeatPlacements ──────────────────────────────────

export function buildSeatPlacements(players: VisiblePlayer[]): SeatPlacement[] {
  const count = players.length;
  if (count === 0) return [];

  // Scale radius with player count so seats never overlap.
  const radius = Math.max(CIRCLE_RADIUS, count * 0.4);

  const sorted = [...players].sort((a, b) => a.seatNumber - b.seatNumber);

  return sorted.map((p, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2; // start at top
    return {
      seatNumber: p.seatNumber,
      x: Math.round(Math.cos(angle) * radius * 1000) / 1000,
      y: SEAT_Y,
      z: Math.round(Math.sin(angle) * radius * 1000) / 1000,
    };
  });
}

// ── buildVisibleAvatarDescriptor ─────────────────────────
// Accepts ONLY explicitly visible fields.  Never reads role / team.

export function buildVisibleAvatarDescriptor(
  player: VisiblePlayer,
): AvatarDescriptor {
  const dead = !isEffectivelyAlive(player.status);
  return {
    playerId: player.id,
    seatNumber: player.seatNumber,
    displayName: player.displayName,
    avatarSeed: player.avatarSeed,
    isDead: dead,
    avatarType: dead ? 'tombstone' : 'character',
    isSpeaking: player.isSpeaking,
    isHuman: !!player.isHuman,
    speechText: player.speechText,
    concealed: !!player.concealed,
    hideLabel: !!player.hideLabel,
  };
}

// ── getLightingPreset ────────────────────────────────────

export function getLightingPreset(isDay: boolean): LightingPreset {
  if (!isDay) {
    return {
      isNight: true,
      ambientIntensity: 0.68,
      directionalIntensity: 1.0,
      skyColor: '#29466e',
      fogColor: '#29466e',
      fogNear: 20,
      fogFar: 105,
      firelightColor: '#f6a623',
      firelightIntensity: 4.2,
    };
  }
  return {
    isNight: false,
    ambientIntensity: 0.75,
    directionalIntensity: 1.9,
    skyColor: '#87ceeb',
    fogColor: '#c8e6f0',
    fogNear: 26,
    fogFar: 140,
    firelightColor: '#f6a623',
    firelightIntensity: 0.4,
  };
}

// ── getCameraFocusTarget ─────────────────────────────────

export function getCameraFocusTarget(opts: {
  seatX: number;
  seatZ: number;
  isNight: boolean;
}): CameraTarget {
  // Slightly elevated look-at point above the seat.
  const y = opts.isNight ? 1.8 : 2.2;
  return {
    x: opts.seatX,
    y,
    z: opts.seatZ,
  };
}

export function getOverviewCameraPose(isNight: boolean): CameraPose {
  // 全景机位拉高拉远，交代更宏大的方块世界（仍在角色可读性范围内）
  return {
    position: isNight
      ? { x: 17, y: 10.5, z: 19 }
      : { x: 18.5, y: 11.5, z: 20.5 },
    target: { x: 0, y: 1.1, z: 0 },
  };
}

// ── Forest valley layout ─────────────────────────────────
// Declarative world data used by the Three scene.  It intentionally carries
// only terrain decoration; game state and hidden player identity never enter
// the environment layer.

