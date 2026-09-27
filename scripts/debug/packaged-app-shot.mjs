// 对打包 App 托管的站点做验收截图(设置中心纸面主题)
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
await page.goto('http://127.0.0.1:3001', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/packaged-home.png' });
await page.evaluate(() => localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/packaged-settings.png' });
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await browser.close();
