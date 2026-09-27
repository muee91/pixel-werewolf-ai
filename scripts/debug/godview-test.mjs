// 上帝视角显示复现
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
    localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
        { id: 1, seatNumber: 1, displayName: '人类测试', role: 'SEER', rolePrompt: '', status: 'ALIVE', isHuman: true, isSpeaking: false, avatarSeed: 101 },
        { id: 2, seatNumber: 2, displayName: '狼甲', role: 'WEREWOLF', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
        { id: 3, seatNumber: 3, displayName: '预女乙', role: 'SEER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 103 },
        { id: 4, seatNumber: 4, displayName: '村民丙', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 104 },
    ]));
    localStorage.setItem('werewolf-currentPhase', JSON.stringify('DAY_DISCUSSION'));
    localStorage.setItem('werewolf-isHumanMode', 'true');
    localStorage.setItem('werewolf-isPaused', 'true');
    localStorage.setItem('werewolf-isAutoPlay', 'false');
    localStorage.setItem('werewolf-debugMode', 'true');
    localStorage.setItem('werewolf-debugGodView', 'true');
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '2d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const body2d = await page.locator('body').innerText();
console.log('2D 角色词出现:', ['狼人', '预言家', '村民'].filter(r => body2d.includes(r)).join('/') || 'NONE');
await page.screenshot({ path: '/tmp/godview-2d.png' });
await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '3d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const body3d = await page.locator('body').innerText();
console.log('3D 角色词出现:', ['狼人', '预言家', '村民'].filter(r => body3d.includes(r)).join('/') || 'NONE');
await page.screenshot({ path: '/tmp/godview-3d.png' });
await browser.close();
