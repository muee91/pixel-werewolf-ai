// 死亡玩家投票面板可见性回归测试
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function setupAndCount(status) {
    await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
    await page.evaluate((st) => {
        localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
        localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
            { id: 1, seatNumber: 1, displayName: '死者', role: 2, rolePrompt: '', status: st, isHuman: true, isSpeaking: false, avatarSeed: 101 },
            { id: 2, seatNumber: 2, displayName: 'AI甲', role: 1, rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
            { id: 3, seatNumber: 3, displayName: 'AI乙', role: 1, rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 103 },
        ]));
        localStorage.setItem('werewolf-currentPhase', JSON.stringify('VOTING'));
        localStorage.setItem('werewolf-isHumanMode', 'true');
        localStorage.setItem('werewolf-isPaused', 'true');
        localStorage.setItem('werewolf-isAutoPlay', 'false');
        const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
        cfg.gameViewMode = '2d';
        localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
    }, status);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    return await page.getByRole('button', { name: '确认行动' }).count();
}

const deadPanel = await setupAndCount('DEAD_NIGHT');
const alivePanel = await setupAndCount('ALIVE');
console.log(`死亡玩家投票面板: ${deadPanel === 0 ? '不显示 ✅' : '显示 ❌'}`);
console.log(`存活玩家投票面板: ${alivePanel > 0 ? '显示 ✅' : '不显示 ❌'}`);
await browser.close();
