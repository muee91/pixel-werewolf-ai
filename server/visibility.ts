const WOLF_ROLES = new Set([
  'WEREWOLF',
  'WOLF_KING',
  'STONE_GHOST',
  'WHITE_WOLF_KING',
  'BLOOD_MOON_DISCIPLE',
]);

export function getViewerFromGameState(gameState: any, playerId: string) {
  return gameState?.players?.find((player: any) => player.roomPlayerId === playerId) ?? null;
}

function canViewerKnowRole(viewer: any, target: any, godState: any): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return true;
  if (WOLF_ROLES.has(viewer.role) && WOLF_ROLES.has(target.role)) return true;
  if (viewer.role === 'CUPID' && Array.isArray(godState?.lovers) && godState.lovers.includes(target.id)) return true;
  if (Array.isArray(godState?.lovers) && godState.lovers.includes(viewer.id) && godState.lovers.includes(target.id)) return true;
  return false;
}

function sanitizePlayerForViewer(viewer: any, target: any) {
  return {
    ...target,
    rolePrompt: '',
    potions: viewer?.id === target?.id ? target.potions : undefined,
  };
}

function maskPlayerForViewer(viewer: any, target: any, godState: any) {
  const safeTarget = sanitizePlayerForViewer(viewer, target);
  if (canViewerKnowRole(viewer, target, godState)) return safeTarget;
  return { ...safeTarget, role: 'VILLAGER' };
}

export function filterLogsForViewer(logs: any[] | undefined, viewer: any) {
  if (!Array.isArray(logs)) return logs;
  return logs
    .filter(log => {
      if (log.debugType) return false;
      if (!viewer) return !log.visibleTo?.length;
      return !log.visibleTo?.length || log.visibleTo.includes(viewer.id);
    })
    .map(log => {
      const { debugData, thought, promptContext, rawResponse, strategySummary, modelName, debugType, ...safeLog } = log;
      return safeLog;
    });
}

function buildVisibleGodState(phase: string, viewer: any, godState: any) {
  const base: any = {
    deathsTonight: [],
    sheriffId: godState?.sheriffId ?? null,
    sheriffCandidates: godState?.sheriffCandidates ?? [],
    sheriffElectionDone: godState?.sheriffElectionDone,
    sheriffVoteRound: godState?.sheriffVoteRound,
    sheriffTieCandidates: godState?.sheriffTieCandidates ?? [],
    voteTieCandidates: godState?.voteTieCandidates ?? null,
    voteTieRound: godState?.voteTieRound ?? 0,
    bloodMoonSealed: godState?.bloodMoonSealed,
    explodedWolves: godState?.explodedWolves ?? [],
  };

  if (!viewer || !godState) return base;
  if (viewer.role === 'SEER') base.seerCheck = godState.seerCheck;
  if (viewer.role === 'WITCH') {
    base.wolfTarget = phase === 'WITCH_ACTION' ? godState.wolfTarget : null;
    base.witchSave = godState.witchSave;
    base.witchPoison = godState.witchPoison;
  }
  if (viewer.role === 'GUARD') {
    base.guardProtect = godState.guardProtect;
    base.lastGuardProtect = godState.lastGuardProtect ?? null;
    base.merchantGuardProtect = godState.merchantGuardProtect;
  }
  if (WOLF_ROLES.has(viewer.role)) {
    base.wolfTarget = godState.wolfTarget;
    base.wolfExplodeTarget = godState.wolfExplodeTarget;
  }
  if (viewer.role === 'CUPID') {
    base.lovers = godState.lovers;
    base.cupidIsThirdParty = godState.cupidIsThirdParty;
  }
  if (viewer.role === 'KNIGHT') {
    base.knightChallenged = godState.knightChallenged;
    base.knightChallengeTarget = godState.knightChallengeTarget;
  }
  if (viewer.role === 'DEMON_HUNTER') base.demonHunterKills = godState.demonHunterKills;
  if (viewer.role === 'GRAVEKEEPER') base.lastExiledPlayerId = godState.lastExiledPlayerId;
  if (viewer.role === 'MIRACLE_MERCHANT') {
    base.merchantSkillTarget = godState.merchantSkillTarget;
    base.merchantSkillType = godState.merchantSkillType;
    base.merchantSkillUsed = godState.merchantSkillUsed;
  }
  if (Array.isArray(godState.lovers) && godState.lovers.includes(viewer.id) && viewer.role !== 'CUPID') {
    base.lovers = godState.lovers;
    base.cupidIsThirdParty = godState.cupidIsThirdParty;
  }
  if (godState.merchantSkillTarget === viewer.id && !godState.merchantSkillUsed) {
    base.merchantSkillTarget = godState.merchantSkillTarget;
    base.merchantSkillType = godState.merchantSkillType;
    base.merchantSkillUsed = godState.merchantSkillUsed;
  }
  return base;
}

export function buildGameStateForViewer(fullGameState: any, viewer: any, revealRoles: boolean) {
  return {
    ...fullGameState,
    players: Array.isArray(fullGameState.players)
      ? fullGameState.players.map((player: any) => revealRoles
        ? sanitizePlayerForViewer(viewer, player)
        : maskPlayerForViewer(viewer, player, fullGameState.godState))
      : fullGameState.players,
    logs: filterLogsForViewer(fullGameState.logs, viewer),
    godState: revealRoles
      ? fullGameState.godState
      : buildVisibleGodState(fullGameState.phase, viewer, fullGameState.godState),
    areRolesVisible: revealRoles,
  };
}
