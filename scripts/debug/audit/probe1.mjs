import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:3907', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
// list home screen buttons
const texts = await page.locator('button').allInnerTexts();
console.log('BUTTONS:', JSON.stringify(texts.slice(0, 40)));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 10)));
await browser.close();
