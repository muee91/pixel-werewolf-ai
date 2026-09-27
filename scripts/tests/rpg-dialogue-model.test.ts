import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getDialogueDurationMs,
    isDialoguePresentationLog,
    shouldConcealDialogueIdentity,
} from '../../src/components/game/voxel3d/dialogueModel';

test('short RPG dialogue remains visible long enough to read', () => {
    assert.equal(getDialogueDurationMs('收到。'), 8000);
});

test('long RPG dialogue duration is capped', () => {
    assert.equal(getDialogueDurationMs('很长的发言'.repeat(100)), 60000);
});

test('night dialogue conceals identity outside omniscient view', () => {
    assert.equal(shouldConcealDialogueIdentity(true, false), true);
    assert.equal(shouldConcealDialogueIdentity(true, true), false);
    assert.equal(shouldConcealDialogueIdentity(false, false), false);
});

test('only actual player speech enters the RPG dialogue queue', () => {
    assert.equal(isDialoguePresentationLog({
        isSystem: false,
        speakerId: 3,
        content: '我选择继续竞选。',
        debugType: 'AI_THINKING',
    }), true);
    assert.equal(isDialoguePresentationLog({
        isSystem: false,
        speakerId: 3,
        content: '警长退水决策：坚持竞选',
        debugType: 'SHERIFF_WITHDRAW_STRATEGY',
    }), false);
    assert.equal(isDialoguePresentationLog({
        isSystem: true,
        content: '3号坚持竞选。',
    }), false);
});
