// MCP agent 实战驱动：加入房间后自动打完一局（随机但合法的发言/投票/技能）。
// 用法：node scripts/mcp-play.mjs [roomId]
import { spawn } from 'node:child_process';

const ROOM_HOST = process.env.WEREWOLF_ROOM_HOST || 'http://localhost:3002';
const roomIdArg = process.argv[2];

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
        } catch { /* 忽略 */ }
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
    catch { return { error: 'bad response' };
    }
};
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// 1) 确定房间
let roomId = roomIdArg;
if (!roomId) {
    const resp = await fetch(`${ROOM_HOST}/api/rooms`);
    const j = await resp.json();
    roomId = j.rooms?.[0]?.roomId;
}
if (!roomId) {
    console.log('没有可加入的等待中房间，退出');
    process.exit(1);
}
log('加入房间', roomId);

// 2) initialize + 加入
const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
void init;
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const join = textOf(await call('tools/call', { name: 'join_room', arguments: { roomId, nickname: 'AI智能体' } }));
log('加入结果:', JSON.stringify(join.joined ?? join).slice(0, 120));

// 3) 对局主循环
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SPEECHES = [
    '我是好人，这轮先听大家的逻辑。',
    '发言都很平静，我要多观察一轮。',
    '谁在带节奏，我心里有数了。',
    '信息太少，先不站边。',
];

for (let round = 1; round <= 40; round++) {
    const wait = textOf(await call('tools/call', { name: 'wait_for_my_turn', arguments: { timeoutSec: 150 } }));
    if (wait.game?.gameOver || wait.game?.winner) {
        log('对局结束，胜方:', wait.game.winner);
        break;
    }
    if (!wait.myTurn) {
        log('等待超时（未轮到），继续等待…', wait.game?.phase ?? '');
        continue;
    }
    const phase = wait.game.phase;
    const targets = (wait.game.alive || []).filter(id => id !== wait.my.seat);
    const wantsTarget = /VOTING|ACTION|CHALLENGE|EXPLODE|HUNTER|WITCH|GUARD|SEER|GRAVEKEEPER|DEMON|MERCHANT|CUPID|STONE/.test(phase);
    const body = {
        speak: rand(SPEECHES),
        actionTarget: wantsTarget && targets.length > 0 && Math.random() < 0.9 ? Number(rand(targets)) : null,
        strategySummary: 'MCP 演练',
    };
    const ack = textOf(await call('tools/call', { name: 'submit_action', arguments: body }));
    log(`提交行动 #${round}: phase=${phase} target=${body.actionTarget} ack=${JSON.stringify(ack.success ?? ack.error ?? ack.note)}`);
    // ACK 后等阶段推进（currentSpeakerId 仍指向自己时避免重复提交刷屏）
    if (ack.success) await new Promise(r => setTimeout(r, 3000));
}

log('驱动结束');
child.kill();
process.exit(0);
