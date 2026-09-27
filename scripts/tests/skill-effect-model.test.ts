import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROLE_EFFECT_CONFIGS,
  buildSkillEffectEvents,
  getPhaseDefaultEffects,
  getRoleEffectConfig,
  isPublicEventPhase,
  PHASE_TO_ROLE,
  PUBLIC_EVENT_PHASES,
  type SkillEffectEvent,
  type ViewerContext,
  type VisiblePlayerRole,
} from '../../src/components/game/voxel3d/skillEffectModel';
import { Role, GamePhase } from '../../src/types';

// ── helpers ──────────────────────────────────────────────

const ALL_ROLES: Role[] = Object.values(Role);

interface StubLog {
  id: string;
  turn: number;
  phase: GamePhase;
  speakerId?: number;
  content: string;
}

const makeLog = (overrides: Partial<StubLog> = {}): StubLog => ({
  id: `log-${overrides.turn ?? 1}-${overrides.phase ?? GamePhase.WEREWOLF_ACTION}`,
  turn: overrides.turn ?? 1,
  phase: overrides.phase ?? GamePhase.WEREWOLF_ACTION,
  speakerId: overrides.speakerId,
  content: overrides.content ?? '系统消息',
});

const makeVisiblePlayer = (id: number, role: Role): VisiblePlayerRole => ({
  id,
  role,
});

// viewer that is NOT the actor and NOT omniscient
const spectatorViewer = (): ViewerContext => ({
  isOmniscient: false,
  isActor: false,
  actorId: null,
  viewerRole: null,
});

const actorViewer = (actorId: number, role: Role): ViewerContext => ({
  isOmniscient: false,
  isActor: true,
  actorId,
  viewerRole: role,
});

const godViewer = (): ViewerContext => ({
  isOmniscient: true,
  isActor: false,
  actorId: null,
  viewerRole: null,
});

// ── 1. Every current role has a config ───────────────────

test('ROLE_EFFECT_CONFIGS covers every Role enum value', () => {
  for (const role of ALL_ROLES) {
    const cfg = ROLE_EFFECT_CONFIGS[role];
    assert.ok(cfg, `missing config for ${role}`);
    assert.ok(typeof cfg.effectKind === 'string', `${role}: effectKind must be string`);
    assert.ok(cfg.effectKind.length > 0, `${role}: effectKind must not be empty`);
    assert.ok(typeof cfg.audioCue === 'string', `${role}: audioCue must be string`);
    assert.ok(cfg.audioCue.length > 0, `${role}: audioCue must not be empty`);
    assert.ok(typeof cfg.durationMs === 'number', `${role}: durationMs must be number`);
    assert.ok(cfg.durationMs > 0, `${role}: durationMs must be positive`);
  }
});

test('ROLE_EFFECT_CONFIGS has exactly one entry per Role enum value', () => {
  assert.equal(Object.keys(ROLE_EFFECT_CONFIGS).length, ALL_ROLES.length);
});

test('getRoleEffectConfig returns config for every role', () => {
  for (const role of ALL_ROLES) {
    const cfg = getRoleEffectConfig(role);
    assert.ok(cfg, `getRoleEffectConfig(${role}) must return a config`);
    assert.equal(cfg.effectKind, ROLE_EFFECT_CONFIGS[role].effectKind);
  }
});

// ── 2. PHASE_TO_ROLE mapping ─────────────────────────────

test('PHASE_TO_ROLE covers all action phases', () => {
  const actionPhases = [
    GamePhase.WEREWOLF_ACTION,
    GamePhase.SEER_ACTION,
    GamePhase.WITCH_ACTION,
    GamePhase.GUARD_ACTION,
    GamePhase.HUNTER_ACTION,
    GamePhase.KNIGHT_CHALLENGE,
    GamePhase.WOLF_EXPLODE,
    GamePhase.STONE_GHOST_ACTION,
    GamePhase.GRAVEKEEPER_ACTION,
    GamePhase.DEMON_HUNTER_ACTION,
    GamePhase.CUPID_LINK,
    GamePhase.MERCHANT_ACTION,
  ];
  for (const phase of actionPhases) {
    assert.ok(PHASE_TO_ROLE[phase] !== undefined, `PHASE_TO_ROLE missing ${phase}`);
  }
});

// ── 3. Spectator sees only neutral events ────────────────

test('spectator receives only neutral events — no role/casterId/targetIds exposed', () => {
  const logs = [makeLog({ phase: GamePhase.WEREWOLF_ACTION, speakerId: 2 })];
  const players = [makeVisiblePlayer(1, Role.WEREWOLF), makeVisiblePlayer(2, Role.VILLAGER)];

  const events = buildSkillEffectEvents(
    logs, players, spectatorViewer(), GamePhase.WEREWOLF_ACTION, 1,
  );

  for (const evt of events) {
    assert.equal(evt.visibility, 'neutral', `event ${evt.eventId} must be neutral`);
    assert.equal(evt.role, undefined, `event ${evt.eventId} must not expose role`);
    assert.equal(evt.casterId, undefined, `event ${evt.eventId} must not expose casterId`);
    assert.equal(
      evt.targetIds, undefined,
      `event ${evt.eventId} must not expose targetIds`,
    );
    // neutral audio cue must not leak role
    assert.ok(
      !evt.audioCue.includes('wolf') && !evt.audioCue.includes('seer'),
      `neutral audio must not leak role: ${evt.audioCue}`,
    );
  }
});

// ── 4. Actor sees own role events ────────────────────────

test('actor receives role-visibility events for their own phase', () => {
  const logs = [makeLog({ phase: GamePhase.WEREWOLF_ACTION, speakerId: 1 })];
  const players = [
    makeVisiblePlayer(1, Role.WEREWOLF),
    makeVisiblePlayer(2, Role.VILLAGER),
  ];

  const events = buildSkillEffectEvents(
    logs, players, actorViewer(1, Role.WEREWOLF), GamePhase.WEREWOLF_ACTION, 1,
  );

  const roleEvents = events.filter((e) => e.visibility === 'role');
  assert.ok(roleEvents.length > 0, 'actor should have at least one role event');
  for (const evt of roleEvents) {
    assert.equal(evt.role, Role.WEREWOLF);
    assert.ok(evt.casterId !== undefined, 'role event must have casterId');
  }
});

test('same-role viewer cannot see another actor private skill event', () => {
  const logs = [makeLog({ phase: GamePhase.WEREWOLF_ACTION, speakerId: 2 })];
  const players = [
    makeVisiblePlayer(1, Role.WEREWOLF),
    makeVisiblePlayer(2, Role.WEREWOLF),
  ];

  const events = buildSkillEffectEvents(
    logs, players, actorViewer(1, Role.WEREWOLF), GamePhase.WEREWOLF_ACTION, 1,
  );

  assert.ok(events.length > 0);
  assert.ok(events.every(event => event.visibility === 'neutral'));
  assert.ok(events.every(event => event.casterId === undefined));
});

test('phase open/close cues do not trigger skill events', () => {
  const logs = [
    makeLog({ id: 'open', phase: GamePhase.SEER_ACTION, content: '预言家请睁眼。' }),
    makeLog({ id: 'close', phase: GamePhase.SEER_ACTION, content: '预言家请闭眼。' }),
  ];

  assert.deepEqual(
    buildSkillEffectEvents(logs, [], godViewer(), GamePhase.SEER_ACTION, 1),
    [],
  );
});

test('actor does NOT get role events for other roles', () => {
  // Werewolf (id=1) as actor, but phase is SEER_ACTION — seer is someone else
  const logs = [makeLog({ phase: GamePhase.SEER_ACTION, speakerId: 3 })];
  const players = [
    makeVisiblePlayer(1, Role.WEREWOLF),
    makeVisiblePlayer(3, Role.SEER),
  ];

  const events = buildSkillEffectEvents(
    logs, players, actorViewer(1, Role.WEREWOLF), GamePhase.SEER_ACTION, 1,
  );

  const roleEvents = events.filter((e) => e.visibility === 'role');
  assert.equal(roleEvents.length, 0, 'actor must not see seer role events');
});

test('actor sees only neutral events when phase does not match their role', () => {
  // Player 2 is a VILLAGER, phase is WEREWOLF_ACTION
  const logs = [makeLog({ phase: GamePhase.WEREWOLF_ACTION, speakerId: 1 })];
  const players = [
    makeVisiblePlayer(1, Role.WEREWOLF),
    makeVisiblePlayer(2, Role.VILLAGER),
  ];

  const events = buildSkillEffectEvents(
    logs, players, actorViewer(2, Role.VILLAGER), GamePhase.WEREWOLF_ACTION, 1,
  );

  for (const evt of events) {
    assert.equal(evt.visibility, 'neutral');
    assert.equal(evt.role, undefined);
  }
});

test('god viewer receives omniscient events with full role/caster/target info', () => {
  const logs = [makeLog({ phase: GamePhase.WEREWOLF_ACTION, speakerId: 2 })];
  const players = [
    makeVisiblePlayer(1, Role.WEREWOLF),
    makeVisiblePlayer(2, Role.VILLAGER),
  ];

  const events = buildSkillEffectEvents(
    logs, players, godViewer(), GamePhase.WEREWOLF_ACTION, 2,
  );

  const omni = events.filter((e) => e.visibility === 'omniscient');
  assert.ok(omni.length > 0, 'god must see omniscient events');
  for (const evt of omni) {
    assert.ok(evt.role !== undefined, 'omniscient event must expose role');
    assert.ok(evt.casterId !== undefined, 'omniscient event must expose casterId');
  }
});

test('god viewer sees all phase role events', () => {
  const phases: GamePhase[] = [
    GamePhase.WEREWOLF_ACTION,
    GamePhase.SEER_ACTION,
    GamePhase.WITCH_ACTION,
    GamePhase.HUNTER_ACTION,
    GamePhase.KNIGHT_CHALLENGE,
  ];
  for (const phase of phases) {
    const logs = [makeLog({ phase })];
    const players: VisiblePlayerRole[] = [];
    const events = buildSkillEffectEvents(logs, players, godViewer(), phase, 1);
    assert.ok(events.length > 0, `god must see events for ${phase}`);
    for (const evt of events) {
      if (evt.visibility !== 'neutral') {
        assert.equal(evt.visibility, 'omniscient');
      }
    }
  }
});

// ── 6. Public events visible to all ──────────────────────

test('PUBLIC_EVENT_PHASES includes wolf explode, knight challenge, hunter action', () => {
  assert.ok(PUBLIC_EVENT_PHASES.has(GamePhase.WOLF_EXPLODE));
  assert.ok(PUBLIC_EVENT_PHASES.has(GamePhase.KNIGHT_CHALLENGE));
  assert.ok(PUBLIC_EVENT_PHASES.has(GamePhase.HUNTER_ACTION));
});

test('public events show role even to spectators', () => {
  const phases = [GamePhase.WOLF_EXPLODE, GamePhase.KNIGHT_CHALLENGE, GamePhase.HUNTER_ACTION];
  for (const phase of phases) {
    const logs = [makeLog({ phase, speakerId: 5 })];
    const players = [makeVisiblePlayer(5, Role.KNIGHT)];
    const events = buildSkillEffectEvents(logs, players, spectatorViewer(), phase, 1);

    const publicEvents = events.filter((e) => e.visibility === 'role' || e.visibility === 'omniscient');
    assert.ok(publicEvents.length > 0, `spectator must see public events for ${phase}`);
    for (const evt of publicEvents) {
      assert.ok(evt.role !== undefined, `public event ${evt.eventId} must expose role`);
    }
  }
});

test('public events are also visible to actor and god', () => {
  const logs = [makeLog({ phase: GamePhase.WOLF_EXPLODE, speakerId: 3 })];
  const players = [makeVisiblePlayer(3, Role.WEREWOLF)];

  for (const viewer of [actorViewer(3, Role.WEREWOLF), godViewer()]) {
    const events = buildSkillEffectEvents(logs, players, viewer, GamePhase.WOLF_EXPLODE, 1);
    const nonNeutral = events.filter((e) => e.visibility !== 'neutral');
    assert.ok(nonNeutral.length > 0, `${viewer.isOmniscient ? 'god' : 'actor'} must see public events`);
  }
});

// ── 7. Event ID is deterministic ─────────────────────────

test('same inputs produce identical event IDs', () => {
  const logs = [makeLog({ phase: GamePhase.SEER_ACTION, speakerId: 2 })];
  const players = [makeVisiblePlayer(2, Role.SEER)];

  const run1 = buildSkillEffectEvents(logs, players, godViewer(), GamePhase.SEER_ACTION, 3);
  const run2 = buildSkillEffectEvents(logs, players, godViewer(), GamePhase.SEER_ACTION, 3);

  assert.equal(run1.length, run2.length);
  for (let i = 0; i < run1.length; i++) {
    assert.equal(run1[i].eventId, run2[i].eventId, `event ID must be deterministic at index ${i}`);
    assert.equal(run1[i].effectKind, run2[i].effectKind);
    assert.equal(run1[i].visibility, run2[i].visibility);
  }
});

test('different turns produce different event IDs', () => {
  const logs1 = [makeLog({ phase: GamePhase.SEER_ACTION, turn: 1 })];
  const logs2 = [makeLog({ phase: GamePhase.SEER_ACTION, turn: 2 })];
  const players: VisiblePlayerRole[] = [];

  const evts1 = buildSkillEffectEvents(logs1, players, godViewer(), GamePhase.SEER_ACTION, 1);
  const evts2 = buildSkillEffectEvents(logs2, players, godViewer(), GamePhase.SEER_ACTION, 2);

  assert.equal(evts1.length, evts2.length);
  for (let i = 0; i < evts1.length; i++) {
    assert.notEqual(evts1[i].eventId, evts2[i].eventId, 'different turns must produce different IDs');
  }
});

// ── 8. Neutral events use unified neutral presentation ────

test('neutral events use a neutral audio cue and no role-specific effectKind', () => {
  const neutralEffectKinds = new Set<string>();

  // Collect neutral effects across many phases and roles
  const phases: GamePhase[] = [
    GamePhase.WEREWOLF_ACTION,
    GamePhase.SEER_ACTION,
    GamePhase.WITCH_ACTION,
    GamePhase.GUARD_ACTION,
    GamePhase.HUNTER_ACTION,
    GamePhase.STONE_GHOST_ACTION,
    GamePhase.GRAVEKEEPER_ACTION,
    GamePhase.DEMON_HUNTER_ACTION,
    GamePhase.CUPID_LINK,
    GamePhase.MERCHANT_ACTION,
  ];

  for (const phase of phases) {
    const logs = [makeLog({ phase, speakerId: 1 })];
    const players = [makeVisiblePlayer(1, Role.SEER)];
    const events = buildSkillEffectEvents(logs, players, spectatorViewer(), phase, 1);
    for (const evt of events) {
      if (evt.visibility === 'neutral') {
        neutralEffectKinds.add(evt.effectKind);
        assert.ok(
          evt.audioCue === 'neutral_ambient' || evt.audioCue.startsWith('neutral_'),
          `neutral event audio must be neutral, got: ${evt.audioCue}`,
        );
      }
    }
  }

  // All neutral events from different roles should map to few unified kinds
  assert.ok(neutralEffectKinds.size <= 3, `too many neutral effectKinds: ${neutralEffectKinds.size}`);
});

// ── 9. Event fields are well-formed ──────────────────────

test('SkillEffectEvent has all required fields', () => {
  const logs = [makeLog({ phase: GamePhase.SEER_ACTION })];
  const players: VisiblePlayerRole[] = [];

  const events = buildSkillEffectEvents(logs, players, godViewer(), GamePhase.SEER_ACTION, 1);

  for (const evt of events) {
    assert.ok(typeof evt.eventId === 'string' && evt.eventId.length > 0, 'eventId required');
    assert.ok(typeof evt.turn === 'number' && evt.turn > 0, 'turn required');
    assert.ok(typeof evt.phase === 'string' && evt.phase.length > 0, 'phase required');
    assert.ok(
      evt.visibility === 'neutral' || evt.visibility === 'role' || evt.visibility === 'omniscient',
      `invalid visibility: ${evt.visibility}`,
    );
    assert.ok(typeof evt.effectKind === 'string' && evt.effectKind.length > 0, 'effectKind required');
    assert.ok(typeof evt.audioCue === 'string' && evt.audioCue.length > 0, 'audioCue required');
    assert.ok(typeof evt.durationMs === 'number' && evt.durationMs > 0, 'durationMs required');
  }
});

// ── 10. getPhaseDefaultEffects ────────────────────────────

test('getPhaseDefaultEffects returns effects for common phases', () => {
  const phases = [GamePhase.NIGHT_START, GamePhase.DAY_DISCUSSION, GamePhase.VOTING, GamePhase.GAME_OVER];
  for (const phase of phases) {
    const effects = getPhaseDefaultEffects(phase, 1);
    assert.ok(Array.isArray(effects), `${phase} must return array`);
    // Default effects can be empty for some phases
  }
});

test('getPhaseDefaultEffects returns neutral visibility events', () => {
  const effects = getPhaseDefaultEffects(GamePhase.NIGHT_START, 5);
  for (const evt of effects) {
    assert.equal(evt.visibility, 'neutral');
    assert.equal(evt.role, undefined);
  }
});

test('private action phase defaults remain neutral', () => {
  const effects = getPhaseDefaultEffects(GamePhase.SEER_ACTION, 4);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].visibility, 'neutral');
  assert.equal(effects[0].role, undefined);
  assert.equal(effects[0].casterId, undefined);
  assert.equal(effects[0].targetIds, undefined);
  assert.equal(effects[0].audioCue, 'neutral_ambient');
});

test('getPhaseDefaultEffects has deterministic event IDs', () => {
  const a = getPhaseDefaultEffects(GamePhase.DAY_DISCUSSION, 3);
  const b = getPhaseDefaultEffects(GamePhase.DAY_DISCUSSION, 3);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].eventId, b[i].eventId);
  }
});

// ── 11. isPublicEventPhase ────────────────────────────────

test('isPublicEventPhase returns true for public phases', () => {
  assert.equal(isPublicEventPhase(GamePhase.WOLF_EXPLODE), true);
  assert.equal(isPublicEventPhase(GamePhase.KNIGHT_CHALLENGE), true);
  assert.equal(isPublicEventPhase(GamePhase.HUNTER_ACTION), true);
});

test('isPublicEventPhase returns false for private phases', () => {
  assert.equal(isPublicEventPhase(GamePhase.WEREWOLF_ACTION), false);
  assert.equal(isPublicEventPhase(GamePhase.SEER_ACTION), false);
  assert.equal(isPublicEventPhase(GamePhase.WITCH_ACTION), false);
  assert.equal(isPublicEventPhase(GamePhase.GUARD_ACTION), false);
  assert.equal(isPublicEventPhase(GamePhase.DAY_DISCUSSION), false);
});

// ── 12. Negative cases ───────────────────────────────────

test('neutral events must not retain inferable role fields in any format', () => {
  // Even if visiblePlayers accidentally has role data, neutral viewer must not see it
  const logs = [makeLog({ phase: GamePhase.WEREWOLF_ACTION, speakerId: 1 })];
  const players = [makeVisiblePlayer(1, Role.WEREWOLF)];

  const events = buildSkillEffectEvents(logs, players, spectatorViewer(), GamePhase.WEREWOLF_ACTION, 1);

  for (const evt of events) {
    if (evt.visibility === 'neutral') {
      // role, casterId, targetIds must be absent
      assert.equal(evt.role, undefined);
      assert.equal(evt.casterId, undefined);
      assert.equal(evt.targetIds, undefined);
      // effectKind and audioCue must not contain role identifiers
      assert.ok(!evt.effectKind.includes('wolf'), 'effectKind must not leak role');
      assert.ok(!evt.audioCue.includes('wolf'), 'audioCue must not leak role');
    }
  }
});

test('non-actor with same role as phase role still only sees neutral', () => {
  // Player 2 is also WEREWOLF but not the actor; they shouldn't see role events
  const logs = [makeLog({ phase: GamePhase.WEREWOLF_ACTION, speakerId: 1 })];
  const players = [
    makeVisiblePlayer(1, Role.WEREWOLF),
    makeVisiblePlayer(2, Role.WEREWOLF),
  ];

  const nonActorViewer: ViewerContext = {
    isOmniscient: false,
    isActor: false,
    actorId: 2,
    viewerRole: Role.WEREWOLF,
  };

  const events = buildSkillEffectEvents(
    logs, players, nonActorViewer, GamePhase.WEREWOLF_ACTION, 1,
  );

  for (const evt of events) {
    assert.equal(evt.visibility, 'neutral');
  }
});

test('empty logs produce empty events for spectator', () => {
  const events = buildSkillEffectEvents(
    [], [], spectatorViewer(), GamePhase.WEREWOLF_ACTION, 1,
  );
  assert.equal(events.length, 0);
});

test('god sees role events across every dedicated action phase', () => {
  // Every action phase should produce an omniscient event for god
  const actionPhases: [GamePhase, Role][] = [
    [GamePhase.WEREWOLF_ACTION, Role.WEREWOLF],
    [GamePhase.SEER_ACTION, Role.SEER],
    [GamePhase.WITCH_ACTION, Role.WITCH],
    [GamePhase.GUARD_ACTION, Role.GUARD],
    [GamePhase.HUNTER_ACTION, Role.HUNTER],
    [GamePhase.KNIGHT_CHALLENGE, Role.KNIGHT],
    [GamePhase.WOLF_EXPLODE, Role.WEREWOLF],
    [GamePhase.STONE_GHOST_ACTION, Role.STONE_GHOST],
    [GamePhase.GRAVEKEEPER_ACTION, Role.GRAVEKEEPER],
    [GamePhase.DEMON_HUNTER_ACTION, Role.DEMON_HUNTER],
    [GamePhase.CUPID_LINK, Role.CUPID],
    [GamePhase.MERCHANT_ACTION, Role.MIRACLE_MERCHANT],
  ];

  const seenRoles = new Set<Role>();

  for (const [phase, role] of actionPhases) {
    const logs = [makeLog({ phase, speakerId: 1 })];
    const players = [makeVisiblePlayer(1, role)];
    const events = buildSkillEffectEvents(logs, players, godViewer(), phase, 1);
    for (const evt of events) {
      if (evt.visibility === 'omniscient' && evt.role) {
        seenRoles.add(evt.role);
      }
    }
  }

  // Plus additional roles without dedicated phases (VILLAGER, IDIOT, etc.)
  // These are covered by ROLE_EFFECT_CONFIGS but may not appear as omniscient events
  // in phase-driven logs. That's acceptable — they appear in public/situational contexts.
  assert.ok(seenRoles.size >= 10, `god should see at least 10 distinct roles, got ${seenRoles.size}`);
});

test('idiot reveal via log content is detected as public event', () => {
  // When the idiot is revealed (voted out and flips), it should be a public event
  const logs = [makeLog({
    phase: GamePhase.VOTING,
    speakerId: 7,
    content: '白痴翻牌',
  })];
  const players = [makeVisiblePlayer(7, Role.IDIOT)];

  const events = buildSkillEffectEvents(logs, players, spectatorViewer(), GamePhase.VOTING, 1);

  // If idiot reveal is public, spectator should see a non-neutral event
  const publicEvents = events.filter((e) => e.visibility !== 'neutral');
  // Idiot reveal through log content should produce role-visible event
  assert.ok(publicEvents.length > 0, 'spectator must see idiot reveal as public');
  for (const evt of publicEvents) {
    assert.equal(evt.role, Role.IDIOT);
  }
});
