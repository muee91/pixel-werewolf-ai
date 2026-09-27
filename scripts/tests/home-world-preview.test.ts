import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomePreviewPlayers } from '../../src/components/home/VoxelHomeWorldPreview';
import { buildVisibleAvatarDescriptor } from '../../src/components/game/voxel3d/sceneModel';

test('home 3D preview never renders player nameplates', () => {
    const players = createHomePreviewPlayers();

    assert.equal(players.length, 9);
    assert.ok(players.every(player => player.hideLabel === true));
    assert.ok(players.every(player => buildVisibleAvatarDescriptor(player).hideLabel === true));
});
