import { test, expect } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * 结算页的"模型战绩"：同模型座位合并，按胜率→总分排序。
 * 电子斗蛐蛐的落点就在这一块——一局打完要能一眼看出"哪个模型赢了"。
 * 用即时回包的假网关，一分钟内就能跑到结算。
 */
test('result panel shows per-model scoreboard', async ({ page }) => {
    test.setTimeout(420_000);
    const server = http.createServer((req, res) => {
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
        req.on('data', () => {});
        req.on('end', () => {
            const payload = JSON.stringify({ strategySummary: '看票型。', speak: '我投 3 号。', actionTarget: 3, useCure: false, poisonTarget: null });
            res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: payload } }] })}\n\n`);
            res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 40 } })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;

    await page.addInitScript(({ baseUrl }) => {
        const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a8', 'a9', 'a10', 'a11'];
        const actors = ids.map((id, i) => ({
            id, name: `分身${i + 1}`, llmPresetId: i % 3 === 0 ? 'l1' : i % 3 === 1 ? 'l2' : 'l3',
            ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '',
        }));
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
        localStorage.setItem('werewolf-llmProviders', JSON.stringify([{ id: 'p', name: '网关', type: 'openai', baseUrl, apiKey: 'k' }]));
        localStorage.setItem('werewolf-llmPresets', JSON.stringify([
            { id: 'l1', name: 'v4.1-flash', providerId: 'p', modelId: 'm1' },
            { id: 'l2', name: 'gpt-mini', providerId: 'p', modelId: 'm2' },
            { id: 'l3', name: 'qwen-max', providerId: 'p', modelId: 'm3' },
        ]));
        localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify(actors));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({ themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign', effectLevel: 'subtle', gameViewMode: '2d', worldAmbientAudioEnabled: false, worldSkillAudioEnabled: false, worldAudioVolume: 0, gameSfxEnabled: false, gameSfxVolume: 0, bgmEnabled: false, personaTagsEnabled: false, randomPersonaEachGame: false }));
        localStorage.setItem('werewolf-gamePace', '4');
        localStorage.setItem('werewolf-isHumanMode', JSON.stringify(false));
    }, { baseUrl: `http://127.0.0.1:${port}/v1` });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '旁观生存' }).click();
    await page.getByRole('button', { name: '点燃营火' }).click();

    const panel = page.getByText('模型战绩', { exact: false });
    await expect(panel).toBeVisible({ timeout: 380_000 });
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('div')).filter(el => /^🧠 /.test((el.textContent || '').trim())).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 4));
    console.log('MODEL_ROWS ' + JSON.stringify(rows));
    await page.screenshot({ path: '/tmp/result-models.png' });
    server.close();
});
