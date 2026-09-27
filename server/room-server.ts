import { createServer, IncomingMessage, ServerResponse } from 'http';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 快照落盘目录:打包环境传入可写目录(如 userData),开发态回落到本文件所在目录
const CONFIG_SHARE_PATH = path.join(
    process.env.CONFIG_SHARE_DIR
    || (typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))),
    'config-share.json',
);
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, createHash } from 'crypto';
import { RoomManager, RoomDiscovery } from './room-manager.js';
import { buildGameStateForViewer, getViewerFromGameState } from './visibility.js';
import { createBotSession } from './bots.js';

function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * 解析请求 URL。Host 头由客户端控制，可能是畸形值（如含空格），
 * 直接用其构造 base URL 会抛 TypeError。这里固定使用本地 base，
 * 只取 pathname/searchParams，不依赖 Host 头。
 */
function parseRequestUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url || '/', 'http://localhost');
  } catch {
    return null;
  }
}

const PORT = parseInt(process.env.ROOM_SERVER_PORT || '3002', 10);
const roomManager = new RoomManager();
const discovery = new RoomDiscovery({ servicePort: PORT });

const CONFIGURED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : [];

function isPrivateLanHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  // mDNS 主机名（macbook.local）与单标签主机名（macbook）只能在局域网内解析
  if (/\.local$/i.test(host)) return true;
  if (!host.includes('.') && !host.includes(':')) return true;
  // IPv6 唯一本地地址（fc00::/7）与链路本地地址（fe80::/10）
  if (/^(fc|fd|fe80)/i.test(host)) return true;
  return false;
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (CONFIGURED_ORIGINS.includes('*') || CONFIGURED_ORIGINS.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    return isPrivateLanHost(parsed.hostname) && ['3000', '3001', '5173', ''].includes(parsed.port);
  } catch {
    return false;
  }
}

function isAllowedWsOrigin(origin: string): boolean {
  if (CONFIGURED_ORIGINS.includes('*') || CONFIGURED_ORIGINS.includes(origin)) return true;
  try {
    // 只按私网主机名校验、不限定端口：跨站 WS 劫持的威胁来自公网页面
    // （Origin 为公网主机），本机/局域网内的其他端口是合法的开发场景。
    return isPrivateLanHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function getCorsHeaders(req?: IncomingMessage) {
  const origin = req?.headers.origin || '';
  if (!isAllowedOrigin(origin)) {
    return {
      'Vary': 'Origin',
    };
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function parseBody(req: IncomingMessage): Promise<{ data: any; oversized: boolean }> {
  return new Promise((resolve) => {
    let body = '';
    let size = 0;
    const MAX_BODY_SIZE = 64 * 1024;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        resolve({ data: {}, oversized: true });
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve({ data: JSON.parse(body), oversized: false });
      } catch {
        resolve({ data: {}, oversized: false });
      }
    });
  });
}

function writeJson(res: ServerResponse, statusCode: number, data: any, req?: IncomingMessage) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...getCorsHeaders(req) });
  res.end(JSON.stringify(data));
}

interface ClientConnection {
  ws: WebSocket;
  roomId: string;
  playerId: string;
  nickname: string;
  sessionTokenHash: string;
  connectedAt: number;
  isAlive: boolean;
}

const wsConnections: Map<string, ClientConnection> = new Map();
const roomLastGameState: Map<string, any> = new Map();
const roomStateVersions: Map<string, number> = new Map();
const roomRoleAssignments: Map<string, Map<string, any>> = new Map();
const roomRoleAcks: Map<string, Set<string>> = new Map();
const disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const playerSessionTokens: Map<string, string> = new Map();
interface ActionRecord {
  playerId: string;
  actionType: string;
  status: 'pending' | 'completed';
  success?: boolean;
}

const processedActions: Map<string, { records: Map<string, ActionRecord>; order: string[] }> = new Map();
const lastClientSeqByPlayer: Map<string, number> = new Map();
const advisorRequestsInFlight: Set<string> = new Set();
const DISCONNECT_GRACE_MS = 10000;
const MAX_ACTION_HISTORY_PER_ROOM = 5000;
const ACTIVE_ROOM_MESSAGE_TYPES = new Set([
  'PING',
  'PLAYER_ACTION',
  'ROLE_RECEIVED_ACK',
  'ACTION_ACK',
  'ADVISOR_REQUEST',
  'ADVISOR_RESULT',
  'GAME_STATE_SYNC',
  'GAME_ARCHIVE',
  'ASSIGN_ROLES',
  'GAME_PAUSED',
  'GAME_RESUMED',
  'READY',
  'CHANGE_SEAT',
  'CHANGE_PRESET',
  'KICK_PLAYER',
  'START_GAME',
  'AI_USED',
  'ADD_BOT',
]);

function verifySession(conn: ClientConnection, data: any): boolean {
  const token = data.sessionToken;
  if (!token) return false;
  return hashToken(token) === conn.sessionTokenHash;
}

function getConnectionKey(roomId: string, playerId: string) {
  return `${roomId}:${playerId}`;
}

function getRoomActionHistory(roomId: string) {
  let actionHistory = processedActions.get(roomId);
  if (!actionHistory) {
    actionHistory = { records: new Map(), order: [] };
    processedActions.set(roomId, actionHistory);
  }
  return actionHistory;
}

function rememberPendingAction(roomId: string, actionId: string, record: ActionRecord) {
  const actionHistory = getRoomActionHistory(roomId);
  actionHistory.records.set(actionId, record);
  actionHistory.order.push(actionId);
  while (actionHistory.order.length > MAX_ACTION_HISTORY_PER_ROOM) {
    const staleActionId = actionHistory.order.shift();
    if (staleActionId) actionHistory.records.delete(staleActionId);
  }
}

function completeAction(roomId: string, actionId: string, success: boolean) {
  const actionHistory = getRoomActionHistory(roomId);
  const record = actionHistory.records.get(actionId);
  if (!record) return null;
  const completed = { ...record, status: 'completed' as const, success };
  actionHistory.records.set(actionId, completed);
  return completed;
}

function getPlayerSeqKey(roomId: string, playerId: string) {
  return `${roomId}:${playerId}`;
}

function clearPlayerRuntimeState(roomId: string, playerId: string) {
  lastClientSeqByPlayer.delete(getPlayerSeqKey(roomId, playerId));
  advisorRequestsInFlight.delete(getConnectionKey(roomId, playerId));
  playerSessionTokens.delete(getConnectionKey(roomId, playerId));
}

function clearRoomRuntimeState(roomId: string) {
  roomLastGameState.delete(roomId);
  roomStateVersions.delete(roomId);
  roomRoleAssignments.delete(roomId);
  roomRoleAcks.delete(roomId);
  processedActions.delete(roomId);
  Array.from(advisorRequestsInFlight)
    .filter(key => key.startsWith(`${roomId}:`))
    .forEach(key => advisorRequestsInFlight.delete(key));
  Array.from(lastClientSeqByPlayer.keys())
    .filter(key => key.startsWith(`${roomId}:`))
    .forEach(key => lastClientSeqByPlayer.delete(key));
  Array.from(playerSessionTokens.keys())
    .filter(key => key.startsWith(`${roomId}:`))
    .forEach(key => playerSessionTokens.delete(key));
}

function getRoomConnections(roomId: string): ClientConnection[] {
  const result: ClientConnection[] = [];
  wsConnections.forEach(conn => {
    if (conn.roomId === roomId) result.push(conn);
  });
  return result;
}

function sendToConnection(conn: ClientConnection, message: any) {
  if (conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(message));
  }
}

function broadcastToRoom(roomId: string, message: any, excludePlayerId?: string) {
    const connections = getRoomConnections(roomId);
    const data = JSON.stringify(message);
    for (const conn of connections) {
        if (excludePlayerId && conn.playerId === excludePlayerId) continue;
        if (conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(data);
        }
    }
    if (message.type !== 'STATE_UPDATE') {
        console.log(`[Room Server] Broadcasting ${message.type} to room ${roomId}`);
    }
}

function getGameStateForConnection(room: any, conn: ClientConnection, fullGameState: any) {
  if (room.hostPlayerId === conn.playerId) return fullGameState;
  const viewer = getViewerFromGameState(fullGameState, conn.playerId);
  const revealRoles = fullGameState.phase === 'GAME_REVIEW' || fullGameState.phase === 'GAME_OVER';
  return buildGameStateForViewer(fullGameState, viewer, revealRoles);
}

function broadcastGameState(roomId: string, fullGameState: any, excludePlayerId?: string) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  for (const conn of getRoomConnections(roomId)) {
    if (excludePlayerId && conn.playerId === excludePlayerId) continue;
    sendToConnection(conn, {
      type: 'GAME_STATE_SYNC',
      gameState: getGameStateForConnection(room, conn, fullGameState),
    });
  }
}

function serializeRoom(room: any) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    hostPlayerId: room.hostPlayerId,
    players: Array.from((room.players as Map<string, any>).values()).map((p: any) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      seatNumber: p.seatNumber,
      isReady: p.isReady,
      isConnected: p.isConnected,
      hasUsedAISuggestion: p.hasUsedAISuggestion,
    })),
    maxPlayers: room.maxPlayers,
    presetKey: room.presetKey,
    hasPassword: !!room.password,
    status: room.status,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function handleWsMessage(conn: ClientConnection, data: any) {
  const { roomId, playerId } = conn;
  const room = roomManager.getRoom(roomId);
  if (room && ACTIVE_ROOM_MESSAGE_TYPES.has(data.type)) {
    roomManager.touchRoom(roomId);
  }

  switch (data.type) {
    case 'PING': {
      sendToConnection(conn, { type: 'PONG', ts: data.ts || Date.now() });
      break;
    }

    case 'PLAYER_ACTION': {
      if (!room) return;
      if (!verifySession(conn, data)) return;
      if (room.status !== 'IN_GAME') return;
      const actionId = typeof data.actionId === 'string' ? data.actionId : '';
      if (!actionId) {
        sendToConnection(conn, {
          type: 'ACTION_ACK',
          playerId,
          actionType: data.actionData?.action || data.actionData?.phase || 'unknown',
          success: false,
        });
        return;
      }
      const actionHistory = getRoomActionHistory(roomId);
      const existingAction = actionHistory.records.get(actionId);
      if (existingAction) {
        sendToConnection(conn, {
          type: 'ACTION_ACK',
          playerId,
          actionId,
          actionType: existingAction.actionType,
          success: existingAction.status === 'completed' ? !!existingAction.success : false,
          pending: existingAction.status === 'pending',
        });
        return;
      }
      const clientSeq = Number(data.clientSeq);
      if (!Number.isSafeInteger(clientSeq) || clientSeq <= 0) {
        sendToConnection(conn, {
          type: 'ACTION_ACK',
          playerId,
          actionId,
          actionType: data.actionData?.action || data.actionData?.phase || 'unknown',
          success: false,
        });
        return;
      }
      const seqKey = getPlayerSeqKey(roomId, playerId);
      const lastClientSeq = lastClientSeqByPlayer.get(seqKey) ?? 0;
      if (clientSeq <= lastClientSeq) {
        sendToConnection(conn, {
          type: 'ACTION_ACK',
          playerId,
          actionId,
          actionType: data.actionData?.action || data.actionData?.phase || 'unknown',
          success: false,
        });
        return;
      }
      lastClientSeqByPlayer.set(seqKey, clientSeq);
      const actionType = data.actionData?.action || data.actionData?.phase || 'unknown';
      rememberPendingAction(roomId, actionId, {
        playerId,
        actionType,
        status: 'pending',
      });
      const hostConn = wsConnections.get(getConnectionKey(roomId, room.hostPlayerId));
      if (hostConn) {
        sendToConnection(hostConn, {
          type: 'PLAYER_ACTION',
          playerId,
          actionId,
          clientSeq,
          ts: data.ts,
          actionData: data.actionData,
        });
      } else {
        completeAction(roomId, actionId, false);
        sendToConnection(conn, { type: 'ACTION_ACK', playerId, actionId, actionType, success: false });
      }
      break;
    }

    case 'ROLE_RECEIVED_ACK': {
      if (!room) return;
      if (!verifySession(conn, data)) return;
      let roleAcks = roomRoleAcks.get(roomId);
      if (!roleAcks) {
        roleAcks = new Set();
        roomRoleAcks.set(roomId, roleAcks);
      }
      roleAcks.add(playerId);
      break;
    }

    case 'ACTION_ACK': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      const targetPlayerId = data.targetPlayerId;
      if (!targetPlayerId) return;
      const actionId = typeof data.actionId === 'string' ? data.actionId : '';
      const actionRecord = actionId ? getRoomActionHistory(roomId).records.get(actionId) : null;
      if (!actionRecord || actionRecord.playerId !== targetPlayerId) return;
      completeAction(roomId, actionId, !!data.success);
      const targetConn = wsConnections.get(getConnectionKey(roomId, targetPlayerId));
      if (targetConn) {
        sendToConnection(targetConn, {
          type: 'ACTION_ACK',
          playerId: targetPlayerId,
          actionType: data.actionType || 'unknown',
          success: !!data.success,
          actionId,
        });
      }
      break;
    }

    case 'ADVISOR_REQUEST': {
      if (!room) return;
      if (!verifySession(conn, data)) return;
      if (room.status !== 'IN_GAME') return;
      const roomPlayer = room.players.get(playerId);
      const advisorKey = getConnectionKey(roomId, playerId);
      if (!roomPlayer) return;
      if (roomPlayer.hasUsedAISuggestion || advisorRequestsInFlight.has(advisorKey)) {
        sendToConnection(conn, { type: 'ADVISOR_RESULT', playerId, result: { error: '本局行动建议已使用' } });
        return;
      }
      const lastGameState = roomLastGameState.get(roomId);
      const viewer = getViewerFromGameState(lastGameState, playerId);
      if (!viewer || viewer.seatNumber !== data.requestPayload?.seatNumber) {
        sendToConnection(conn, { type: 'ADVISOR_RESULT', playerId, result: { error: '只能请求自己座位视角的军师建议' } });
        return;
      }
      const hostConn = wsConnections.get(getConnectionKey(roomId, room.hostPlayerId));
      if (hostConn) {
        advisorRequestsInFlight.add(advisorKey);
        sendToConnection(hostConn, { type: 'ADVISOR_REQUEST', playerId, requestPayload: data.requestPayload });
      } else {
        sendToConnection(conn, { type: 'ADVISOR_RESULT', playerId, result: { error: '房主不在线，暂时无法生成行动建议' } });
      }
      break;
    }

    case 'ADVISOR_RESULT': {
      if (!room) return;
      if (room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      const targetPlayerId = data.targetPlayerId;
      const advisorKey = getConnectionKey(roomId, targetPlayerId);
      if (!advisorRequestsInFlight.has(advisorKey)) return;
      advisorRequestsInFlight.delete(advisorKey);
      if (!data.result?.error) {
        roomManager.updatePlayerAISuggestion(roomId, targetPlayerId, true);
        broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(room) });
      }
      const targetConn = wsConnections.get(advisorKey);
      if (targetConn) {
        sendToConnection(targetConn, { type: 'ADVISOR_RESULT', playerId: targetPlayerId, result: data.result });
      }
      break;
    }

    case 'GAME_STATE_SYNC': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      const incomingVersion = Number(data.gameState?.stateVersion ?? 0);
      const currentVersion = roomStateVersions.get(roomId) ?? 0;
      const stateVersion = incomingVersion > currentVersion ? incomingVersion : currentVersion + 1;
      const versionedGameState = { ...data.gameState, stateVersion };
      roomStateVersions.set(roomId, stateVersion);
      roomLastGameState.set(roomId, versionedGameState);
      broadcastGameState(roomId, versionedGameState, playerId);
      break;
    }

    case 'EVENT_APPEND': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      break;
    }

    case 'GAME_ARCHIVE': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      broadcastToRoom(roomId, { type: 'GAME_ARCHIVE', archive: data.archive });
      break;
    }

    case 'ASSIGN_ROLES': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      const { roleAssignments } = data;
      if (!roleAssignments || !Array.isArray(roleAssignments)) return;
      const cachedAssignments = roomRoleAssignments.get(roomId) ?? new Map<string, any>();
      roomRoleAssignments.set(roomId, cachedAssignments);
      const roleAcks = roomRoleAcks.get(roomId) ?? new Set<string>();
      roomRoleAcks.set(roomId, roleAcks);
      for (const assignment of roleAssignments) {
        const { playerId: targetPlayerId, role, rolePrompt, seatNumber, potions } = assignment;
        if (targetPlayerId === playerId) continue;
        cachedAssignments.set(targetPlayerId, assignment);
        roleAcks.delete(targetPlayerId);
        const targetConn = wsConnections.get(getConnectionKey(roomId, targetPlayerId));
        if (targetConn) {
          const msg: any = { type: 'YOUR_ROLE', playerId: targetPlayerId, role, rolePrompt, seatNumber };
          if (potions) msg.potions = potions;
          sendToConnection(targetConn, msg);
        }
      }
      break;
    }

    case 'GAME_PAUSED': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      broadcastToRoom(roomId, { type: 'GAME_PAUSED', pausedBy: playerId }, playerId);
      break;
    }

    case 'GAME_RESUMED': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      broadcastToRoom(roomId, { type: 'GAME_RESUMED', resumedBy: playerId }, playerId);
      break;
    }

    case 'READY': {
      if (!verifySession(conn, data)) return;
      const updatedRoom = roomManager.setReady(roomId, playerId, data.ready ?? true);
      if (updatedRoom) {
        broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(updatedRoom) });
      }
      break;
    }

    case 'CHANGE_SEAT': {
      if (!verifySession(conn, data)) return;
      const updatedRoom = roomManager.changeSeat(roomId, playerId, data.seatNumber);
      if (updatedRoom) {
        broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(updatedRoom) });
      }
      break;
    }

    case 'CHANGE_PRESET': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      const result = roomManager.changePreset(roomId, playerId, data.presetKey, data.maxPlayers);
      if (result) {
        for (const kickedId of result.kickedPlayerIds) {
          const kickedConn = wsConnections.get(getConnectionKey(roomId, kickedId));
          if (kickedConn) {
            sendToConnection(kickedConn, { type: 'PLAYER_KICKED', reason: '房主切换了板子，房间人数已满' });
            kickedConn.ws.close();
          }
        }
        broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(result.room) });
      }
      break;
    }

    case 'KICK_PLAYER': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      const targetPlayerId = data.targetPlayerId;
      // 房主不能踢自己：leaveRoom 会把房主位移交任意幸存玩家
      if (!targetPlayerId || targetPlayerId === playerId) return;
      const targetConn = wsConnections.get(getConnectionKey(roomId, targetPlayerId));
      if (targetConn) {
        sendToConnection(targetConn, { type: 'PLAYER_KICKED', reason: '房主将你踢出房间' });
        targetConn.ws.close();
      }
      const updatedRoom = roomManager.leaveRoom(roomId, targetPlayerId);
      if (updatedRoom) {
        broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(updatedRoom) });
      }
      break;
    }

    case 'START_GAME': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      if (room.status === 'IN_GAME') return;
      const guestsReady = Array.from(room.players.values())
        .filter(p => p.playerId !== room.hostPlayerId)
        .every(p => p.isReady);
      if (!guestsReady) {
        sendToConnection(conn, { type: 'ERROR', error: '还有玩家未准备' });
        return;
      }
      room.status = 'IN_GAME';
      room.updatedAt = Date.now();
      broadcastToRoom(roomId, { type: 'GAME_START', room: serializeRoom(room) });
      break;
    }

    case 'HOST_EXIT': {
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      const hostKey = getConnectionKey(roomId, playerId);
      const hostTimer = disconnectTimers.get(hostKey);
      if (hostTimer) { clearTimeout(hostTimer); disconnectTimers.delete(hostKey); }
      broadcastToRoom(roomId, { type: 'HOST_LEFT', reason: '房主退出了对局' });
      roomManager.deleteRoom(roomId);
      clearRoomRuntimeState(roomId);
      getRoomConnections(roomId).forEach(c => {
        if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
      });
      break;
    }

    case 'LEAVE': {
      if (!verifySession(conn, data)) return;
      const leaveKey = getConnectionKey(roomId, playerId);
      const leaveTimer = disconnectTimers.get(leaveKey);
      if (leaveTimer) { clearTimeout(leaveTimer); disconnectTimers.delete(leaveKey); }
      const updatedRoom = roomManager.leaveRoom(roomId, playerId);
      wsConnections.delete(getConnectionKey(roomId, playerId));
      clearPlayerRuntimeState(roomId, playerId);
      if (!updatedRoom) {
        clearRoomRuntimeState(roomId);
      } else {
        broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(updatedRoom) });
      }
      break;
    }

    case 'AI_USED': {
      if (!verifySession(conn, data)) return;
      roomManager.updatePlayerAISuggestion(roomId, playerId, true);
      if (room) broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(room) });
      break;
    }

    case 'ADD_BOT': {
      // 房主邀请一个内置 AI 玩家（规则大脑，回环以普通客人身份入房）
      if (!room || room.hostPlayerId !== playerId) return;
      if (!verifySession(conn, data)) return;
      if (room.status !== 'WAITING') {
        sendToConnection(conn, { type: 'ERROR', error: '对局进行中无法添加 AI 玩家' });
        return;
      }
      if (room.players.size >= room.maxPlayers) {
        sendToConnection(conn, { type: 'ERROR', error: '房间已满，无法添加 AI 玩家' });
        return;
      }
      createBotSession(roomId, PORT, room.maxPlayers).then(ok => {
        if (!ok) sendToConnection(conn, { type: 'ERROR', error: 'AI 玩家加入失败' });
      });
      break;
    }
  }
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = parseRequestUrl(req);
  if (!url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '无效请求' }));
    return;
  }
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, getCorsHeaders(req));
    res.end();
    return;
  }

  try {
    if (pathname === '/api/ping' && method === 'GET') {
      return writeJson(res, 200, { ok: true, ts: Date.now() }, req);
    }

    // ── 配置同步(局域网):房主发布快照,成员拉取 ─────────────────
    if (pathname === '/api/config/share' && method === 'POST') {
      const { data: body, oversized } = await parseBody(req);
      if (oversized) return writeJson(res, 413, { error: '配置快照过大' }, req);
      if (!body || typeof body !== 'object' || typeof body.config !== 'object') {
        return writeJson(res, 400, { error: '缺少 config 字段' }, req);
      }
      const snapshot = {
        config: body.config,
        includesApiKeys: !!body.includesApiKeys,
        publishedAt: Date.now(),
        publishedBy: String(body.publishedBy || 'host').slice(0, 20),
      };
      writeFileSync(CONFIG_SHARE_PATH, JSON.stringify(snapshot, null, 2));
      return writeJson(res, 200, { ok: true, publishedAt: snapshot.publishedAt }, req);
    }

    if (pathname === '/api/config/share' && method === 'GET') {
      if (!existsSync(CONFIG_SHARE_PATH)) {
        return writeJson(res, 404, { error: '房间服务上暂无共享配置' }, req);
      }
      try {
        const snapshot = JSON.parse(readFileSync(CONFIG_SHARE_PATH, 'utf8'));
        return writeJson(res, 200, snapshot, req);
      } catch {
        return writeJson(res, 500, { error: '共享配置文件损坏' }, req);
      }
    }

    if (pathname === '/api/rooms' && method === 'GET') {
      const rooms = roomManager.getAllRooms()
        .filter(r => r.status === 'WAITING')
        .map(r => ({
          roomId: r.roomId,
          roomName: r.roomName,
          hostIp: r.hostIp,
          playerCount: r.players.size,
          maxPlayers: r.maxPlayers,
          presetKey: r.presetKey,
          hasPassword: !!r.password,
        }));
      return writeJson(res, 200, { rooms }, req);
    }

    if (pathname === '/api/rooms' && method === 'POST') {
      const { data: body, oversized } = await parseBody(req);
      if (oversized) return writeJson(res, 413, { error: '请求体过大' }, req);
      const { roomName, nickname, presetKey, hostIp, maxPlayers, password } = body;
      if (!roomName || !nickname) return writeJson(res, 400, { error: '需要房间名和昵称' }, req);
      if (nickname.length > 5) return writeJson(res, 400, { error: '昵称最多5个字符' }, req);
      if (roomName.length > 20) return writeJson(res, 400, { error: '房间名最多20个字符' }, req);
      const room = roomManager.createRoom(hostIp || req.socket.remoteAddress || '127.0.0.1', roomName, nickname, presetKey, maxPlayers || 12, password);
      const sessionToken = generateSessionToken();
      const tokenHash = hashToken(sessionToken);
      const hostPlayer = room.players.get(room.hostPlayerId);
      if (hostPlayer) hostPlayer.sessionTokenHash = tokenHash;
      playerSessionTokens.set(getConnectionKey(room.roomId, room.hostPlayerId), tokenHash);
      return writeJson(res, 201, {
        roomId: room.roomId,
        playerId: room.hostPlayerId,
        nickname: room.players.get(room.hostPlayerId)?.nickname,
        roomName: room.roomName,
        presetKey: room.presetKey,
        sessionToken,
      }, req);
    }

    if (pathname.match(/^\/api\/rooms\/[^/]+\/join$/) && method === 'POST') {
      const roomId = pathname.split('/')[3];
      const { data: body, oversized } = await parseBody(req);
      if (oversized) return writeJson(res, 413, { error: '请求体过大' }, req);
      const { nickname, seatNumber, password } = body;
      if (!nickname) return writeJson(res, 400, { error: '需要昵称' }, req);
      if (nickname.length > 5) return writeJson(res, 400, { error: '昵称最多5个字符' }, req);
      if (!roomManager.validatePassword(roomId, password || '')) return writeJson(res, 403, { error: '房间密码错误' }, req);
      const result = roomManager.joinRoom(roomId, nickname, seatNumber);
      if (!result) return writeJson(res, 404, { error: '房间不存在' }, req);
      if ('error' in result) return writeJson(res, 403, { error: result.error }, req);
      const sessionToken = generateSessionToken();
      const tokenHash = hashToken(sessionToken);
      result.player.sessionTokenHash = tokenHash;
      playerSessionTokens.set(getConnectionKey(roomId, result.player.playerId), tokenHash);
      console.log(`[Room Server] Player ${nickname} joined room ${roomId} at seat ${result.player.seatNumber}.`);
      return writeJson(res, 200, {
        roomId: result.room.roomId,
        playerId: result.player.playerId,
        nickname: result.player.nickname,
        seatNumber: result.player.seatNumber,
        sessionToken,
      }, req);
    }

    if (pathname.match(/^\/api\/rooms\/[^/]+$/) && method === 'GET') {
      const roomId = pathname.split('/')[3];
      const room = roomManager.getRoom(roomId);
      if (!room) return writeJson(res, 404, { error: '房间不存在' }, req);
      return writeJson(res, 200, { room: serializeRoom(room) }, req);
    }

    writeJson(res, 404, { error: 'Not found' }, req);
  } catch (e: any) {
    writeJson(res, 500, { error: e.message || 'Internal error' }, req);
  }
});

const wss = new WebSocketServer({
  server: httpServer,
  path: '/api/ws',
  // 浏览器发起的 WS 握手必带 Origin；拒绝公网来源，防跨站 WebSocket 劫持。
  // 无 Origin 的非浏览器客户端（curl、测试脚本）放行。
  verifyClient: (info) => {
    const rawOrigin = info.req.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    if (!origin) return true;
    return isAllowedWsOrigin(origin);
  },
});

const AUTH_TIMEOUT_MS = 5000;

interface PendingAuth {
  ws: WebSocket;
  roomId: string;
  playerId: string;
  nickname: string;
  timer: ReturnType<typeof setTimeout>;
}

const pendingAuths: Map<string, PendingAuth> = new Map();

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const url = parseRequestUrl(req);
  if (!url) {
    ws.close(4000, 'Invalid request URL');
    return;
  }
  const roomId = url.searchParams.get('roomId') || '';
  const playerId = url.searchParams.get('playerId') || '';
  const nickname = url.searchParams.get('nickname') || '';

  if (!roomId || !playerId) {
    ws.close(4001, 'Missing roomId or playerId');
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    ws.close(4002, 'Room not found');
    return;
  }

  const player = room.players.get(playerId);
  if (!player) {
    ws.close(4003, 'Player not in room');
    return;
  }

  const authKey = getConnectionKey(roomId, playerId);
  const authTimer = setTimeout(() => {
    pendingAuths.delete(authKey);
    ws.close(4005, 'Auth timeout');
  }, AUTH_TIMEOUT_MS);

  pendingAuths.set(authKey, { ws, roomId, playerId, nickname: player.nickname, timer: authTimer });

  ws.on('message', (raw: Buffer) => {
    try {
      if (raw.length > 1024 * 1024) {
        console.warn(`[Room Server] Oversized message from unauthenticated ${authKey}: ${raw.length} bytes`);
        return;
      }
      const data = JSON.parse(raw.toString());

      if (data.type === 'AUTH') {
        const pending = pendingAuths.get(authKey);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingAuths.delete(authKey);

        const sessionToken = data.sessionToken || '';
        if (!sessionToken) {
          ws.close(4001, 'Missing sessionToken');
          return;
        }

        const tokenHash = hashToken(sessionToken);
        const storedHash = playerSessionTokens.get(authKey);
        if (!storedHash || tokenHash !== storedHash) {
          ws.close(4004, 'Invalid sessionToken');
          return;
        }

        const connectionKey = authKey;
        const oldConn = wsConnections.get(connectionKey);
        if (oldConn && oldConn.ws.readyState === WebSocket.OPEN) {
          oldConn.ws.close();
        }

        const pendingTimer = disconnectTimers.get(connectionKey);
        const wasDisconnected = !player.isConnected || !!pendingTimer;
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          disconnectTimers.delete(connectionKey);
          console.log(`[Room Server] Player ${playerId} reconnected within grace period`);
        }
        player.isConnected = true;

        const conn: ClientConnection = {
          ws,
          roomId,
          playerId,
          nickname: player.nickname,
          sessionTokenHash: tokenHash,
          connectedAt: Date.now(),
          isAlive: true,
        };
        wsConnections.set(connectionKey, conn);
        // 协议层 pong 由浏览器/webview 自动回复，用于服务端心跳存活判断
        ws.on('pong', () => { conn.isAlive = true; });
        roomManager.touchRoom(roomId);

        const isHost = room.hostPlayerId === playerId;
        sendToConnection(conn, {
          type: 'CONNECTED',
          playerId,
          roomId,
          isHost,
          hostPlayerId: room.hostPlayerId,
          disconnectGraceMs: DISCONNECT_GRACE_MS,
        });

        broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(room) });
        if (wasDisconnected) {
          broadcastToRoom(roomId, {
            type: 'PLAYER_RECONNECTED',
            playerId,
            nickname: player.nickname,
            seatNumber: player.seatNumber,
          }, playerId);
        }

        const roleAssignment = roomRoleAssignments.get(roomId)?.get(playerId);
        if (!isHost && roleAssignment) {
          const msg: any = {
            type: 'YOUR_ROLE',
            playerId,
            role: roleAssignment.role,
            rolePrompt: roleAssignment.rolePrompt,
            seatNumber: roleAssignment.seatNumber,
          };
          if (roleAssignment.potions) msg.potions = roleAssignment.potions;
          sendToConnection(conn, msg);
        }

        if (room.status === 'IN_GAME') {
          const cachedState = roomLastGameState.get(roomId);
          if (cachedState) {
            sendToConnection(conn, {
              type: 'GAME_STATE_SYNC',
              gameState: getGameStateForConnection(room, conn, { ...cachedState, syncType: 'full', syncedAt: Date.now() }),
            });
            console.log(`[Room Server] Sent cached game state to ${playerId} for room ${roomId}`);
          }
        }

        console.log(`[Room Server] WS connected: ${connectionKey}. Total: ${wsConnections.size}`);

        ws.removeAllListeners('message');
        ws.on('message', (raw: Buffer) => {
          try {
            if (raw.length > 1024 * 1024) {
              console.warn(`[Room Server] Oversized message from ${connectionKey}: ${raw.length} bytes`);
              return;
            }
            const data = JSON.parse(raw.toString());
            handleWsMessage(conn, data);
          } catch (e) {
            console.error('[Room Server] Failed to parse WS message:', e);
          }
        });

        ws.on('close', () => {
          if (wsConnections.get(connectionKey) !== conn) return;
          wsConnections.delete(connectionKey);
          console.log(`[Room Server] WS disconnected: ${connectionKey}. Total: ${wsConnections.size}`);

          const currentRoom = roomManager.getRoom(roomId);
          if (!currentRoom) {
            clearRoomRuntimeState(roomId);
            return;
          }

          const disconnectedRoomPlayer = currentRoom.players.get(playerId);
          if (disconnectedRoomPlayer) {
            disconnectedRoomPlayer.isConnected = false;
            currentRoom.updatedAt = Date.now();
            broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(currentRoom) });
            broadcastToRoom(roomId, {
              type: 'PLAYER_DISCONNECTED',
              playerId,
              nickname: disconnectedRoomPlayer.nickname,
              seatNumber: disconnectedRoomPlayer.seatNumber,
              disconnectGraceMs: DISCONNECT_GRACE_MS,
            });
          }

          if (playerId === currentRoom.hostPlayerId) {
            const timer = setTimeout(() => {
              disconnectTimers.delete(connectionKey);
              const stillRoom = roomManager.getRoom(roomId);
              if (!stillRoom) return;
              const hostReconnected = wsConnections.has(connectionKey);
              if (hostReconnected) return;
              console.log(`[Room Server] Host ${playerId} grace period expired, deleting room ${roomId}`);
              broadcastToRoom(roomId, { type: 'HOST_LEFT', reason: '房主断开连接' });
              roomManager.deleteRoom(roomId);
              clearRoomRuntimeState(roomId);
              getRoomConnections(roomId).forEach(c => {
                if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
              });
            }, DISCONNECT_GRACE_MS);
            disconnectTimers.set(connectionKey, timer);
            console.log(`[Room Server] Host ${playerId} disconnected, grace period ${DISCONNECT_GRACE_MS}ms`);
          } else {
            const timer = setTimeout(() => {
              disconnectTimers.delete(connectionKey);
              const stillRoom = roomManager.getRoom(roomId);
              if (!stillRoom) return;
              const guestReconnected = wsConnections.has(connectionKey);
              if (guestReconnected) return;
              console.log(`[Room Server] Guest ${playerId} grace period expired, removing from room ${roomId}`);
              const updatedRoom = roomManager.leaveRoom(roomId, playerId);
              clearPlayerRuntimeState(roomId, playerId);
              if (updatedRoom) {
                broadcastToRoom(roomId, { type: 'STATE_UPDATE', room: serializeRoom(updatedRoom) });
              }
            }, DISCONNECT_GRACE_MS);
            disconnectTimers.set(connectionKey, timer);
          }
        });

        ws.on('error', (err) => {
          console.error(`[Room Server] WS error for ${connectionKey}:`, err.message);
        });

        return;
      }

      ws.close(4005, 'Auth required');
    } catch (e) {
      console.error('[Room Server] Failed to parse WS message during auth:', e);
    }
  });

  ws.on('close', () => {
    const pending = pendingAuths.get(authKey);
    if (pending) {
      clearTimeout(pending.timer);
      pendingAuths.delete(authKey);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Room Server] WS error during auth for ${authKey}:`, err.message);
  });
});

setInterval(() => {
  const cleanedRoomIds = roomManager.cleanupStaleRooms();
  if (cleanedRoomIds.length === 0) return;
  for (const roomId of cleanedRoomIds) {
    clearRoomRuntimeState(roomId);
    getRoomConnections(roomId).forEach(conn => {
      try { conn.ws.close(4009, 'Room closed due to inactivity'); } catch { /* noop */ }
    });
  }
  console.log(`[Room Server] Cleaned up ${cleanedRoomIds.length} stale rooms`);
}, 5 * 60 * 1000);

// 心跳：客户端崩溃/断网不会触发 close 事件，靠协议层 ping/pong 清理半开连接
const HEARTBEAT_INTERVAL_MS = 30000;
setInterval(() => {
  wsConnections.forEach((conn) => {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    if (!conn.isAlive) {
      conn.ws.terminate();
      return;
    }
    conn.isAlive = false;
    conn.ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Room Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Room Server] WebSocket endpoint: ws://0.0.0.0:${PORT}/api/ws`);
    console.log(`[Room Server] Starting mDNS broadcast: _ai-werewolf._tcp on port ${PORT}`);
    discovery.startBroadcast(roomManager);
    console.log(`[Room Server] Room discovery and multiplayer ready`);
});
