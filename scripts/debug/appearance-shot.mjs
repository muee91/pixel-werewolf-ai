import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/appearance-preview.png' });
await browser.close();
