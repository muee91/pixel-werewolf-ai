import http from 'node:http';
import WebSocket from 'ws';

// ── 内置 AI 玩家（规则大脑，零 LLM 依赖） ──────────────────
// 以普通客人身份 join + AUTH 进房（回环连接），与人类客人走完全相同的
// 服务端通路：收到的状态已按本座位视角过滤，提交的行动与人类一致。
// 因此 AI 作弊边界与人类玩家完全相同。

interface BotSession {
    roomId: string;
    playerId: string;
    sessionToken: string;
    seatNumber: number | null;
    ws: WebSocket | null;
    seq: number;
    lastActPhase: string | null;
    lastActAt: number;
}

const sessions = new Set<BotSession>();

const NICKNAMES = ['AI·石头', 'AI·铁蛋', 'AI·阿燧', 'AI·矿工', 'AI·老井', 'AI·燧石', 'AI·灰岩', 'AI·熔炉'];
const WOLF_ROLE_NAMES = new Set(['WEREWOLF', 'WOLF_KING', 'WHITE_WOLF_KING', 'BLOOD_MOON_DISCIPLE', 'STONE_GHOST']);
const SPEECHES = [
    '我先听一轮，大家的发言都有点飘。',
    '这轮信息不多，我先跟票。',
    '谁在带节奏，我心里已经有数了。',
    '我是好人，按逻辑投，别催我。',
    '昨夜的刀法有点意思，先记下。',
    '都别装了，投出去看看反应。',
];

const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomAlive = (gameState: any, mySeat: number | null): number | null => {
    const alive = (gameState?.players || [])
        .filter((p: any) => (p.status === 'ALIVE' || p.status === 'IDIOT_REVEALED') && p.id !== mySeat)
        .map((p: any) => p.id);
    return alive.length > 0 ? Number(rand(alive)) : null;
};

// 阶段 → 该座位需要提交的 UserInput
function decideInput(phase: string, gameState: any, mySeat: number | null) {
    const alive = randomAlive(gameState, mySeat);
    const speak = rand(SPEECHES);
    switch (phase) {
        case 'WEREWOLF_ACTION':
        case 'SEER_ACTION':
        case 'STONE_GHOST_ACTION':
        case 'GUARD_ACTION':
        case 'DEMON_HUNTER_ACTION':
        case 'GRAVEKEEPER_ACTION':
        case 'MERCHANT_ACTION':
        case 'CUPID_LINK':
            return { speak, actionTarget: alive };
        case 'WITCH_ACTION':
            // 女巫：偶尔救人，更少毒人
            if (Math.random() < 0.35) return { useCure: true, speak };
            if (Math.random() < 0.15 && alive != null) return { poisonTarget: alive, speak };
            return { speak };
        case 'VOTING':
        case 'SHERIFF_VOTING': {
            // 狼人 bot 不投狼队友（狼队友的角色在过滤状态下对本座位可见）
            const mateSeats = new Set((gameState?.players || [])
                .filter((p: any) => p.id !== mySeat && typeof p.role === 'string' && WOLF_ROLE_NAMES.has(p.role))
                .map((p: any) => p.id));
            const pool = (gameState?.players || [])
                .filter((p: any) => (p.status === 'ALIVE' || p.status === 'IDIOT_REVEALED') && !mateSeats.has(p.id) && p.id !== mySeat)
                .map((p: any) => p.id);
            return { speak, actionTarget: pool.length > 0 ? Number(rand(pool)) : alive };
        }
        case 'SHERIFF_ELECTION':
            return { speak, actionTarget: null };
        case 'KNIGHT_CHALLENGE':
            return Math.random() < 0.5 ? { action: 'challenge', actionTarget: alive, speak } : { action: 'stay', speak };
        case 'WOLF_EXPLODE':
            return { action: 'skip', speak };
        case 'HUNTER_ACTION':
            return Math.random() < 0.7 ? { actionTarget: alive, speak } : { speak, action: 'stay' };
        case 'LAST_WORDS':
        case 'DAY_DISCUSSION':
        case 'DISCUSSION_ROUND_TWO':
        default:
            return { speak, actionTarget: null };
    }
}

function wsSend(bot: BotSession, obj: Record<string, unknown>) {
    if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
        (bot.ws as WebSocket).send(JSON.stringify({ ...obj, sessionToken: bot.sessionToken }));
    }
}

function act(bot: BotSession, phase: string, gameState: any) {
    // 同一阶段只行动一次，且带 0.8~1.8 秒的拟人延迟
    if (bot.lastActPhase === phase && Date.now() - bot.lastActAt < 15000) return;
    bot.lastActPhase = phase;
    bot.lastActAt = Date.now();
    const mySeat = bot.seatNumber;
    const input = decideInput(phase, gameState, mySeat);
    setTimeout(() => {
        const seq = ++bot.seq;
        const ts = Date.now();
        const actionId = `action-${ts}-${seq}-${Math.random().toString(36).slice(2)}`;
        wsSend(bot, {
            type: 'PLAYER_ACTION',
            actionId,
            clientSeq: seq,
            ts,
            actionData: { ...input, strategySummary: '内置 AI' },
        });
    }, 800 + Math.random() * 1000);
}

function connectBot(bot: BotSession, port: number) {
    const url = `ws://127.0.0.1:${port}/api/ws?roomId=${encodeURIComponent(bot.roomId)}&playerId=${encodeURIComponent(bot.playerId)}&nickname=${encodeURIComponent('AI')}`;
    const ws = new WebSocket(url);
    bot.ws = ws;

    ws.on('open', () => {
        wsSend(bot, { type: 'AUTH', sessionToken: bot.sessionToken });
    });
    ws.on('message', (raw: Buffer) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        switch (msg.type) {
            case 'CONNECTED':
                wsSend(bot, { type: 'READY', ready: true });
                break;
            case 'YOUR_ROLE':
                wsSend(bot, { type: 'ROLE_RECEIVED_ACK' });
                break;
            case 'GAME_STATE_SYNC': {
                const gs = msg.gameState;
                if (!gs || gs.gameResult) break;
                const mySeat = bot.seatNumber;
                if (gs.currentSpeakerId != null && gs.currentSpeakerId === mySeat) {
                    act(bot, gs.phase, gs);
                }
                break;
            }
            default:
                break;
        }
    });
    ws.on('close', () => {
        sessions.delete(bot);
    });
    ws.on('error', () => {
        sessions.delete(bot);
    });
}

/**
 * 让一个内置 AI 玩家加入房间（回环调用本服务端的 join 接口后以 WS 接入）。
 * 返回 false 表示加入失败（房间满 / 不存在等）。
 */
export function createBotSession(roomId: string, port: number, maxPlayers: number): Promise<boolean> {
    return new Promise((resolve) => {
        const nickname = rand(NICKNAMES);
        const req = http.request(
            new URL(`/api/rooms/${encodeURIComponent(roomId)}/join`, `http://127.0.0.1:${port}`),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            },
            (res) => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => {
                    try {
                        const body = JSON.parse(data);
                        if (res.statusCode !== 200 || !body.playerId) {
                            resolve(false);
                            return;
                        }
                        const bot: BotSession = {
                            roomId,
                            playerId: body.playerId,
                            sessionToken: body.sessionToken,
                            seatNumber: body.seatNumber ?? null,
                            ws: null,
                            seq: 0,
                            lastActPhase: null,
                            lastActAt: 0,
                        };
                        sessions.add(bot);
                        connectBot(bot, port);
                        void maxPlayers;
                        resolve(true);
                    } catch {
                        resolve(false);
                    }
                });
            },
        );
        req.on('error', () => resolve(false));
        req.write(JSON.stringify({ nickname }));
        req.end();
    });
}

export function botSessionCount(): number {
    return sessions.size;
}
