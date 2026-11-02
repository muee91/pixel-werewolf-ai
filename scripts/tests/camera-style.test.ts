import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA_STYLES, getDialoguePose, getDollyOffset, getOrbitParams, isOrbitStyle } from '../../src/components/game/voxel3d/cameraDirectorModel';

// 运镜方式模型:五种运镜的参数完备性与巡游数值边界

test('exposes five camera styles with unique ids and labels', () => {
    const ids = CAMERA_STYLES.map(s => s.id);
    assert.equal(ids.length, 5);
    assert.deepEqual(new Set(ids).size, 5);
    for (const style of CAMERA_STYLES) {
        assert.ok(style.label.length > 0);
        assert.ok(style.desc.length > 0);
    }
});

test('orbit-family styles carry motion params; auto does not', () => {
    for (const style of ['orbit', 'low-orbit', 'top-down', 'dolly'] as const) {
        const params = getOrbitParams(style);
        assert.ok(params, style);
        assert.ok(params.radius > 0 && params.height > 0 && params.speed > 0);
        assert.equal(isOrbitStyle(style), true);
    }
    assert.equal(getOrbitParams('auto'), null);
    assert.equal(isOrbitStyle('auto'), false);
});

test('low-orbit flies lower and faster than full orbit', () => {
    const orbit = getOrbitParams('orbit');
    const low = getOrbitParams('low-orbit');
    assert.ok(orbit && low, 'getOrbitParams 应返回两种机位参数');
    assert.ok(low.height < orbit.height);
    assert.ok(low.speed > orbit.speed);
    assert.ok(low.radius < orbit.radius);
});

test('dolly offset oscillates inside designed bounds', () => {
    let minR = Infinity, maxR = -Infinity, minH = Infinity, maxH = -Infinity;
    for (let t = 0; t < 60; t += 0.1) {
        const { radius, height } = getDollyOffset(t);
        minR = Math.min(minR, radius); maxR = Math.max(maxR, radius);
        minH = Math.min(minH, height); maxH = Math.max(maxH, height);
    }
    assert.ok(minR > 5 && maxR < 13.8, `radius ${minR}~${maxR}`);
    assert.ok(minH > 3 && maxH < 7, `height ${minH}~${maxH}`);
    // 确实在"推拉":半径存在明显往复（幅度收到 6.4m —— 再往外退就跑到营地建筑外面了）
    assert.ok(maxR - minR > 6, `推拉幅度只有 ${(maxR - minR).toFixed(1)}m`);
});

// ── 发言镜头（桌面视角） ──────────────────────────────────

test('发言机位是正面镜头：与发言人同一条半径线，正对脸拍', () => {
    // 角色坐下后一律朝营火中心，径向就是正脸方向。4.0 版机位与发言人同方位角，
    // 拍的是标准正面中景；中央的火/祭坛整个落在机位背后，不会糊在镜头前。
    for (const focus of [{ x: 0, z: 4 }, { x: 4, z: 0 }, { x: -2.8, z: -2.8 }]) {
        const pose = getDialoguePose(focus, 4, 9);
        const toCam = { x: pose.position.x - focus.x, z: pose.position.z - focus.z };
        const facing = { x: -focus.x, z: -focus.z };
        const cos =
            (toCam.x * facing.x + toCam.z * facing.z) /
            (Math.hypot(toCam.x, toCam.z) * Math.hypot(facing.x, facing.z));
        const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
        assert.ok(angle < 12, `机位偏离正脸 ${angle.toFixed(0)}°，不再是正面镜头`);
    }
});

test('正面机位与发言人同侧：镜头在脸的正前方而不是对面', () => {
    const focus = { x: 0, z: 4 };            // 9 人桌，正北座位
    const pose = getDialoguePose(focus, 4, 9);
    assert.ok(pose.position.z > 0 && pose.position.z < 4, `机位 z=${pose.position.z} 不在脸前`);
    // 与发言人同一条半径线（点积 > 0 = 同侧），且在座位圈内
    const dot = pose.position.x * focus.x + pose.position.z * focus.z;
    assert.ok(dot > 0, '机位跑到发言人对面去了');
});

test('发言镜头是平视：俯角不超过 8 度', () => {
    for (const focus of [{ x: 0, z: 4 }, { x: 3.8, z: 1.2 }, { x: -2.4, z: -3.2 }]) {
        const pose = getDialoguePose(focus, 4, 9);
        const horizontal = Math.hypot(pose.position.x - focus.x, pose.position.z - focus.z);
        const pitch = Math.atan2(pose.position.y - pose.look.y, horizontal) * 180 / Math.PI;
        assert.ok(pitch < 8, `俯角 ${pitch.toFixed(1)}° 太大，又变成俯视了`);
        assert.ok(pitch > 0, '机位不该低于视线（会变成仰拍地板）');
    }
});

test('发言镜头距离适中：正面中景，既不是怼脸也不是远景', () => {
    // 机位与发言人同半径线、脸距 2.6m（座位圈最小 4m，机位半径 1.4）——
    // 再近帽檐怼脸（2.0 版的教训），再远表情看不清。
    for (const count of [6, 9, 12]) {
        const seatRadius = Math.max(4, count * 0.4);
        const focus = { x: 0, z: seatRadius };
        const pose = getDialoguePose(focus, seatRadius, count);
        const dist = Math.hypot(
            pose.position.x - focus.x,
            pose.position.y - 1.35,
            pose.position.z - focus.z,
        );
        assert.ok(dist > 2.2 && dist < 3.2, `${count} 人时机位距发言人 ${dist.toFixed(2)}m`);
    }
});

test('多人数（座位圈更大）时机位跟着后退', () => {
    const near = getDialoguePose({ x: 0, z: 4 }, 4, 9);
    const far = getDialoguePose({ x: 0, z: 5 }, 5, 12);
    assert.ok(Math.abs(far.position.z) > Math.abs(near.position.z));
});

// ── 发言镜头（桌面视角） ──────────────────────────────────

test('发言机位是正面镜头：与发言人同一条半径线，正对脸拍', () => {
    // 角色坐下后一律朝营火中心，径向就是正脸方向。4.0 版机位与发言人同方位角，
    // 拍的是标准正面中景；中央的火/祭坛整个落在机位背后，不会糊在镜头前。
    for (const focus of [{ x: 0, z: 4 }, { x: 4, z: 0 }, { x: -2.8, z: -2.8 }]) {
        const pose = getDialoguePose(focus, 4, 9);
        const toCam = { x: pose.position.x - focus.x, z: pose.position.z - focus.z };
        const facing = { x: -focus.x, z: -focus.z };
        const cos =
            (toCam.x * facing.x + toCam.z * facing.z) /
            (Math.hypot(toCam.x, toCam.z) * Math.hypot(facing.x, facing.z));
        const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
        assert.ok(angle < 12, `机位偏离正脸 ${angle.toFixed(0)}°，不再是正面镜头`);
    }
});

test('正面机位与发言人同侧：镜头在脸的正前方而不是对面', () => {
    const focus = { x: 0, z: 4 };            // 9 人桌，正北座位
    const pose = getDialoguePose(focus, 4, 9);
    assert.ok(pose.position.z > 0 && pose.position.z < 4, `机位 z=${pose.position.z} 不在脸前`);
    // 与发言人同一条半径线（点积 > 0 = 同侧），且在座位圈内
    const dot = pose.position.x * focus.x + pose.position.z * focus.z;
    assert.ok(dot > 0, '机位跑到发言人对面去了');
});

test('发言镜头是平视：俯角不超过 8 度', () => {
    for (const focus of [{ x: 0, z: 4 }, { x: 3.8, z: 1.2 }, { x: -2.4, z: -3.2 }]) {
        const pose = getDialoguePose(focus, 4, 9);
        const horizontal = Math.hypot(pose.position.x - focus.x, pose.position.z - focus.z);
        const pitch = Math.atan2(pose.position.y - pose.look.y, horizontal) * 180 / Math.PI;
        assert.ok(pitch < 8, `俯角 ${pitch.toFixed(1)}° 太大，又变成俯视了`);
        assert.ok(pitch > 0, '机位不该低于视线（会变成仰拍地板）');
    }
});

test('发言镜头距离适中：正面中景，既不是怼脸也不是远景', () => {
    // 机位与发言人同半径线、脸距 2.6m（座位圈最小 4m，机位半径 1.4）——
    // 再近帽檐怼脸（2.0 版的教训），再远表情看不清。
    for (const count of [6, 9, 12]) {
        const seatRadius = Math.max(4, count * 0.4);
        const focus = { x: 0, z: seatRadius };
        const pose = getDialoguePose(focus, seatRadius, count);
        const dist = Math.hypot(
            pose.position.x - focus.x,
            pose.position.y - 1.35,
            pose.position.z - focus.z,
        );
        assert.ok(dist > 2.2 && dist < 3.2, `${count} 人时机位距发言人 ${dist.toFixed(2)}m`);
    }
});

test('多人数（座位圈更大）时机位跟着后退', () => {
    const near = getDialoguePose({ x: 0, z: 4 }, 4, 9);
    const far = getDialoguePose({ x: 0, z: 5 }, 5, 12);
    assert.ok(Math.abs(far.position.z) > Math.abs(near.position.z));
});
