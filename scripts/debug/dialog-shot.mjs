// 注入假对局状态截图像素对话框
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 150)));
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
    localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
        { id: 1, seatNumber: 1, displayName: '测试员', role: 3, rolePrompt: '', status: 'ALIVE', isHuman: true, isSpeaking: false, avatarSeed: 101 },
        { id: 2, seatNumber: 2, displayName: '路人甲', role: 1, rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
    ]));
    localStorage.setItem('werewolf-currentPhase', JSON.stringify('DAY_DISCUSSION'));
    localStorage.setItem('werewolf-isHumanMode', 'true');
    localStorage.setItem('werewolf-isPaused', 'true');
    localStorage.setItem('werewolf-isAutoPlay', 'false');
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '2d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/mc-dialog.png' });
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await browser.close();
