// 人类玩家发言链路功能测试
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
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
await page.waitForTimeout(4000);
// 面板出现则填写发言并提交
const textarea = page.locator('textarea');
const panelVisible = await textarea.count();
console.log('面板输入框数量:', panelVisible);
if (panelVisible > 0) {
    await textarea.first().fill('大家好我是人类玩家,这是一条发言测试。');
    await page.getByRole('button', { name: '确认行动' }).click();
    await page.waitForTimeout(2500);
}
const chatText = await page.locator('body').innerText();
console.log('发言进入会话区:', chatText.includes('发言测试') ? 'YES' : 'NO');
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await page.screenshot({ path: '/tmp/speech-test.png' });
await browser.close();
