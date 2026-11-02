import { expect, test } from '@playwright/test';

// AI 陪伴场景的核心韧性回归（2026-09-27 审计 T14）：
// 远端 LLM（example.test，.test 保育域必不可达）全部失败时，对局必须
// 靠降级大脑（规则兜底）持续推进完整夜班——不仅开局，还要走到「天亮了」。
// 断言三层：请求确实发出 → 夜间阶段推进 → 完整夜结束。
test('remote LLM unreachable: game degrades to fallback brain and completes the night', async ({ page }) => {
    // 降级夜的墙钟耗时 = 每个座位最多 3 次 LLM 重试退避（倍速不压缩这段）+ 演出等待。
    // 实测原 45s 等待下首跑通过率只有 1/3，这里把「天亮了」的等待抬到 120s（整条测试 180s）：
    // 断言内容不变，仍必须走到「天亮了」才算降级大脑撑过完整夜班。
    test.setTimeout(180_000);

    const llmRequests: string[] = [];
    page.on('request', request => {
        if (request.url().includes('example.test')) llmRequests.push(request.url());
    });

    await page.addInitScript(() => {
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({
            enabled: false, // 无头环境关 TTS；LLM 路径不受此开关影响
            narratorActorId: 'n1',
        }));
        localStorage.setItem('werewolf-llmProviders', JSON.stringify([{
            id: 'provider-test', name: '测试供应商', type: 'openai',
            baseUrl: 'https://example.test/v1', apiKey: 'test-api-key',
        }]));
        localStorage.setItem('werewolf-llmPresets', JSON.stringify([{
            id: 'llm-test', name: '测试模型', providerId: 'provider-test', modelId: 'test-model',
        }]));
        localStorage.setItem('werewolf-isHumanMode', JSON.stringify(false));
        localStorage.removeItem('werewolf-uiConfig');
    });

    await page.goto('/');
    await page.getByRole('button', { name: '旁观生存' }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();

    await expect(page.getByRole('button', { name: /暂停|继续/ })).toBeVisible();
    await expect(page.getByText('游戏开始。')).toBeVisible();

    // 用对局自带的倍速按钮快进（1×→2×→4×）：它只压缩演出与阶段推进等待，
    // 模型重试退避与降级判定路径完全不变，正是玩家快进时看到的那条链路
    const paceButton = page.getByTestId('pace-control');
    await paceButton.click();
    await paceButton.click();
    await expect(paceButton).toHaveAccessibleName('观战节奏 4 倍');

    // 夜间推进（睁眼/闭眼播报）——降级大脑驱动的阶段机仍在走
    await expect.poll(
        async () => page.getByText(/请睁眼|请闭眼/).count(),
        { timeout: 60_000 },
    ).toBeGreaterThan(0);

    // 完整夜结束：证明降级不是只撑一步
    await expect(page.getByText(/天亮了/).first()).toBeVisible({ timeout: 120_000 });

    // 确认期间确实尝试过远端 LLM（失败请求也会触发 request 事件）
    expect(llmRequests.length).toBeGreaterThan(0);
});
