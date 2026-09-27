// 自动导播实测
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => { const t = m.text(); if (t.includes('CAM-DEBUG') || t.includes('DLG-DEBUG')) console.log('DBG:', t.slice(0, 170)); });
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
    localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
        { id: 1, seatNumber: 1, displayName: 'AI一', role: 'WEREWOLF', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 101 },
        { id: 2, seatNumber: 2, displayName: 'AI二', role: 'SEER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
        { id: 3, seatNumber: 3, displayName: 'AI三', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 103 },
        { id: 4, seatNumber: 4, displayName: 'AI四', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 104 },
        { id: 5, seatNumber: 5, displayName: 'AI五', role: 'WITCH', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 105 },
        { id: 6, seatNumber: 6, displayName: 'AI六', role: 'HUNTER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 106 },
    ]));
    localStorage.setItem('werewolf-currentPhase', JSON.stringify('DAY_DISCUSSION'));
    localStorage.setItem('werewolf-speakingQueue', JSON.stringify([1, 2, 3, 4, 5, 6]));
    localStorage.setItem('werewolf-isAutoPlay', 'true');
    localStorage.setItem('werewolf-isPaused', 'false');
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '3d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(40000);
await page.screenshot({ path: '/tmp/autodirector-40s.png' });
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await browser.close();
