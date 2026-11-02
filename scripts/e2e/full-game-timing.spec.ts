import { test } from '@playwright/test';

/**
 * 真网关整局实测：量总时长、每天用时、调用次数与单次平均耗时。
 *
 * 默认跳过（一次最长 30 分钟，不能进日常套件）。手动跑：
 *   source /tmp/gw.env   # 需要 GW_BASE / GW_KEY / GW_MODEL
 *   FULL_GAME=1 npx playwright test scripts/e2e/full-game-timing.spec.ts --reporter=list
 */
test('real gateway full game', async ({ page }) => {
    test.skip(!process.env.FULL_GAME, '整局实测默认跳过：设 FULL_GAME=1 且提供 GW_BASE/GW_KEY 才跑');
    test.setTimeout(2_000_000);
    const base = process.env.GW_BASE || '';
    const key = process.env.GW_KEY || '';
    const model = process.env.GW_MODEL || 'deepseek-v4.1-flash';

    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

    await page.addInitScript(({ baseUrl, apiKey, modelId }) => {
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
        localStorage.setItem('werewolf-llmProviders', JSON.stringify([{ id: 'p1', name: 'accgate', type: 'openai', baseUrl, apiKey }]));
        localStorage.setItem('werewolf-llmPresets', JSON.stringify([{ id: 'l1', name: 'v4.1-flash', providerId: 'p1', modelId }]));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign',
            effectLevel: 'subtle', gameViewMode: '2d', worldAmbientAudioEnabled: false, worldSkillAudioEnabled: false,
            worldAudioVolume: 0, gameSfxEnabled: false, gameSfxVolume: 0, bgmEnabled: false,
            personaTagsEnabled: false, randomPersonaEachGame: false,
        }));
        localStorage.setItem('werewolf-gamePace', '4');
        localStorage.setItem('werewolf-isHumanMode', JSON.stringify(false));
    }, { baseUrl: base, apiKey: key, modelId: model });

    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
    await page.getByRole('button', { name: '旁观生存' }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();

    const t0 = Date.now();
    type Snap = { t: number; day: string; phase: string; calls: number; avg: number; over: boolean; caption: string };
    const snaps: Snap[] = [];
    let lastDay = '';
    const dayMarks: { day: string; at: number }[] = [];

    for (;;) {
        const s = await page.evaluate(() => {
            const text = document.body.innerText || '';
            const dayBadge = (text.match(/DAY\s+(\d+)/) || [])[1] || '';
            const phaseEl = document.querySelector('header .text-xl, header [class*="text-xl"]');
            const hud = [...document.querySelectorAll('[title]')].map(e => e.getAttribute('title') || '').find(t => t.includes('次模型调用')) || '';
            const calls = Number((hud.match(/本局\s*(\d+)\s*次模型调用/) || [])[1] || 0);
            const avg = Number((hud.match(/平均\s*([\d.]+)s\/次/) || [])[1] || 0);
            const cap = document.querySelector('[data-testid="live-speech-caption"]');
            return {
                day: dayBadge,
                phase: (phaseEl?.textContent || '').trim(),
                calls, avg,
                over: text.includes('对局已结束') || text.includes('本局结束') || text.includes('游戏结束'),
                caption: (cap?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
            };
        });
        const item = { t: Date.now() - t0, ...s };
        snaps.push(item);
        if (s.day && s.day !== lastDay) { lastDay = s.day; dayMarks.push({ day: s.day, at: item.t }); console.log(`DAY ${s.day} @ ${(item.t / 1000).toFixed(0)}s`); }
        if (s.over) { console.log(`GAME OVER @ ${(item.t / 1000).toFixed(0)}s`); break; }
        if (item.t > 1_800_000) { console.log(`CAP @ ${(item.t / 1000).toFixed(0)}s（30 分钟上限）`); break; }
        await page.waitForTimeout(5000);
    }

    const last = snaps[snaps.length - 1];
    const minutes = (last.t / 60000).toFixed(1);
    console.log(`RESULT total=${minutes}min calls=${last.calls} avg=${last.avg}s over=${last.over} day=${last.day} phase=${last.phase}`);
    console.log(`DAYS ${JSON.stringify(dayMarks.map(m => `${m.day}@${Math.round(m.at / 1000)}s`))}`);
    const decisions = snaps.filter(s => s.caption.includes('正在决策')).length;
    const thinking = snaps.filter(s => /思考 \d+ 字/.test(s.caption)).length;
    console.log(`CAPTION samples=${snaps.length} withThinking=${thinking} withDecision=${decisions}`);
    console.log(`ERRORS ${errors.length ? [...new Set(errors)].slice(0, 4).join(' | ') : '无'}`);
    await page.screenshot({ path: '/tmp/fullgame-end.png' });
});
