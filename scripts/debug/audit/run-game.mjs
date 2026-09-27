import { chromium } from '@playwright/test';
const presetKey = process.argv[2] || '9-v1';
const maxMs = Number(process.argv[3] || 300000);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://127.0.0.1:3907', { waitUntil: 'domcontentloaded' });
// configure local mock LLM + actor binding
await page.evaluate(() => {
    const providers = [{ id: 'provider-mock', name: 'MockLocal', type: 'openai', baseUrl: 'http://127.0.0.1:19000', apiKey: '' }];
    localStorage.setItem('werewolf-llmProviders', JSON.stringify(providers));
    const presets = [{ id: 'llm-mock', name: 'Mock', providerId: 'provider-mock', modelId: 'mock-1' }];
    localStorage.setItem('werewolf-llmPresets', JSON.stringify(presets));
    const actorsRaw = localStorage.getItem('werewolf-actorProfiles-v2');
    const actors = actorsRaw ? JSON.parse(actorsRaw) : [];
    const fixed = actors.map(a => ({ ...a, llmPresetId: 'llm-mock' }));
    localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify(fixed));
    localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '2d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
    localStorage.setItem('werewolf-debugMode', 'true');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// pick the preset card
const card = page.locator('button', { hasText: presetKey === '9-v1' ? '经典标准局' : '' }).first();
await card.click();
await page.waitForTimeout(500);
const start = page.getByRole('button', { name: /点燃营火/ });
await start.click();
await page.waitForTimeout(2500);

const started = Date.now();
let lastLogCount = 0, stagnant = 0;
while (Date.now() - started < maxMs) {
    const st = await page.evaluate(() => ({
        phase: localStorage.getItem('werewolf-currentPhase'),
        turn: localStorage.getItem('werewolf-currentTurn'),
        logs: (JSON.parse(localStorage.getItem('werewolf-currentLogs') || '[]')).length,
        auto: localStorage.getItem('werewolf-isAutoPlay'),
    }));
    if (st.logs === lastLogCount) { stagnant++; } else { stagnant = 0; lastLogCount = st.logs; }
    if (stagnant > 60) { console.log('STAGNANT at', JSON.stringify(st)); break; }
    if (String(st.phase).includes('GAME_REVIEW') || String(st.phase).includes('GAME_OVER')) { console.log('GAME OVER', JSON.stringify(st)); break; }
    await page.waitForTimeout(2000);
}
const dump = await page.evaluate(() => ({
    phase: localStorage.getItem('werewolf-currentPhase'),
    turn: localStorage.getItem('werewolf-currentTurn'),
    players: JSON.parse(localStorage.getItem('werewolf-currentPlayers') || '[]'),
    logs: JSON.parse(localStorage.getItem('werewolf-currentLogs') || '[]'),
    godState: JSON.parse(localStorage.getItem('werewolf-currentGodState') || '{}'),
    result: localStorage.getItem('werewolf-currentGameResult'),
}));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 15), null, 1));
await browser.close();
import fs from 'node:fs';
fs.writeFileSync('/tmp/game-dump.json', JSON.stringify(dump, null, 1));
console.log('PHASE', dump.phase, 'TURN', dump.turn, 'LOGS', dump.logs.length);
