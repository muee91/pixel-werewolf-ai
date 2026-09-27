// 验证状态变化追踪不再出现在玩家可见日志
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 150)));
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
    localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
        { id: 1, seatNumber: 1, displayName: '人类测试', role: 3, rolePrompt: '', status: 'ALIVE', isHuman: true, isSpeaking: false, avatarSeed: 101 },
        { id: 2, seatNumber: 2, displayName: 'AI甲', role: 1, rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
    ]));
    localStorage.setItem('werewolf-currentPhase', JSON.stringify('DAY_DISCUSSION'));
    localStorage.setItem('werewolf-speakingQueue', JSON.stringify([1, 2]));
    localStorage.setItem('werewolf-isHumanMode', 'true');
    localStorage.setItem('werewolf-isAutoPlay', 'true');
    localStorage.setItem('werewolf-isPaused', 'false');
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '2d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const body = await page.locator('body').innerText();
console.log('状态变化泄露到玩家视图:', body.includes('状态变化') ? 'YES ❌' : 'NO ✅');
console.log('正常发言仍在:', body.includes('发言测试') || body.includes('号') ? 'YES ✅' : 'NO');
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await page.screenshot({ path: '/tmp/trace-filter.png' });
await browser.close();
