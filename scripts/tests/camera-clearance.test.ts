import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClearance, getClearanceFactor, type CameraBlocker } from '../../src/components/game/voxel3d/cameraClearance';

const LOOK = { x: 0, y: 1.6, z: 0 };

test('没有遮挡物时机位不动', () => {
  const cam = { x: 12, y: 7, z: 0 };
  assert.equal(getClearanceFactor(LOOK, cam, []), 1);
});

test('视线正后方有房子时把机位拉到房子前面', () => {
  const house: CameraBlocker = { x: 6, z: 0, radius: 2, height: 3.5 };
  const cam = { x: 12, y: 7, z: 0 };
  const f = getClearanceFactor(LOOK, cam, [house]);
  assert.ok(f < 1, `预期缩近，实得 ${f}`);
  // 12m 视线上，房子近面在 4m 处（6-2），留 0.7 余量 → 约 3.3/12
  const pulled = applyClearance(LOOK, cam, f);
  assert.ok(pulled.x < 5, `机位应落在房子这侧，实得 x=${pulled.x.toFixed(2)}`);
  assert.ok(pulled.x > 3, `不该缩到脸上，实得 x=${pulled.x.toFixed(2)}`);
});

test('视线从房子旁边擦过去（绕开了）不触发避让', () => {
  const house: CameraBlocker = { x: 6, z: 6, radius: 2, height: 3.5 };
  const f = getClearanceFactor(LOOK, { x: 12, y: 7, z: 0 }, [house]);
  assert.equal(f, 1);
});

test('视线从道具头顶飞过不触发避让', () => {
  const low: CameraBlocker = { x: 6, z: 0, radius: 1, height: 1.4 };
  // 起点 1.6m 已高于 1.4m 的道具，整条视线都在它上方
  assert.equal(getClearanceFactor(LOOK, { x: 12, y: 7, z: 0 }, [low]), 1);
});

test('多个遮挡物取最近的那个', () => {
  const near: CameraBlocker = { x: 4, z: 0, radius: 1, height: 3 };
  const far: CameraBlocker = { x: 9, z: 0, radius: 1, height: 3 };
  const f = getClearanceFactor(LOOK, { x: 12, y: 7, z: 0 }, [far, near]);
  const pulled = applyClearance(LOOK, { x: 12, y: 7, z: 0 }, f);
  assert.ok(pulled.x < 3.4, `应停在近处那道之前，实得 x=${pulled.x.toFixed(2)}`);
});

test('不会把机位拉到比 minDistance 更近', () => {
  const wall: CameraBlocker = { x: 1, z: 0, radius: 4, height: 6 };
  const cam = { x: 12, y: 7, z: 0 };
  const f = getClearanceFactor(LOOK, cam, [wall], { minDistance: 3.2 });
  const pulled = applyClearance(LOOK, cam, f);
  const dist = Math.hypot(pulled.x - LOOK.x, pulled.y - LOOK.y, pulled.z - LOOK.z);
  assert.ok(dist >= 3.1, `机位离目标只有 ${dist.toFixed(2)}m`);
});

test('看的人自己贴着道具站时不会被推到脸上', () => {
  // 发言者 x=2，紧贴着半径 2 的木屋（房子中心 2.5）
  const look = { x: 2, y: 1.6, z: 0 };
  const house: CameraBlocker = { x: 2.5, z: 0, radius: 2, height: 3 };
  assert.equal(getClearanceFactor(look, { x: 6.4, y: 2, z: 0 }, [house]), 1);
});

test('applyClearance 只缩不放', () => {
  const cam = { x: 10, y: 5, z: 0 };
  const same = applyClearance(LOOK, cam, 1);
  assert.deepEqual(same, cam);
  const half = applyClearance(LOOK, cam, 0.5);
  assert.ok(Math.abs(half.x - 5) < 1e-9 && Math.abs(half.y - 3.3) < 1e-9);
});
