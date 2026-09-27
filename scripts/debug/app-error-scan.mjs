// 打包站点全屏幕错误扫描
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 250)));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:3001', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
console.log('HOME errors:', errors.length ? errors.slice(0, 3).join(' ;; ') : 'none');
await page.evaluate(() => localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
console.log('SETTINGS errors:', errors.length ? errors.slice(-3).join(' ;; ') : 'none');
await page.screenshot({ path: '/tmp/settings-repro.png' });
await browser.close();
