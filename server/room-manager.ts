import { Server } from 'http';
import type { Socket } from 'net';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { hostname } from 'os';
import { Bonjour } from 'bonjour-service';

const SCRYPT_KEY_LENGTH = 32;

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

  createRoom(hostIp: string, roomName: string, hostNickname: string, presetKey: string = '8-standard', maxPlayers: number = 12, password?: string): GameRoom {
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
    });

    this.rooms.set(roomId, room);

    if (!this.roomsByIp.has(hostIp)) {
      this.roomsByIp.set(hostIp, new Set());
    }
    this.roomsByIp.get(hostIp)!.add(roomId);

    return room;
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
