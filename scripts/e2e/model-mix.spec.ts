import { test, expect } from '@playwright/test';

test('model mix panel applies presets to actors', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
        const actors = ['a1', 'a2', 'a3', 'a4', 'a5', 'a8', 'a9', 'a10', 'a11'].map((id, i) => ({
            id, name: `分身${i + 1}`, llmPresetId: '', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '',
        }));
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
        localStorage.setItem('werewolf-llmProviders', JSON.stringify([{ id: 'p', name: '网关', type: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'k' }]));
        localStorage.setItem('werewolf-llmPresets', JSON.stringify([
            { id: 'l1', name: 'v4.1-flash', providerId: 'p', modelId: 'deepseek-v4.1-flash' },
            { id: 'l2', name: 'gpt-mini', providerId: 'p', modelId: 'gpt-5-mini' },
            { id: 'l3', name: 'qwen-max', providerId: 'p', modelId: 'qwen-max' },
        ]));
        localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify(actors));
        localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS'));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({ themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign', effectLevel: 'subtle', gameViewMode: '2d', worldAmbientAudioEnabled: false, worldSkillAudioEnabled: false, worldAudioVolume: 0, gameSfxEnabled: false, gameSfxVolume: 0, bgmEnabled: false, personaTagsEnabled: false, randomPersonaEachGame: false }));
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByText('玩家与分身', { exact: false }).first().click();
    await expect(page.getByText('模型混搭（电子斗蛐蛐）', { exact: false })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '混搭' }).click();
    await page.getByRole('button', { name: '轮流铺开' }).click();
    await page.waitForTimeout(400);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('werewolf-actorProfiles-v2') || '[]') as { llmPresetId: string }[]);
    const used = [...new Set(saved.map(a => a.llmPresetId))].filter(Boolean);
    expect(used.length, `期望铺开 3 个模型，实际 ${used.join(',')}`).toBe(3);
    await page.screenshot({ path: '/tmp/settings-mix.png' });
});
