// 零配置离线大脑端到端验证
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 150)));
// 全新机器:清空所有存储,无 Key 无 Ollama(3907 端口 dev 关闭了 aux,19000 无 mock)
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
// 首页:零配置应可点燃营火
const igniteDisabled = await page.getByTestId('ignite-campfire-button').isDisabled().catch(() => 'no-button');
console.log('零配置点燃营火可用:', igniteDisabled === false ? 'YES ✅' : `NO(${igniteDisabled}) ❌`);
// 选 9 人经典局并点燃
await page.getByText('经典标准局', { exact: false }).first().click();
await page.getByTestId('ignite-campfire-button').click();
await page.waitForTimeout(25000);
const body = await page.locator('body').innerText();
console.log('离线大脑提示出现:', body.includes('内置离线大脑') || body.includes('离线大脑驱动') ? 'YES ✅' : 'NO ❌');
console.log('对局在推进(白天/夜晚):', /天黑|天亮|讨论|发言|查验|回合/.test(body) ? 'YES ✅' : 'NO ❌');
console.log('状态变化泄露:', body.includes('状态变化：') ? 'YES ❌' : 'NO ✅');
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await page.screenshot({ path: '/tmp/offline-brain.png' });
await browser.close();
