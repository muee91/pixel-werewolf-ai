import { Server } from 'http';
import type { Socket } from 'net';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { hostname } from 'os';
import { Bonjour } from 'bonjour-service';

const SCRYPT_KEY_LENGTH = 32;

// ── 联机韧性：断线宽限与超限消息 ────────────────────────────
// 这两条规则都是纯配置/纯构造函数，放在这里是为了能直接单测
// （room-server.ts 一被 import 就会 listen 端口并广播 mDNS）。

/**
 * 客人/房主断线后保留座位的宽限时长默认值。
 * 手机锁屏、切后台几分钟是熟人联机的常态，而客户端重连计划
 * （RECONNECT_DELAYS_MS = 1s/2s/4s/8s/15s/25s）合计 55 秒，
 * 原先的 10 秒宽限会在重连预算用完之前就把座位踢掉。
 */
export const DEFAULT_DISCONNECT_GRACE_MS = 60_000;
// 超出这个区间一律视为非法配置（回退默认值），避免 0/负数把宽限直接关掉
export const MIN_DISCONNECT_GRACE_MS = 5_000;
export const MAX_DISCONNECT_GRACE_MS = 600_000;

/** 读取 ROOM_DISCONNECT_GRACE_MS：非法值（空、非数字、非整数、越界）回退默认值 */
export function resolveDisconnectGraceMs(raw: string | undefined | null): number {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return DEFAULT_DISCONNECT_GRACE_MS;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) return DEFAULT_DISCONNECT_GRACE_MS;
  if (parsed < MIN_DISCONNECT_GRACE_MS || parsed > MAX_DISCONNECT_GRACE_MS) return DEFAULT_DISCONNECT_GRACE_MS;
  return parsed;
}

/**
 * 房主侧「连接不稳」的静默阈值：宽限期的一半（取整）。
 * 断线一半时间还没听到任何入站消息，就值得提示房主，
 * 但还不至于直接宣布对方掉线。
 */
export function resolveUnstableAfterMs(disconnectGraceMs: number): number {
  return Math.floor(disconnectGraceMs / 2);
}

// 入站消息上限：一条超长消息（多半是发疯的发言文本）不该静默吃掉发送方的操作
export const MAX_INBOUND_MESSAGE_BYTES = 1024 * 1024;

// ── 建房配额 ────────────────────────────────────────────────
// POST /api/rooms 对同网段任意设备开放且建房无成本，没有配额就是内存 DoS
// （空房要等 30 分钟的 stale 清理才会回收）。
export const MAX_ROOMS_TOTAL = 64;
export const MAX_ROOMS_PER_IP = 4;
export type RoomCreateError = 'ROOM_LIMIT_TOTAL' | 'ROOM_LIMIT_PER_IP';

export interface MessageTooLargeReply {
  type: 'MESSAGE_TOO_LARGE';
  reason: string;
  receivedBytes: number;
  limitBytes: number;
}

/** 超限消息的回信：沿用 { type, ...payload } 的现有信封格式，不带 sessionToken */
export function createMessageTooLargeReply(receivedBytes: number): MessageTooLargeReply {
  return {
    type: 'MESSAGE_TOO_LARGE',
    reason: '这条消息超过房间服务的单条上限，已被丢弃，请缩短内容后重试',
    receivedBytes,
    limitBytes: MAX_INBOUND_MESSAGE_BYTES,
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(':');
  if (!salt || !derivedHex) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const storedBuffer = Buffer.from(derivedHex, 'hex');
  if (derived.length !== storedBuffer.length) return false;
  return timingSafeEqual(derived, storedBuffer);
}

export interface RoomPlayer {
  playerId: string;
  nickname: string;
  seatNumber: number | null;
  isReady: boolean;
  isConnected: boolean;
  sseConnection?: SseConnection;
  hasUsedAISuggestion: boolean;
  currentTurnSpeech?: string;
  sessionTokenHash?: string;
  /** 服务端最近一次收到该座位入站消息（含心跳 pong）的时刻，仅房主可见性使用 */
  lastSeenAt?: number;
  /** 静默时长已超过宽限期的一半：只影响 UI 提示，不参与任何对局推进 */
  isUnstable?: boolean;
}

export interface GameRoom {
  roomId: string;
  roomName: string;
  hostIp: string;
  hostPlayerId: string;
  players: Map<string, RoomPlayer>;
  maxPlayers: number;
  presetKey: string;
  password?: string;
  status: 'WAITING' | 'IN_GAME' | 'FINISHED';
  createdAt: number;
  updatedAt: number;
  gameState?: unknown;
}

export interface SseConnection {
  res: any;
  playerId: string;
  roomId: string;
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private roomsByIp: Map<string, Set<string>> = new Map();

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getRoomsByIp(ip: string): GameRoom[] {
    const roomIds = this.roomsByIp.get(ip) || new Set();
    return Array.from(roomIds)
      .map(id => this.rooms.get(id))
      .filter(Boolean) as GameRoom[];
  }

  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  touchRoom(roomId: string): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.updatedAt = Date.now();
    return room;
  }

  createRoom(hostIp: string, roomName: string, hostNickname: string, presetKey: string = '8-standard', maxPlayers: number = 12, password?: string): { room: GameRoom } | { error: RoomCreateError } {
    if (this.rooms.size >= MAX_ROOMS_TOTAL) return { error: 'ROOM_LIMIT_TOTAL' };
    if ((this.roomsByIp.get(hostIp)?.size ?? 0) >= MAX_ROOMS_PER_IP) return { error: 'ROOM_LIMIT_PER_IP' };
    const roomId = randomUUID();
    const hostId = randomUUID();

    const room: GameRoom = {
      roomId,
      roomName,
      hostIp,
      hostPlayerId: hostId,
      players: new Map(),
      maxPlayers,
      presetKey,
      password: password ? hashPassword(password) : undefined,
      status: 'WAITING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    room.players.set(hostId, {
      playerId: hostId,
      nickname: this.ensureUniqueNickname(room, hostNickname),
      seatNumber: 1,
      isReady: true,
      isConnected: true,
      hasUsedAISuggestion: false,
      lastSeenAt: Date.now(),
      isUnstable: false,
    });

    this.rooms.set(roomId, room);

    if (!this.roomsByIp.has(hostIp)) {
      this.roomsByIp.set(hostIp, new Set());
    }
    this.roomsByIp.get(hostIp)!.add(roomId);

    return { room };
  }

  joinRoom(roomId: string, nickname: string, preferredSeat?: number): { player: RoomPlayer; room: GameRoom } | { error: string } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== 'WAITING') return { error: '游戏已开始，无法加入' };
    if (room.players.size >= room.maxPlayers) return { error: `房间已满（${room.maxPlayers}人局）` };

    const playerId = randomUUID();
    const uniqueNickname = this.ensureUniqueNickname(room, nickname);

    const takenSeats = new Set(Array.from(room.players.values()).map(p => p.seatNumber));
    let seatNumber: number;
    if (preferredSeat != null && preferredSeat >= 1 && preferredSeat <= room.maxPlayers && !takenSeats.has(preferredSeat)) {
      seatNumber = preferredSeat;
    } else {
      seatNumber = 1;
      while (takenSeats.has(seatNumber)) seatNumber++;
    }

    const player: RoomPlayer = {
      playerId,
      nickname: uniqueNickname,
      seatNumber,
      isReady: false,
      isConnected: true,
      hasUsedAISuggestion: false,
      lastSeenAt: Date.now(),
      isUnstable: false,
    };

    room.players.set(playerId, player);
    room.updatedAt = Date.now();

    return { player, room };
  }

  changeSeat(roomId: string, playerId: string, newSeat: number): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== 'WAITING') return null;
    if (newSeat < 1 || newSeat > room.maxPlayers) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    const takenSeats = new Set(
      Array.from(room.players.values())
        .filter(p => p.playerId !== playerId)
        .map(p => p.seatNumber)
    );
    if (takenSeats.has(newSeat)) return null;

    player.seatNumber = newSeat;
    player.isReady = false;
    room.updatedAt = Date.now();
    return room;
  }

  leaveRoom(roomId: string, playerId: string): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players.delete(playerId);
    room.updatedAt = Date.now();

    if (room.hostPlayerId === playerId && room.players.size > 0) {
      const newHost = room.players.values().next().value;
      if (newHost) {
        room.hostPlayerId = newHost.playerId;
      }
    }

    if (room.players.size === 0) {
      this.deleteRoom(roomId);
      return null;
    }

    return room;
  }

  setReady(roomId: string, playerId: string, ready: boolean): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    player.isReady = ready;
    room.updatedAt = Date.now();
    return room;
  }

  changePreset(roomId: string, playerId: string, presetKey: string, maxPlayers: number): { room: GameRoom; kickedPlayerIds: string[] } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.hostPlayerId !== playerId) return null;
    if (room.status !== 'WAITING') return null;

    const kickedPlayerIds: string[] = [];
    if (room.players.size > maxPlayers) {
      const guests = Array.from(room.players.values())
        .filter(p => p.playerId !== room.hostPlayerId)
        .sort((a, b) => (b.seatNumber ?? 0) - (a.seatNumber ?? 0));
      while (room.players.size > maxPlayers && guests.length > 0) {
        const guest = guests.shift()!;
        room.players.delete(guest.playerId);
        kickedPlayerIds.push(guest.playerId);
      }
    }

    room.presetKey = presetKey;
    room.maxPlayers = maxPlayers;
    for (const [, player] of room.players) {
      if (player.playerId !== room.hostPlayerId) {
        player.isReady = false;
      }
    }
    room.updatedAt = Date.now();
    return { room, kickedPlayerIds };
  }

  deleteRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      this.roomsByIp.get(room.hostIp)?.delete(roomId);
      this.rooms.delete(roomId);
    }
  }

  cleanupStaleRooms(maxAgeMs: number = 30 * 60 * 1000): string[] {
    const now = Date.now();
    const cleanedRoomIds: string[] = [];
    for (const [roomId, room] of this.rooms) {
      if (now - room.updatedAt > maxAgeMs) {
        this.deleteRoom(roomId);
        cleanedRoomIds.push(roomId);
      }
    }
    return cleanedRoomIds;
  }

  updatePlayerAISuggestion(roomId: string, playerId: string, used: boolean) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;
    player.hasUsedAISuggestion = used;
    room.updatedAt = Date.now();
  }

  getPlayer(roomId: string, playerId: string): RoomPlayer | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room.players.get(playerId);
  }

  validatePassword(roomId: string, password: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (!room.password) return true;
    return verifyPassword(password, room.password);
  }

  private ensureUniqueNickname(room: GameRoom, nickname: string): string {
    const existingNames = new Set(Array.from(room.players.values()).map(p => p.nickname));
    let finalName = nickname;
    let counter = 2;
    while (existingNames.has(finalName)) {
      finalName = `${nickname}${counter}`;
      counter++;
    }
    return finalName;
  }
}

type RoomDiscoveryServiceConfig = Parameters<Bonjour['publish']>[0];
type RoomDiscoveryBonjour = {
  publish(config: RoomDiscoveryServiceConfig): unknown;
  unpublishAll(callback?: CallableFunction): void;
  destroy(callback?: CallableFunction): void;
};

export class RoomDiscovery {
  private bonjour: RoomDiscoveryBonjour | null = null;
  private service: unknown | null = null;
  private readonly intervalMs: number;
  private readonly bonjourFactory: () => RoomDiscoveryBonjour;
  private readonly serviceName: string;
  private readonly servicePort: number;
  private intervalId: NodeJS.Timeout | null = null;
  private lastTxtSignature: string | null = null;

  constructor(options: {
    intervalMs?: number;
    bonjourFactory?: () => RoomDiscoveryBonjour;
    serviceName?: string;
    servicePort?: number;
  } = {}) {
    this.intervalMs = options.intervalMs ?? 10000;
    this.bonjourFactory = options.bonjourFactory ?? (() => new Bonjour(
      {},
      (error: Error) => console.warn(`[Room Discovery] mDNS error: ${error.message}`)
    ));
    this.serviceName = options.serviceName ?? `AI狼人杀-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.servicePort = options.servicePort ?? 3001;
  }

  startBroadcast(roomManager: RoomManager) {
    if (this.bonjour) return;

    this.bonjour = this.bonjourFactory();
    this.updateService(roomManager);

    if (this.intervalMs > 0) {
      this.intervalId = setInterval(() => {
        this.updateService(roomManager);
      }, this.intervalMs);
    }
  }

  private updateService(roomManager: RoomManager) {
    if (!this.bonjour) return;

    const rooms = roomManager.getAllRooms().filter(r => r.status === 'WAITING');
    const totalPlayers = rooms.reduce((sum, r) => sum + r.players.size, 0);
    const txt = {
      roomCount: String(rooms.length),
      playerCount: String(totalPlayers),
    };
    const txtSignature = `${txt.roomCount}:${txt.playerCount}`;

    if (this.service && txtSignature === this.lastTxtSignature) {
      return;
    }

    if (this.service) {
      this.bonjour.unpublishAll();
    }

    this.service = this.bonjour.publish({
      name: this.serviceName,
      type: 'ai-werewolf',
      port: this.servicePort,
      txt,
    });
    this.lastTxtSignature = txtSignature;
  }

  stopBroadcast() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.bonjour) {
      this.bonjour.unpublishAll();
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.service = null;
    this.lastTxtSignature = null;
  }
}
