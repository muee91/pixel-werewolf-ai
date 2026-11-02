import { test, expect } from '@playwright/test';

// 形象自定义的端到端契约。
// 背景：2D 视角的人物原先只有两张 16×28 矩阵（knight / elf），`座位号 % 2` 决定用哪张，
// 12 个座位必有 6 对双胞胎；3D 的颜色又是 seed 取模派生的。
// 现在 2D 有 13 种骨架（前 12 种剪影互不相同），且 2D / 3D 共用同一份 look。
test('分身形象可自定义：换色立即生效、13 种造型可选、随机可用、回到列表仍保留', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByText('设置中心')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('settings-section-players').click();

  // 列表里每个人已经有一张自己的小像（不再是一排一模一样的头）
  const firstCard = page.getByTestId('player-card').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('canvas').first()).toBeVisible();

  await firstCard.click();
  const editor = page.getByTestId('avatar-look-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByText('形象（2D / 3D 通用）')).toBeVisible();

  // 0) 13 种造型格子都在，且每格都画出了自己的头像（画不出来会是空白 canvas）
  const spriteButtons = editor.locator('[data-testid^="sprite-pick-"]');
  expect(await spriteButtons.count()).toBe(13);
  const headCanvases = editor.locator('[data-testid^="sprite-pick-"] canvas');
  expect(await headCanvases.count()).toBe(13);

  // 1) 换主色 → 2D 精灵的 canvas 像素必须真的变
  const spriteCanvas = editor.getByTestId('sprite-look-preview').locator('canvas');
  const before = await spriteCanvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
  const primarySwatches = editor.locator('[aria-label^="主色 "]');
  expect(await primarySwatches.count()).toBeGreaterThan(4);
  await primarySwatches.nth(3).click();
  const after = await spriteCanvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
  expect(after).not.toBe(before);

  // 2) 换造型必须真的换掉预览（不同骨架是不同矩阵，不是只有颜色不同）
  await editor.getByTestId('sprite-pick-imp').click();
  const afterSprite = await spriteCanvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
  expect(afterSprite).not.toBe(after);

  // 3) 体型与发型在列表里以文字描述体现
  const summary = editor.getByText(/^.+：.+·.+·.+$/).first();
  const summaryBefore = await summary.textContent();
  await editor.getByRole('button', { name: '少年' }).click();
  await expect(summary).not.toHaveText(summaryBefore ?? '');
  await expect(summary).toContainText('少年');

  await editor.getByRole('button', { name: '两侧辫发' }).click();
  await expect(summary).toContainText('两侧辫发');

  // 4) 现成形象一键套用（法师是 wizard 造型，且会一并换掉配色）
  // 用 testid 而不是可见文字：造型格子里也有一个"法师"，按名字会命中两个按钮
  await editor.getByTestId('preset-scholar').click();
  await expect(summary).toContainText('法师');

  // 5) 随机不会把编辑器搞崩，且描述仍完整
  const beforeRandom = await summary.textContent();
  await editor.getByTitle('随机一套形象').click();
  await expect(summary).not.toHaveText(beforeRandom ?? '');
  const settled = await summary.textContent();

  // 6) 退出再进：形象落在分身配置上，而不是只活在页面 state 里
  // 注意别点成侧栏那个「返回」（它回首页），子页的返回有自己的 testid
  await page.getByTestId('subpage-back').click();
  await expect(page.getByTestId('player-card').first().locator('canvas').first()).toBeVisible();
  await page.getByTestId('player-card').first().click();
  await expect(page.getByTestId('avatar-look-editor')).toBeVisible();
  await expect(page.getByText(/^.+：.+·.+·.+$/).first()).toHaveText(settled ?? '');
});
