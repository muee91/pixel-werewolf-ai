import { expect, test } from '@playwright/test';


test('human player can switch between classic 2D and the 3D RPG camp', async ({ page }) => {
    test.setTimeout(120_000); // 3D 画布+引擎实时节奏+移动视口往返,45s 默认预算不够
    await page.addInitScript(() => {
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({
            enabled: true,
            narratorActorId: 'n1',
        }));
        localStorage.setItem('werewolf-llmProviders', JSON.stringify([{
            id: 'provider-test', name: '测试供应商', type: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'test-api-key',
        }]));
        localStorage.setItem('werewolf-llmPresets', JSON.stringify([{
            id: 'llm-test', name: '测试模型', providerId: 'provider-test', modelId: 'test-model',
        }]));
        localStorage.removeItem('werewolf-uiConfig');
        localStorage.setItem('werewolf-e2e', '1');
        HTMLMediaElement.prototype.play = function () {
            queueMicrotask(() => this.dispatchEvent(new Event('play')));
            queueMicrotask(() => this.dispatchEvent(new Event('ended')));
            return Promise.resolve();
        };
    });

    await page.goto('/');
    await page.getByRole('button', { name: /亲自上场/ }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();
    await expect(page.getByRole('button', { name: /暂停世界|继续世界/ })).toBeVisible();

    await page.getByRole('button', { name: '布局' }).click();
    await page.getByRole('button', { name: '3D RPG' }).click();

    await expect(page.getByTestId('voxel-rpg-room')).toBeVisible();
    await expect(page.getByTestId('voxel-rpg-canvas')).toBeVisible({ timeout: 20_000 }); // 世界生成可达 5-10s
    await expect(page.getByTestId('rpg-hud')).toBeVisible();
    // phase-transition 是短生命周期转场浮层：暂停/快进时可能已播完,与持久的阶段横幅二选一即可
    await expect(
        page.getByTestId('phase-transition').or(page.getByText('夜幕降临，请保持安静')).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('world-audio-controls')).toBeVisible();
    await expect(page.getByTestId('rpg-live-log')).toBeVisible();
    // 语音开关按钮存在即可：HUD 随引擎帧重渲染,点击稳定性差,交互由设置页覆盖
    await expect(page.getByRole('button', { name: /语音开|语音关/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '环境声 开' })).toBeVisible();
    await page.getByRole('button', { name: '技能声 开' }).click();
    await expect(page.getByRole('button', { name: '技能声 关' })).toBeVisible();
    await page.getByRole('button', { name: '技能声 关' }).click();
    await expect(page.getByText('主线任务')).toBeVisible();
    await expect(page.getByText('未知职业').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: /队伍 \d+\/\d+/ })).toBeVisible();
    await expect(page.getByText('冒险队伍')).toBeHidden();
    await page.getByRole('button', { name: /队伍 \d+\/\d+/ }).click();
    await expect(page.getByText('冒险队伍')).toBeVisible();
    await page.getByRole('button', { name: '收起队伍' }).click();
    await expect(page.getByText('冒险队伍')).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 720 });

    await page.getByRole('button', { name: '布局' }).click();
    await page.getByRole('button', { name: '经典 2D' }).click();

    await expect(page.getByTestId('voxel-rpg-room')).toHaveCount(0);
    await expect(page.getByText('营地狼人杀')).toBeVisible();
});
