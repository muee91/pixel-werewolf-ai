// 上帝视角日志可见性回归(村民看狼人夜聊)
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function scenario(godView) {
    await page.goto('http://localhost:3907', { waitUntil: 'domcontentloaded' });
    await page.evaluate((gv) => {
        localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
        localStorage.setItem('werewolf-currentPlayers', JSON.stringify([
            { id: 1, seatNumber: 1, displayName: '村民我', role: 'VILLAGER', rolePrompt: '', status: 'ALIVE', isHuman: true, isSpeaking: false, avatarSeed: 101 },
            { id: 2, seatNumber: 2, displayName: '狼人甲', role: 'WEREWOLF', rolePrompt: '', status: 'ALIVE', isHuman: false, isSpeaking: false, avatarSeed: 102 },
        ]));
        localStorage.setItem('werewolf-currentPhase', JSON.stringify('DAY_DISCUSSION'));
        localStorage.setItem('werewolf-isHumanMode', 'true');
        localStorage.setItem('werewolf-isPaused', 'true');
        localStorage.setItem('werewolf-isAutoPlay', 'false');
        localStorage.setItem('werewolf-debugMode', 'true');
        localStorage.setItem('werewolf-debugGodView', JSON.stringify(gv));
        localStorage.setItem('werewolf-currentLogs', JSON.stringify([
            { id: 'l1', turn: 1, phase: 'DAY_DISCUSSION', speakerId: 1, content: '我是村民的公开发言', timestamp: Date.now(), isSystem: false },
            { id: 'l2', turn: 1, phase: 'WEREWOLF_ACTION', speakerId: 2, content: '【狼队夜聊】今晚刀1号,别暴露', timestamp: Date.now(), isSystem: false, visibleTo: [2] },
            { id: 'l3', turn: 1, phase: 'SEER_ACTION', speakerId: 2, content: '上帝(私聊): 3号是狼人', timestamp: Date.now(), isSystem: true, visibleTo: [3] },
            { id: 'l4', turn: 1, phase: 'EVENT_TRACE' || 'DAY_DISCUSSION', speakerName: 'Runtime', content: '状态变化：wolfTarget', timestamp: Date.now(), isSystem: true, debugType: 'EVENT_TRACE' },
        ]));
        const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
        cfg.gameViewMode = '2d';
        localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
    }, godView);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    return await page.locator('body').innerText();
}

const godBody = await scenario(true);
console.log('上帝视角-狼人夜聊可见:', godBody.includes('狼队夜聊') ? 'YES ✅' : 'NO ❌');
console.log('上帝视角-状态变化追踪可见:', godBody.includes('状态变化') ? 'YES' : 'NO');
const normalBody = await scenario(false);
console.log('普通视角-狼人夜聊隐藏:', !normalBody.includes('狼队夜聊') ? 'YES ✅' : 'NO ❌');
console.log('普通视角-状态变化不泄露:', !normalBody.includes('状态变化') ? 'YES ✅' : 'NO ❌');
console.log('普通视角-公开发言保留:', normalBody.includes('我是村民的公开发言') ? 'YES ✅' : 'NO ❌');
await browser.close();
