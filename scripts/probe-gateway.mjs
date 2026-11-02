#!/usr/bin/env node
/**
 * 网关能力探针：在动"减调用数"之前，先问清楚这个网关到底支持什么。
 *
 * 为什么需要它：C-1 的实测里 90% 的输出 token 花在看不见的思考上，单次调用中位 29.9 秒。
 * 如果网关能关掉/压低思考，节奏问题的收益比"并行化"还大；如果不能，才轮到合并问话、减候选。
 * 这些能力各家用词都不一样，只能实测。
 *
 * 用法（key 只走环境变量，不落盘、不进仓库）：
 *   GW_BASE=https://your-gateway/v1 GW_MODEL=deepseek-v4.1-flash GW_KEY=sk-xxx node scripts/probe-gateway.mjs
 *
 * 输出四张表：
 *   1. 普通调用（stream:false）—— 能否用、耗时、usage 是否回、思考 token 占比
 *   2. 流式（stream:true）—— 首帧延迟、是否逐帧到达、末帧是否带 usage
 *   3. 思考预算开关 —— reasoning_effort / enable_thinking / thinking 哪个被认
 *   4. 结论：给出"该走哪条减调用路径"的建议
 */
const BASE = (process.env.GW_BASE || '').replace(/\/+$/, '');
const MODEL = process.env.GW_MODEL || '';
const KEY = process.env.GW_KEY || '';

if (!BASE || !MODEL || !KEY) {
    console.error('缺参数：需要 GW_BASE / GW_MODEL / GW_KEY 三个环境变量');
    process.exit(1);
}

const URL_CHAT = `${BASE}/chat/completions`;
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
const PROMPT = '用一句话回答：3 号玩家昨天说他投了 5 号，今天却改口说投了 7 号。这说明什么？';

const call = async (extra, { stream = false } = {}) => {
    const startedAt = Date.now();
    const res = await fetch(URL_CHAT, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: PROMPT }],
            temperature: 0.7,
            ...extra,
            ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
        }),
    });
    if (!res.ok) {
        return { ok: false, status: res.status, text: (await res.text()).slice(0, 200), ms: Date.now() - startedAt };
    }
    if (!stream) {
        const data = await res.json();
        const usage = data.usage || {};
        return {
            ok: true,
            ms: Date.now() - startedAt,
            text: data.choices?.[0]?.message?.content || '',
            prompt: usage.prompt_tokens ?? null,
            completion: usage.completion_tokens ?? null,
            reasoning: usage.completion_tokens_details?.reasoning_tokens ?? null,
        };
    }
    // 流式：记录首帧与帧间隔
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    let firstAt = 0;
    const gaps = [];
    let lastAt = Date.now();
    let text = '';
    let usage = null;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = Date.now();
        if (!firstAt) firstAt = now;
        else gaps.push(now - lastAt);
        lastAt = now;
        buffer += dec.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
            const line = part.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const json = JSON.parse(payload);
                text += json.choices?.[0]?.delta?.content || '';
                if (json.usage) usage = json.usage;
            } catch { /* 心跳或非 JSON 帧 */ }
        }
    }
    return {
        ok: true,
        ms: Date.now() - startedAt,
        firstTokenMs: firstAt ? firstAt - startedAt : null,
        chunks: gaps.length + 1,
        maxGapMs: gaps.length ? Math.max(...gaps) : null,
        text,
        usage,
    };
};

const pct = (part, total) => (part && total ? `${Math.round((part / total) * 100)}%` : 'n/a');

const main = async () => {
    console.log(`网关 ${BASE}\n模型 ${MODEL}\n`);

    console.log('== 1. 普通调用 ==');
    const plain = await call({});
    if (!plain.ok) {
        console.log(`  ✗ HTTP ${plain.status} ${plain.text}`);
        console.log('  网关不可用，后面的表没有意义');
        return;
    }
    console.log(`  ✓ ${plain.ms}ms · 输出 ${plain.completion ?? '?'} tok（思考 ${plain.reasoning ?? '?'}，占 ${pct(plain.reasoning, plain.completion)}）`);
    console.log(`  文本：${plain.text.slice(0, 60)}`);

    console.log('\n== 2. 流式（SSE） ==');
    const streamed = await call({}, { stream: true });
    if (!streamed.ok) {
        console.log(`  ✗ HTTP ${streamed.status} ${streamed.text}`);
    } else {
        console.log(`  ✓ 首帧 ${streamed.firstTokenMs ?? '?'}ms · 共 ${streamed.chunks} 帧 · 最大帧间隔 ${streamed.maxGapMs ?? '?'}ms`);
        console.log(`  usage：${streamed.usage ? JSON.stringify({
            prompt: streamed.usage.prompt_tokens,
            completion: streamed.usage.completion_tokens,
            reasoning: streamed.usage.completion_tokens_details?.reasoning_tokens ?? null,
        }) : '末帧没有 usage（HUD 的 token 读数会漏掉流式调用）'}`);
        // 判据：至少 5 帧、且帧间隔 >= 30ms（再快就看不出"在打字"）
        const streamy = streamed.chunks >= 5 && (streamed.maxGapMs ?? 0) >= 30;
        console.log(`  逐帧到达：${streamy ? '是（可以边生成边看）' : '否（一次性/极快，流式看不出打字感）'}`);
    }

    console.log('\n== 3. 思考预算开关 ==');
    const variants = [
        ['基线', {}],
        ['reasoning_effort: low', { reasoning_effort: 'low' }],
        ['reasoning_effort: none', { reasoning_effort: 'none' }],
        ['enable_thinking: false', { enable_thinking: false }],
        ['thinking: disabled', { thinking: { type: 'disabled' } }],
        ['max_tokens: 120', { max_tokens: 120 }],
    ];
    const rows = [];
    for (const [label, extra] of variants) {
        const r = await call(extra);
        rows.push({
            label,
            ok: r.ok,
            ms: r.ms,
            completion: r.completion,
            reasoning: r.reasoning,
            err: r.ok ? '' : `${r.status}`,
        });
    }
    console.log('  开关                    结果      耗时     输出tok  思考tok');
    for (const row of rows) {
        console.log(`  ${row.label.padEnd(22)} ${row.ok ? '✓' : `✗${row.err}`}  ${String(row.ms).padStart(6)}ms  ${String(row.completion ?? '-').padStart(6)}  ${String(row.reasoning ?? '-').padStart(6)}`);
    }

    const baseline = rows[0];
    const honored = rows.filter(row => row.ok && baseline.ok && row.reasoning !== null && baseline.reasoning !== null
        && row.reasoning < baseline.reasoning * 0.6);
    console.log('\n== 4. 结论 ==');
    if (honored.length) {
        console.log(`  可压思考：${honored.map(r => r.label).join('、')} —— 先做"思考预算档位"，收益比合并问话大。`);
    } else {
        console.log('  没有开关能显著压低思考 token —— 减调用只能走"合并问话 / 减少候选人数"。');
    }
    const streamy = streamed.ok && streamed.chunks >= 5 && (streamed.maxGapMs ?? 0) >= 30;
    if (!streamy) {
        console.log('  流式给不出打字感或不可用 —— 字幕只能做"等待期进度"，不要承诺逐字上屏。');
    }
};

main().catch(error => {
    console.error('探针异常：', error);
    process.exit(1);
});
