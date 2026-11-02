import { test, expect } from '@playwright/test';

// 设置中心「归位」契约：听得见的、看得见的、动脑子的、要搬家的，各在各的分区里。
// 这一条专门防回归 —— 之前音频挂在外观、朗读语速挂在游戏、TTS 开关挂在模型，同一件事被拆三处。
test('设置分区归位：声音 / 模型 / 游戏 / 高级 各管一摊', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByText('设置中心')).toBeVisible({ timeout: 30_000 });

  const sections = ['appearance', 'sound', 'model', 'game', 'players', 'advanced'];
  for (const id of sections) {
    await expect(page.getByTestId(`settings-section-${id}`)).toBeVisible();
  }

  // 声音：三条音轨 + 音乐 + 音量 + 朗读，全在一处
  await page.getByTestId('settings-section-sound').click();
  for (const text of ['场景与对局音轨', '语音朗读', '环境声', '技能声', '阶段音效', '对局音乐（BGM）', '音量', '朗读倍速', 'Edge TTS 引擎']) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }

  // 外观：只剩看得见的东西，音频不该再出现在这里
  await page.getByTestId('settings-section-appearance').click();
  await expect(page.getByText('对局视角', { exact: true })).toBeVisible();
  await expect(page.getByText('特效等级', { exact: true })).toBeVisible();
  await expect(page.getByText('环境声', { exact: true })).toHaveCount(0);
  await expect(page.getByText('朗读倍速', { exact: true })).toHaveCount(0);
  await expect(page.getByText('演出音频', { exact: true })).toHaveCount(0);

  // 游戏：只剩板子规则，朗读语速已搬走
  await page.getByTestId('settings-section-game').click();
  await expect(page.getByText('狼人自爆', { exact: true })).toBeVisible();
  await expect(page.getByText('朗读倍速', { exact: true })).toHaveCount(0);
  await expect(page.getByText('自动播放速度', { exact: true })).toHaveCount(0);

  // 模型：只剩大脑，代理与 TTS、导入导出都已搬走
  await page.getByTestId('settings-section-model').click();
  await expect(page.getByText('开局健康检查', { exact: true })).toBeVisible();
  await expect(page.getByText('AI 供应商', { exact: true })).toBeVisible();
  await expect(page.getByText('LLM 代理', { exact: true })).toHaveCount(0);
  await expect(page.getByText('启用语音 (TTS)', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导出模型配置' })).toHaveCount(0);

  // 玩家：不再自带导入导出
  await page.getByTestId('settings-section-players').click();
  await expect(page.getByText('玩家列表', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出玩家配置' })).toHaveCount(0);

  // 高级：网络转发 + 四组导入导出收口
  await page.getByTestId('settings-section-advanced').click();
  await expect(page.getByText('网络与转发', { exact: true })).toBeVisible();
  await expect(page.getByText('数据搬家', { exact: true })).toBeVisible();
  await expect(page.getByText('LLM 代理', { exact: true })).toBeVisible();
  for (const title of ['设置配置', '模型配置', '玩家配置', '完整备份']) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(4);
  await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(4);
});

// 设置页「减法」契约：能点的才留着，不能点的只读装饰不进版面。
// 背景：头部原有 4 个只读徽章（含一个和外观选择器重复的「主题」）+ 侧栏 2 个统计，
// 6 个数字全点不动；玩家 12 张卡单列要滚 4 屏；健康检查面板占 200px 和供应商列表抢屏。
test('设置页减法：总览可跳转 / 玩家两列 / 健康检查压成一行', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByText('设置中心')).toBeVisible({ timeout: 30_000 });

  // 1) 头部只剩三个总览，且都能点（主题徽章已删）
  for (const id of ['overview-model', 'overview-tts', 'overview-archives']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.locator('.sticky').getByText('主题', { exact: true })).toHaveCount(0);

  // 点 TTS 总览应落到「声音」分区（选中态带 3px 硬阴影，未选中是 none）
  await page.getByTestId('overview-tts').getByRole('button').click();
  await expect(page.getByText('语音朗读', { exact: true })).toBeVisible();
  await expect(page.getByTestId('settings-section-sound')).not.toHaveCSS('box-shadow', 'none');

  // 2) 模型页健康检查压成一条：整块高度不超过 90px（原来是 200px 的三格面板）
  await page.getByTestId('settings-section-model').click();
  const healthBox = page.getByTestId('model-health');
  await expect(healthBox).toBeVisible();
  const healthH = (await healthBox.boundingBox())?.height ?? 999;
  expect(healthH).toBeLessThan(90);
  for (const pill of ['供应商', '模型', '语音']) {
    // 药丸里「✓ / 名词 / 数值」是同一元素内的三段，没有只含名词的子元素，所以不能 exact
    await expect(healthBox.getByText(pill).first()).toBeVisible();
  }

  // 3) 玩家卡片两列同排
  await page.getByTestId('settings-section-players').click();
  const cards = page.locator('[data-testid="player-card"]');
  const count = await cards.count();
  if (count >= 2) {
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    expect(a && b && Math.abs(a.y - b.y)).toBeLessThan(4);
    expect((b?.x ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0))).toBeGreaterThan(8);
  }
});
