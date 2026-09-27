// 3D 模式可视化验证：无头 Chromium 注入本地 Mock 配置，
// 开一局旁观 AI 对战，按时间连拍夜景/过渡/白天截图到 /tmp。
// 用法：先启动 dev server 与 scripts/mock-llm.mjs，再 node scripts/verify-3d.mjs
import { chromium } from 'playwright';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3001/';

// 优先使用本地已缓存的 Chromium（避免 playwright install 下载）
const cachedExecutables = [
    `${homedir()}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    `${homedir()}/Library/Caches/ms-playwright/chromium-1222/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
];
const executablePath = cachedExecutables.find(p => existsSync(p));

const browser = await chromium.launch(executablePath ? { executablePath, args: ['--enable-unsafe-swiftshader'] } : { args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', msg => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 240));
});

await page.goto(BASE);
await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('werewolf-llmProviders', JSON.stringify([
        { id: 'provider-local-mock', name: '本地Mock', type: 'openai', baseUrl: 'http://127.0.0.1:19000', apiKey: '' },
    ]));
    localStorage.setItem('werewolf-llmPresets', JSON.stringify([
        { id: 'llm-local-mock', name: '本地演练模型', providerId: 'provider-local-mock', modelId: 'mock-model' },
    ]));
    const voice = ['zh-CN-YunxiNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural', 'zh-CN-YunyangNeural'];
    const actors = [{ id: 'n1', name: '上帝 (旁白)', llmPresetId: 'llm-local-mock', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '' }];
    for (let i = 1; i <= 14; i++) {
        actors.push({ id: `a${i}`, name: `演练员${i}`, llmPresetId: 'llm-local-mock', ttsPresetId: 'tts-edge', voiceId: voice[i % voice.length], stylePrompt: '' });
    }
    localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify(actors));
    localStorage.setItem('werewolf-actorProfiles-migrated-v3', '1');
    localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
    localStorage.setItem('werewolf-uiConfig', JSON.stringify({
        gameViewMode: '3d',
        effectLevel: 'intense',
        gameLayout: 'block-arena',
        playerCardStyle: 'name-sign',
    }));
    localStorage.setItem('werewolf-appScreen', 'HOME');
});
await page.reload();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(1000);

const clickText = async (kw) => {
    await page.evaluate((kw) => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes(kw));
        if (btn) btn.click();
    }, kw);
};

await clickText('旁观生存');
await page.waitForTimeout(400);
await clickText('点燃营火');

// 等 3D canvas 挂载（最长 20 秒；若降级则截降级页并退出）
let canvasOk = false;
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    canvasOk = await page.evaluate(() => document.querySelectorAll('canvas').length > 0);
    if (canvasOk) break;
}
console.log('canvas mounted:', canvasOk);
if (!canvasOk) {
    await page.screenshot({ path: '/tmp/3d-fallback.png' });
    console.log('FALLBACK — 3D 未启动，截图已保存 /tmp/3d-fallback.png');
    await browser.close();
    process.exit(1);
}

// 连拍：首帧后 6s（夜）、+16s（夜/过渡）、+30s（夜后段）、+30s（白天）、+25s（白天讨论）
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/3d-1-night.png' });
console.log('shot 1 (night)');
await page.waitForTimeout(16000);
await page.screenshot({ path: '/tmp/3d-2-mid.png' });
console.log('shot 2 (mid)');
await page.waitForTimeout(24000);
await page.screenshot({ path: '/tmp/3d-3-day.png' });
console.log('shot 3 (night-late)');
await page.waitForTimeout(30000);
await page.screenshot({ path: '/tmp/3d-4-dawn.png' });
console.log('shot 4 (dawn/day)');
await page.waitForTimeout(25000);
await page.screenshot({ path: '/tmp/3d-5-day.png' });
console.log('shot 5 (day)');
await browser.close();
console.log('done');
