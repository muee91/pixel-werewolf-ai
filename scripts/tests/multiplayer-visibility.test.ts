import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGameStateForViewer } from '../../server/visibility';

const players = [
    { id: 1, roomPlayerId: 'host', role: 'WEREWOLF', rolePrompt: 'host-secret', potions: undefined },
    { id: 2, roomPlayerId: 'guest', role: 'WITCH', rolePrompt: 'guest-secret', potions: { cure: true, poison: true } },
    { id: 3, roomPlayerId: null, role: 'SEER', rolePrompt: 'seer-secret', potions: undefined },
];

test('guest sync masks hidden roles and strips internal log fields', () => {
    const visible = buildGameStateForViewer({
        phase: 'DAY_DISCUSSION',
        players,
        logs: [
            { id: 'public', content: '公开', rawResponse: 'secret', promptContext: { hidden: true } },
            { id: 'debug', content: '内部', debugType: 'AI_THINKING', debugData: { hidden: true } },
        ],
        godState: {},
        areRolesVisible: true,
    }, players[1], false);

    assert.equal(visible.players[0].role, 'VILLAGER');
    assert.equal(visible.players[1].role, 'WITCH');
    assert.equal(visible.players[0].rolePrompt, '');
    assert.deepEqual(visible.players[1].potions, { cure: true, poison: true });
    assert.equal(visible.logs.length, 1);
    assert.equal('rawResponse' in visible.logs[0], false);
    assert.equal('promptContext' in visible.logs[0], false);
    assert.equal(visible.areRolesVisible, false);
});

test('review sync reveals roles without leaking debug logs or other player prompts', () => {
    const visible = buildGameStateForViewer({
        phase: 'GAME_REVIEW',
        players,
        logs: [
            { id: 'public', content: '结算', strategySummary: 'secret', modelName: 'private-model' },
            { id: 'debug', content: '内部', debugType: 'AI_THINKING', rawResponse: 'secret' },
            { id: 'private', content: '他人私聊', visibleTo: [3] },
        ],
        godState: { lovers: null },
        areRolesVisible: false,
    }, players[1], true);

    assert.deepEqual(visible.players.map((player: any) => player.role), ['WEREWOLF', 'WITCH', 'SEER']);
    assert.equal(visible.players.every((player: any) => player.rolePrompt === ''), true);
    assert.equal(visible.players[0].potions, undefined);
    assert.equal(visible.logs.length, 1);
    assert.equal('strategySummary' in visible.logs[0], false);
    assert.equal('modelName' in visible.logs[0], false);
    assert.equal(visible.areRolesVisible, true);
});
