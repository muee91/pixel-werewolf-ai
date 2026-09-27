// 设置页第 2 批审计:滑杆、供应商列表、玩家编辑子页
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3907';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// 游戏 → 滚到底(朗读速度滑杆)
await page.getByRole('button', { name: '游戏' }).first().click();
await page.waitForTimeout(500);
await page.locator('input[type="range"]').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/settings-audit-游戏-滑杆.png' });
console.log('shot: 游戏滑杆');

// 模型与语音 → 滚到 AI 供应商列表
await page.getByRole('button', { name: '模型与语音' }).first().click();
await page.waitForTimeout(500);
await page.getByText('AI 供应商').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/settings-audit-模型-供应商.png' });
console.log('shot: 供应商列表');

// 玩家与分身 → 进路人甲编辑子页(含 select)
await page.getByRole('button', { name: '玩家与分身' }).first().click();
await page.waitForTimeout(500);
await page.getByText('路人甲').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/settings-audit-子页-玩家编辑.png' });
console.log('shot: 玩家编辑子页');

await browser.close();
