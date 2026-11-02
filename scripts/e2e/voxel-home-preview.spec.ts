import { expect, test } from '@playwright/test';

test('3D mode turns the home camp into a forest valley preview', async ({ page }) => {
    // 3D 预览要拉 three chunk + 9 个 glb，机器忙起来 45s 不够
    test.setTimeout(120_000);
    await page.addInitScript(() => {
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp',
            gameViewMode: '3d',
        }));
    });

    await page.goto('/');
    await expect(page.getByTestId('voxel-home-world-preview')).toBeVisible({ timeout: 45_000 });
    // 左上场景工具条：3D 分段选中（这里原来是一个"3D 森林山谷 · 营地预览"的假按钮标签，
    // 长得像按钮却点不动；现在分段是真开关，所以断言的是状态 + 点了会发生什么）
    await expect(page.getByTestId('home-view-3d')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('home-view-2d')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: '3D 森林山谷预览' })).toBeVisible();
    await page.screenshot({ path: 'output/playwright/voxel-home-3d.png' });

    // 切回 2D：预览卸载、分段互斥
    await page.getByTestId('home-view-2d').click();
    await expect(page.getByTestId('voxel-home-world-preview')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('home-view-2d')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('home-view-3d')).toHaveAttribute('aria-pressed', 'false');
});
