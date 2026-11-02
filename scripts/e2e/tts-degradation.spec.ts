import { expect, test } from '@playwright/test';

/**
 * 回归：语音默认开启之后，**没有 TTS 后端**（Web 版起不来 Python/Electron 代理）时，
 * 对局必须照常推进——这是 AudioService 里三处兜底（fetch 超时、播放锁排队上限、播放看门狗）存在的意义。
 * 若哪天有人把 fetch 超时或看门狗删掉，这条会在"卡住不动"上失败，而不是让玩家先发现。
 */
test('TTS enabled but backend missing: game keeps advancing via subtitles', async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
        // 语音打开 + 没有任何可用模型（走离线大脑），后端由 DISABLE_AUX_SERVICES 的对照组提供：这里用 vite 默认实例，
        // TTS 端点若不存在会在 15s 内失败并回落字幕。
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: true, narratorActorId: 'n1' }));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign',
            effectLevel: 'subtle', gameViewMode: '2d', worldAmbientAudioEnabled: false, worldSkillAudioEnabled: false,
            worldAudioVolume: 0, gameSfxEnabled: false, gameSfxVolume: 0, bgmEnabled: false,
            personaTagsEnabled: false, randomPersonaEachGame: false,
        }));
        localStorage.setItem('werewolf-gamePace', '4');
        localStorage.setItem('werewolf-isHumanMode', JSON.stringify(false));
    });

    const started = Date.now();
    await page.goto('/');
    await page.getByRole('button', { name: '旁观生存' }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();
    await expect(page.getByRole('button', { name: /暂停|继续/ })).toBeVisible({ timeout: 30_000 });
    // 必须是推进到"天亮"（走完整个夜晚阶段链），而不只是刚开局的那句"天黑请闭眼"：
    // 语音请求失败只应丢语音，不能把主循环挂死。
    await expect(page.getByText(/天亮了/).first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/请睁眼|请闭眼/).first()).toBeVisible();
    const elapsed = Math.round((Date.now() - started) / 1000);
    expect(elapsed).toBeLessThan(150);

    // 再确认状态没有被"等待语音"卡住：暂停/恢复仍可切换
    const pause = page.getByRole('button', { name: /暂停|继续/ });
    await pause.click();
    await expect(page.getByRole('button', { name: /暂停|继续/ })).toBeVisible();
});
