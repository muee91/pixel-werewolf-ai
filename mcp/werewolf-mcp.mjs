#!/usr/bin/env node
// Werewolf MCP Server：让任意兼容 MCP 的客户端作为玩家进入联机对局。
//
// 工作方式：
//   1. 以「客人玩家」身份通过房间服务端 HTTP API 加入房间（join），拿到 sessionToken；
//   2. 直连房间服务端 WebSocket（ws://host:3002/api/ws）并 AUTH；
//   3. 收到的 GAME_STATE_SYNC 已由服务端按本座位视角过滤（防作弊边界在服务端，天然保留）；
//   4. 轮到本座位时，agent 通过 wait_for_my_turn 感知，并用 submit_action 提交行动，
//      服务端转发给房主引擎消费（与人类客人完全同一条通路）。
//
// 协议：stdio 上的 JSON-RPC 2.0（MCP stdio 传输），零外部依赖（仅复用项目内 ws）。
// 环境变量：WEREWOLF_ROOM_HOST（默认 http://localhost:3002）
import http from 'node:http';
import WebSocket from 'ws';

const ROOM_HOST = (process.env.WEREWOLF_ROOM_HOST || 'http://localhost:3002').replace(/\/+$/, '');
const WS_HOST = ROOM_HOST.replace(/^http/, 'ws');

// ── 会话状态 ─────────────────────────────────────────────
const session = {
    roomId: null,
    playerId: null,
    nickname: null,
    sessionToken: null,
    seatNumber: null,
    role: null,
    connected: false,
    ws: null,
    seq: 0,
    roomState: null,
    gameState: null,     // 服务端按本座位视角过滤后的最新同步状态
    lastAck: null,
    syncWaiters: [],     // wait_for_my_turn 的等待者
};

// ── 房间服务端 HTTP/WS 客户端 ────────────────────────────

function httpRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, ROOM_HOST);
        const req = http.request(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }); }
                catch { resolve({ status: res.statusCode, body: { raw: data.slice(0, 500) } }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function wsSend(obj) {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        const withToken = obj.type === 'AUTH' ? obj : { ...obj, sessionToken: session.sessionToken };
        session.ws.send(JSON.stringify(withToken));
        return true;
    }
    return false;
}

function nextSeq() { return ++session.seq; }

function submitPlayerAction(actionData) {
    const ts = Date.now();
    const seq = nextSeq();
    const actionId = `action-${ts}-${seq}-${Math.random().toString(36).slice(2)}`;
    wsSend({ type: 'PLAYER_ACTION', actionId, clientSeq: seq, ts, actionData });
    return actionId;
}

function connectWs() {
    return new Promise((resolve, reject) => {
        const url = `${WS_HOST}/api/ws?roomId=${encodeURIComponent(session.roomId)}&playerId=${encodeURIComponent(session.playerId)}&nickname=${encodeURIComponent(session.nickname)}`;
        const ws = new WebSocket(url);
        session.ws = ws;
        const failTimer = setTimeout(() => reject(new Error('WS 连接超时')), 8000);

        ws.on('open', () => {
            wsSend({ type: 'AUTH', sessionToken: session.sessionToken });
        });
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }
            handleServerMessage(msg);
            if (msg.type === 'CONNECTED') {
                clearTimeout(failTimer);
                session.connected = true;
                // 自动举手“准备”，房主才能开局；并确认角色收到
                wsSend({ type: 'READY', ready: true });
                resolve();
            }
        });
        ws.on('close', () => {
            session.connected = false;
        });
        ws.on('error', (err) => {
            clearTimeout(failTimer);
            reject(err);
        });
    });
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case 'STATE_UPDATE':
            session.roomState = msg.room;
            break;
        case 'GAME_START':
            session.roomState = msg.room;
            break;
        case 'GAME_STATE_SYNC':
            session.gameState = msg.gameState;
            break;
        case 'YOUR_ROLE':
            session.role = { role: msg.role, seatNumber: msg.seatNumber, rolePrompt: msg.rolePrompt || '' };
            wsSend({ type: 'ROLE_RECEIVED_ACK' });
            break;
        case 'ACTION_ACK':
            if (msg.playerId === session.playerId) session.lastAck = msg;
            break;
        default:
            break;
    }
    // 唤醒 wait_for_my_turn 等待者
    const waiters = session.syncWaiters;
    session.syncWaiters = [];
    for (const w of waiters) w();
    // 应用层 PING：让房间服务端知道房间仍活跃（防止被过期清理回收）
    if (!session.pingTimer) {
        session.pingTimer = setInterval(() => {
            if (session.connected) wsSend({ type: 'PING', ts: Date.now() });
        }, 20000);
        session.pingTimer.unref?.();
    }
}

function mySeat() {
    const me = session.gameState?.players?.find(p => p.roomPlayerId === session.playerId);
    if (me) return me.id;
    return session.seatNumber ?? null;
}

function summarizeState() {
    const gs = session.gameState;
    const seat = mySeat();
    const logs = (gs?.logs || []).slice(-12).map(l => ({
        turn: l.turn, phase: l.phase, from: l.speakerName || (l.isSystem ? '系统' : null), text: l.content, private: !!l.visibleTo?.length,
    }));
    return {
        connected: session.connected,
        room: session.roomState ? {
            roomId: session.roomState.roomId,
            name: session.roomState.roomName,
            status: session.roomState.status,
            players: session.roomState.players.map(p => ({ seat: p.seatNumber, nickname: p.nickname, connected: p.isConnected, ready: p.isReady })),
        } : null,
        my: {
            playerId: session.playerId,
            seat,
            role: session.role,
            isMyTurn: !!gs && gs.currentSpeakerId != null && gs.currentSpeakerId === seat,
        },
        game: gs ? {
            phase: gs.phase,
            turnCount: gs.turnCount,
            currentSpeakerId: gs.currentSpeakerId,
            isNight: !/DAY|SHERIFF|VOTING|LAST_WORDS|GAME_/.test(gs.phase) || ['NIGHT_START', 'WEREWOLF_ACTION', 'SEER_ACTION', 'WITCH_ACTION', 'GUARD_ACTION'].includes(gs.phase),
            gameOver: !!gs.gameResult,
            winner: gs.gameResult?.winner ?? null,
            alive: (gs.players || []).filter(p => p.status === 'ALIVE' || p.status === 'IDIOT_REVEALED').map(p => p.id),
            // 注意：players 里的 role 是服务端按本座位视角掩码后的结果（自己的角色可见）
        } : null,
        recentLogs: logs,
        lastAck: session.lastAck,
    };
}

// ── 工具实现 ─────────────────────────────────────────────

const tools = {
    async list_rooms() {
        const { status, body } = await httpRequest('GET', '/api/rooms');
        return { status, rooms: body.rooms || [] };
    },

    async join_room({ roomId, nickname = 'AI智能体', seatNumber = null }) {
        if (!roomId) throw new Error('缺少 roomId');
        const { status, body } = await httpRequest('POST', `/api/rooms/${encodeURIComponent(roomId)}/join`, {
            nickname: String(nickname).slice(0, 5),
            seatNumber: seatNumber ?? undefined,
        });
        if (status !== 200) return { joined: false, status, error: body.error || '加入失败' };
        session.roomId = body.roomId;
        session.playerId = body.playerId;
        session.sessionToken = body.sessionToken;
        session.seatNumber = body.seatNumber ?? null;
        session.nickname = nickname;
        await connectWs();
        return { joined: true, playerId: session.playerId, seatNumber: session.seatNumber, state: summarizeState() };
    },

    async get_room_state() {
        return summarizeState();
    },

    async get_game_state() {
        if (!session.gameState) return { hasState: false, hint: '房主尚未开始对局或尚未同步状态；请确认房主已开局。' };
        return { hasState: true, ...summarizeState() };
    },

    async wait_for_my_turn({ timeoutSec = 30 } = {}) {
        const timeoutMs = Math.min(120, Math.max(5, timeoutSec)) * 1000;
        return new Promise((resolve) => {
            const finish = (result) => {
                clearInterval(poll);
                clearTimeout(timer);
                session.syncWaiters = session.syncWaiters.filter(w => w !== wake);
                resolve(result);
            };
            const check = () => {
                const gs = session.gameState;
                if (!gs) return false;
                if (gs.gameResult) return true; // 对局结束也视为可行动（应提交结算观战/离开）
                const seat = mySeat();
                return gs.currentSpeakerId != null && gs.currentSpeakerId === seat;
            };
            const wake = () => {
                if (check()) finish({ myTurn: true, ...summarizeState() });
            };
            session.syncWaiters.push(wake);
            const poll = setInterval(wake, 2000); // 定期兜底唤醒
            const timer = setTimeout(() => finish({ myTurn: false, timeout: true, ...summarizeState() }), timeoutMs);
            wake(); // 可能早已轮到自己
        });
    },

    async submit_action({ speak = '', actionTarget = null, action = null, strategySummary = '', extra = {} } = {}) {
        if (!session.connected) return { submitted: false, error: '未连接房间；请先 join_room。' };
        const actionData = { speak: String(speak || '').slice(0, 300), actionTarget, action: action || undefined, strategySummary: String(strategySummary || '').slice(0, 160), ...extra };
        const actionId = submitPlayerAction(actionData);
        // 等待房主 ACK（最多 10 秒）
        const ackAt = Date.now();
        while (Date.now() - ackAt < 10000) {
            await new Promise(r => setTimeout(r, 400));
            if (session.lastAck && session.lastAck.actionId === actionId) {
                return { submitted: true, success: session.lastAck.success, ack: session.lastAck };
            }
        }
        return { submitted: true, success: null, note: '已提交但未在 10 秒内收到 ACK（房主可能延迟处理）', actionId };
    },

    async set_ready({ ready = true } = {}) {
        wsSend({ type: 'READY', ready });
        return { ok: true };
    },

    async leave_room() {
        wsSend({ type: 'LEAVE' });
        setTimeout(() => { try { session.ws?.close(); } catch {} }, 300);
        return { ok: true };
    },

    async set_server_host({ host }) {
        if (typeof host !== 'string' || !host) throw new Error('缺少 host');
        process.env.WEREWOLF_ROOM_HOST = host;
        return { ok: true, note: '对后续 join 生效（ROOM_HOST 已变更）' };
    },
};

// ── MCP 工具描述 ─────────────────────────────────────────

const toolDefs = [
    {
        name: 'list_rooms',
        description: '【仅限狼人杀对局】列出当前正在等待玩家的狼人杀房间（房间服务端）。',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'join_room',
        description: '【仅限狼人杀对局——用户明确要求加入时才调用】以客人玩家身份加入指定房间，并自动举手准备。加入后你会获得座位号；对局开始后服务端只会向你同步你视角内可见的信息（防作弊）。',
        inputSchema: {
            type: 'object',
            properties: {
                roomId: { type: 'string', description: '房间 ID' },
                nickname: { type: 'string', description: '昵称（最多 5 个字符）' },
                seatNumber: { type: 'number', description: '期望座位号（可选）' },
            },
            required: ['roomId'],
        },
    },
    {
        name: 'get_room_state',
        description: '获取当前房间连接状态与成员列表。',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'get_game_state',
        description: '获取对局当前状态：阶段、昼夜、我的座位与身份、当前发言人、存活玩家、最近的可见日志（已按我的视角过滤，看不到别人的私密信息）。',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'wait_for_my_turn',
        description: '【仅限狼人杀联机对局——用户没有明确在玩狼人杀时,不要调用本工具】阻塞等待轮到自己行动（当前发言/投票/夜间技能指向我的座位）。默认只等 30 秒,对局进行中请循环调用。',
        inputSchema: {
            type: 'object',
            properties: { timeoutSec: { type: 'number', description: '最长等待秒数，默认 90，上限 240' } },
            required: [],
        },
    },
    {
        name: 'submit_action',
        description: '【仅限狼人杀对局】提交本座位的行动：发言（speak）、投票/技能目标（actionTarget）、或特殊动作。房主确认后返回 ACK。',
        inputSchema: {
            type: 'object',
            properties: {
                speak: { type: 'string', description: '公开发言内容（不超过 300 字）' },
                actionTarget: { type: 'number', description: '行动目标座位号（投票/技能/刀人等）' },
                action: { type: 'string', description: '特殊动作：explode | challenge | hunt | check | withdraw | stay', enum: ['explode', 'skip', 'challenge', 'hunt', 'check', 'link', 'give', 'withdraw', 'stay'] },
                strategySummary: { type: 'string', description: '一句话策略摘要（可选）' },
                extra: { type: 'object', description: '其他 UserInput 字段（useCure、poisonTarget、shouldWithdraw 等，可选）' },
            },
            required: [],
        },
    },
    {
        name: 'set_ready',
        description: '切换准备状态（默认加入后已自动准备）。',
        inputSchema: {
            type: 'object',
            properties: { ready: { type: 'boolean' } },
            required: [],
        },
    },
    {
        name: 'leave_room',
        description: '离开当前房间。',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'set_server_host',
        description: '设置房间服务端地址（默认 http://localhost:3002），对后续 join 生效。',
        inputSchema: {
            type: 'object',
            properties: { host: { type: 'string', description: '形如 http://192.168.1.5:3002' } },
            required: ['host'],
        },
    },
];

// ── JSON-RPC (MCP stdio) ─────────────────────────────────

function reply(id, result) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, code, message) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

async function dispatchTool(name, args) {
    const fn = tools[name];
    if (!fn) throw new Error(`未知工具: ${name}`);
    const result = await fn(args || {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        (async () => {
            let msg;
            try { msg = JSON.parse(line); } catch { return; }
            const { id, method, params } = msg;
            try {
                if (method === 'initialize') {
                    reply(id, {
                        protocolVersion: params?.protocolVersion || '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'werewolf-mcp', version: '1.0.0' },
                    });
                } else if (method === 'notifications/initialized' || method?.startsWith('notifications/')) {
                    // 通知无需回复
                } else if (method === 'ping') {
                    reply(id, {});
                } else if (method === 'tools/list') {
                    reply(id, { tools: toolDefs });
                } else if (method === 'tools/call') {
                    const result = await dispatchTool(params?.name, params?.arguments);
                    reply(id, result);
                } else if (id !== undefined) {
                    replyError(id, -32601, `method not found: ${method}`);
                }
            } catch (e) {
                if (id !== undefined) {
                    reply(id, { content: [{ type: 'text', text: String(e?.message || e) }], isError: true });
                }
            }
        })();
    }
});

process.stderr.write(`[werewolf-mcp] ready (room host: ${ROOM_HOST})\n`);
