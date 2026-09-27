#!/usr/bin/env node
// 单机模式 MCP 外脑 · 每会话瘦代理(stdio)
// 把 MCP 工具调用转发到中心枢纽(:3015)。每个 AI 会话注册本文件,并用 claim_seat 认领自己的分身名;
// 之后只能看到/提交自己分身的决策——多会话之间信息隔离。
//
// 会话内注册:node mcp/standalone-agent.mjs (stdio)
import http from 'node:http';

const HUB = `http://localhost:${process.env.MCP_BRIDGE_PORT || 3015}`;
const GUARD = '【仅限狼人杀对局使用——用户没有明确在玩狼人杀时,不要调用本工具】';

let token = null;

function hub(path, body, method = 'POST') {
    return new Promise((resolve, reject) => {
        const url = new URL(path, HUB);
        const req = http.request(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            signal: undefined,
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve({ raw: data.slice(0, 300) }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function ensureToken() {
    if (token) return token;
    const r = await hub('/agent/register', {});
    if (r.token) token = r.token;
    return token;
}

const TOOLS = [
    {
        name: 'claim_seat',
        description: `${GUARD} 认领你的分身(按名字,来自邀请提示词)。认领后你只能看到该分身的决策——多会话互不串信息。必须在等待决策之前先调用一次。`,
        inputSchema: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string', description: '邀请提示词里的分身名,如「麦田老王」' } },
        },
    },
    {
        name: 'get_game_state',
        description: `${GUARD} 查看你自己分身的当前挂起决策与最近一次提交结果(看不到其它分身)。`,
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'wait_for_my_turn',
        description: `${GUARD} 阻塞等待你认领分身的下一个决策(返回 requestId 与完整提示词)。返回 {waiting:true} 表示阶段间隙,继续轮询;只有 {ended:true} 才是对局结束。`,
        inputSchema: { type: 'object', properties: { timeoutSec: { type: 'number', description: '默认 20,上限 60' } } },
    },
    {
        name: 'submit_action',
        description: `${GUARD} 提交你自己分身的决策:speak(发言)、actionTarget(目标座位)、strategySummary。字段与 LLM JSON 协议一致。`,
        inputSchema: {
            type: 'object',
            required: ['requestId'],
            properties: {
                requestId: { type: 'string' },
                speak: { type: 'string' },
                actionTarget: { type: ['number', 'null'] },
                strategySummary: { type: 'string' },
                extra: { type: 'object', description: '其余 LLM 协议字段(useCure/poisonTarget/cupidTarget1/2/shouldExplode/action 等),原样合并进决策' },
            },
        },
    },
];

function sendMcp(id, result) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function sendMcpError(id, code, message) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

async function handleTool(name, args, id) {
    if (name === 'claim_seat') {
        const t = await ensureToken();
        if (!t) return sendMcpError(id, -32000, '无法连接枢纽(先运行 npm run mcp-bridge)');
        const r = await hub(`/agent/claim?token=${t}`, { name: args?.name });
        return r.error ? sendMcpError(id, -32000, r.error) : sendMcp(id, { content: [JSON.stringify(r)] });
    }
    if (name === 'get_game_state') {
        const t = await ensureToken();
        const r = await hub(`/agent/state?token=${t}`, null, 'GET');
        return sendMcp(id, { content: [JSON.stringify(r)] });
    }
    if (name === 'wait_for_my_turn') {
        const t = await ensureToken();
        if (!t) return sendMcpError(id, -32000, '无法连接枢纽(先运行 npm run mcp-bridge)');
        const timeoutSec = Math.min(args?.timeoutSec || 20, 60);
        const r = await hub(`/agent/poll?token=${t}&timeoutSec=${timeoutSec}`, {});
        return sendMcp(id, { content: [JSON.stringify(r)] });
    }
    if (name === 'submit_action') {
        const t = await ensureToken();
        const r = await hub(`/agent/submit?token=${t}`, {
            requestId: args?.requestId,
            action: {
                ...(args?.extra && typeof args.extra === 'object' ? args.extra : {}),
                speak: typeof args?.speak === 'string' ? args.speak : '',
                actionTarget: Number.isFinite(args?.actionTarget) ? args.actionTarget : null,
                strategySummary: typeof args?.strategySummary === 'string' ? args.strategySummary : '',
            },
        });
        return r.error ? sendMcpError(id, -32000, r.error) : sendMcp(id, { content: [JSON.stringify(r)] });
    }
    sendMcpError(id, -32601, `未知工具: ${name}`);
}

const heartbeat = setInterval(() => {
    if (token) hub(`/agent/heartbeat?token=${token}`, {}).catch(() => {});
}, 15000);
heartbeat.unref();

let buffer = '';
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const { id, method, params } = msg;
        if (method === 'initialize') {
            sendMcp(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'werewolf-standalone-agent', version: '2.0.0' },
            });
        } else if (method === 'notifications/initialized') {
            // 无需回复
        } else if (method === 'tools/list') {
            sendMcp(id, { tools: TOOLS });
        } else if (method === 'tools/call') {
            handleTool(params?.name, params?.arguments, id).catch((e) => sendMcpError(id, -32000, String(e)));
        } else if (method === 'ping') {
            sendMcp(id, {});
        }
    }
});
