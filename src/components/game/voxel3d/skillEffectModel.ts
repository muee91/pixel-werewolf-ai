// Pure skill-effect model — no React, no Three.js, no atom/godState reads.
// Consumes only visibility-trimmed logs, visible players, and viewer context.

import { Role, GamePhase } from '../../../types';

// ── Types ──────────────────────────────────────────────────

export type SkillEffectVisibility = 'neutral' | 'role' | 'omniscient';

export type SkillEffectKind =
  | 'slash'
  | 'mist'
  | 'ring'
  | 'crystal'
  | 'orb'
  | 'beam'
  | 'heal'
  | 'poison'
  | 'shield'
  | 'shot'
  | 'sword'
  | 'flame'
  | 'explosion'
  | 'moon'
  | 'seal'
  | 'stone'
  | 'gaze'
  | 'bow'
  | 'arrow'
  | 'heart'
  | 'rune'
  | 'amulet'
  | 'ripple'
  | 'spark'
  | 'neutral_whisper'
  | 'neutral_wind'
  | 'neutral_flicker';

export interface RoleEffectConfig {
  effectKind: SkillEffectKind;
  audioCue: string;
  durationMs: number;
  color: string;
  secondaryColor: string;
}

export interface SkillEffectEvent {
  eventId: string;
  turn: number;
  phase: string;
  visibility: SkillEffectVisibility;
  effectKind: SkillEffectKind;
  audioCue: string;
  durationMs: number;
  color: string;
  secondaryColor: string;
  casterId?: number;
  targetIds?: number[];
  role?: Role;
}

export interface VisiblePlayerRole {
  id: number;
  role: Role;
}

export interface ViewerContext {
  isOmniscient: boolean;
  isActor: boolean;
  actorId: number | null;
  viewerRole: Role | null; // null for spectators / omniscient
}

// ── All current role effect configs ────────────────────────

export const ROLE_EFFECT_CONFIGS: Record<Role, RoleEffectConfig> = {
  [Role.WEREWOLF]: {
    effectKind: 'slash',
    audioCue: 'wolf_slash',
    durationMs: 1200,
    color: '#b31923', secondaryColor: '#3a1016',
  },
  [Role.VILLAGER]: {
    effectKind: 'spark',
    audioCue: 'villager_spark',
    durationMs: 800,
    color: '#f6b443', secondaryColor: '#d8b36d',
  },
  [Role.SEER]: {
    effectKind: 'crystal',
    audioCue: 'seer_crystal',
    durationMs: 1500,
    color: '#8b7cf6', secondaryColor: '#4ad8ff',
  },
  [Role.WITCH]: {
    effectKind: 'orb',
    audioCue: 'witch_brew',
    durationMs: 1500,
    color: '#a855f7', secondaryColor: '#46d17d',
  },
  [Role.HUNTER]: {
    effectKind: 'shot',
    audioCue: 'hunter_shot',
    durationMs: 1000,
    color: '#f28c28', secondaryColor: '#ffe09a',
  },
  [Role.GUARD]: {
    effectKind: 'shield',
    audioCue: 'guard_shield',
    durationMs: 1500,
    color: '#4da3ff', secondaryColor: '#b8e4ff',
  },
  [Role.IDIOT]: {
    effectKind: 'amulet',
    audioCue: 'idiot_amulet',
    durationMs: 1200,
    color: '#45d6c6', secondaryColor: '#d7fff8',
  },
  [Role.WOLF_KING]: {
    effectKind: 'ring',
    audioCue: 'wolf_king_ring',
    durationMs: 1500,
    color: '#d23b32', secondaryColor: '#f6b443',
  },
  [Role.KNIGHT]: {
    effectKind: 'sword',
    audioCue: 'knight_sword',
    durationMs: 2000,
    color: '#ffd45c', secondaryColor: '#fff3c4',
  },
  [Role.STONE_GHOST]: {
    effectKind: 'gaze',
    audioCue: 'stone_ghost_gaze',
    durationMs: 1500,
    color: '#8d849a', secondaryColor: '#5b4b70',
  },
  [Role.WHITE_WOLF_KING]: {
    effectKind: 'explosion',
    audioCue: 'white_wolf_explosion',
    durationMs: 1200,
    color: '#f1f5ff', secondaryColor: '#d85b5b',
  },
  [Role.BLOOD_MOON_DISCIPLE]: {
    effectKind: 'seal',
    audioCue: 'blood_moon_seal',
    durationMs: 2000,
    color: '#8d102d', secondaryColor: '#d6405f',
  },
  [Role.GRAVEKEEPER]: {
    effectKind: 'flame',
    audioCue: 'gravekeeper_flame',
    durationMs: 1500,
    color: '#6bb6a8', secondaryColor: '#718096',
  },
  [Role.DEMON_HUNTER]: {
    effectKind: 'bow',
    audioCue: 'demon_hunter_bow',
    durationMs: 1200,
    color: '#d99532', secondaryColor: '#f6cf72',
  },
  [Role.CUPID]: {
    effectKind: 'heart',
    audioCue: 'cupid_heart',
    durationMs: 1500,
    color: '#ff6fae', secondaryColor: '#ffd0e4',
  },
  [Role.MIRACLE_MERCHANT]: {
    effectKind: 'rune',
    audioCue: 'merchant_rune',
    durationMs: 1500,
    color: '#4fd19b', secondaryColor: '#f6d36f',
  },
};

// ── Phase → acting-role mapping ────────────────────────────

export const PHASE_TO_ROLE: Partial<Record<GamePhase, Role>> = {
  [GamePhase.WEREWOLF_ACTION]: Role.WEREWOLF,
  [GamePhase.SEER_ACTION]: Role.SEER,
  [GamePhase.WITCH_ACTION]: Role.WITCH,
  [GamePhase.GUARD_ACTION]: Role.GUARD,
  [GamePhase.HUNTER_ACTION]: Role.HUNTER,
  [GamePhase.KNIGHT_CHALLENGE]: Role.KNIGHT,
  [GamePhase.WOLF_EXPLODE]: Role.WEREWOLF,
  [GamePhase.STONE_GHOST_ACTION]: Role.STONE_GHOST,
  [GamePhase.GRAVEKEEPER_ACTION]: Role.GRAVEKEEPER,
  [GamePhase.DEMON_HUNTER_ACTION]: Role.DEMON_HUNTER,
  [GamePhase.CUPID_LINK]: Role.CUPID,
  [GamePhase.MERCHANT_ACTION]: Role.MIRACLE_MERCHANT,
};

// ── Public event phases (visible to all perspectives) ──────

export const PUBLIC_EVENT_PHASES: Set<GamePhase> = new Set([
  GamePhase.WOLF_EXPLODE,
  GamePhase.KNIGHT_CHALLENGE,
  GamePhase.HUNTER_ACTION,
]);

// ── Neutral presentation constants ─────────────────────────

const NEUTRAL_EFFECT_KIND: SkillEffectKind = 'neutral_whisper';
const NEUTRAL_AUDIO_CUE = 'neutral_ambient';
const NEUTRAL_DURATION_MS = 1000;

// ── Log-content-based public event detection ───────────────

const IDIOT_REVEAL_KEYWORDS = ['白痴翻牌', '翻牌存活', '白痴身份'];

interface ParsedAction {
  sourceId: string;
  sourceTurn: number;
  role: Role;
  casterId?: number;
  targetIds: number[];
  isPublic: boolean;
}

function parseActionFromLog(
  log: { id: string; turn: number; phase: GamePhase; content: string; speakerId?: number },
): ParsedAction | null {
  if (/请(?:睁眼|闭眼)/.test(log.content)) return null;
  const phase = log.phase;
  let role = PHASE_TO_ROLE[phase];
  if (!role) return null;

  if (phase === GamePhase.WOLF_EXPLODE) {
    if (log.content.includes('白狼王')) role = Role.WHITE_WOLF_KING;
    else if (log.content.includes('血月使徒')) role = Role.BLOOD_MOON_DISCIPLE;
    else if (log.content.includes('狼王')) role = Role.WOLF_KING;
  } else if (phase === GamePhase.HUNTER_ACTION && log.content.includes('狼王')) {
    role = Role.WOLF_KING;
  }

  const isPublic = PUBLIC_EVENT_PHASES.has(phase);
  const casterId = log.speakerId;
  const targetIds = parseTargetIdsFromContent(log.content, casterId ?? null);

  return { sourceId: log.id, sourceTurn: log.turn, role, casterId, targetIds, isPublic };
}

function parseTargetIdsFromContent(content: string, casterId: number | null): number[] {
  const ids: number[] = [];
  const patterns = [
    /玩家\s*(\d+)/g,
    /目标\s*(\d+)/g,
    /#(\d+)/g,
    /Player\s+(\d+)/gi,
    /(\d+)号/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0; // reset global regex state
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const id = parseInt(match[1], 10);
      if (id > 0 && id !== casterId && !ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

function detectIdiotReveal(logs: Array<{ id: string; turn: number; phase: GamePhase; content: string; speakerId?: number }>): ParsedAction | null {
  for (const log of logs) {
    const content = log.content;
    if (IDIOT_REVEAL_KEYWORDS.some((kw) => content.includes(kw))) {
      return {
        sourceId: log.id,
        sourceTurn: log.turn,
        role: Role.IDIOT,
        casterId: log.speakerId,
        targetIds: [],
        isPublic: true,
      };
    }
  }
  return null;
}

// ── Deterministic event ID ─────────────────────────────────

function makeEventId(
  sourceId: string,
  turn: number,
  phase: string,
  effectKind: string,
  visibility: string,
  index: number,
): string {
  const safeSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-80);
  return `evt-${turn}-${phase}-${safeSourceId}-${effectKind}-${visibility}-${index}`;
}

// ── buildSkillEffectEvents ─────────────────────────────────

export function buildSkillEffectEvents(
  visibleLogs: Array<{ id: string; phase: GamePhase; turn: number; content: string; speakerId?: number }>,
  visiblePlayers: VisiblePlayerRole[],
  viewer: ViewerContext,
  currentPhase: GamePhase,
  turn: number,
): SkillEffectEvent[] {
  const events: SkillEffectEvent[] = [];

  // 1. Check for idiot reveal through log content
  const idiotAction = detectIdiotReveal(visibleLogs);
  if (idiotAction) {
    events.push(makeEventFromAction(idiotAction, viewer, currentPhase, turn, events.length));
  }

  // 2. Process logs for phase-mapped actions
  for (const log of visibleLogs) {
    const action = parseActionFromLog(log);
    if (!action) continue;

    // Check for WHITE_WOLF_KING override in WOLF_EXPLODE
    if (action.role === Role.WEREWOLF && log.phase === GamePhase.WOLF_EXPLODE) {
      // White wolf king gets its own config when exploding
      // We check if the caster's role (from visible players) is WHITE_WOLF_KING
      const casterVisible = visiblePlayers.find((p) => p.id === action.casterId);
      if (casterVisible?.role === Role.WHITE_WOLF_KING) {
        const whiteWolfAction: ParsedAction = {
          sourceId: action.sourceId,
          sourceTurn: action.sourceTurn,
          role: Role.WHITE_WOLF_KING,
          casterId: action.casterId,
          targetIds: action.targetIds,
          isPublic: true,
        };
        events.push(makeEventFromAction(whiteWolfAction, viewer, currentPhase, turn, events.length));
        continue;
      }
    }

    events.push(makeEventFromAction(action, viewer, currentPhase, turn, events.length));
  }

  return events;
}

export function buildSkillEffectEventFromLog(
  visibleLog: { id: string; phase: GamePhase; turn: number; content: string; speakerId?: number },
  visiblePlayers: VisiblePlayerRole[],
  viewer: ViewerContext,
): SkillEffectEvent | null {
  const idiotAction = detectIdiotReveal([visibleLog]);
  const action = idiotAction ?? parseActionFromLog(visibleLog);
  if (!action) return null;

  if (action.casterId === undefined && (viewer.isOmniscient || viewer.isActor)) {
    const matchingCasters = visiblePlayers.filter(player => player.role === action.role);
    if (matchingCasters.length === 1) action.casterId = matchingCasters[0].id;
  }

  if (action.role === Role.WEREWOLF && visibleLog.phase === GamePhase.WOLF_EXPLODE) {
    const casterRole = visiblePlayers.find(player => player.id === action.casterId)?.role;
    if (casterRole === Role.WHITE_WOLF_KING || casterRole === Role.BLOOD_MOON_DISCIPLE) {
      action.role = casterRole;
    }
  }

  return makeEventFromAction(action, viewer, visibleLog.phase, visibleLog.turn, 0);
}

function makeEventFromAction(
  action: ParsedAction,
  viewer: ViewerContext,
  phase: GamePhase,
  turn: number,
  index: number,
): SkillEffectEvent {
  const config = ROLE_EFFECT_CONFIGS[action.role];
  const isPublic = action.isPublic || PUBLIC_EVENT_PHASES.has(phase);

  // Determine visibility
  let visibility: SkillEffectVisibility;
  if (viewer.isOmniscient) {
    visibility = 'omniscient';
  } else if (isPublic) {
    visibility = 'role'; // public events show role to all
  } else if (
    viewer.isActor &&
    viewer.viewerRole === action.role &&
    (action.casterId === undefined || action.casterId === viewer.actorId)
  ) {
    visibility = 'role';
  } else {
    visibility = 'neutral';
  }

  // Build event
  if (visibility === 'neutral') {
    return {
      eventId: makeEventId(action.sourceId, action.sourceTurn, phase, NEUTRAL_EFFECT_KIND, 'neutral', index),
      turn: action.sourceTurn,
      phase,
      visibility: 'neutral',
      effectKind: NEUTRAL_EFFECT_KIND,
      audioCue: NEUTRAL_AUDIO_CUE,
      durationMs: NEUTRAL_DURATION_MS,
      color: '#9aab9f',
      secondaryColor: '#d8cba8',
    };
  }

  return {
    eventId: makeEventId(action.sourceId, action.sourceTurn, phase, config.effectKind, visibility, index),
    turn: action.sourceTurn,
    phase,
    visibility,
    effectKind: config.effectKind,
    audioCue: config.audioCue,
    durationMs: config.durationMs,
    color: config.color,
    secondaryColor: config.secondaryColor,
    casterId: action.casterId ?? viewer.actorId ?? undefined,
    targetIds: action.targetIds.length > 0 ? action.targetIds : undefined,
    role: action.role,
  };
}

// ── getPhaseDefaultEffects ─────────────────────────────────

export function getPhaseDefaultEffects(
  phase: GamePhase,
  turn: number,
): SkillEffectEvent[] {
  const defaults: Partial<Record<GamePhase, { effectKind: SkillEffectKind; audioCue: string; durationMs: number }>> = {
    [GamePhase.NIGHT_START]: { effectKind: 'neutral_wind', audioCue: 'neutral_ambient', durationMs: 2000 },
    [GamePhase.DAY_ANNOUNCE]: { effectKind: 'neutral_flicker', audioCue: 'neutral_ambient', durationMs: 1500 },
    [GamePhase.DAY_DISCUSSION]: { effectKind: 'neutral_flicker', audioCue: 'neutral_ambient', durationMs: 1000 },
    [GamePhase.VOTING]: { effectKind: 'neutral_whisper', audioCue: 'neutral_ambient', durationMs: 1000 },
    [GamePhase.SHERIFF_ELECTION]: { effectKind: 'spark', audioCue: 'neutral_ambient', durationMs: 1200 },
    [GamePhase.SHERIFF_VOTING]: { effectKind: 'neutral_whisper', audioCue: 'neutral_ambient', durationMs: 1000 },
    [GamePhase.LAST_WORDS]: { effectKind: 'neutral_wind', audioCue: 'neutral_ambient', durationMs: 1500 },
    [GamePhase.GAME_OVER]: { effectKind: 'neutral_flicker', audioCue: 'neutral_ambient', durationMs: 3000 },
    [GamePhase.GAME_REVIEW]: { effectKind: 'neutral_flicker', audioCue: 'neutral_ambient', durationMs: 2000 },
    [GamePhase.DISCUSSION_ROUND_TWO]: { effectKind: 'neutral_flicker', audioCue: 'neutral_ambient', durationMs: 1000 },
    [GamePhase.SHERIFF_WITHDRAW]: { effectKind: 'neutral_whisper', audioCue: 'neutral_ambient', durationMs: 800 },
    [GamePhase.SETUP]: { effectKind: 'neutral_wind', audioCue: 'neutral_ambient', durationMs: 1000 },
  };

  const cfg = defaults[phase] ?? (PHASE_TO_ROLE[phase]
    ? { effectKind: NEUTRAL_EFFECT_KIND, audioCue: NEUTRAL_AUDIO_CUE, durationMs: NEUTRAL_DURATION_MS }
    : undefined);
  if (!cfg) return [];

  return [{
    eventId: makeEventId(`phase-${turn}-${phase}`, turn, phase, cfg.effectKind, 'neutral', 0),
    turn,
    phase,
    visibility: 'neutral',
    effectKind: cfg.effectKind,
    audioCue: cfg.audioCue,
    durationMs: cfg.durationMs,
    color: '#9aab9f',
    secondaryColor: '#d8cba8',
  }];
}

// ── Utilities ──────────────────────────────────────────────

export function getRoleEffectConfig(role: Role): RoleEffectConfig {
  return ROLE_EFFECT_CONFIGS[role];
}

export function isPublicEventPhase(phase: GamePhase): boolean {
  return PUBLIC_EVENT_PHASES.has(phase);
}
