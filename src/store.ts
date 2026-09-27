import { atom } from 'jotai';
import { sendWsMessage } from './multiplayer/wsClient';
import {
    gamePhaseAtom, playersAtom, logsAtom, gameTracesAtom, turnCountAtom, godStateAtom,
    gameHistoryAtom, gameConfigAtom, actorProfilesAtom,
    globalApiConfigAtom, appScreenAtom, isAutoPlayAtom, isTheaterModeAtom,
    isPlayingAudioAtom, currentSpeakerIdAtom, speakingQueueAtom,
    timelineAtom, replaySourceLogsAtom, isReplayModeAtom, areRolesVisibleAtom,
    gameArchivesAtom, isProcessingAtom, agentMessagesAtom,
    lastSavedArchiveAtom,
    llmPresetsAtom, ttsPresetsAtom,
    isHumanModeAtom, humanPlayerSeatAtom, userInputAtom, minimizedGameAtom,
    debugGodViewAtom,
    debugModeAtom, debugLogPanelOpenAtom,
    replayPausedAtom, replayProgressAtom, replayPerspectiveAtom, humanInputResolverMapAtom, cancelHumanInputAtom,
    gameResultAtom, gameEvaluationAtom,
    multiplayerRoleAtom, aiHostedPlayersAtom, multiplayerConnectionAtom, multiplayerStateAtom,
    isPausedAtom, guestRoleInfoAtom, actionAckStateAtom, DEFAULT_ACTORS, uiConfigAtom
} from './atoms';

import {
    GamePhase, Player, GameLog, GameSnapshot,
    GAME_PRESETS, Role, PlayerStatus, ROLE_INFO, GameArchive,
    DEFAULT_PHASE_PROMPTS, DEFAULT_GOD_STATE, GodState, pickRandomPersona
} from './types';
import { CURRENT_ARCHIVE_SCHEMA_VERSION, normalizeGameArchive, sanitizeTimelineForArchive } from './utils/archive';
import type { SyncedGameState } from './multiplayer/types';
import { DEFAULT_DISCONNECT_GRACE_MS } from './multiplayer/constants';

// Re-export everything from atoms
export * from './atoms';
export { DEFAULT_PHASE_PROMPTS, DEFAULT_GOD_STATE };

// --- Derived Atoms ---

export const isDaytimeAtom = atom((get) => {
    const phase = get(gamePhaseAtom);
    return [
        GamePhase.DAY_ANNOUNCE,
        GamePhase.LAST_WORDS,
        GamePhase.DAY_DISCUSSION,
        GamePhase.DISCUSSION_ROUND_TWO,
        GamePhase.SHERIFF_ELECTION,
        GamePhase.SHERIFF_VOTING,
        GamePhase.SHERIFF_WITHDRAW,
        GamePhase.VOTING,
        GamePhase.HUNTER_ACTION,
        GamePhase.KNIGHT_CHALLENGE,
        GamePhase.WOLF_EXPLODE,
        GamePhase.GAME_OVER,
        GamePhase.GAME_REVIEW
    ].includes(phase);
});

// --- Actions ---

const MAX_SNAPSHOT_COUNT = 20;
const MAX_SNAPSHOT_LOGS = 80;

const cloneForSnapshot = <T,>(value: T): T => structuredClone(value);

const slimLogsForSnapshot = (logs: GameLog[]): GameLog[] => logs.slice(-MAX_SNAPSHOT_LOGS).map(log => {
    const { debugData, thought, ...rest } = log;
    return rest;
});

const getPlayerActorCandidates = (actors: typeof DEFAULT_ACTORS, narratorId: string) => {
    const configuredCandidates = actors.filter(actor => actor.id !== narratorId);
    if (configuredCandidates.length > 0) return configuredCandidates;

    const fallbackCandidates = DEFAULT_ACTORS.filter(actor => actor.id !== narratorId);
    if (fallbackCandidates.length > 0) {
        console.warn('玩家配置中没有可用的非旁白角色，已使用内置玩家配置继续游戏。');
        return fallbackCandidates;
    }

    const fallbackActor = actors[0] ?? DEFAULT_ACTORS[0];
    console.warn('玩家配置中没有可用角色，已使用内置旁白配置作为临时玩家。');
    return [fallbackActor];
};

export const saveSnapshotAtom = atom(null, (get, set) => {
    try {
        const snapshot: GameSnapshot = {
            phase: get(gamePhaseAtom),
            players: cloneForSnapshot(get(playersAtom)),
            logs: cloneForSnapshot(slimLogsForSnapshot(get(logsAtom))),
            turn: get(turnCountAtom),
            godState: cloneForSnapshot(get(godStateAtom))
        };
        set(gameHistoryAtom, (prev) => [...prev.slice(-(MAX_SNAPSHOT_COUNT - 1)), snapshot]);
    } catch (error) {
        console.warn('保存游戏快照失败，已跳过本次快照，不影响游戏流程。', error);
    }
});

export const initGameAtom = atom(null, (get, set, presetKey: string) => {
    const preset = GAME_PRESETS.find(p => p.key === presetKey);
    if (!preset) {
        console.error(`未找到预设板子: ${presetKey}`);
        return;
    }
    const playerCount = preset.playerCount;
    const allActors = get(actorProfilesAtom);
    const narratorId = get(globalApiConfigAtom).narratorActorId;

    // Filter out narrator from players pool
    const playerCandidates = getPlayerActorCandidates(allActors, narratorId);

    // Reset Config
    set(gameConfigAtom, (prev) => ({
        ...prev,
        playerCount: preset.playerCount,
        roles: preset.roles,
        sheriffEnabled: preset.rules.sheriffElection,
        voteDetailPublic: preset.rules.voteDetailPublic,
        rules: preset.rules
    }));

    // Shuffle Roles
    const shuffledRoles = [...preset.roles];
    for (let i = shuffledRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
    }

    // Create Players with Actors
    const rolePrompts = get(gameConfigAtom).rolePrompts;

    // Shuffle Actors
    const shuffledActors = [...playerCandidates].sort(() => Math.random() - 0.5);

    // Randomly assign human seat if in human mode
    const isHumanMode = get(isHumanModeAtom);
    const humanSeat = isHumanMode ? Math.floor(Math.random() * playerCount) + 1 : -1;
    if (isHumanMode) {
        set(humanPlayerSeatAtom, humanSeat);
    }

    const newPlayers = Array.from({ length: playerCount }, (_, i) => {
        const seat = i + 1;
        const role = shuffledRoles[i];
        const potions = role === Role.WITCH ? { cure: true, poison: true } : undefined;
        // Fallback if not enough actors
        const actor = shuffledActors[i % shuffledActors.length];
        const isHuman = isHumanMode && seat === humanSeat;
        const randomPersona = get(uiConfigAtom).randomPersonaEachGame;

        return {
            id: seat,
            seatNumber: seat,
            role: role,
            status: PlayerStatus.ALIVE,
            avatarSeed: i + 100,
            rolePrompt: rolePrompts[role] || "",
            isSpeaking: false,
            actorId: actor.id,
            potions,
            isHuman,
            displayName: isHuman ? '你' : actor.name,
            stylePrompt: isHuman ? undefined : (randomPersona ? pickRandomPersona().prompt : actor.stylePrompt),
        };
    });

    set(playersAtom, newPlayers);

    // Reset Game State
    set(gamePhaseAtom, GamePhase.NIGHT_START);
    set(turnCountAtom, 1);
    set(logsAtom, [{
        id: 'sys-init',
        turn: 1,
        phase: GamePhase.NIGHT_START,
        content: `游戏开始。${playerCount} 人局 · ${preset.label}\n配置：${preset.roles.map(r => ROLE_INFO[r].label).join(' ')}`,
        timestamp: Date.now(),
        isSystem: true
    }]);
    set(gameTracesAtom, []);

    // Reset Timeline & Audio
    set(timelineAtom, []);
    set(replaySourceLogsAtom, []);
    set(gameHistoryAtom, []);
    set(gameResultAtom, null);
    set(isReplayModeAtom, false);
    set(isTheaterModeAtom, false);
    // Spectator-only games promise automatic progression from the home screen.
    // Human games still wait for explicit player input.
    set(isAutoPlayAtom, !isHumanMode);
    set(areRolesVisibleAtom, true); // Reset visibility to shown
    set(godStateAtom, { ...DEFAULT_GOD_STATE });
    set(speakingQueueAtom, []);
    set(currentSpeakerIdAtom, null);
    set(userInputAtom, null);
    set(humanInputResolverMapAtom, {});
    set(cancelHumanInputAtom);
    set(isPausedAtom, false);
    set(multiplayerRoleAtom, null);
    set(aiHostedPlayersAtom, {});
    set(appScreenAtom, 'GAME');

    // Save Initial Snapshot
    set(saveSnapshotAtom);
});

// 联机模式开始游戏：根据预设人数填充 AI 玩家，然后启动引擎
export const startMultiplayerGameAtom = atom(null, (get, set, { presetKey, roomPlayers, humanSeatNumber }: { presetKey: string; roomPlayers: { seatNumber: number | null; nickname: string; playerId: string; isHost: boolean }[]; humanSeatNumber?: number }) => {
    const preset = GAME_PRESETS.find(p => p.key === presetKey);
    if (!preset) {
        console.error(`未找到预设板子: ${presetKey}`);
        return;
    }
    const playerCount = preset.playerCount;
    const humanCount = roomPlayers.filter(rp => rp.playerId).length;
    if (humanCount < playerCount) {
        console.warn(`[联机] 人类玩家(${humanCount})不足板子人数(${playerCount})，剩余座位将由AI填充`);
    }
    const allActors = get(actorProfilesAtom);
    const narratorId = get(globalApiConfigAtom).narratorActorId;

    const playerCandidates = getPlayerActorCandidates(allActors, narratorId);

    set(gameConfigAtom, (prev) => ({
        ...prev,
        playerCount: preset.playerCount,
        roles: preset.roles,
        sheriffEnabled: preset.rules.sheriffElection,
        voteDetailPublic: preset.rules.voteDetailPublic,
        rules: preset.rules
    }));

    // 发牌必须用加密随机源：旧实现用房间玩家 ID 求和做 Math.sin 种子，
    // 而玩家 ID 在大厅状态里对所有人公开——任何客人都能离线推算出全部身份
    const secureRandom = (): number => {
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            const buf = new Uint32Array(1);
            crypto.getRandomValues(buf);
            return buf[0] / 4294967296;
        }
        return Math.random();
    };

    const shuffledRoles = [...preset.roles];
    for (let i = shuffledRoles.length - 1; i > 0; i--) {
        const j = Math.floor(secureRandom() * (i + 1));
        [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
    }

    const rolePrompts = get(gameConfigAtom).rolePrompts;
    const shuffledActors = [...playerCandidates].sort(() => Math.random() - 0.5);

    const roomPlayerBySeat = new Map<number, { nickname: string; playerId: string; isHost: boolean }>();
    for (const rp of roomPlayers) {
        if (rp.playerId && rp.seatNumber != null) {
            roomPlayerBySeat.set(rp.seatNumber, { nickname: rp.nickname, playerId: rp.playerId, isHost: rp.isHost });
        }
    }

    const newPlayers = Array.from({ length: playerCount }, (_, i) => {
        const seat = i + 1;
        const role = shuffledRoles[i];
        const potions = role === Role.WITCH ? { cure: true, poison: true } : undefined;
        const actor = shuffledActors[i % shuffledActors.length];

        const roomPlayer = roomPlayerBySeat.get(seat);
        const isHuman = roomPlayer !== undefined;
        const randomPersona = get(uiConfigAtom).randomPersonaEachGame;

        return {
            id: seat,
            seatNumber: seat,
            role: role,
            status: PlayerStatus.ALIVE,
            avatarSeed: i + 100,
            rolePrompt: rolePrompts[role] || "",
            isSpeaking: false,
            actorId: actor.id,
            potions,
            isHuman,
            displayName: roomPlayer?.nickname ?? actor.name,
            roomPlayerId: roomPlayer?.playerId ?? null,
            stylePrompt: isHuman ? undefined : (randomPersona ? pickRandomPersona().prompt : actor.stylePrompt),
        };
    });

    set(playersAtom, newPlayers);

    // Reset Game State
    set(gamePhaseAtom, GamePhase.NIGHT_START);
    set(turnCountAtom, 1);
    set(logsAtom, [{
        id: 'sys-multi',
        turn: 1,
        phase: GamePhase.NIGHT_START,
        content: `联机游戏开始。${playerCount} 人局 · ${preset.label}\n配置：${preset.roles.map(r => ROLE_INFO[r].label).join(' ')}`,
        timestamp: Date.now(),
        isSystem: true
    }]);
    set(gameTracesAtom, []);

    set(speakingQueueAtom, []);
    set(currentSpeakerIdAtom, null);
    set(userInputAtom, null);
    set(humanInputResolverMapAtom, {});
    set(cancelHumanInputAtom);

    // Reset Timeline & Replay
    set(timelineAtom, []);
    set(replaySourceLogsAtom, []);
    set(gameHistoryAtom, []);
    set(gameResultAtom, null);
    set(isReplayModeAtom, false);
    set(isTheaterModeAtom, false);
    set(isAutoPlayAtom, true);
    set(areRolesVisibleAtom, true);
    set(godStateAtom, { ...DEFAULT_GOD_STATE });
    set(isPausedAtom, false);
    set(multiplayerRoleAtom, 'host');
    set(multiplayerStateAtom, prev => ({ ...prev, status: 'IN_GAME', isHost: true }));
    set(multiplayerConnectionAtom, {
        isConnected: true,
        disconnectedAt: null,
        reconnectTimeout: DEFAULT_DISCONNECT_GRACE_MS,
        disconnectedPlayerId: null,
        disconnectedPlayerNickname: null
    });
    set(aiHostedPlayersAtom, {});
    // 联机游戏不切换 appScreen，保持 MultiplayerView 挂载以维持 SSE 连接
    set(appScreenAtom, 'MULTIPLAYER');
    set(saveSnapshotAtom);
});



export const exitGameAtom = atom(null, (get, set) => {
    import('./services/mcpBrain').then(m => m.notifyBridgeGameOver()).catch(() => {});
    set(appScreenAtom, 'HOME');
    set(minimizedGameAtom, { enabled: false });
    set(isAutoPlayAtom, false);
    set(isTheaterModeAtom, false);
    set(isReplayModeAtom, false);
    set(isProcessingAtom, false);
    set(isPlayingAudioAtom, false);
    set(gamePhaseAtom, GamePhase.SETUP);
    set(playersAtom, []);
    set(logsAtom, []);
    set(gameTracesAtom, []);
    set(timelineAtom, []);
    set(replaySourceLogsAtom, []);
    set(gameHistoryAtom, []);
    set(gameResultAtom, null);
    set(gameEvaluationAtom, null);
    set(replayPausedAtom, false);
    set(replayProgressAtom, { current: 0, total: 0, isFinished: false });
    set(speakingQueueAtom, []);
    set(currentSpeakerIdAtom, null);
    set(userInputAtom, null);
    set(humanInputResolverMapAtom, {});
    set(cancelHumanInputAtom);
    set(godStateAtom, { ...DEFAULT_GOD_STATE });
    set(areRolesVisibleAtom, true);
    set(isPausedAtom, false);
    set(guestRoleInfoAtom, null);
    set(actionAckStateAtom, { pending: false, actionType: '', success: null, timestamp: 0 });
    set(multiplayerRoleAtom, null);
    set(aiHostedPlayersAtom, {});
    // 模式选择一并重置：主页模式卡回到中性（无高亮），下次点燃营火默认旁观生存
    set(isHumanModeAtom, false);
    set(multiplayerConnectionAtom, {
        isConnected: true,
        disconnectedAt: null,
        reconnectTimeout: DEFAULT_DISCONNECT_GRACE_MS,
        disconnectedPlayerId: null,
        disconnectedPlayerNickname: null
    });
    set(multiplayerStateAtom, { status: 'LOBBY', roomId: null, playerId: null, nickname: null, isHost: false, hostPlayerId: null, sessionToken: null });
});

// Add current game to Archives
export const saveGameArchiveAtom = atom(null, async (get, set, winner: 'GOOD' | 'WOLF' | 'THIRD_PARTY') => {
    const existingLogs = get(logsAtom);
    if (existingLogs.length === 0) return;

    // Check if already saved to avoid duplicates
    let archivesRaw = get(gameArchivesAtom);
    if (archivesRaw instanceof Promise) {
        archivesRaw = await archivesRaw;
    }
    const archives = (Array.isArray(archivesRaw) ? archivesRaw : []).map(normalizeGameArchive);

    const lastArchive = archives[archives.length - 1];

    // Simple debounce: if we saved in the last 5 seconds, ignore
    if (lastArchive && (Date.now() - lastArchive.timestamp) < 5000) return;

    const publicLogs = existingLogs.filter(log => !log.visibleTo?.length && !log.debugType);
    const debugLogs = existingLogs.filter(log => !!log.debugType || !!log.debugData);
    const keyEvents = existingLogs
        .filter(log => log.isSystem && (
            /游戏结算|胜利阵营|死亡|出局|放逐|警长|平票|警徽|投票结果|猎人开枪|天亮|昨夜/.test(log.content)
            || log.debugType === 'VOTE_TALLY'
        ))
        .slice(-24)
        .map(log => `Day ${log.turn} · ${log.content.split('\n')[0]}`);
    const archiveLogs = existingLogs.map(log => {
        if (!log.debugData) return log;
        const { rawResponse, promptContext, ...debugDataRest } = log.debugData;
        return {
            ...log,
            debugData: debugDataRest,
            debugRawResponseSaved: !!rawResponse,
            debugPromptContextSaved: !!promptContext
        } as GameLog & { debugRawResponseSaved?: boolean; debugPromptContextSaved?: boolean };
    });

    const archiveTimeline = sanitizeTimelineForArchive(get(timelineAtom));

    const archive: GameArchive = {
        schemaVersion: CURRENT_ARCHIVE_SCHEMA_VERSION,
        id: `game-${Date.now()}`,
        timestamp: Date.now(),
        duration: 0,
        playerCount: get(playersAtom).length,
        winner: winner,
        roles: get(gameConfigAtom).roles,
        result: get(gameResultAtom),
        keyEvents,
        debugLogCount: debugLogs.length,
        publicLogCount: publicLogs.length,
        isMultiplayer: get(multiplayerRoleAtom) !== null,
        logs: structuredClone(archiveLogs),
        timeline: structuredClone(archiveTimeline),
        players: structuredClone(get(playersAtom)),
        turnCount: get(turnCountAtom)
    };

    const allArchives = [...archives, archive];
    const MAX_ARCHIVES = 100;
    set(gameArchivesAtom, allArchives.length > MAX_ARCHIVES ? allArchives.slice(allArchives.length - MAX_ARCHIVES) : allArchives);
    set(lastSavedArchiveAtom, archive);
});



export const loadGameArchiveAtom = atom(null, (get, set, archive: GameArchive) => {
    // 1. Reset State
    const gameArchive = normalizeGameArchive(archive);
    // 1. Reset Players to ALIVE state to allow for a true "Replay"
    const initialPlayers: Player[] = gameArchive.players.map(p => ({
        ...p,
        status: PlayerStatus.ALIVE,
        isSpeaking: false
    }));

    set(playersAtom, initialPlayers);
    set(gameResultAtom, gameArchive.result ?? null);
    // 存档里没有评分数据，避免回放框显示上一局 live 对局残留的 gameEvaluation
    set(gameEvaluationAtom, null);

    // 2. Setup Replay Logic
    set(logsAtom, []);
    set(replaySourceLogsAtom, gameArchive.logs); // The full script
    set(replayPausedAtom, false);
    set(replayProgressAtom, { current: 0, total: gameArchive.logs.length, isFinished: false });

    // 3. Reset Game State for Replay
    set(turnCountAtom, 1);
    // Attempt to set start phase from first log, or default
    const startPhase = gameArchive.logs[0]?.phase || GamePhase.NIGHT_START;
    set(gamePhaseAtom, startPhase);

    set(appScreenAtom, 'GAME');

    set(timelineAtom, gameArchive.timeline); // The audio keys

    // 4. Reset Control State
    set(isAutoPlayAtom, false);
    set(isProcessingAtom, false);
    set(isTheaterModeAtom, true);
    set(isReplayModeAtom, true); // Mark as Replay Mode to hide game controls
    set(isPlayingAudioAtom, false);
    set(currentSpeakerIdAtom, null);
    set(areRolesVisibleAtom, true); // Reveal roles for replay
    // 视角必须重置：上一局回放结束时可能已切到上帝视角，不重置会让下一局从开场就全明牌
    set(replayPerspectiveAtom, 'GOOD');
});

export const restoreSnapshotAtom = atom(null, (get, set, snapshot: GameSnapshot) => {
    set(gamePhaseAtom, snapshot.phase);
    set(playersAtom, structuredClone(snapshot.players));
    set(logsAtom, structuredClone(snapshot.logs));
    set(turnCountAtom, snapshot.turn);
    set(godStateAtom, structuredClone(snapshot.godState));
    set(isReplayModeAtom, true);
});

// 联机客人模式：设置基础信息（不运行引擎，等房主同步状态）
export const setupMultiplayerGameAtom = atom(null, (get, set, { presetKey, roomPlayers, isHost, myPlayerId }: { presetKey: string; roomPlayers: { seatNumber: number | null; nickname: string; playerId: string; isHost: boolean }[]; isHost: boolean; myPlayerId?: string }) => {
    const preset = GAME_PRESETS.find(p => p.key === presetKey);
    if (!preset) {
        console.error(`未找到预设板子: ${presetKey}`);
        return;
    }
    const playerCount = preset.playerCount;
    const allActors = get(actorProfilesAtom);
    const narratorId = get(globalApiConfigAtom).narratorActorId;
    const playerCandidates = getPlayerActorCandidates(allActors, narratorId);
    const shuffledActors = [...playerCandidates].sort(() => Math.random() - 0.5);

    const roomPlayerBySeat = new Map<number, { nickname: string; playerId: string; isHost: boolean }>();
    for (const rp of roomPlayers) {
        if (rp.seatNumber != null) {
            roomPlayerBySeat.set(rp.seatNumber, { nickname: rp.nickname, playerId: rp.playerId, isHost: rp.isHost });
        }
    }

    const placeholderPlayers: Player[] = Array.from({ length: playerCount }, (_, i) => {
        const seat = i + 1;
        const roomPlayer = roomPlayerBySeat.get(seat);
        const actor = shuffledActors[i % shuffledActors.length];
        const isMe = myPlayerId && roomPlayer?.playerId === myPlayerId;
        return {
            id: seat,
            seatNumber: seat,
            role: Role.VILLAGER,
            status: PlayerStatus.ALIVE,
            avatarSeed: i + 100,
            rolePrompt: '',
            isSpeaking: false,
            actorId: actor.id,
            isHuman: !!isMe,
            displayName: roomPlayer?.nickname ?? actor.name,
            roomPlayerId: roomPlayer?.playerId ?? null
        };
    });

    set(playersAtom, placeholderPlayers);
    set(gamePhaseAtom, GamePhase.NIGHT_START);
    set(turnCountAtom, 1);
    set(logsAtom, [{
        id: 'sys-multi-wait',
        turn: 1,
        phase: GamePhase.NIGHT_START,
        content: `正在等待房主开始游戏...\n${playerCount} 人局 · ${preset.label}`,
        timestamp: Date.now(),
        isSystem: true
    }]);
    set(godStateAtom, { ...DEFAULT_GOD_STATE });
    set(isReplayModeAtom, false);
    set(isTheaterModeAtom, false);
    set(isAutoPlayAtom, false);
    set(areRolesVisibleAtom, true);
    set(speakingQueueAtom, []);
    set(currentSpeakerIdAtom, null);
    set(userInputAtom, null);
    set(humanInputResolverMapAtom, {});
    set(cancelHumanInputAtom);
    set(isPausedAtom, false);
    set(multiplayerRoleAtom, isHost ? 'host' : 'guest');
    set(multiplayerStateAtom, prev => ({ ...prev, status: 'IN_GAME', isHost }));
    set(multiplayerConnectionAtom, {
        isConnected: true,
        disconnectedAt: null,
        reconnectTimeout: DEFAULT_DISCONNECT_GRACE_MS,
        disconnectedPlayerId: null,
        disconnectedPlayerNickname: null
    });
    set(aiHostedPlayersAtom, {});
    // 联机游戏不切换 appScreen，保持 MultiplayerView 挂载以维持 SSE 连接
    set(appScreenAtom, 'MULTIPLAYER');
});

// 应用房主同步的游戏状态（客人专用）
export const applyGameStateAtom = atom(null, (get, set, gameState: SyncedGameState) => {
    const myPlayerId = get(multiplayerStateAtom).playerId;
    const correctedPlayers = gameState.players.map((p: any) => ({
        ...p,
        isHuman: p.roomPlayerId === myPlayerId
    }));
    set(playersAtom, correctedPlayers);

    if (gameState.logs) {
        set(logsAtom, gameState.logs);
    }

    set(gamePhaseAtom, gameState.phase as GamePhase);
    set(turnCountAtom, gameState.turnCount);
    set(godStateAtom, gameState.godState as GodState);
    if (get(multiplayerRoleAtom) === 'host') {
        set(isAutoPlayAtom, gameState.isAutoPlay);
    }
    set(currentSpeakerIdAtom, gameState.currentSpeakerId);
    set(areRolesVisibleAtom, gameState.areRolesVisible);
    if (gameState.gameResult !== undefined) {
        set(gameResultAtom, gameState.gameResult);
    }
    if (gameState.gameEvaluation !== undefined) {
        set(gameEvaluationAtom, gameState.gameEvaluation);
    }
    if (gameState.isPaused !== undefined && get(multiplayerRoleAtom) !== null) {
        set(isPausedAtom, gameState.isPaused);
    }
});

export const applyHostGameStateAtom = atom(null, (get, set, gameState: SyncedGameState) => {
    set(playersAtom, structuredClone(gameState.players));

    if (gameState.logs) {
        set(logsAtom, structuredClone(gameState.logs));
    }

    set(gamePhaseAtom, gameState.phase as GamePhase);
    set(turnCountAtom, gameState.turnCount);
    set(godStateAtom, structuredClone(gameState.godState) as GodState);
    set(isAutoPlayAtom, gameState.isAutoPlay);
    set(currentSpeakerIdAtom, gameState.currentSpeakerId);
    set(areRolesVisibleAtom, gameState.areRolesVisible);
    set(isPausedAtom, gameState.isPaused);
    set(isReplayModeAtom, false);
    set(isTheaterModeAtom, false);
    set(multiplayerRoleAtom, 'host');
    set(appScreenAtom, 'MULTIPLAYER');
    if (gameState.gameResult !== undefined) {
        set(gameResultAtom, gameState.gameResult);
    }
    if (gameState.gameEvaluation !== undefined) {
        set(gameEvaluationAtom, gameState.gameEvaluation);
    }
});

export const hostExitGameAtom = atom(null, async (get, set, { roomId, playerId }: { roomId: string; playerId: string }) => {
    try {
        sendWsMessage({ type: 'HOST_EXIT' });
    } catch (e) {
        console.error('房主退出失败:', e);
    }
    set(multiplayerRoleAtom, null);
    set(appScreenAtom, 'HOME');
    set(exitGameAtom);
});

// AI 托管切换
export const toggleAIHostingAtom = atom(null, (get, set, { seatNumber, enabled }: { seatNumber: number; enabled: boolean }) => {
    set(aiHostedPlayersAtom, (prev) => {
        const next = { ...prev };
        if (enabled) {
            next[seatNumber] = true;
        } else {
            delete next[seatNumber];
        }
        return next;
    });

    const player = get(playersAtom).find(p => p.seatNumber === seatNumber);
    if (player) {
        set(logsAtom, (prev) => [...prev, {
            id: `sys-ai-host-${seatNumber}-${Date.now()}`,
            turn: get(turnCountAtom),
            phase: get(gamePhaseAtom),
            content: `${player.displayName ?? player.id}号玩家已${enabled ? '由AI托管' : '解除AI托管'}`,
            timestamp: Date.now(),
            isSystem: true
        }]);
    }
});
