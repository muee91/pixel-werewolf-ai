import { chromium } from '@playwright/test';
import fs from 'node:fs';
const cardIdx = Number(process.argv[2] || 0);
const label = process.argv[3] || 'preset';
const maxMs = Number(process.argv[4] || 240000);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('werewolf-llmProviders', JSON.stringify([{ id: 'provider-mock', name: 'MockLocal', type: 'openai', baseUrl: 'http://127.0.0.1:19000', apiKey: '' }]));
    localStorage.setItem('werewolf-llmPresets', JSON.stringify([{ id: 'llm-mock', name: 'Mock', providerId: 'provider-mock', modelId: 'mock-1' }]));
    const actors = JSON.parse(localStorage.getItem('werewolf-actorProfiles-v2') || '[]');
    localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify(actors.map(a => ({ ...a, llmPresetId: 'llm-mock' }))));
    localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
    const cfg = JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}');
    cfg.gameViewMode = '2d'; localStorage.setItem('werewolf-uiConfig', JSON.stringify(cfg));
    localStorage.setItem('werewolf-debugMode', 'true');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
// preset cards are buttons containing "狼人×"
const cards = page.locator('button').filter({ hasText: /狼人×/ });
await cards.nth(cardIdx).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /点燃营火/ }).click();
await page.waitForTimeout(2500);
const t0 = Date.now(); let last = 0, still = 0;
while (Date.now() - t0 < maxMs) {
    const st = await page.evaluate(() => ({ p: localStorage.getItem('werewolf-currentPhase'), n: (JSON.parse(localStorage.getItem('werewolf-currentLogs')||'[]')).length }));
    if (st.n === last) still++; else { still = 0; last = st.n; }
    if (still > 60) { console.log('STAGNANT', JSON.stringify(st)); break; }
    if (/GAME_REVIEW|GAME_OVER/.test(String(st.p))) { console.log('OVER', JSON.stringify(st)); break; }
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
fs.writeFileSync(`/tmp/dump-${label}.json`, JSON.stringify(dump, null, 1));
console.log(label, 'PHASE', dump.phase, 'TURN', dump.turn, 'LOGS', dump.logs.length);
if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0,8)));
await browser.close();
