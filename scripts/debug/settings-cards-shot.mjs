import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:3001', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS'));
    sessionStorage.setItem('werewolf-settings-section', 'model');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/settings-builtin-card.png' });
await browser.close();
