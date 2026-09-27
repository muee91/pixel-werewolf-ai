// 3D 运镜实测:每个风格切两帧对比
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => { const t = m.text(); if (t.includes('CAM-DEBUG')) console.log('DBG:', t.slice(0, 160)); });
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
    localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
        { id: 1, seatNumber: 1, displayName: 'AI一', role: 'WEREWOLF', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 101 },
        { id: 2, seatNumber: 2, displayName: 'AI二', role: 'SEER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
        { id: 3, seatNumber: 3, displayName: 'AI三', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 103 },
    ]));
    localStorage.setItem('werewolf-currentPhase', JSON.stringify('DAY_DISCUSSION'));
    localStorage.setItem('werewolf-isAutoPlay', 'true');
    localStorage.setItem('werewolf-isPaused', 'false');
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '3d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const styles = ['自动导播', '全景环绕', '低角掠野', '高空俯瞰', '缓推缓拉'];
for (const label of styles) {
    await page.getByRole('button', { name: /运镜/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `/tmp/cam-${label}-a.png` });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `/tmp/cam-${label}-b.png` });
    console.log(`shot: ${label}`);
}
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await browser.close();
