import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getCameraDirectorMode,
    getDirectorFocus,
    getGameplayCameraFocus,
} from '../../src/components/game/voxel3d/cameraDirectorModel';

test('automatic director exclusively owns OrbitControls updates', () => {
    assert.equal(getCameraDirectorMode(false), 'auto');
});

test('silent gameplay actions never take over the camera', () => {
    assert.equal(getGameplayCameraFocus({
        dialogueActive: false,
        dialogueSpeaker: { x: 3, z: 4 },
    }), null);
    assert.deepEqual(getGameplayCameraFocus({
        dialogueActive: true,
        dialogueSpeaker: { x: 3, z: 4 },
    }), { x: 3, z: 4 });
});

test('manual orbit exclusively owns OrbitControls updates', () => {
    assert.equal(getCameraDirectorMode(true), 'manual');
});

test('event focus has priority without changing focus on every render', () => {
    assert.deepEqual(
        getDirectorFocus({ speaker: { x: 1, z: 2 }, event: { x: 3, z: 4 } }),
        { x: 3, z: 4 },
    );
    assert.deepEqual(
        getDirectorFocus({ speaker: { x: 1, z: 2 }, event: null }),
        { x: 1, z: 2 },
    );
});
