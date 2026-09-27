#!/usr/bin/env node
// 单机模式 MCP 外脑 · 中心枢纽(HTTP 队列,无 stdio)
// 职责:接收浏览器引擎的决策请求,按「分身名字」路由给已认领的 AI 会话。
// 多会话各自运行 mcp/standalone-agent.mjs(stdio→本枢纽的瘦代理),互不可见对方提示词(信息墙)。
//
// 启动:npm run mcp-bridge   (端口 MCP_BRIDGE_PORT 覆盖,默认 3015)
import http from 'node:http';

const PORT = Number(process.env.MCP_BRIDGE_PORT || 3015);
const PENDING_TTL_MS = 250000;

let seq = 0;
const pending = new Map();      // id -> entry
const sessions = new Map();     // token -> { claimedName, registeredAt }
const lastBySeat = new Map();   // name -> 最近一次已解决的决策(仅本人可见)
let gameEnded = false;
let lastStateAny = null;

function resolveEntry(entry, action) {
    if (entry.resolved) return;
    entry.resolved = true;
    clearTimeout(entry.timer);
    pending.delete(entry.id);
    lastBySeat.set(entry.payload.name, { ...entry.payload, action, resolvedAt: Date.now() });
    lastStateAny = lastBySeat.get(entry.payload.name);
    try {
        entry.res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        entry.res.end(JSON.stringify(action));
    } catch { /* 引擎已断开 */ }
}

const waiters = new Set(); // agent 长轮询等待者 { token, wake, ended }

function oldestPendingFor(name) {
    let oldest = null;
    for (const e of pending.values()) {
        if (e.payload.name === name && (!oldest || e.createdAt < oldest.createdAt)) oldest = e;
    }
    return oldest;
}

function notifyWaiters(entry) {
    for (const waiter of [...waiters]) {
        if (waiter.ended) continue;
        const session = sessions.get(waiter.token);
        if (!session || entry.payload.name !== session.claimedName) continue;
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.deliver({ requestId: entry.id, ...entry.payload });
        return; // 一条决策只投递给一个匹配会话
    }
}

// ── 引擎侧端点(不变) ─────────────────────────────────────
const server = http.createServer((req, res) => {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const pathname = req.url.split('?')[0];

    if (pathname === '/health' && req.method === 'GET') {
        const claimed = [...new Set([...sessions.values()].map(s => s.claimedName).filter(Boolean))];
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true, pending: pending.size, sessions: sessions.size, claimed }));
        return;
    }

    if (pathname === '/decision' && req.method === 'POST') {
        if (sessions.size === 0) {
            // 没有任何 AI 会话注册:立即让引擎回退 LLM
            res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
            res.end(JSON.stringify({ noAgent: true }));
            return;
        }
        let body = '';
        req.on('data', c => { body += c; if (body.length > 1024 * 1024) req.destroy(); });
        req.on('end', () => {
            try {
                if (gameEnded) {
                    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
                    res.end(JSON.stringify({ gameEnded: true }));
                    return;
                }
                const payload = JSON.parse(body);
                if (!payload.name || typeof payload.name !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
                    res.end(JSON.stringify({ error: 'payload.name 必填(按分身名路由)' }));
                    return;
                }
                const id = `d-${++seq}`;
                const entry = { id, payload, res, resolved: false, createdAt: Date.now() };
                entry.timer = setTimeout(() => resolveEntry(entry, { timedOut: true }),
                    Math.min(payload.timeoutMs || PENDING_TTL_MS, PENDING_TTL_MS));
                pending.set(id, entry);
                notifyWaiters(entry);
                // 长轮询:响应由 resolveEntry 在 agent 提交/超时/对局结束时写出
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
                res.end(JSON.stringify({ error: 'bad json' }));
            }
        });
        return;
    }

    if (pathname === '/game-over' && req.method === 'POST') {
        gameEnded = true;
        for (const entry of [...pending.values()]) resolveEntry(entry, { gameEnded: true });
        for (const waiter of [...waiters]) {
            waiters.delete(waiter);
            clearTimeout(waiter.timer);
            waiter.deliver({ ended: true });
        }
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    if (pathname === '/game-new' && req.method === 'POST') {
        gameEnded = false;
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // ── agent 代理侧端点 ─────────────────────────────────
    const readBody = (cb) => {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 256 * 1024) req.destroy(); });
        req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch { res.writeHead(400, cors); res.end(); } });
    };
    const respond = (data) => {
        if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify(data));
    };

    if (pathname === '/agent/register' && req.method === 'POST') {
        readBody(() => {
            const token = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            sessions.set(token, { claimedName: null, registeredAt: Date.now(), lastSeen: Date.now() });
            respond({ token });
        });
        return;
    }

    const session = () => {
        const token = new URL(req.url, 'http://x').searchParams.get('token') || '';
        const s = sessions.get(token);
        if (!s) respond({ error: '会话未注册或已失效,请重新运行 register' });
        return s ? { s, token } : null;
    };

    if (pathname === '/agent/claim' && req.method === 'POST') {
        const ctx = session(); if (!ctx) return;
        readBody(({ name }) => {
            if (!name) return respond({ error: '缺少 name' });
            for (const [otherToken, other] of sessions) {
                if (other.claimedName === name) {
                    const stale = Date.now() - (other.lastSeen || 0) > 45000;
                    if (!stale) return respond({ error: `「${name}」已被其它会话认领` });
                    sessions.delete(otherToken); // 陈旧会话(超 45s 无心跳)视为掉线,允许接管
                }
            }
            ctx.s.claimedName = name;
            ctx.s.lastSeen = Date.now();
            respond({ ok: true, name });
        });
        return;
    }

    if (pathname === '/agent/heartbeat' && req.method === 'POST') {
        const ctx = session(); if (!ctx) return;
        ctx.s.lastSeen = Date.now();
        return respond({ ok: true });
    }

    if (pathname === '/agent/poll' && (req.method === 'POST' || req.method === 'GET')) {
        const ctx = session(); if (!ctx) return;
        ctx.s.lastSeen = Date.now();
        if (!ctx.s.claimedName) return respond({ error: '尚未认领座位:先调用 claim_seat' });
        const url = new URL(req.url, 'http://x');
        const timeoutSec = Math.min(Number(url.searchParams.get('timeoutSec')) || 20, 60);
        if (gameEnded) return respond({ ended: true });
        const oldest = oldestPendingFor(ctx.s.claimedName);
        if (oldest) {
            return respond({ requestId: oldest.id, ...oldest.payload });
        }
        const waiter = {
            token: ctx.token,
            ended: false,
            deliver: respond, // respond 内部有 headersSent 守卫,天然幂等
        };
        waiter.timer = setTimeout(() => {
            if (!waiters.has(waiter)) return;
            waiters.delete(waiter);
            respond({ waiting: true }); // 阶段间隙:继续轮询,不代表对局结束
        }, timeoutSec * 1000);
        waiters.add(waiter);
        return;
    }

    if (pathname === '/agent/submit' && req.method === 'POST') {
        const ctx = session(); if (!ctx) return;
        readBody(({ requestId, action }) => {
            const entry = pending.get(requestId);
            if (!entry) return respond({ error: 'requestId 不存在或已解决' });
            if (entry.payload.name !== ctx.s.claimedName) {
                return respond({ error: `该决策属于「${entry.payload.name}」,不是你认领的「${ctx.s.claimedName}」` });
            }
            resolveEntry(entry, action || {});
            respond({ ok: true });
        });
        return;
    }

    if (pathname === '/agent/state' && req.method === 'GET') {
        const ctx = session(); if (!ctx) return;
        if (!ctx.s.claimedName) return respond({ error: '尚未认领座位' });
        respond({
            name: ctx.s.claimedName,
            pending: oldestPendingFor(ctx.s.claimedName)
                ? { requestId: oldestPendingFor(ctx.s.claimedName).id, ...oldestPendingFor(ctx.s.claimedName).payload }
                : null,
            last: lastBySeat.get(ctx.s.claimedName) || null,
        });
        return;
    }

    res.writeHead(404, cors); res.end();
});

server.on('error', (err) => {
    console.error(`[mcp-hub] HTTP 端口 ${PORT} 不可用: ${err.message}（可能已有枢纽在运行,本进程退出）`);
    process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
    console.error(`[mcp-hub] 枢纽已就绪: http://localhost:${PORT} (浏览器引擎连接此端口;AI 会话用 standalone-agent.mjs 接入)`);
});
