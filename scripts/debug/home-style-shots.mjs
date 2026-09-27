// 逐个首页风格截图验证
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
for (const [id, label] of [['block-harbor', '木板码头'], ['survival-camp', '营火据点'], ['redstone-lobby', '红石工坊']]) {
    await page.getByText(label, { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '返回' }).first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `/tmp/home-style-${id}.png` });
    console.log(`shot: ${label}`);
    await page.evaluate(() => localStorage.setItem('werewolf-appScreen', JSON.stringify('SETTINGS')));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
}
await browser.close();
