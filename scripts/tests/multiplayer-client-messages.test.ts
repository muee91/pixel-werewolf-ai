import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createAdvisorRequestMessage,
    createPauseStateMessage,
    createPlayerActionMessage,
} from '../../src/multiplayer/clientMessages';

test('player actions are wrapped in the authenticated WebSocket protocol envelope', () => {
    const message = createPlayerActionMessage(
        { actionId: 'action-1', clientSeq: 7, ts: 1234 },
        { action: 'vote', actionTarget: 4 }
    );

    assert.deepEqual(message, {
        type: 'PLAYER_ACTION',
        actionId: 'action-1',
        clientSeq: 7,
        ts: 1234,
        actionData: { action: 'vote', actionTarget: 4 },
    });
});

test('advisor requests use the WebSocket message understood by the room server', () => {
    const requestPayload = { seatNumber: 3, phase: 'VOTING' };
    assert.deepEqual(createAdvisorRequestMessage(requestPayload), {
        type: 'ADVISOR_REQUEST',
        requestPayload,
    });
});

test('pause and resume controls map to existing WebSocket message types', () => {
    assert.deepEqual(createPauseStateMessage(true), { type: 'GAME_PAUSED' });
    assert.deepEqual(createPauseStateMessage(false), { type: 'GAME_RESUMED' });
});
