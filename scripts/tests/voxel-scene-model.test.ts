import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSeatPlacements,
  buildVisibleAvatarDescriptor,
  getLightingPreset,
  getWorldTerrain,
  getCameraFocusTarget,
  getOverviewCameraPose,
} from '../../src/components/game/voxel3d/sceneModel';

// ── helpers ──────────────────────────────────────────────

interface VisiblePlayer {
  id: number;
  seatNumber: number;
  displayName?: string;
  status: string; // ALIVE | DEAD_NIGHT | DEAD_VOTE | DEAD_SHOOT | DEAD_POISON | IDIOT_REVEALED | EXPLODED
  avatarSeed: number;
  isSpeaking: boolean;
  isHuman?: boolean;
  concealed?: boolean;
  hideLabel?: boolean;
}

const makePlayer = (
  id: number,
  overrides: Partial<VisiblePlayer> = {},
): VisiblePlayer => ({
  id,
  seatNumber: id,
  displayName: undefined,
  status: 'ALIVE',
  avatarSeed: id,
  isSpeaking: false,
  isHuman: false,
  ...overrides,
});

// ── buildSeatPlacements ──────────────────────────────────

test('buildSeatPlacements returns N positions for N players', () => {
  const players = [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
    makePlayer(id, { seatNumber: id }),
  );
  const seats = buildSeatPlacements(players);
  assert.equal(seats.length, 8);
});

test('buildSeatPlacements handles 8 to 12 players', () => {
  for (const count of [8, 9, 10, 11, 12]) {
    const players = Array.from({ length: count }, (_, i) =>
      makePlayer(i + 1, { seatNumber: i + 1 }),
    );
    const seats = buildSeatPlacements(players);
    assert.equal(seats.length, count, `expected ${count} seats`);
  }
});

test('buildSeatPlacements produces no overlapping positions', () => {
  const players = Array.from({ length: 12 }, (_, i) =>
    makePlayer(i + 1, { seatNumber: i + 1 }),
  );
  const seats = buildSeatPlacements(players);
  const MIN_DIST = 1.0; // minimum distance between seat centres
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const dx = seats[i].x - seats[j].x;
      const dz = seats[i].z - seats[j].z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      assert.ok(
        dist >= MIN_DIST,
        `seats ${i} and ${j} overlap: distance ${dist.toFixed(3)} < ${MIN_DIST}`,
      );
    }
  }
});

test('buildSeatPlacements places each seat at radius > 0 from origin', () => {
  const players = [1, 2, 3, 4, 5].map((id) =>
    makePlayer(id, { seatNumber: id }),
  );
  const seats = buildSeatPlacements(players);
  for (const s of seats) {
    const r = Math.sqrt(s.x * s.x + s.z * s.z);
    assert.ok(r > 0.1, `seat at origin (${s.x}, ${s.z})`);
  }
});

test('buildSeatPlacements maps seat number to correct position', () => {
  const players = [makePlayer(1, { seatNumber: 1 }), makePlayer(2, { seatNumber: 2 })];
  const seats = buildSeatPlacements(players);
  // Seats must be at distinct positions (different x or z)
  const samePos = seats[0].x === seats[1].x && seats[0].z === seats[1].z;
  assert.ok(!samePos, 'two seats must not share the same position');
});

// ── buildVisibleAvatarDescriptor ─────────────────────────

test('alive player gets living avatar descriptor', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(1, { status: 'ALIVE', avatarSeed: 42 }),
  );
  assert.equal(desc.isDead, false);
  assert.equal(desc.avatarType, 'character');
});

test('dead player gets tombstone descriptor', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(2, { status: 'DEAD_NIGHT', avatarSeed: 7 }),
  );
  assert.equal(desc.isDead, true);
  assert.equal(desc.avatarType, 'tombstone');
});

test('IDIOT_REVEALED player is alive', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(3, { status: 'IDIOT_REVEALED' }),
  );
  assert.equal(desc.isDead, false);
});

test('EXPLODED player is dead', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(4, { status: 'EXPLODED' }),
  );
  assert.equal(desc.isDead, true);
  assert.equal(desc.avatarType, 'tombstone');
});

test('descriptor does NOT contain role/identity fields', () => {
  const desc = buildVisibleAvatarDescriptor(makePlayer(5, { status: 'ALIVE' }));
  const keys = Object.keys(desc);
  assert.ok(!keys.includes('role'), 'descriptor must not expose role');
  assert.ok(!keys.includes('team'), 'descriptor must not expose team');
  assert.ok(!keys.includes('isWolf'), 'descriptor must not expose isWolf');
});

test('descriptor includes avatarSeed for procedural appearance', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(6, { avatarSeed: 99 }),
  );
  assert.equal(desc.avatarSeed, 99);
});

test('descriptor keeps player id separate from seat number for world clicks', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(42, { seatNumber: 7, avatarSeed: 3 }),
  );
  assert.equal(desc.playerId, 42);
  assert.equal(desc.seatNumber, 7);
});

test('descriptor preserves only the public display name needed by world labels', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(9, { displayName: '旅人甲' }),
  );
  assert.equal(desc.displayName, '旅人甲');
  assert.ok(!('rolePrompt' in desc));
});

test('speaking player is marked in descriptor', () => {
  const desc = buildVisibleAvatarDescriptor(
    makePlayer(7, { isSpeaking: true }),
  );
  assert.equal(desc.isSpeaking, true);
});

test('non-speaking player is not marked speaking', () => {
  const desc = buildVisibleAvatarDescriptor(makePlayer(8));
  assert.equal(desc.isSpeaking, false);
});

test('descriptor preserves only explicit concealment flags', () => {
  const desc = buildVisibleAvatarDescriptor(makePlayer(8, { concealed: true, hideLabel: true }));
  assert.equal(desc.concealed, true);
  assert.equal(desc.hideLabel, true);
  assert.ok(!('role' in desc));
});

// ── getLightingPreset ────────────────────────────────────

test('daytime returns bright preset', () => {
  const light = getLightingPreset(true);
  assert.equal(light.isNight, false);
  assert.ok(light.ambientIntensity > 0, 'ambient should be positive');
  assert.ok(light.directionalIntensity > 0, 'directional should be positive');
  assert.ok(typeof light.skyColor === 'string', 'skyColor should be a string');
});

test('nighttime returns dark preset with firelight', () => {
  const light = getLightingPreset(false);
  assert.equal(light.isNight, true);
  assert.ok(light.ambientIntensity >= 0, 'ambient should be non-negative');
  assert.ok(typeof light.firelightColor === 'string', 'firelightColor required');
  assert.ok(light.firelightIntensity > 0, 'firelight should be positive at night');
});

test('night ambient is dimmer than day ambient', () => {
  const day = getLightingPreset(true);
  const night = getLightingPreset(false);
  assert.ok(
    night.ambientIntensity < day.ambientIntensity,
    'night should be dimmer',
  );
});

test('night lighting remains readable around the camp', () => {
  const night = getLightingPreset(false);
  assert.ok(night.ambientIntensity >= 0.3);
  assert.ok(night.firelightIntensity > getLightingPreset(true).firelightIntensity);
});

// ── 方块地形（getWorldTerrain） ─────────────────────────

test('world terrain is a large layered environment around the camp', () => {
  const terrain = getWorldTerrain();
  assert.ok(terrain.grass.length >= 1500, '草地圆盘应有足够多的草方块');
  assert.ok(terrain.water.length >= 20, '世界应有湖泊水面');
  assert.ok(terrain.sand.length >= 5, '水岸应有沙滩');
  assert.ok(terrain.stone.length >= 200, '天际线需要石柱围合');
  assert.ok(terrain.leaves.length >= 200, '树冠需要足够树叶');
  assert.ok(terrain.log.length >= 60, '树干需要足够原木');
  assert.ok(terrain.trees.length >= 25, '边界需要足量树木');
});

test('world terrain keeps the camp plateau flat and seats grounded', () => {
  const terrain = getWorldTerrain();
  // 营地平台（r<7）必须平整为 y=0，角色双脚才能落地
  for (const [x, z] of [[0, 0], [4, 0], [0, 4], [-4, 0], [3, 3]]) {
    assert.equal(terrain.heightAt(x, z), 0, `营地 (${x},${z}) 高度应为 0`);
  }
});

test('world terrain is deterministic', () => {
  const a = getWorldTerrain();
  const b = getWorldTerrain();
  assert.equal(a.grass.length, b.grass.length);
  assert.equal(a.water.length, b.water.length);
  assert.deepEqual(a.grass[0], b.grass[0]);
  assert.equal(a.heightAt(6, 0), b.heightAt(6, 0));
});

// ── getCameraFocusTarget ─────────────────────────────────

test('focus target returns x, y, z coordinates', () => {
  const target = getCameraFocusTarget({
    seatX: 3,
    seatZ: 4,
    isNight: false,
  });
  assert.equal(typeof target.x, 'number');
  assert.equal(typeof target.y, 'number');
  assert.equal(typeof target.z, 'number');
});

test('focus target centres on seat position', () => {
  const target = getCameraFocusTarget({
    seatX: 5,
    seatZ: 7,
    isNight: false,
  });
  // Target should be near the seat position
  assert.ok(Math.abs(target.x - 5) < 2, `x ${target.x} should be near 5`);
  assert.ok(Math.abs(target.z - 7) < 2, `z ${target.z} should be near 7`);
});

test('focus target has reasonable y height', () => {
  const target = getCameraFocusTarget({ seatX: 0, seatZ: 0, isNight: true });
  assert.ok(target.y >= 0 && target.y <= 10, `y ${target.y} out of range`);
});

test('night and day focus targets differ', () => {
  const day = getCameraFocusTarget({ seatX: 2, seatZ: 3, isNight: false });
  const night = getCameraFocusTarget({ seatX: 2, seatZ: 3, isNight: true });
  assert.notEqual(day.y, night.y);
});

test('overview camera stays outside the player ring and looks at the camp centre', () => {
  const pose = getOverviewCameraPose(false);
  const horizontalDistance = Math.hypot(pose.position.x, pose.position.z);
  assert.ok(horizontalDistance > 9);
  assert.deepEqual(pose.target, { x: 0, y: 1.1, z: 0 });
});
