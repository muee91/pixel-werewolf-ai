import { expect, test } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * 流式字幕的端到端证据：真起一个 OpenAI 兼容的 SSE 网关（本地进程，不依赖外网），
 * 让它在几秒里慢慢吐一句 JSON，看玩家屏幕上"等待期"到底有没有东西。
 *
 * 断言三件事：
 *   1. 请求发出 → 字幕亮起（谁在等、等了几秒）
 *   2. **正文增量逐步到达**（同一段字幕上能观察到至少 3 个不同长度）
 *   3. 发言落账 → 字幕退场，完整发言进日志
 *
 * 第 2 条是这次补上的：开发期给 loopback 网关用的 `/api/local-llm-gateway` 转发器
 * 曾经 `await upstream.arrayBuffer()` 再带 Content-Length 一次性回给浏览器，
 * 于是流式在开发环境里永远"整包到达"、字幕只能显示"正在思考"。
 * 只断言生命周期的话，这个 bug 测不出来 —— 必须断言"中途能看到半个句子"。
 */

const SPEECH = '我是预言家，昨晚查验 3 号是狼人。今天先归票 3 号，警徽流给 5 号。';
const PAYLOAD = JSON.stringify({ speak: SPEECH, actionTarget: 3 });
const REASONING = '先想一下场上局势：如果 3 号是真狼，那么昨天给他投票的人里应该还有一个同伴……';

test('streaming gateway: caption covers the wait, then hands over to the real log line', async ({ page }) => {
    test.setTimeout(120_000);

    const server = http.createServer((req, res) => {
        const cors = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
        };
        if (req.method === 'OPTIONS') {
            res.writeHead(204, cors);
            res.end();
            return;
        }
        if (!req.url?.includes('/chat/completions')) {
            res.writeHead(404, cors);
            res.end('not found');
            return;
        }
        res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

        // 先来一段"看不见的思考"，再逐字吐正文——这正是真实思考型模型的样子
        let step = 0;
        const reasoningTimer = setInterval(() => {
            send({ choices: [{ delta: { reasoning_content: REASONING.slice(step * 20, step * 20 + 20) } }] });
            step += 1;
            if (step < 3) return;
            clearInterval(reasoningTimer);
            let cursor = 0;
            const contentTimer = setInterval(() => {
                if (cursor >= PAYLOAD.length) {
                    clearInterval(contentTimer);
                    send({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 60, completion_tokens_details: { reasoning_tokens: 40 } } });
                    res.write('data: [DONE]\n\n');
                    res.end();
                    return;
                }
                send({ choices: [{ delta: { content: PAYLOAD.slice(cursor, cursor + 8) } }] });
                cursor += 8;
            }, 550);
        }, 700);
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    try {
        await page.addInitScript(({ baseUrl }) => {
            localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
            localStorage.setItem('werewolf-llmProviders', JSON.stringify([{
                id: 'provider-stream', name: '流式测试网关', type: 'openai',
                baseUrl, apiKey: 'test-key',
            }]));
            localStorage.setItem('werewolf-llmPresets', JSON.stringify([{
                id: 'llm-stream', name: '流式模型', providerId: 'provider-stream', modelId: 'stream-model',
            }]));
            localStorage.setItem('werewolf-uiConfig', JSON.stringify({
                themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign',
                effectLevel: 'subtle', gameViewMode: '2d', worldAmbientAudioEnabled: false, worldSkillAudioEnabled: false,
                worldAudioVolume: 0, gameSfxEnabled: false, gameSfxVolume: 0, bgmEnabled: false,
                personaTagsEnabled: false, randomPersonaEachGame: false,
            }));
            localStorage.setItem('werewolf-gamePace', '4');
            localStorage.setItem('werewolf-isHumanMode', JSON.stringify(false));
        }, { baseUrl: `http://127.0.0.1:${port}/v1` });

        await page.goto('/');
        await page.getByRole('button', { name: '旁观生存' }).click();
        await page.getByRole('button', { name: '点燃营火' }).click();

        // 1) 等待期：字幕亮起，且明确写着"在思考"（此时正文还没到）
        const caption = page.getByTestId('live-speech-caption');
        await expect(caption).toBeVisible({ timeout: 45_000 });
        await expect(caption).toContainText(/正在思考|正在说话/);
        await expect(caption).not.toContainText('{"speak"');

        // 2) 字幕出现时，完整发言还没落账 —— 说明它确实补上了那段空白
        expect(await page.getByText(SPEECH, { exact: false }).count()).toBe(0);

        // 2.5) 增量必须逐步到达：同一段字幕上观察到的"长度"至少有 3 种取值。
        //      整包到达时只会出现「空」和「完整」两种，这条会立刻红。
        const captionBodyLen = () => page.evaluate(() => {
            const el = document.querySelector('[data-testid="live-speech-caption"]');
            const body = el?.firstElementChild?.children[1];
            return (body?.textContent || '').length;
        });
        const lengths = new Set<number>();
        for (let i = 0; i < 80; i += 1) {
            lengths.add(await captionBodyLen());
            if (lengths.size >= 3) break;
            await page.waitForTimeout(120);
        }
        expect(lengths.size, `观察到的字幕长度: ${[...lengths].join('/')}`).toBeGreaterThanOrEqual(3);

        // 3) 落账后：字幕退场，完整发言进日志
        await expect(caption).toBeHidden({ timeout: 40_000 });
        await expect(page.getByText(SPEECH, { exact: false }).first()).toBeVisible({ timeout: 40_000 });
    } finally {
        server.close();
    }
});
