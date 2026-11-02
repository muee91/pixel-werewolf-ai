import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from 'jotai/vanilla';
import {
    actorProfilesAtom,
    DEFAULT_ACTORS,
    gameConfigAtom,
    globalApiConfigAtom,
    isAutoPlayAtom,
    isHumanModeAtom,
    llmPresetsAtom,
    playersAtom,
} from '../../src/atoms';
import {
    initGameAtom,
    setupMultiplayerGameAtom,
    startMultiplayerGameAtom,
} from '../../src/store';
import { Role } from '../../src/types';
import type { ActorProfile } from '../../src/types';
import { isProviderConfiguredForRuntime } from '../../src/utils/llmConfig';

const narratorOnly: ActorProfile[] = [{
    id: 'n1',
    name: '上帝',
    llmPresetId: '',
    ttsPresetId: 'tts-edge',
    voiceId: 'zh-CN-XiaoxiaoNeural',
    stylePrompt: '',
}];

const createNarratorOnlyStore = () => {
    const store = createStore();
    store.set(actorProfilesAtom, narratorOnly);
    store.set(globalApiConfigAtom, {
        enabled: false,
        narratorActorId: 'n1',
    });
    return store;
};

const storeHasLegacyNvidiaPreset = () => {
    const store = createStore();
    return store.get(llmPresetsAtom).some(preset => preset.id === 'llm-nvidia-default');
};

test('default configuration does not select an implicit cloud model', () => {
    assert.equal(storeHasLegacyNvidiaPreset(), false);
    assert.ok(DEFAULT_ACTORS.every(actor => actor.llmPresetId === ''));
});

test('local model endpoints remain usable without a cloud API key', () => {
    assert.equal(isProviderConfiguredForRuntime({ id: 'ollama', name: 'Ollama', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '' }), true);
    assert.equal(isProviderConfiguredForRuntime({ id: 'cloud', name: 'Cloud', type: 'openai', baseUrl: 'https://example.test/v1', apiKey: '' }), false);
});

test('remote proxy requires an explicit NVIDIA-compatible provider', () => {
    const proxy = { llmProxyEnabled: true, llmProxyUrl: 'http://127.0.0.1:8000' };
    assert.equal(isProviderConfiguredForRuntime({ id: 'nvidia', name: 'NVIDIA', type: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: '' }, proxy), true);
    assert.equal(isProviderConfiguredForRuntime({ id: 'gemini', name: 'Gemini', type: 'gemini', apiKey: '' }, proxy), false);
});

test('single-player initialization survives a narrator-only persisted actor list', () => {
    const store = createNarratorOnlyStore();

    assert.doesNotThrow(() => store.set(initGameAtom, '9-v1'));
    assert.equal(store.get(playersAtom).length, 9);
    assert.ok(store.get(playersAtom).every(player => player.actorId));
});

test('AI spectator game starts auto-play so the process is visible', () => {
    const store = createNarratorOnlyStore();
    store.set(isHumanModeAtom, false);
    store.set(initGameAtom, '9-v1');

    assert.equal(store.get(isAutoPlayAtom), true);
    assert.ok(store.get(playersAtom).every(player => !player.isHuman));
});

test('human game waits for the player instead of forcing auto-play', () => {
    const store = createNarratorOnlyStore();
    store.set(isHumanModeAtom, true);
    store.set(initGameAtom, '9-v1');

    assert.equal(store.get(isAutoPlayAtom), false);
    assert.equal(store.get(playersAtom).filter(player => player.isHuman).length, 1);
});

test('multiplayer host initialization survives a narrator-only persisted actor list', () => {
    const store = createNarratorOnlyStore();

    assert.doesNotThrow(() => store.set(startMultiplayerGameAtom, {
        presetKey: '9-v1',
        roomPlayers: [],
    }));
    assert.equal(store.get(playersAtom).length, 9);
    assert.ok(store.get(playersAtom).every(player => player.actorId));
});

test('multiplayer guest placeholders survive a narrator-only persisted actor list', () => {
    const store = createNarratorOnlyStore();

    assert.doesNotThrow(() => store.set(setupMultiplayerGameAtom, {
        presetKey: '9-v1',
        roomPlayers: [],
        isHost: false,
    }));
    assert.equal(store.get(playersAtom).length, 9);
    assert.ok(store.get(playersAtom).every(player => player.actorId));
});

// ── 开局前配置（人数不变，神职/上警可改） ─────────────────

const customRoles = [
    Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
    Role.VILLAGER, Role.VILLAGER,
    Role.SEER, Role.WITCH, Role.GUARD, Role.KNIGHT,
];

test('开局面板改过的神职会真的发到座位上', () => {
    const store = createNarratorOnlyStore();
    store.set(initGameAtom, { presetKey: '9-v1', roles: customRoles, sheriffEnabled: false });

    const dealt = store.get(playersAtom).map(player => player.role);
    assert.equal(dealt.length, 9);
    assert.equal(dealt.filter(role => role === Role.GUARD).length, 1);
    assert.equal(dealt.filter(role => role === Role.KNIGHT).length, 1);
    assert.equal(dealt.filter(role => role === Role.HUNTER).length, 0);
    assert.equal(store.get(gameConfigAtom).sheriffEnabled, false);
    assert.equal(store.get(gameConfigAtom).rules.sheriffElection, false);
});

test('上警开关会同时写进顶层字段与规则层（提示词与 3D 开票板各读一边）', () => {
    const store = createNarratorOnlyStore();
    store.set(initGameAtom, { presetKey: '9-v1', sheriffEnabled: true });
    assert.equal(store.get(gameConfigAtom).sheriffEnabled, true);
    assert.equal(store.get(gameConfigAtom).rules.sheriffElection, true);
});

test('人数对不上的脏配置回退板子默认，不会开出一个少一张牌的局', () => {
    const store = createNarratorOnlyStore();
    store.set(initGameAtom, { presetKey: '9-v1', roles: [Role.WEREWOLF, Role.SEER] });

    const dealt = store.get(playersAtom).map(player => player.role);
    assert.equal(dealt.length, 9);
    assert.equal(dealt.filter(role => role === Role.WEREWOLF).length, 3);
    assert.equal(dealt.filter(role => role === Role.HUNTER).length, 1);
});
