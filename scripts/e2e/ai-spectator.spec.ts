import { expect, test } from '@playwright/test';

test('AI spectator game starts automatically and exposes the live process', async ({ page }) => {
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
        localStorage.removeItem('werewolf-uiConfig');
    });

    await page.goto('/');
    await page.getByRole('button', { name: '旁观生存' }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();

    await expect(page.getByRole('button', { name: '暂停世界' })).toBeVisible();
    await expect(page.getByText('游戏开始。')).toBeVisible();
    await expect(page.getByText('未知职业')).toHaveCount(0);
    await expect.poll(async () => page.getByText(/请睁眼|请闭眼/).count()).toBeGreaterThan(0);
});
