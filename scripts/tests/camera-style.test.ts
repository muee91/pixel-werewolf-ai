import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA_STYLES, getDollyOffset, getOrbitParams, isOrbitStyle } from '../../src/components/game/voxel3d/cameraDirectorModel';

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
    assert.ok(minR > 0 && maxR < 18, `radius ${minR}~${maxR}`);
    assert.ok(minH > 0 && maxH < 8, `height ${minH}~${maxH}`);
    // 确实在"推拉":半径存在明显往复
    assert.ok(maxR - minR > 8);
});
