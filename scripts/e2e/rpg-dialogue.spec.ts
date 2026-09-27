import { expect, test } from '@playwright/test';

test('visible player speech uses the RPG dialogue overlay in 3D', async ({ page }) => {
    test.setTimeout(90_000); // 9 人发言串行显示,预算放宽
    const deterministicLlmResponse = {
        choices: [{
            message: {
                content: JSON.stringify({
                    speak: '今晚先统一信息，白天再根据发言顺序判断，不要急着暴露自己的底牌。',
                    strategySummary: '测试发言',
                    actionTarget: 1,
                    action: 'skip',
                }),
            },
        }],
    };
    await page.route(/\/(?:api\/nvidia-chat|api\/local-llm|chat\/completions)(?:\?|$)/, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(deterministicLlmResponse),
        });
    });
    await page.addInitScript(() => {
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({
            enabled: false,
            narratorActorId: 'n1',
        }));
        localStorage.setItem('werewolf-llmProviders', JSON.stringify([{
            id: 'provider-test', name: '测试供应商', type: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'test-api-key',
        }]));
        localStorage.setItem('werewolf-llmPresets', JSON.stringify([{
            id: 'llm-test', name: '测试模型', providerId: 'provider-test', modelId: 'test-model',
        }]));
        localStorage.setItem('werewolf-isHumanMode', JSON.stringify(false));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp',
            gameViewMode: '3d',
        }));
        localStorage.setItem('werewolf-e2e', '1');
    });

    await page.goto('/');
    await page.getByRole('button', { name: '旁观生存' }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();
    await expect(page.getByTestId('voxel-rpg-canvas')).toBeVisible({ timeout: 20_000 }); // 世界生成可达 5-10s
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: 'output/playwright/rpg-valley-overview.png' });

    const dialogue = page.getByTestId('rpg-dialogue-overlay');
    const logPanel = page.getByTestId('rpg-log-panel');

    // 对话按发言逐条显示(2.2s/条,阶段间隙有短暂空窗)。
    // 用单次轮询在同一可见窗口内验证:内容正确、无隐藏身份泄漏、日志面板淡出。
    await expect.poll(async () => {
        if (!(await dialogue.isVisible())) return 'waiting';
        const text = (await dialogue.textContent().catch(() => '')) ?? '';
        if (!text.includes('今晚先统一信息')) return 'waiting';
        if (text.includes('神秘发言者')) return 'leak';
        const opacity = await logPanel.evaluate(el => getComputedStyle(el).opacity).catch(() => '0');
        return opacity === '0' ? 'ok' : 'panel-visible';
    }, { timeout: 60_000, intervals: [500, 1000, 2_500] }).toBe('ok');

    await page.screenshot({ path: 'output/playwright/rpg-dialogue-desktop.png' });

    // 移动端:等下一条对话出现再量尺寸(发言是串行循环的,必然再出现)
    await expect(dialogue).toBeVisible({ timeout: 30_000 });
    const dialogueBox = await dialogue.boundingBox();
    expect(dialogueBox).not.toBeNull();
    expect(dialogueBox!.width).toBeGreaterThan(340);
    expect(dialogueBox!.height).toBeLessThan(360);
    await page.screenshot({ path: 'output/playwright/rpg-dialogue-mobile.png' });
});
