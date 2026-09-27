import { expect, test } from '@playwright/test';

test('3D mode turns the home camp into a forest valley preview', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp',
            gameViewMode: '3d',
        }));
    });

    await page.goto('/');
    await expect(page.getByTestId('voxel-home-world-preview')).toBeVisible();
    await expect(page.getByText('3D 森林山谷 · 营地预览')).toBeVisible();
    await page.screenshot({ path: 'output/playwright/voxel-home-3d.png' });
});
