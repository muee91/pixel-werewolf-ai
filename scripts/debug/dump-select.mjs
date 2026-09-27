import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
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
const info = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')].filter(l => l.textContent.includes('基础模型'));
    const sel = labels[0] ? labels[0].closest('div')?.querySelector('select') : null;
    return sel ? [...sel.options].map(o => o.value + '|' + o.textContent) : 'NO SELECT';
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
