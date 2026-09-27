// MCP server 冒烟测试：启动 werewolf-mcp，走一遍 initialize / tools/list /
// join_room / get_room_state（需要一个运行中的房间服务端，默认 3002）。
// 用法：node scripts/mcp-smoke.mjs
import { spawn } from 'node:child_process';

const ROOM_HOST = 'http://localhost:3002';

const child = spawn(process.execPath, ['mcp/werewolf-mcp.mjs'], {
    env: { ...process.env, WEREWOLF_ROOM_HOST: ROOM_HOST },
    stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
let nextId = 1;
const pending = new Map();

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
            const msg = JSON.parse(line);
            if (msg.id !== undefined && pending.has(msg.id)) {
                pending.get(msg.id)(msg);
                pending.delete(msg.id);
            }
        } catch { /* 忽略非 JSON 行 */ }
    }
});

function call(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
}

const textOf = (resp) => {
    try { return JSON.parse(resp.result.content[0].text); }
    catch { return resp; }
};

// 1) initialize
const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
console.log('initialized:', init.result?.serverInfo?.name === 'werewolf-mcp' ? 'OK' : JSON.stringify(init));

// initialized 是通知（无 id，服务端不回复），直接发送即可
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

// 2) tools/list
const list = await call('tools/list', {});
console.log('tools:', list.result?.tools?.length ?? 0);

// 3) 建一个房间（房主为占位），然后用 MCP 工具加入
const createResp = await fetch(`${ROOM_HOST}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName: 'MCP冒烟房', nickname: '房主' }),
});
const room = await createResp.json();
console.log('room created:', room.roomId);

// 4) join_room
const joinResp = await call('tools/call', { name: 'join_room', arguments: { roomId: room.roomId, nickname: 'AI智能体' } });
const join = textOf(joinResp);
console.log('joined:', join.joined === true ? 'OK' : JSON.stringify(join));

// 5) get_room_state
const stateResp = await call('tools/call', { name: 'get_room_state', arguments: {} });
const state = textOf(stateResp);
const playerCount = state.room?.players?.length ?? 0;
console.log('room players:', playerCount === 2 ? 'OK (2)' : `UNEXPECTED (${playerCount})`);

// 6) get_game_state（房主未开局 → 应返回 hasState:false 的友好提示）
const gameResp = await call('tools/call', { name: 'get_game_state', arguments: {} });
const game = textOf(gameResp);
console.log('game state guard:', game.hasState === false ? 'OK' : JSON.stringify(game).slice(0, 120));

// 7) leave_room + 退出
await call('tools/call', { name: 'leave_room', arguments: {} });
await new Promise(r => setTimeout(r, 500));
child.kill();
console.log('smoke done');
process.exit(0);
