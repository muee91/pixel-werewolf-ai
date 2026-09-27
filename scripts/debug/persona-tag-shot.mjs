// 人设标记 2D 验收截图
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 150)));
await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
    localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
        { id: 1, seatNumber: 1, displayName: '人类测试', role: 'SEER', rolePrompt: '', status: 'ALIVE', isHuman: true, isSpeaking: false, avatarSeed: 101 },
        { id: 2, seatNumber: 2, displayName: '狼甲', role: 'WEREWOLF', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102, stylePrompt: '你的所有发言必须极度戏剧化,情绪放大,善用感叹号与排比,像在演独幕剧,但推理保持正确。' },
        { id: 3, seatNumber: 3, displayName: '预女乙', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 103, stylePrompt: '你用东北方言口吻发言,豪爽幽默,爱用"咱""整""咋地""老铁"等词,但逻辑清晰不含糊。' },
        { id: 4, seatNumber: 4, displayName: '村民丙', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 104 },
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
await page.waitForTimeout(3000);
const body = await page.locator('body').innerText();
console.log('人设标记显示:', body.includes('戏精附体') && body.includes('东北老铁') ? 'YES ✅' : 'NO ❌');
console.log('人设开关按钮:', body.includes('人设开') ? 'YES ✅' : 'NO ❌');
await page.screenshot({ path: '/tmp/persona-tags.png' });
console.log('ERRORS:', errors.join(' ;; ') || 'none');
await browser.close();
