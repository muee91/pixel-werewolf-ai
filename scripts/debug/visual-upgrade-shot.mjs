// 3D 视觉升级验收截图
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
    localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
        { id: 1, seatNumber: 1, displayName: '狼一', role: 'WEREWOLF', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 101 },
        { id: 2, seatNumber: 2, displayName: '预女', role: 'SEER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
        { id: 3, seatNumber: 3, displayName: '村民', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 103 },
        { id: 4, seatNumber: 4, displayName: '狼二', role: 'WEREWOLF', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 104 },
    ]));
    localStorage.setItem('werewolf-currentPhase', JSON.stringify('DAY_DISCUSSION'));
    localStorage.setItem('werewolf-currentSpeakerId', JSON.stringify(2));
    localStorage.setItem('werewolf-isAutoPlay', 'false');
    localStorage.setItem('werewolf-isPaused', 'false');
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '3d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/visual-3d-speaking.png' });
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await browser.close();
