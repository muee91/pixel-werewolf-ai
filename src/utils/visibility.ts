import { GameLog, GamePhase, GodState, Perspective, Player, Role, WOLF_ROLES } from '../types';

export const NIGHT_ACTION_PHASES: GamePhase[] = [
    GamePhase.WEREWOLF_ACTION,
    GamePhase.SEER_ACTION,
    GamePhase.WITCH_ACTION,
    GamePhase.GUARD_ACTION,
    GamePhase.STONE_GHOST_ACTION,
    GamePhase.GRAVEKEEPER_ACTION,
    GamePhase.DEMON_HUNTER_ACTION,
    GamePhase.CUPID_LINK,
    GamePhase.MERCHANT_ACTION,
];

export const GOOD_HIDDEN_NIGHT_PHASES = NIGHT_ACTION_PHASES;
export const WOLF_HIDDEN_NIGHT_PHASES: GamePhase[] = [
    GamePhase.SEER_ACTION,
    GamePhase.WITCH_ACTION,
    GamePhase.GUARD_ACTION,
    GamePhase.STONE_GHOST_ACTION,
    GamePhase.GRAVEKEEPER_ACTION,
    GamePhase.DEMON_HUNTER_ACTION,
    GamePhase.CUPID_LINK,
    GamePhase.MERCHANT_ACTION,
];

export const isNightActionPhase = (phase: GamePhase) => NIGHT_ACTION_PHASES.includes(phase);
export const isInternalDebugLog = (log: GameLog) => !!log.debugType && log.debugType !== 'AI_THINKING';

export const canRoleSeeNightPhase = (phase: GamePhase, role: Role) => {
    switch (phase) {
        case GamePhase.WEREWOLF_ACTION:
            return WOLF_ROLES.includes(role);
        case GamePhase.SEER_ACTION:
            return role === Role.SEER;
        case GamePhase.WITCH_ACTION:
            return role === Role.WITCH;
        case GamePhase.GUARD_ACTION:
            return role === Role.GUARD;
        case GamePhase.STONE_GHOST_ACTION:
            return role === Role.STONE_GHOST;
        case GamePhase.GRAVEKEEPER_ACTION:
            return role === Role.GRAVEKEEPER;
        case GamePhase.DEMON_HUNTER_ACTION:
            return role === Role.DEMON_HUNTER;
        case GamePhase.CUPID_LINK:
            return role === Role.CUPID;
        case GamePhase.MERCHANT_ACTION:
            return role === Role.MIRACLE_MERCHANT;
        default:
            return true;
    }
};

export const isWolfPrivateLog = (log: GameLog, players: Player[]) => {
    const wolfIds = players.filter(p => WOLF_ROLES.includes(p.role)).map(p => p.id);
    return log.phase === GamePhase.WEREWOLF_ACTION && !!log.visibleTo && log.visibleTo.every(id => wolfIds.includes(id));
};

export const shouldExperienceLog = (log: GameLog, perspective: Perspective, players: Player[]) => {
    if (isInternalDebugLog(log)) return false;
    if (perspective === 'GOD') return true;

    if (log.visibleTo?.length) {
        if (perspective === 'GOOD') return false;
        if (perspective === 'WOLF') return isWolfPrivateLog(log, players);
        return false;
    }

    if (log.isSystem) {
        if (perspective === 'GOOD' && GOOD_HIDDEN_NIGHT_PHASES.includes(log.phase)) return false;
        if (perspective === 'WOLF' && WOLF_HIDDEN_NIGHT_PHASES.includes(log.phase)) return false;
    }

    return true;
};

export const shouldShowLogForViewer = (
    log: GameLog,
    options: {
        isReplay: boolean;
        perspective: Perspective;
        players: Player[];
        humanPlayer?: Player;
        debugGodView?: boolean;
        viewerId?: number;
    }
) => {
    if (isInternalDebugLog(log)) return false;

    if (options.isReplay) {
        return shouldExperienceLog(log, options.perspective, options.players);
    }

    const { humanPlayer, debugGodView, viewerId } = options;
    if (humanPlayer && !debugGodView) {
        if (log.visibleTo?.length && !log.visibleTo.includes(humanPlayer.id)) return false;
        if (log.isSystem && isNightActionPhase(log.phase) && !log.visibleTo?.length) return canRoleSeeNightPhase(log.phase, humanPlayer.role);
        return true;
    }

    if (log.visibleTo && viewerId && !log.visibleTo.includes(viewerId)) return false;
    return true;
};

export const canSeeSpeakerForPhase = (phase: GamePhase, humanPlayer: Player | undefined, isReplayMode: boolean) => {
    if (!isNightActionPhase(phase) || isReplayMode || !humanPlayer) return true;
    return canRoleSeeNightPhase(phase, humanPlayer.role);
};

export const shouldShowPlayerRole = (
    player: Player,
    options: {
        phase: GamePhase;
        isReplayMode: boolean;
        perspective: Perspective;
        humanPlayer?: Player;
        debugGodView?: boolean;
        showRolesGlobal?: boolean;
        godState: GodState;
    }
) => {
    const isGameOver = options.phase === GamePhase.GAME_REVIEW || options.phase === GamePhase.GAME_OVER;
    if (isGameOver) return true;

    if (options.isReplayMode) {
        if (options.perspective === 'GOD') return true;
        if (options.perspective === 'WOLF') return WOLF_ROLES.includes(player.role);
        return !!player.isHuman;
    }

    const humanPlayer = options.humanPlayer;
    if (humanPlayer) {
        if (player.id === humanPlayer.id) return true;
        if (options.debugGodView) return true;
        if (WOLF_ROLES.includes(humanPlayer.role) && WOLF_ROLES.includes(player.role)) return true;
        if (humanPlayer.role === Role.CUPID && options.godState.lovers?.includes(player.id)) return true;
        return false;
    }

    return !!options.showRolesGlobal;
};

export const isGodLikeView = (options: {
    debugGodView?: boolean;
    phase: GamePhase;
    isReplayMode: boolean;
    perspective: Perspective;
    humanPlayer?: Player;
    showRolesGlobal?: boolean;
}) => !!options.debugGodView || options.phase === GamePhase.GAME_REVIEW || options.phase === GamePhase.GAME_OVER || (options.isReplayMode && options.perspective === 'GOD') || (!options.humanPlayer && !!options.showRolesGlobal);

export const canSeeLoverInfo = (player: Player | undefined, godState: GodState, godLikeView: boolean) => {
    if (godLikeView) return true;
    if (!player || !godState.lovers) return false;
    return player.role === Role.CUPID || godState.lovers.includes(player.id);
};

export const canSeeMerchantSkillInfo = (viewer: Player | undefined, target: Player, godLikeView: boolean) => {
    if (godLikeView) return true;
    if (!viewer) return false;
    return viewer.id === target.id || viewer.role === Role.MIRACLE_MERCHANT;
};
