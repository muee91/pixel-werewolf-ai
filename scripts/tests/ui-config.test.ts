import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUiConfig, THEME_DEFAULTS, type UIConfig, type GameViewMode } from '../../src/themes/types';

test('normalizeUiConfig fills missing gameViewMode with 2d for legacy persisted config', () => {
    // Simulate an old persisted UI config that predates gameViewMode.
    const legacy = { themeId: 'voxel-camp' } as Partial<UIConfig>;
    const normalized = normalizeUiConfig(legacy);
    assert.equal(normalized.gameViewMode, '2d');
    // Theme id and default fields are preserved.
    assert.equal(normalized.themeId, 'voxel-camp');
    assert.equal(normalized.effectLevel, THEME_DEFAULTS['voxel-camp'].effectLevel);
});

test('normalizeUiConfig keeps an explicitly set 3d gameViewMode', () => {
    const explicit = normalizeUiConfig({
        themeId: 'voxel-camp',
        gameViewMode: '3d',
    });
    assert.equal(explicit.gameViewMode, '3d');
});

test('normalizeUiConfig keeps an explicitly set 2d gameViewMode', () => {
    const explicit = normalizeUiConfig({
        themeId: 'voxel-camp',
        gameViewMode: '2d',
    });
    assert.equal(explicit.gameViewMode, '2d');
});

test('normalizeUiConfig falls back to 2d when gameViewMode is an unknown value', () => {
    const corrupted = normalizeUiConfig({
        themeId: 'voxel-camp',
        gameViewMode: 'legacy-unknown' as unknown as GameViewMode,
    });
    assert.equal(corrupted.gameViewMode, '2d');
});

test('normalizeUiConfig preserves user-customized fields alongside gameViewMode', () => {
    const normalized = normalizeUiConfig({
        themeId: 'voxel-camp',
        gameViewMode: '3d',
        effectLevel: 'intense',
    });
    assert.equal(normalized.gameViewMode, '3d');
    assert.equal(normalized.effectLevel, 'intense');
});

test('THEME_DEFAULTS declares a default gameViewMode of 2d', () => {
    assert.equal(THEME_DEFAULTS['voxel-camp'].gameViewMode, '2d');
});

test('legacy UI config receives safe world audio defaults', () => {
    const normalized = normalizeUiConfig({ themeId: 'voxel-camp' });
    assert.equal(normalized.worldAmbientAudioEnabled, true);
    assert.equal(normalized.worldSkillAudioEnabled, true);
    assert.equal(normalized.worldAudioVolume, 0.35);
});

test('world audio config preserves valid values and clamps invalid volume', () => {
    const customized = normalizeUiConfig({
        themeId: 'voxel-camp',
        worldAmbientAudioEnabled: false,
        worldSkillAudioEnabled: false,
        worldAudioVolume: 0.8,
    });
    assert.equal(customized.worldAmbientAudioEnabled, false);
    assert.equal(customized.worldSkillAudioEnabled, false);
    assert.equal(customized.worldAudioVolume, 0.8);

    const corrupted = normalizeUiConfig({
        themeId: 'voxel-camp',
        worldAudioVolume: 9,
    });
    assert.equal(corrupted.worldAudioVolume, 1);
});

test('normalizeUiConfig migrates a removed theme id to voxel-camp', () => {
    const normalized = normalizeUiConfig({
        themeId: 'legacy-theme' as UIConfig['themeId'],
        gameViewMode: '3d',
    });
    assert.equal(normalized.themeId, 'voxel-camp');
    assert.equal(normalized.gameViewMode, '3d');
});
