import { expect, test } from '@playwright/test';


test('human player can switch between classic 2D and the 3D RPG camp', async ({ page }) => {
    test.setTimeout(180_000); // 3D 画布+引擎实时节奏+移动视口往返,实测本机约 100s,给 CI 留一倍余量
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
    await expect(page.getByRole('button', { name: /暂停|继续/ })).toBeVisible();

    // 「布局」常驻顶栏（切视角是高频动作，不再收进「更多」菜单）
    const switchViewMode = async (mode: '3D RPG' | '经典 2D') => {
        await page.getByRole('button', { name: '布局', exact: true }).click();
        await page.getByRole('button', { name: mode, exact: true }).click();
    };

    await switchViewMode('3D RPG');

    await expect(page.getByTestId('voxel-rpg-room')).toBeVisible();
    await expect(page.getByTestId('voxel-rpg-canvas')).toBeVisible({ timeout: 20_000 }); // 世界生成可达 5-10s
    await expect(page.getByTestId('rpg-hud')).toBeVisible();
    // phase-transition 是短生命周期转场浮层：暂停/快进时可能已播完,与持久的阶段横幅二选一即可
    await expect(
        page.getByTestId('phase-transition').or(page.getByText('夜幕降临，请保持安静')).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('rpg-live-log')).toBeVisible();
    // 声音只有一个入口（右上工具栏）：原先 HUD 日志面板里还有一个同名「声音」管环境声/技能声，
    // 同一屏两处同名开关玩家分不清该点哪个，现已合并进这一个菜单
    const toolbarSound = page.getByTitle('语音与音乐');
    await expect(toolbarSound).toBeVisible();
    await toolbarSound.click();
    const worldAudio = page.getByTestId('world-audio-controls');
    await expect(worldAudio.getByRole('button', { name: /^旁白语音 (开|关|检测中)$/ })).toBeVisible();
    // 用触发按钮自身收起，不能按 Esc：弹层收起的同一拍会被全局 Esc 快捷键当成「呼出退出确认」
    await expect(worldAudio.getByRole('button', { name: '环境声 开' })).toBeVisible();
    await worldAudio.getByRole('button', { name: '技能声 开' }).click();
    await expect(worldAudio.getByRole('button', { name: '技能声 关' })).toBeVisible();
    await worldAudio.getByRole('button', { name: '技能声 关' }).click();
    await toolbarSound.click();
    await expect(worldAudio.getByRole('button', { name: '环境声 开' })).toBeHidden();
    await expect(page.getByText('主线任务')).toBeVisible();
    await expect(page.getByText('未知职业').first()).toBeVisible();

    // 运镜 / 最小化原来埋在「更多」里，要先展开一次才看得见 → 现在直接挂在顶栏，没有「更多」了
    await expect(page.getByRole('button', { name: '更多控制' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '最小化' })).toBeVisible();
    const cameraTrigger = page.getByRole('button', { name: '运镜方式' });
    await expect(cameraTrigger).toBeVisible();
    await cameraTrigger.click();
    const cameraMenu = page.getByTestId('camera-menu');
    await expect(cameraMenu).toBeVisible();
    await expect(cameraMenu.getByRole('button')).toHaveCount(5);
    await expect(cameraMenu.getByText('当前：自动导播')).toBeVisible();
    await cameraMenu.getByRole('button', { name: /全景环绕/ }).click();
    await expect(cameraMenu).toBeHidden();
    // 选完立刻生效：触发按钮点亮（active）且标题带上当前款式
    await expect(cameraTrigger).toHaveAttribute('title', '运镜：全景环绕');
    await cameraTrigger.click();
    await expect(page.getByTestId('camera-menu').getByRole('button', { name: /全景环绕/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('camera-menu').locator('button').filter({ hasText: '自动导播' }).first().click();
    await expect(page.getByTestId('camera-menu')).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: /队伍 \d+\/\d+/ })).toBeVisible();
    await expect(page.getByText('冒险队伍')).toBeHidden();
    await page.getByRole('button', { name: /队伍 \d+\/\d+/ }).click();
    await expect(page.getByText('冒险队伍')).toBeVisible();
    await page.getByRole('button', { name: '收起队伍' }).click();
    await expect(page.getByText('冒险队伍')).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 720 });

    await switchViewMode('经典 2D');

    await expect(page.getByTestId('voxel-rpg-room')).toHaveCount(0);
    await expect(page.getByText('营地狼人杀')).toBeVisible();
});
