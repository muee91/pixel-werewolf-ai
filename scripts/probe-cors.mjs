#!/usr/bin/env node
/**
 * 网关 CORS 探针：判断"浏览器能不能直连这个网关"。
 *
 * 为什么单独一个脚本：CORS 只有真浏览器说了算，但每次开浏览器太慢。
 * 这里按浏览器预检的真实形状发 OPTIONS（带 Origin / Request-Method / Request-Headers），
 * 再发一次带 Origin 的 GET，看响应里到底有没有 Access-Control-Allow-Origin。
 *
 * 用法： GW_BASE=https://your-gateway/v1 node scripts/probe-cors.mjs
 * 退出码：0 = 浏览器可直连；1 = 不可（会打印缺什么）
 */
const BASE = (process.env.GW_BASE || '').replace(/\/+$/, '');
const ORIGIN = process.env.PROBE_ORIGIN || 'http://127.0.0.1:39011';
const KEY = process.env.GW_KEY || '';

if (!BASE) {
    console.error('缺 GW_BASE（例：GW_BASE=https://your-gateway/v1 node scripts/probe-cors.mjs）');
    process.exit(2);
}

const show = (res) => ({
    status: res.status,
    acao: res.headers.get('access-control-allow-origin'),
    acah: res.headers.get('access-control-allow-headers'),
    acam: res.headers.get('access-control-allow-methods'),
    allow: res.headers.get('allow'),
});

const main = async () => {
    console.log(`网关 ${BASE}\nOrigin ${ORIGIN}\n`);

    // 1) 预检：浏览器对带 Authorization 的 POST 一定会先发这个
    const preflight = await fetch(`${BASE}/chat/completions`, {
        method: 'OPTIONS',
        headers: {
            Origin: ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
        },
    });
    const p = show(preflight);
    console.log(`预检 OPTIONS /chat/completions → ${p.status}`);
    console.log(`  Access-Control-Allow-Origin : ${p.acao ?? '缺失'}`);
    console.log(`  Access-Control-Allow-Headers: ${p.acah ?? '缺失'}`);
    console.log(`  Access-Control-Allow-Methods: ${p.acam ?? '缺失'}`);
    if (p.allow) console.log(`  （405 的 allow 头：${p.allow}）`);

    // 2) 实际请求的响应头（哪怕预检过了，简单响应也必须带 ACAO）
    const post = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
        body: JSON.stringify({ model: 'deepseek-v4.1-flash', messages: [{ role: 'user', content: 'hi' }] }),
    });
    const q = show(post);
    console.log(`\nPOST /chat/completions → ${q.status}`);
    console.log(`  Access-Control-Allow-Origin : ${q.acao ?? '缺失'}`);

    const preflightOk = preflight.status >= 200 && preflight.status < 300 && !!p.acao;
    const postOk = !!q.acao;
    console.log('\n结论：');
    if (preflightOk && postOk) {
        console.log('  ✓ 浏览器可以直连（预检 2xx 且有 ACAO，响应也带 ACAO）');
        process.exit(0);
    }
    if (!preflightOk) {
        console.log(`  ✗ 预检没过：需要 OPTIONS 返回 2xx + ACAO（现在是 ${preflight.status}）`);
        console.log('    nginx 示例：');
        console.log('      add_header Access-Control-Allow-Origin  $http_origin always;');
        console.log('      add_header Access-Control-Allow-Headers "authorization, content-type" always;');
        console.log('      add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;');
        console.log('      if ($request_method = OPTIONS) { return 204; }');
    }
    if (!postOk) console.log('  ✗ 实际响应没有 ACAO：预检即使过了，浏览器仍会拦下这次请求');
    process.exit(1);
};

main().catch(error => {
    console.error('探针异常：', error);
    process.exit(2);
});
