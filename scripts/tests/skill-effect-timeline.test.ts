import assert from 'node:assert/strict';
import test from 'node:test';
import { GamePhase, Role, type GameLog } from '../../src/types';
import {
    collectNewSkillEffectEvents,
    trimSkillEffectEvents,
} from '../../src/components/game/voxel3d/skillEffectTimeline';

const log = (id: string, content: string, speakerId = 3): GameLog => ({
    id,
    turn: 2,
    phase: GamePhase.SEER_ACTION,
    speakerId,
    content,
    timestamp: 1,
    isSystem: true,
});

test('first timeline sync marks history seen without replaying old skills', () => {
    const result = collectNewSkillEffectEvents({
        visibleLogs: [log('old', '3号查验了5号。')],
        seenLogIds: null,
        visiblePlayers: [{ id: 3, role: Role.SEER }],
        viewer: { isOmniscient: true, isActor: false, actorId: null, viewerRole: null },
    });

    assert.deepEqual(result.events, []);
    assert.deepEqual([...result.seenLogIds], ['old']);
});

test('only newly visible logs produce effects once', () => {
    const result = collectNewSkillEffectEvents({
        visibleLogs: [log('old', '预言家请睁眼。'), log('new', '3号查验了5号。')],
        seenLogIds: new Set(['old']),
        visiblePlayers: [{ id: 3, role: Role.SEER }],
        viewer: { isOmniscient: true, isActor: false, actorId: null, viewerRole: null },
    });

    assert.equal(result.events.length, 1);
    assert.match(result.events[0].eventId, /new/);
    assert.deepEqual(new Set(result.seenLogIds), new Set(['old', 'new']));

    const repeated = collectNewSkillEffectEvents({
        visibleLogs: result.visibleLogs,
        seenLogIds: result.seenLogIds,
        visiblePlayers: [{ id: 3, role: Role.SEER }],
        viewer: { isOmniscient: true, isActor: false, actorId: null, viewerRole: null },
    });
    assert.deepEqual(repeated.events, []);
});

test('permission-cropped input remains neutral in the timeline', () => {
    const result = collectNewSkillEffectEvents({
        visibleLogs: [log('private-action', '3号查验了5号。')],
        seenLogIds: new Set<string>(),
        visiblePlayers: [{ id: 3, role: Role.SEER }],
        viewer: { isOmniscient: false, isActor: false, actorId: null, viewerRole: null },
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].visibility, 'neutral');
    assert.equal(result.events[0].role, undefined);
    assert.equal(result.events[0].casterId, undefined);
    assert.equal(result.events[0].targetIds, undefined);
});

test('timeline caps concurrent events and removes expired entries', () => {
    const now = 10_000;
    const entries = Array.from({ length: 8 }, (_, index) => ({
        event: {
            eventId: `evt-${index}`,
            turn: 1,
            phase: GamePhase.SEER_ACTION,
            visibility: 'neutral' as const,
            effectKind: 'neutral_whisper' as const,
            audioCue: 'neutral_ambient',
            durationMs: 1000,
            color: '#999999',
            secondaryColor: '#bbbbbb',
        },
        expiresAt: index < 2 ? now - 1 : now + index,
    }));

    const trimmed = trimSkillEffectEvents(entries, now, 4);
    assert.equal(trimmed.length, 4);
    assert.deepEqual(trimmed.map(item => item.event.eventId), ['evt-4', 'evt-5', 'evt-6', 'evt-7']);
});

