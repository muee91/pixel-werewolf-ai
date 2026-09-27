// 设置页各分区截图审计
import { chromium } from '@playwright/test';

const BASE = process.env.SHOT_BASE || 'http://localhost:3907';
const OUT = process.env.SHOT_OUT || '/tmp/settings-audit';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const sections = ['外观', '游戏', '模型与语音', '玩家与分身', '高级'];
for (const label of sections) {
    const btn = page.getByRole('button', { name: label }).first();
    await btn.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}-${label}.png` });
    console.log(`shot: ${label}`);
}

// 子页:供应商编辑
await page.getByRole('button', { name: '模型与语音' }).first().click();
await page.waitForTimeout(500);
const addProvider = page.getByRole('button', { name: /新增供应商|添加供应商/ }).first();
if (await addProvider.count()) {
    await addProvider.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}-子页-供应商编辑.png` });
    console.log('shot: 子页-供应商编辑');
}

await browser.close();
