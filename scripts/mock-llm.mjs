#!/usr/bin/env node
// 本地 Mock LLM：让 AI 对战在无任何 API Key 的环境下完整跑通（演示 / 视觉联调用）。
// 用法：node scripts/mock-llm.mjs   （监听 127.0.0.1:19000）
// 配合：vite 代理 /api/local-llm -> /proxy/llm/chat/completions，
//       浏览器端把 LLM 供应商 baseUrl 指向 http://127.0.0.1:19000 即可。
import http from 'node:http';

const PORT = Number(process.env.MOCK_LLM_PORT || 19000);

const SPEECH_LINES = [
    '我先听大家怎么说，现在信息还太少。',
    '这轮我保留意见，先跟一票看看风向。',
    '从目前发言看，还没有人给出硬逻辑。',
    '别急，狼人比我们更着急暴露。',
    '我是好人，按发言逻辑投，不乱带节奏。',
    '刚才那段发言有点飘，我先记一下。',
];
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
    }
    let body = '';
    req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
        let prompt = '';
        try {
            const parsed = JSON.parse(body);
            prompt = (parsed.messages || []).map(m => m.content || '').join('\n');
        } catch { /* 忽略解析失败，走默认回复 */ }

        // 从上下文里提取存活玩家（格式形如 “Alive Players: [3 号、5 号、7 号]”）
        const aliveMatch = prompt.match(/Alive Players: \[([0-9\s号,，、和]+)\]/);
        const alive = aliveMatch
            ? (aliveMatch[1].match(/\d+/g) || []).map(Number).filter(n => n > 0)
            : [];
        // 尽量排除自己（识别失败也无妨，引擎会校验目标合法性）
        const selfMatch = prompt.match(/你(?:的座位)?是\s*(\d+)\s*号/);
        const selfSeat = selfMatch ? Number(selfMatch[1]) : 0;
        const candidates = alive.filter(n => n !== selfSeat);

        const wantsTarget = /actionTarget|投票|击杀|查验|带走|毒|守护|指刀|决斗/.test(prompt);
        const target = wantsTarget && candidates.length > 0 && Math.random() < 0.9
            ? Number(rand(candidates))
            : null;

        const content = JSON.stringify({
            speak: rand(SPEECH_LINES),
            action: target != null ? 'target' : 'speak',
            actionTarget: target,
            strategySummary: '本地演练模式',
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            id: 'mock-llm',
            choices: [{ index: 0, message: { role: 'assistant', content } }],
            usage: {},
        }));
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[mock-llm] listening on http://127.0.0.1:${PORT} (POST /proxy/llm/chat/completions)`);
});
