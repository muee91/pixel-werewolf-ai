import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
await page.goto('http://127.0.0.1:3001', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS'));
    sessionStorage.setItem('werewolf-settings-section', 'model');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
// 进入一个分身编辑页验证下拉含内置选项
await page.getByText('玩家与分身', { exact: false }).first().click();
await page.waitForTimeout(600);
await page.getByText('路人甲').first().click();
await page.waitForTimeout(800);
const builtinOption = await page.getByText('内置小模型（离线，无需配置）').count();
await page.screenshot({ path: '/tmp/builtin-select.png' });
console.log('基础模型下拉含内置选项:', builtinOption > 0 ? 'YES ✅' : 'NO ❌');
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await browser.close();
