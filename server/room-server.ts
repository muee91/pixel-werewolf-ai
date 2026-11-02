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
import {
  RoomManager,
  RoomDiscovery,
  MAX_INBOUND_MESSAGE_BYTES,
  createMessageTooLargeReply,
  resolveDisconnectGraceMs,
  resolveUnstableAfterMs,
} from './room-manager.js';
import { buildGameStateForViewer, getViewerFromGameState } from './visibility.js';
import { createBotSession } from './bots.js';
import { createAttemptLimiter, generateShareCode, isValidShareCode, maskShareCode } from './share-guard.js';

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
  /** 最近一次收到该连接入站消息（应用层消息或心跳 pong）的时刻 */
  lastSeenAt: number;
}

const wsConnections: Map<string, ClientConnection> = new Map();
const roomLastGameState: Map<string, any> = new Map();
const roomStateVersions: Map<string, number> = new Map();
const roomRoleAssignments: Map<string, Map<string, any>> = new Map();
const roomRoleAcks: Map<string, Set<string>> = new Map();
const disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const playerSessionTokens: Map<string, string> = new Map();
// 房主侧「连接不稳」上一次广播出去的值：connectionKey -> boolean，只在翻转时推送
const unstableBroadcastFlags: Map<string, boolean> = new Map();
interface ActionRecord {
  playerId: string;
  actionType: string;
  status: 'pending' | 'completed';
  success?: boolean;
}

const processedActions: Map<string, { records: Map<string, ActionRecord>; order: string[] }> = new Map();
const lastClientSeqByPlayer: Map<string, number> = new Map();
const advisorRequestsInFlight: Set<string> = new Set();
// 宽限期可由房主用 ROOM_DISCONNECT_GRACE_MS 覆盖（非法值回退 60000），
// 必须长于客户端重连计划（RECONNECT_DELAYS_MS 合计 55 秒）
const DISCONNECT_GRACE_MS = resolveDisconnectGraceMs(process.env.ROOM_DISCONNECT_GRACE_MS);
// 静默超过宽限期的一半，房主 UI 提示「连接不稳」——纯可见性，不影响对局推进
const UNSTABLE_AFTER_MS = resolveUnstableAfterMs(DISCONNECT_GRACE_MS);
const MAX_ACTION_HISTORY_PER_ROOM = 5000;
let oversizedInboundCount = 0;
let oversizedOutboundCount = 0;
const oversizedOutboundLogged: Set<string> = new Set();
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
  unstableBroadcastFlags.delete(getConnectionKey(roomId, playerId));
}

function clearRoomRuntimeState(roomId: string) {
  roomLastGameState.delete(roomId);
  roomStateVersions.delete(roomId);
  roomRoleAssignments.delete(roomId);
  roomRoleAcks.delete(roomId);
  processedActions.delete(roomId);
  Array.from(unstableBroadcastFlags.keys())
    .filter(key => key.startsWith(`${roomId}:`))
    .forEach(key => unstableBroadcastFlags.delete(key));
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
    conn.ws.send(serializeOutbound(conn.roomId, message));
  }
}

function serializeOutbound(roomId: string, message: any): string {
  const data = JSON.stringify(message);
  // 出站没有硬上限，但全量状态一旦超过入站上限，客人回一条大消息就会被自己的
  // 规则挡住：这里只记一条日志 + 计数，作为将来做 delta 同步的依据，不在此实现
  if (data.length > MAX_INBOUND_MESSAGE_BYTES) {
    oversizedOutboundCount += 1;
    const label = `${message.type}@${roomId}`;
    if (!oversizedOutboundLogged.has(label)) {
      oversizedOutboundLogged.add(label);
      console.warn(`[Room Server] Outbound ${String(message.type)} for room ${roomId} is ${data.length} bytes, over ${MAX_INBOUND_MESSAGE_BYTES} (累计 ${oversizedOutboundCount} 次过大广播，建议改用增量同步)`);
    }
  }
  return data;
}

function broadcastToRoom(roomId: string, message: any, excludePlayerId?: string) {
    const connections = getRoomConnections(roomId);
    const data = serializeOutbound(roomId, message);
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
      // 房主侧可见性用：客人最近一次入站时刻与「静默已超过宽限期一半」的判定
      lastSeenAt: p.lastSeenAt ?? null,
      isUnstable: !!p.isUnstable,
    })),
    maxPlayers: room.maxPlayers,
    presetKey: room.presetKey,
    hasPassword: !!room.password,
    status: room.status,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

/** 记录「听到某个座位说话了」：入站消息与心跳 pong 都算，纯可见性，不影响对局 */
function markPlayerSeen(roomId: string, playerId: string, at: number = Date.now()) {
  const conn = wsConnections.get(getConnectionKey(roomId, playerId));
  if (conn) conn.lastSeenAt = at;
  const player = roomManager.getRoom(roomId)?.players.get(playerId);
  if (player) {
    player.lastSeenAt = at;
    player.isUnstable = false;
  }
}

/**
 * 「连接不稳」判定与广播：客人静默时长超过宽限期的一半（默认 60000/2=30000ms）时
 * 提示房主，真正断线时仍走原有 PLAYER_DISCONNECTED 文案。
 *
 * 之所以是可靠信号：服务端每 30 秒 ping 一次、浏览器在网络层自动回 pong，pong 也计入
 * lastSeenAt，所以健康座位的静默时长永远达不到阈值；而手机锁屏/信号丢失时，
 * 座位会在「约 30 秒静默」被标成不稳，比心跳判定半开连接并触发 close（约 60 秒）
 * 早整整一个心跳周期。
 * 只在结果翻转时把房间状态推给房主，避免客人断线时房主 UI 一片空白。
 */
function sweepUnstableConnections() {
  const now = Date.now();
  const dirtyRoomIds = new Set<string>();
  wsConnections.forEach(conn => {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    const unstable = now - conn.lastSeenAt >= UNSTABLE_AFTER_MS;
    const player = roomManager.getRoom(conn.roomId)?.players.get(conn.playerId);
    if (player) player.isUnstable = unstable;
    const flagKey = getConnectionKey(conn.roomId, conn.playerId);
    if (unstableBroadcastFlags.get(flagKey) !== unstable) {
      unstableBroadcastFlags.set(flagKey, unstable);
      dirtyRoomIds.add(conn.roomId);
    }
  });

  for (const roomId of dirtyRoomIds) {
    const room = roomManager.getRoom(roomId);
    if (!room) continue;
    const hostConn = wsConnections.get(getConnectionKey(roomId, room.hostPlayerId));
    // 只推房主：客人看到的是原有断线文案，不需要这份额外可见性
    if (hostConn) sendToConnection(hostConn, { type: 'STATE_UPDATE', room: serializeRoom(room) });
  }
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
    // 配置分享口令：快照里可能含明文 API Key，因此 GET 必须带房主给出的口令，
    // 并对同 IP 的错误尝试做锁定 —— 「同 Wi-Fi 都是朋友」在校园/公共网络不成立。
    if (pathname === '/api/config/share' && method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      const publishLockedMs = publishShareLimiter.lockRemainingMs(ip);
      if (publishLockedMs > 0) {
        return writeJson(res, 429, { error: `发布尝试过于频繁，请 ${Math.ceil(publishLockedMs / 1000)} 秒后再试` }, req);
      }
      const { data: body, oversized } = await parseBody(req);
      if (oversized) return writeJson(res, 413, { error: '配置快照过大' }, req);
      // 覆盖已有快照必须出示当前口令：否则同网段任意设备都能投毒 baseUrl，
      // 让后续拉取者把 API Key 发到攻击者端点。首次发布（尚无快照）仍在局域网信任范围内。
      if (activeShareCode) {
        const supplied = (typeof body?.previousCode === 'string' ? body.previousCode : url.searchParams.get('code') || '').trim();
        if (supplied !== activeShareCode) {
          publishShareLimiter.recordFailure(ip);
          console.warn(`[Room Server] 拒绝一次配置发布（口令缺失或错误）来自 ${ip}`);
          return writeJson(res, 403, { error: '覆盖已有快照需要当前口令；口令遗失时可删除 server/config-share.json 并重启房间服务重置' }, req);
        }
      }
      if (!body || typeof body !== 'object' || typeof body.config !== 'object') {
        return writeJson(res, 400, { error: '缺少 config 字段' }, req);
      }
      const snapshot: {
        config: unknown;
        includesApiKeys: boolean;
        publishedAt: number;
        publishedBy: string;
        shareCode?: string;
      } = {
        config: body.config,
        includesApiKeys: !!body.includesApiKeys,
        publishedAt: Date.now(),
        publishedBy: String(body.publishedBy || 'host').slice(0, 20),
      };
      snapshot.shareCode = generateShareCode();
      activeShareCode = snapshot.shareCode;
      writeFileSync(CONFIG_SHARE_PATH, JSON.stringify(snapshot, null, 2));
      console.log(`[Room Server] 配置快照已发布（含密钥：${snapshot.includesApiKeys ? '是' : '否'}）。口令：${maskShareCode(snapshot.shareCode)}（完整口令已返回给发布方）`);
      return writeJson(res, 200, { ok: true, publishedAt: snapshot.publishedAt, shareCode: snapshot.shareCode }, req);
    }

    if (pathname === '/api/config/share' && method === 'GET') {
      if (!existsSync(CONFIG_SHARE_PATH)) {
        return writeJson(res, 404, { error: '房间服务上暂无共享配置' }, req);
      }
      const ip = req.socket.remoteAddress || 'unknown';
      const lockedMs = fetchShareLimiter.lockRemainingMs(ip);
      if (lockedMs > 0) {
        return writeJson(res, 429, { error: `口令连续错误过多，请 ${Math.ceil(lockedMs / 1000)} 秒后再试` }, req);
      }
      const supplied = (url.searchParams.get('code') || '').trim();
      if (!activeShareCode || !isValidShareCode(supplied) || supplied !== activeShareCode) {
        fetchShareLimiter.recordFailure(ip);
        console.warn(`[Room Server] 拒绝一次配置拉取（口令缺失或错误）来自 ${ip}`);
        return writeJson(res, 401, { error: '需要房主给出的 10 位分享口令' }, req);
      }
      fetchShareLimiter.clear(ip);
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
      const created = roomManager.createRoom(hostIp || req.socket.remoteAddress || '127.0.0.1', roomName, nickname, presetKey, maxPlayers || 12, password);
      if ('error' in created) {
        return writeJson(res, 429, {
          error: created.error === 'ROOM_LIMIT_PER_IP'
            ? '同一 IP 的建房数量已达上限，请等旧房间清理后再试'
            : '房间总数已达上限，请稍后再试',
        }, req);
      }
      const room = created.room;
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

// 口令只保存在内存与快照文件里：房主重新发布即轮换，旧口令自动作废
let activeShareCode: string | null = null;
// 拉取(GET)与发布(POST)各自的按 IP 失败锁定；发布限速防的是同网段设备反复试探覆盖
const fetchShareLimiter = createAttemptLimiter(8, 60_000);
const publishShareLimiter = createAttemptLimiter(5, 60_000);
try {
  if (existsSync(CONFIG_SHARE_PATH)) {
    const existing = JSON.parse(readFileSync(CONFIG_SHARE_PATH, 'utf8'));
    if (typeof existing?.shareCode === 'string') activeShareCode = existing.shareCode;
  }
} catch { /* 快照损坏时由 GET 分支自行报错 */ }

const wss = new WebSocketServer({
  server: httpServer,
  path: '/api/ws',
  // 浏览器发起的 WS 握手必带 Origin；拒绝公网来源，防跨站 WebSocket 劫持。
  // 无 Origin 的非浏览器客户端（curl、测试脚本）放行。
  verifyClient: (info: { origin?: string; req: IncomingMessage; secure: boolean }) => {
    const rawOrigin = info.req.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    if (!origin) return true;
    return isAllowedWsOrigin(origin);
  },
});

// 端口被占/绑定失败时给出可读提示，避免未捕获的 'error' 事件把进程直接炸掉（实测 EADDRINUSE 会崩）。
let portConflictReported = false;
const reportServerError = (err: NodeJS.ErrnoException | Error) => {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'EADDRINUSE') {
    // wss 与 httpServer 会对同一次绑定失败各报一次，只提示一次并退出，不留僵尸进程
    if (portConflictReported) return;
    portConflictReported = true;
    console.error(`[Room Server] 端口 ${PORT} 已被占用，房间服务未能启动。请关闭另一个实例（或设置 ROOM_SERVER_PORT 换端口）后重试。`);
    setTimeout(() => process.exit(1), 50);
    return;
  }
  console.error('[Room Server] 服务错误：', code || err?.message || err);
};
wss.on('error', reportServerError);
httpServer.on('error', reportServerError);

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
      if (raw.length > MAX_INBOUND_MESSAGE_BYTES) {
        oversizedInboundCount += 1;
        console.warn(`[Room Server] Oversized message from unauthenticated ${authKey}: ${raw.length} bytes (dropped, 累计 ${oversizedInboundCount} 条)`);
        // 不能静默丢弃：发送方需要知道自己那条没送到
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(createMessageTooLargeReply(raw.length)));
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
          lastSeenAt: Date.now(),
        };
        unstableBroadcastFlags.set(connectionKey, false);
        wsConnections.set(connectionKey, conn);
        markPlayerSeen(roomId, playerId, conn.lastSeenAt);
        // 协议层 pong 由浏览器/webview 自动回复，用于服务端心跳存活判断
        ws.on('pong', () => {
          conn.isAlive = true;
          markPlayerSeen(roomId, playerId);
        });
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
            // 收到任何入站帧都说明这个座位还在，刷新「最近一次听到」的时刻
            markPlayerSeen(roomId, playerId);
            if (raw.length > MAX_INBOUND_MESSAGE_BYTES) {
              oversizedInboundCount += 1;
              console.warn(`[Room Server] Oversized message from ${connectionKey}: ${raw.length} bytes (dropped, 累计 ${oversizedInboundCount} 条)`);
              // 静默丢弃等于把发送方的操作吃掉：回一条结构化错误，让客户端能提示玩家
              sendToConnection(conn, createMessageTooLargeReply(raw.length));
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
          unstableBroadcastFlags.delete(connectionKey);
          console.log(`[Room Server] WS disconnected: ${connectionKey}. Total: ${wsConnections.size}`);

          const currentRoom = roomManager.getRoom(roomId);
          if (!currentRoom) {
            clearRoomRuntimeState(roomId);
            return;
          }

          const disconnectedRoomPlayer = currentRoom.players.get(playerId);
          if (disconnectedRoomPlayer) {
            disconnectedRoomPlayer.isConnected = false;
            // 真正的断线交回原有断线文案，「连接不稳」标记到此为止
            disconnectedRoomPlayer.isUnstable = false;
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

// 房主侧「连接不稳」可见性扫描：只读连接时刻 + 推房间状态，不参与对局推进
const UNSTABLE_SWEEP_INTERVAL_MS = 5000;
setInterval(sweepUnstableConnections, UNSTABLE_SWEEP_INTERVAL_MS);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Room Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Room Server] WebSocket endpoint: ws://0.0.0.0:${PORT}/api/ws`);
    console.log(`[Room Server] Disconnect grace: ${DISCONNECT_GRACE_MS}ms（ROOM_DISCONNECT_GRACE_MS 可覆盖），静默 ${UNSTABLE_AFTER_MS}ms 起向房主提示「连接不稳」`);
    console.log(`[Room Server] Starting mDNS broadcast: _ai-werewolf._tcp on port ${PORT}`);
    discovery.startBroadcast(roomManager);
    console.log(`[Room Server] Room discovery and multiplayer ready`);
});
