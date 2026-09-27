import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from 'jotai/vanilla';
import {
    actorProfilesAtom,
    DEFAULT_ACTORS,
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
