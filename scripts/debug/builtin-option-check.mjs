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
await page.getByText('玩家与分身', { exact: false }).first().click();
await page.waitForTimeout(600);
await page.getByText('路人甲').first().click();
await page.waitForTimeout(800);
const result = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('select option')].map(o => ({ v: o.value, t: o.textContent }));
    return {
        hasBuiltin: opts.some(o => o.v === '__builtin__'),
        texts: opts.filter(o => o.v === '__builtin__' || o.value === '').map(o => o.t),
    };
});
console.log('内置选项存在:', result.hasBuiltin ? 'YES ✅' : 'NO ❌', JSON.stringify(result.texts));
await browser.close();
