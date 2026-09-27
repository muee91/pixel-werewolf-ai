import assert from 'node:assert/strict';
import test from 'node:test';
import {
    VoxelAudioEngine,
    getSkillAudioProfile,
    routeSkillAudioCue,
} from '../../src/components/game/voxel3d/voxelAudio';
import type { SkillEffectEvent } from '../../src/components/game/voxel3d/skillEffectModel';

const event = (overrides: Partial<SkillEffectEvent> = {}): SkillEffectEvent => ({
    eventId: 'audio-event',
    turn: 1,
    phase: 'SEER_ACTION',
    visibility: 'role',
    effectKind: 'crystal',
    audioCue: 'seer_crystal',
    durationMs: 1200,
    color: '#ffffff',
    secondaryColor: '#aaaaaa',
    ...overrides,
});

test('neutral events can only route to neutral audio', () => {
    assert.equal(routeSkillAudioCue(event({ visibility: 'neutral', audioCue: 'seer_crystal' })), 'neutral_ambient');
});

test('authorized events preserve their skill audio cue', () => {
    assert.equal(routeSkillAudioCue(event()), 'seer_crystal');
});

test('all role audio cues have a synthesis profile', () => {
    const cues = [
        'wolf_slash', 'villager_spark', 'seer_crystal', 'witch_brew',
        'hunter_shot', 'guard_shield', 'idiot_amulet', 'wolf_king_ring',
        'knight_sword', 'stone_ghost_gaze', 'white_wolf_explosion',
        'blood_moon_seal', 'gravekeeper_flame', 'demon_hunter_bow',
        'cupid_heart', 'merchant_rune', 'neutral_ambient',
    ];
    for (const cue of cues) assert.ok(getSkillAudioProfile(cue), `missing profile: ${cue}`);
});

test('engine silently declines when AudioContext is unavailable', async () => {
    const engine = new VoxelAudioEngine(() => null);
    assert.equal(await engine.unlock(), false);
    assert.doesNotThrow(() => engine.playSkill(event()));
    assert.doesNotThrow(() => engine.setAmbientEnabled(true, true));
    assert.doesNotThrow(() => engine.destroy());
});

