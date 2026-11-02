import { expect, test } from '@playwright/test';

/**
 * 顶栏控件的等高契约。
 *
 * 2026-10-26 用户报「上面的按钮开始大小不一样了」：DAY / 存活 两个状态徽章是 34px 的 span，
 * 右侧按钮是 44px（触控标准），一行里混出两种高度，看着像没对齐。
 * 这条测试把"同一行的控件必须同高同顶"钉住——以后谁再加一个按钮，尺寸不对就会红。
 */

test('game header controls share one height and one baseline', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.addInitScript(() => {
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign',
            effectLevel: 'subtle', gameViewMode: '2d', worldAmbientAudioEnabled: false, worldSkillAudioEnabled: false,
            worldAudioVolume: 0, gameSfxEnabled: false, gameSfxVolume: 0, bgmEnabled: false,
            personaTagsEnabled: false, randomPersonaEachGame: false,
        }));
        localStorage.setItem('werewolf-gamePace', '1');
        localStorage.setItem('werewolf-isHumanMode', JSON.stringify(false));
    });
    await page.goto('/');
    await page.getByRole('button', { name: '旁观生存' }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();
    await expect(page.getByRole('button', { name: /暂停|继续/ })).toBeVisible({ timeout: 30_000 });

    const controls = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return null;
        // 顶栏右侧那排控件：DAY / 存活 / 说明 / 节奏 / 声音 / 布局 / 人设 / 最小化 / X
        const row = Array.from(header.querySelectorAll('div')).find(el =>
            el instanceof HTMLElement && el.className.includes('justify-end') && el.className.includes('gap-2')
        ) as HTMLElement | undefined;
        if (!row) return null;
        return Array.from(row.children)
            .filter((el): el is HTMLElement => el instanceof HTMLElement)
            .map(el => {
                const box = el.getBoundingClientRect();
                return {
                    label: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 8) || el.getAttribute('aria-label') || el.tagName,
                    height: Math.round(box.height),
                    top: Math.round(box.top),
                };
            });
    });

    // 人设 / 最小化原先埋在「更多」里，一个菜单只装这两项 → 直接放上顶栏，2D 也没有「更多」了
    await expect(page.getByRole('button', { name: '更多控制' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '人设' })).toBeVisible();
    await expect(page.getByRole('button', { name: '最小化' })).toBeVisible();

    expect(controls, '没找到顶栏控件行').not.toBeNull();
    expect(controls!.length).toBeGreaterThanOrEqual(6);
    console.log('header controls:', JSON.stringify(controls));

    const heights = [...new Set(controls!.map(item => item.height))];
    const tops = [...new Set(controls!.map(item => item.top))];
    expect(heights, `顶栏控件高度不一致：${JSON.stringify(controls)}`).toHaveLength(1);
    expect(tops, `顶栏控件没有对齐到同一条基线：${JSON.stringify(controls)}`).toHaveLength(1);
    // 触控标准：不小于 44px（含 3px 描边）
    expect(heights[0]).toBeGreaterThanOrEqual(44);
});
