import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    ALTAR,
    ARCADE_FLATTEN,
    ARCADE_RADIUS,
    ARCADE_SPRING_Y,
    ARCH,
    ARCH_APEX,
    BRAZIER_COUNT,
    BRAZIER_RING_RADIUS,
    COLUMN_COUNT,
    COLUMN_HEIGHT,
    COLUMN_RADIUS,
    CRYPT_BLOCKERS,
    CRYPT_ROOM_BOUNDS,
    DOME_BASE_Y,
    DOME_RADIUS,
    DOME_SQUASH,
    HALL_RADIUS,
    OCULUS_ANGLE,
    OCULUS_RADIUS,
    OCULUS_Y,
    WALL_HEIGHT,
    WALL_INNER_APOTHEM,
    octVertexRadius,
    getBrazierAngle,
    getBrazierPosition,
    getColumnAngle,
    getColumnPosition,
    getWallSegment,
} from '../../src/components/game/voxel3d/cryptHallModel';
import { clampCameraToRoom, getClearanceFactor } from '../../src/components/game/voxel3d/cameraClearance';
import { getDialoguePose, getDollyOffset, getOrbitParams } from '../../src/components/game/voxel3d/cameraDirectorModel';
import { getOverviewCameraPose, buildSeatPlacements, getSeatRadius } from '../../src/components/game/voxel3d/sceneModel';
import { SCENES } from '../../src/components/game/voxel3d/biomes';

// 深渊圣殿（crypt）的布局约束。
// 这些断言的意义：圣殿是"一套新的世界"，柱子/火盆/机位之间是几何关系，
// 改任何一个数都可能把柱脚摆进座位、或让镜头跑到柱廊外面 —— 用测试钉死。

test('柱廊是 8 根等距八角柱，柱心半径一致且落在墙内', () => {
    assert.equal(COLUMN_COUNT, 8);
    const radii: number[] = [];
    const angles: number[] = [];
    for (let i = 0; i < COLUMN_COUNT; i++) {
        const p = getColumnPosition(i);
        radii.push(Math.hypot(p.x, p.z));
        angles.push(getColumnAngle(i));
        assert.ok(p.x >= -COLUMN_RADIUS - 1e-6 && p.x <= COLUMN_RADIUS + 1e-6);
    }
    for (const r of radii) assert.ok(Math.abs(r - COLUMN_RADIUS) < 1e-6, `柱心半径 ${r}`);
    // 相邻柱夹角严格等于 2π/8
    for (let i = 1; i < angles.length; i++) {
        assert.ok(Math.abs((angles[i] - angles[i - 1]) - Math.PI / 4) < 1e-9);
    }
    assert.ok(COLUMN_RADIUS < HALL_RADIUS - 1, '柱子必须在墙里侧，不能嵌进墙体');
});

test('墙段是八边形折线，弦长按边心距算，不是方块拼的', () => {
    const seg = getWallSegment(0);
    const expected = 2 * HALL_RADIUS * Math.sin(Math.PI / 8);
    assert.ok(Math.abs(seg.width - expected) < 1e-9, `墙段宽 ${seg.width} vs ${expected}`);
    // 八段墙首尾相接：每段中点都在墙上
    for (let i = 0; i < COLUMN_COUNT; i++) {
        const s = getWallSegment(i);
        assert.ok(Math.abs(Math.hypot(s.x, s.z) - HALL_RADIUS) < 1e-6);
    }
});

test('尖拱是 lancet 拱：尖顶恰在 spring + √3×半宽处，且低于墙顶', () => {
    const expected = ARCH.spring + Math.sqrt(3) * ARCH.halfWidth;
    assert.ok(Math.abs(ARCH_APEX - expected) < 1e-9);
    assert.ok(ARCH_APEX > ARCH.spring, '拱顶必须在起拱线之上');
    assert.ok(ARCH_APEX < WALL_HEIGHT - 0.8, '拱顶离墙顶要留出实墙，否则墙会断成两半');
    assert.ok(ARCH.sill > 1, '窗台要高过角色头顶，否则主角脑后开天窗');
});

test('四角火盆落在柱间空当，不压座位也不撞柱', () => {
    assert.equal(BRAZIER_COUNT, 4);
    for (let i = 0; i < BRAZIER_COUNT; i++) {
        const p = getBrazierPosition(i);
        const r = Math.hypot(p.x, p.z);
        assert.ok(Math.abs(r - BRAZIER_RING_RADIUS) < 1e-6);
        // 与最近柱子的角距至少 15°
        const a = getBrazierAngle(i);
        for (let c = 0; c < COLUMN_COUNT; c++) {
            const d = Math.abs(((a - getColumnAngle(c) + Math.PI) % (Math.PI * 2)) - Math.PI);
            assert.ok(d > 0.26, `火盆 ${i} 离柱子只有 ${(d * 180 / Math.PI).toFixed(1)}°`);
        }
    }
});

test('座位圈（最多 12 人）不会长到火盆/柱子身上', () => {
    const maxSeatRadius = getSeatRadius(12);
    assert.ok(maxSeatRadius < BRAZIER_RING_RADIUS - 0.8, `座位半径 ${maxSeatRadius} 已经够到火盆`);
    assert.ok(maxSeatRadius < COLUMN_RADIUS - 4, '座位离柱廊要留出通道');
    const seats = buildSeatPlacements(
        Array.from({ length: 12 }, (_, i) => ({
            id: i + 1, seatNumber: i + 1, status: 'ALIVE', avatarSeed: i, isSpeaking: false,
        })),
    );
    for (const s of seats) {
        for (let i = 0; i < BRAZIER_COUNT; i++) {
            const p = getBrazierPosition(i);
            assert.ok(Math.hypot(s.x - p.x, s.z - p.z) > 2, `座位 ${s.seatNumber} 压住了火盆`);
        }
    }
});

test('避挡柱体覆盖每根柱、祭坛和火盆', () => {
    assert.equal(CRYPT_BLOCKERS.length, COLUMN_COUNT + 1 + BRAZIER_COUNT);
    const altar = CRYPT_BLOCKERS.find(b => b.x === 0 && b.z === 0);
    assert.ok(altar, '祭坛必须能被镜头避让');
    assert.ok(Math.abs(altar.radius - ALTAR.baseRadius) < 1e-9);
});

test('从座位圈中心往外看，视线不会被柱廊切开（机位永远在柱圈里侧）', () => {
    const look = { x: 0, y: 1.4, z: 0 };
    // 覆盖全部四种巡游 + 全景 + 推拉最远端
    const poses: { x: number; y: number; z: number }[] = [
        getOverviewCameraPose(false, true).position,
        getOverviewCameraPose(true, true).position,
    ];
    for (const style of ['orbit', 'low-orbit', 'top-down', 'dolly'] as const) {
        const p = getOrbitParams(style, true)!;
        poses.push({ x: p.radius, y: p.height, z: 0 });
        poses.push({ x: -p.radius, y: p.height, z: 0 });
        poses.push({ x: 0, y: p.height, z: p.radius });
    }
    const dollyFar = getDollyOffset(0, true);
    poses.push({ x: dollyFar.radius, y: dollyFar.height, z: 0 });

    for (const cam of poses) {
        const f = getClearanceFactor(look, cam, CRYPT_BLOCKERS);
        assert.ok(
            f > 0.999,
            `机位 (${cam.x.toFixed(1)}, ${cam.y.toFixed(1)}, ${cam.z.toFixed(1)}) 被柱廊切了，避让系数 ${f.toFixed(2)}`,
        );
    }
});

test('室内机位全部收在柱圈里侧、俯视不穿出穹顶', () => {
    const overviewDay = getOverviewCameraPose(false, true);
    const overviewNight = getOverviewCameraPose(true, true);
    for (const pose of [overviewDay, overviewNight]) {
        const d = Math.hypot(pose.position.x, pose.position.z);
        assert.ok(d < COLUMN_RADIUS - 1.4, `全景机位 ${d.toFixed(1)}m 跑到柱廊外面了`);
        assert.ok(pose.position.y < WALL_HEIGHT - 0.5, `全景机位 ${pose.position.y}m 钻进屋顶了`);
    }
    for (const style of ['orbit', 'low-orbit', 'dolly', 'top-down'] as const) {
        const p = getOrbitParams(style, true)!;
        assert.ok(p.radius < COLUMN_RADIUS - 1, `${style} 半径 ${p.radius} 在柱子外面`);
        // 铁律：机位绝对不能升到起拱高度以上。进了穹顶内部，视野会被屋顶内表面接管，
        // 画面只剩名称牌和背景色（实测 11m 全空、7.4m 正常）。
        assert.ok(p.height < WALL_HEIGHT - 0.5, `${style} 高度 ${p.height} 钻进屋顶了（上限 ${WALL_HEIGHT - 0.5}）`);
    }
    const top = getOrbitParams('top-down', true)!;
    assert.ok(top.height < WALL_HEIGHT - 0.5, '俯视机位钻进穹顶');
    const far = getDollyOffset(Math.PI / 0.25, true); // 推到最远端
    assert.ok(far.radius < COLUMN_RADIUS - 1, '推拉最远端也必须在柱圈里');
});

test('室内机位比室外收得更紧（否则柱廊会把画面前景切碎）', () => {
    for (const style of ['orbit', 'low-orbit', 'top-down', 'dolly'] as const) {
        const outdoor = getOrbitParams(style, false)!;
        const indoor = getOrbitParams(style, true)!;
        assert.ok(indoor.radius < outdoor.radius, `${style} 室内半径没有收`);
        assert.ok(indoor.height <= outdoor.height, `${style} 室内高度没有压`);
    }
});

test('场景表里只有圣殿是 crypt，其余仍是方块群系', () => {
    assert.equal(SCENES['dungeon-hall'].style, 'crypt');
    assert.equal(SCENES['dungeon-hall'].label, '深渊圣殿');
    for (const id of ['forest-camp', 'snow-camp', 'autumn-camp', 'desert-ruins'] as const) {
        assert.equal(SCENES[id].style, 'blocky', `${id} 不该被改成 crypt`);
    }
    // 圣殿是室内：不画太阳月亮星星云
    assert.equal(SCENES['dungeon-hall'].indoor, true);
    // 房间对角 ~30m：雾如果按室外给到 140，远处石墙会被糊成一片灰；
    // 但也不能像第一版那样收到 52（整间厅像蒙了层纱），70~90 之间是"有空气"又不糊。
    const far = SCENES['dungeon-hall'].fog.dayFar;
    assert.ok(far > 60 && far < 95, `室内雾 ${far} 不在手感区间内`);
});

// ── 打磨轮：采光孔 / 柱间拱券 / 八边形半径换算 ─────────────

test('穹顶采光孔开在顶上，孔口贴着压扁后的穹顶最高处', () => {
    // 直径 3~6m：太小看不出"天光落下来"，太大整个穹顶就没了
    assert.ok(OCULUS_RADIUS > 1.4 && OCULUS_RADIUS < 3.2, `孔半径 ${OCULUS_RADIUS.toFixed(2)}`);
    // 孔口高度必须按压扁系数算 —— 忘了乘 DOME_SQUASH 的话，石环会浮在穹顶外 8m 的空中
    assert.ok(
        Math.abs(OCULUS_Y - (DOME_BASE_Y + DOME_RADIUS * Math.cos(OCULUS_ANGLE) * DOME_SQUASH)) < 1e-9,
        'OCULUS_Y 没按穹顶压扁系数算',
    );
    const domeApex = DOME_BASE_Y + DOME_RADIUS * DOME_SQUASH;
    assert.ok(OCULUS_Y > domeApex - 1.2, `孔口 ${OCULUS_Y.toFixed(1)} 离穹顶顶点 ${domeApex.toFixed(1)} 太远`);
});

test('穹顶是压扁的浅穹顶：顶点不至于高到超出雾距', () => {
    // 半径 20.5 的正半球顶点在 31m，从厅内看只剩一片空。
    const apex = DOME_BASE_Y + DOME_RADIUS * DOME_SQUASH;
    assert.ok(DOME_SQUASH > 0.5 && DOME_SQUASH < 0.75, `压扁系数 ${DOME_SQUASH}`);
    assert.ok(apex > WALL_HEIGHT + 8, `穹顶 ${apex.toFixed(1)} 太扁，看不出是穹顶`);
    assert.ok(apex < 26, `穹顶 ${apex.toFixed(1)} 太高，抬头只剩空`);
});

test('柱间拱券：跨度等于柱距，拱顶压在檐口以下', () => {
    const span = 2 * COLUMN_RADIUS * Math.sin(Math.PI / COLUMN_COUNT);
    assert.ok(Math.abs(ARCADE_RADIUS * 2 - span) < 1e-9, `拱跨 ${(ARCADE_RADIUS * 2).toFixed(2)} vs 柱距 ${span.toFixed(2)}`);
    const apex = ARCADE_SPRING_Y + ARCADE_RADIUS * ARCADE_FLATTEN;
    assert.ok(apex < WALL_HEIGHT - 0.1, `拱顶 ${apex.toFixed(2)} 会顶穿檐口 ${WALL_HEIGHT}`);
    assert.ok(ARCADE_SPRING_Y < COLUMN_HEIGHT, '起拱线要在柱头以下，否则拱是从天上长出来的');
});

test('八边形柱体半径换算：顶点半径大于边心距', () => {
    const r = octVertexRadius(WALL_INNER_APOTHEM);
    assert.ok(r > WALL_INNER_APOTHEM, '顶点半径必须大于边心距');
    assert.ok(Math.abs(r * Math.cos(Math.PI / 8) - WALL_INNER_APOTHEM) < 1e-9);
    // 墙裙/檐口用的就是这个换算，算错会缩进墙里
    assert.ok(octVertexRadius(WALL_INNER_APOTHEM) > WALL_INNER_APOTHEM + 0.8);
});

// ── 房间尺寸 / 机位边界（玩家："场景太小，镜头一拉远直接穿模"） ──────

test('厅堂足够大：机位在柱圈里侧还剩出可退的空间', () => {
    // 14.2m 那版整个厅只有 28m 对径，机位在屋里根本没有可退的余量，
    // 玩家一拉远就穿墙。20.5m 之后柱圈 17.4、边界 15.0，中间留出 2.4m 缓冲。
    assert.ok(HALL_RADIUS >= 19, `厅半径 ${HALL_RADIUS} 太小`);
    assert.ok(CRYPT_ROOM_BOUNDS.maxRadius > 12, '机位可退半径太小，等于没放大');
    assert.ok(
        CRYPT_ROOM_BOUNDS.maxRadius < COLUMN_RADIUS,
        '边界必须收在柱圈里侧，否则机位会切进柱子',
    );
});

test('房间边界：任何室内机位夹过之后都不再越界（幂等）', () => {
    const poses = [
        getOverviewCameraPose(false, true),
        getOverviewCameraPose(true, true),
        getDialoguePose({ x: 4, z: 0 }, 4, 9),
        getDialoguePose({ x: 0, z: 4.8 }, 4.8, 12),
    ];
    for (const style of ['orbit', 'low-orbit', 'dolly', 'top-down'] as const) {
        const p = getOrbitParams(style, true)!;
        poses.push({
            position: { x: Math.cos(0.7) * p.radius, y: p.height, z: Math.sin(0.7) * p.radius },
            target: { x: 0, y: 1, z: 0 },
        });
    }
    for (const pose of poses) {
        const clamped = clampCameraToRoom(pose.position, CRYPT_ROOM_BOUNDS);
        assert.ok(clamped.y <= CRYPT_ROOM_BOUNDS.maxHeight + 1e-9, `机位 y=${clamped.y} 越过檐口`);
        assert.ok(
            Math.hypot(clamped.x, clamped.z) <= CRYPT_ROOM_BOUNDS.maxRadius + 1e-9,
            '机位水平半径越过柱圈',
        );
        // 已经在房间里的机位，夹完必须原地不动（否则会被"推"一下）
        assert.ok(
            Math.abs(clamped.x - pose.position.x) < 1e-9 &&
                Math.abs(clamped.y - pose.position.y) < 1e-9 &&
                Math.abs(clamped.z - pose.position.z) < 1e-9,
            '机位本身就在房间内，夹取不该改动它',
        );
    }
});

test('越界的机位会被拉回房间（穿墙/钻穹顶的兜底）', () => {
    const outside = clampCameraToRoom({ x: 40, y: 30, z: 0 }, CRYPT_ROOM_BOUNDS);
    assert.ok(outside.x <= CRYPT_ROOM_BOUNDS.maxRadius + 1e-9);
    assert.equal(outside.y, CRYPT_ROOM_BOUNDS.maxHeight);
    // 方位角保持：只是被"墙"挡住，不是瞬移
    assert.equal(Math.round(Math.atan2(outside.z, outside.x) * 1000), 0);
});

test('发言机位：正对脸的中景，邻座落在镜头视野之外', () => {
    const seatRadius = 4;
    const seatCount = 9;
    const focus = { x: seatRadius, z: 0 };
    const pose = getDialoguePose(focus, seatRadius, seatCount);
    const cam = pose.position;

    // 1) 到发言人 2.2~3.2m 的正面中景：再近帽檐怼脸（2.0 版教训），再远看不清表情
    const d = Math.hypot(cam.x - focus.x, cam.z - focus.z);
    assert.ok(d > 2.2 && d < 3.2, `机位到发言人 ${d.toFixed(2)}m 不在正面中景区间`);

    // 1b) 正对：机位与发言人同一条半径线（角色朝中心坐，径向就是正脸方向）
    const cross = Math.abs(focus.x * cam.z - focus.z * cam.x);
    assert.ok(cross < 1e-6, `机位偏离发言人径向 ${cross.toFixed(4)}，不是正面`);

    // 2) 平视：机位只比视线高 0.1~0.3m（俯角 2° 以内），不是俯视
    assert.ok(pose.look.y > 1.2 && pose.look.y < 1.45, '视线中心要在坐姿眼高');
    const pitch = Math.atan2(cam.y - pose.look.y, d);
    assert.ok(Math.abs(pitch) < 0.09, `俯角 ${(pitch * 180 / Math.PI).toFixed(1)}° 太大`);

    // 3) 邻座不能压在发言人旁边 —— 这是"两块巨大暗剪影"的根因。
    //
    //    几何上做不到让邻座完全出画：机位必须落在两把椅子之间的缝隙里（不然就撞人），
    //    这个位置离左右两个邻座都只有 2.6~3.7m，夹角约 24°。
    //    所以这里的判据是"不许进画面中央 40%"，而不是"完全出画"（后者是伪命题）。
    //    fov 60 / 宽高比 1.5 → 水平半视野约 41°，中央 40% 对应 ±16.4°。
    const axis = Math.atan2(focus.z - cam.z, focus.x - cam.x);
    const CENTER_KEEP_OUT = (17 * Math.PI) / 180;
    for (let k = 1; k < seatCount; k++) {
        const a = (k / seatCount) * Math.PI * 2;
        const seat = { x: Math.cos(a) * seatRadius, z: Math.sin(a) * seatRadius };
        if (Math.hypot(seat.x - focus.x, seat.z - focus.z) < 1e-6) continue; // 发言人自己
        if (Math.hypot(seat.x - cam.x, seat.z - cam.z) < 2.4) continue; // 贴在机位侧后的，看不见
        const ang = Math.atan2(seat.z - cam.z, seat.x - cam.x);
        // 夹角归一到 [0, π]：直接取差的绝对值再对 2π 折返，不要用补角
        let diff = Math.abs(ang - axis) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        assert.ok(
            diff > CENTER_KEEP_OUT,
            `第 ${k} 号座位离视轴只有 ${((diff * 180) / Math.PI).toFixed(0)}°，会压在发言人旁边`,
        );
    }
});

test('发言镜头里祭坛火焰在画面之外（不再是一块橙色挡板）', () => {
    const seatRadius = 4;
    const focus = { x: seatRadius, z: 0 };
    const pose = getDialoguePose(focus, seatRadius, 9);
    const cam = pose.position;

    // 火焰半径 1.2（ALTAR.bowlRadius）、最高约 3.8m。正面机位下火焰整个在相机
    // **正后方**：方向夹角应接近 180°，远超水平半视野 36°（fov 52、宽高比 1.5 保守值）。
    const axis = Math.atan2(focus.z - cam.z, focus.x - cam.x);
    const toAltar = Math.atan2(-cam.z, -cam.x);
    let diff = Math.abs(((toAltar - axis + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(
        diff > (36 * Math.PI) / 180,
        `祭坛偏离视轴只有 ${((diff * 180) / Math.PI).toFixed(0)}°，火会进画面`,
    );

    // 视线（机位→发言人）本身也不能钻进火盆圆：正面机位的最近点就是机位端，
    // 只要机位站在火盆口径之外（0.85 + 0.3 余量）就不会擦到火焰。
    const abx = focus.x - cam.x;
    const abz = focus.z - cam.z;
    const t = Math.max(0, Math.min(1, -(cam.x * abx + cam.z * abz) / (abx * abx + abz * abz)));
    const dist = Math.hypot(cam.x + abx * t, cam.z + abz * t);
    assert.ok(dist > ALTAR.bowlRadius + 0.3, `视线离中轴 ${dist.toFixed(2)}m，会擦到火焰`);
});

test('默认全景框得住整个座位圈（人数最多 12）', () => {
    for (const count of [6, 9, 12]) {
        const seatRadius = getSeatRadius(count);
        const pose = getOverviewCameraPose(false, true, seatRadius);
        const cam = pose.position;
        // 机位到中轴的水平距离
        const dist = Math.hypot(cam.x, cam.z);
        // 室内全景 fov 66°（SceneDirector 里按 indoor 切），宽高比按 1.4 保守估：
        // 水平半视野 = atan(tan33° × 1.4) ≈ 42.3°，取 42°
        const halfW = dist * Math.tan((42 * Math.PI) / 180);
        assert.ok(halfW > seatRadius + 1.2, `${count} 人时水平可拍半宽 ${halfW.toFixed(1)}m 装不下座位圈`);
        // 俯角：目标点高度 3.2，机位高度 6.2，最近那个人的脚也必须进画面
        const pitch = Math.atan2(cam.y - pose.target.y, dist);
        const halfV = (33 * Math.PI) / 180;
        const nearDist = dist - seatRadius;
        const footAngle = Math.atan2(cam.y, nearDist);
        assert.ok(footAngle - pitch < halfV, `${count} 人时最近的人脚会被切出画面`);
    }
});


// ── 房间尺寸 / 机位边界（玩家："场景太小，镜头一拉远直接穿模"） ──────

test('厅堂足够大：机位在柱圈里侧还剩出可退的空间', () => {
    // 14.2m 那版整个厅只有 28m 对径，机位在屋里根本没有可退的余量，
    // 玩家一拉远就穿墙。20.5m 之后柱圈 17.4、边界 15.0，中间留出 2.4m 缓冲。
    assert.ok(HALL_RADIUS >= 19, `厅半径 ${HALL_RADIUS} 太小`);
    assert.ok(CRYPT_ROOM_BOUNDS.maxRadius > 12, '机位可退半径太小，等于没放大');
    assert.ok(
        CRYPT_ROOM_BOUNDS.maxRadius < COLUMN_RADIUS,
        '边界必须收在柱圈里侧，否则机位会切进柱子',
    );
});

test('房间边界：任何室内机位夹过之后都不再越界（幂等）', () => {
    const poses = [
        getOverviewCameraPose(false, true),
        getOverviewCameraPose(true, true),
        getDialoguePose({ x: 4, z: 0 }, 4, 9),
        getDialoguePose({ x: 0, z: 4.8 }, 4.8, 12),
    ];
    for (const style of ['orbit', 'low-orbit', 'dolly', 'top-down'] as const) {
        const p = getOrbitParams(style, true)!;
        poses.push({
            position: { x: Math.cos(0.7) * p.radius, y: p.height, z: Math.sin(0.7) * p.radius },
            target: { x: 0, y: 1, z: 0 },
        });
    }
    for (const pose of poses) {
        const clamped = clampCameraToRoom(pose.position, CRYPT_ROOM_BOUNDS);
        assert.ok(clamped.y <= CRYPT_ROOM_BOUNDS.maxHeight + 1e-9, `机位 y=${clamped.y} 越过檐口`);
        assert.ok(
            Math.hypot(clamped.x, clamped.z) <= CRYPT_ROOM_BOUNDS.maxRadius + 1e-9,
            '机位水平半径越过柱圈',
        );
        // 已经在房间里的机位，夹完必须原地不动（否则会被"推"一下）
        assert.ok(
            Math.abs(clamped.x - pose.position.x) < 1e-9 &&
                Math.abs(clamped.y - pose.position.y) < 1e-9 &&
                Math.abs(clamped.z - pose.position.z) < 1e-9,
            '机位本身就在房间内，夹取不该改动它',
        );
    }
});

test('越界的机位会被拉回房间（穿墙/钻穹顶的兜底）', () => {
    const outside = clampCameraToRoom({ x: 40, y: 30, z: 0 }, CRYPT_ROOM_BOUNDS);
    assert.ok(outside.x <= CRYPT_ROOM_BOUNDS.maxRadius + 1e-9);
    assert.equal(outside.y, CRYPT_ROOM_BOUNDS.maxHeight);
    // 方位角保持：只是被"墙"挡住，不是瞬移
    assert.equal(Math.round(Math.atan2(outside.z, outside.x) * 1000), 0);
});

test('发言机位：正对脸的中景，邻座落在镜头视野之外', () => {
    const seatRadius = 4;
    const seatCount = 9;
    const focus = { x: seatRadius, z: 0 };
    const pose = getDialoguePose(focus, seatRadius, seatCount);
    const cam = pose.position;

    // 1) 到发言人 2.2~3.2m 的正面中景：再近帽檐怼脸（2.0 版教训），再远看不清表情
    const d = Math.hypot(cam.x - focus.x, cam.z - focus.z);
    assert.ok(d > 2.2 && d < 3.2, `机位到发言人 ${d.toFixed(2)}m 不在正面中景区间`);

    // 1b) 正对：机位与发言人同一条半径线（角色朝中心坐，径向就是正脸方向）
    const cross = Math.abs(focus.x * cam.z - focus.z * cam.x);
    assert.ok(cross < 1e-6, `机位偏离发言人径向 ${cross.toFixed(4)}，不是正面`);

    // 2) 平视：机位只比视线高 0.1~0.3m（俯角 2° 以内），不是俯视
    assert.ok(pose.look.y > 1.2 && pose.look.y < 1.45, '视线中心要在坐姿眼高');
    const pitch = Math.atan2(cam.y - pose.look.y, d);
    assert.ok(Math.abs(pitch) < 0.09, `俯角 ${(pitch * 180 / Math.PI).toFixed(1)}° 太大`);

    // 3) 邻座不能压在发言人旁边 —— 这是"两块巨大暗剪影"的根因。
    //
    //    几何上做不到让邻座完全出画：机位必须落在两把椅子之间的缝隙里（不然就撞人），
    //    这个位置离左右两个邻座都只有 2.6~3.7m，夹角约 24°。
    //    所以这里的判据是"不许进画面中央 40%"，而不是"完全出画"（后者是伪命题）。
    //    fov 60 / 宽高比 1.5 → 水平半视野约 41°，中央 40% 对应 ±16.4°。
    const axis = Math.atan2(focus.z - cam.z, focus.x - cam.x);
    const CENTER_KEEP_OUT = (17 * Math.PI) / 180;
    for (let k = 1; k < seatCount; k++) {
        const a = (k / seatCount) * Math.PI * 2;
        const seat = { x: Math.cos(a) * seatRadius, z: Math.sin(a) * seatRadius };
        if (Math.hypot(seat.x - focus.x, seat.z - focus.z) < 1e-6) continue; // 发言人自己
        if (Math.hypot(seat.x - cam.x, seat.z - cam.z) < 2.4) continue; // 贴在机位侧后的，看不见
        const ang = Math.atan2(seat.z - cam.z, seat.x - cam.x);
        // 夹角归一到 [0, π]：直接取差的绝对值再对 2π 折返，不要用补角
        let diff = Math.abs(ang - axis) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        assert.ok(
            diff > CENTER_KEEP_OUT,
            `第 ${k} 号座位离视轴只有 ${((diff * 180) / Math.PI).toFixed(0)}°，会压在发言人旁边`,
        );
    }
});

test('发言镜头里祭坛火焰在画面之外（不再是一块橙色挡板）', () => {
    const seatRadius = 4;
    const focus = { x: seatRadius, z: 0 };
    const pose = getDialoguePose(focus, seatRadius, 9);
    const cam = pose.position;

    // 火焰半径 1.2（ALTAR.bowlRadius）、最高约 3.8m。正面机位下火焰整个在相机
    // **正后方**：方向夹角应接近 180°，远超水平半视野 36°（fov 52、宽高比 1.5 保守值）。
    const axis = Math.atan2(focus.z - cam.z, focus.x - cam.x);
    const toAltar = Math.atan2(-cam.z, -cam.x);
    let diff = Math.abs(((toAltar - axis + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(
        diff > (36 * Math.PI) / 180,
        `祭坛偏离视轴只有 ${((diff * 180) / Math.PI).toFixed(0)}°，火会进画面`,
    );

    // 视线（机位→发言人）本身也不能钻进火盆圆：正面机位的最近点就是机位端，
    // 只要机位站在火盆口径之外（0.85 + 0.3 余量）就不会擦到火焰。
    const abx = focus.x - cam.x;
    const abz = focus.z - cam.z;
    const t = Math.max(0, Math.min(1, -(cam.x * abx + cam.z * abz) / (abx * abx + abz * abz)));
    const dist = Math.hypot(cam.x + abx * t, cam.z + abz * t);
    assert.ok(dist > ALTAR.bowlRadius + 0.3, `视线离中轴 ${dist.toFixed(2)}m，会擦到火焰`);
});

test('默认全景框得住整个座位圈（人数最多 12）', () => {
    for (const count of [6, 9, 12]) {
        const seatRadius = getSeatRadius(count);
        const pose = getOverviewCameraPose(false, true, seatRadius);
        const cam = pose.position;
        // 机位到中轴的水平距离
        const dist = Math.hypot(cam.x, cam.z);
        // 室内全景 fov 66°（SceneDirector 里按 indoor 切），宽高比按 1.4 保守估：
        // 水平半视野 = atan(tan33° × 1.4) ≈ 42.3°，取 42°
        const halfW = dist * Math.tan((42 * Math.PI) / 180);
        assert.ok(halfW > seatRadius + 1.2, `${count} 人时水平可拍半宽 ${halfW.toFixed(1)}m 装不下座位圈`);
        // 俯角：目标点高度 3.2，机位高度 6.2，最近那个人的脚也必须进画面
        const pitch = Math.atan2(cam.y - pose.target.y, dist);
        const halfV = (33 * Math.PI) / 180;
        const nearDist = dist - seatRadius;
        const footAngle = Math.atan2(cam.y, nearDist);
        assert.ok(footAngle - pitch < halfV, `${count} 人时最近的人脚会被切出画面`);
    }
});
