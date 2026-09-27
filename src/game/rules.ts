import {
    GameConfig,
    GOD_ROLES,
    Player,
    PlayerStatus,
    Role,
    VILLAGER_ROLES,
    WOLF_ROLES,
} from '../types';

export type WinResult = {
    winner: 'GOOD' | 'WOLF' | 'THIRD_PARTY';
    reason: 'ALL_WOLVES_DEAD' | 'ALL_VILLAGERS_DEAD' | 'ALL_GODS_DEAD' | 'THIRD_PARTY_WIN';
    reasonText: string;
};

export type WinConditionContext = {
    thirdPartyEnabled: boolean;
    cupidIsThirdParty?: boolean;
    lovers?: [number, number] | null;
};

export const isEffectivelyAlive = (player: Player) =>
    player.status === PlayerStatus.ALIVE ||
    player.status === PlayerStatus.IDIOT_REVEALED;

export const canWolfSelfExplode = (player: Player) =>
    isEffectivelyAlive(player) &&
    WOLF_ROLES.includes(player.role) &&
    player.role !== Role.STONE_GHOST;

export type MerchantSkillType = 'check' | 'poison' | 'guard';

export const normalizeMerchantSkillType = (value: unknown): MerchantSkillType | null =>
    value === 'check' || value === 'poison' || value === 'guard' ? value : null;

export const isCrossFactionLoverPair = (
    players: Player[],
    lovers: [number, number]
) => {
    const first = players.find(player => player.id === lovers[0]);
    const second = players.find(player => player.id === lovers[1]);
    return !!first && !!second && WOLF_ROLES.includes(first.role) !== WOLF_ROLES.includes(second.role);
};

export const isSheriffElectionEnabled = (
    config: Pick<GameConfig, 'rules' | 'sheriffEnabled'>
) => config.rules?.sheriffElection ?? config.sheriffEnabled;

export const canPlayerUseDeathAction = (
    player: Player,
    poisonedPlayerIds: number[],
    hunterCanShootWhenPoisoned: boolean,
    wolfKingCanShootWhenPoisoned: boolean = false
) => {
    if (player.role === Role.WOLF_KING) {
        // 标准狼王守卫板：被毒（或中毒连锁）死亡不能开枪，与猎人同规
        const eligibleDeath = [
            PlayerStatus.DEAD_VOTE,
            PlayerStatus.DEAD_NIGHT,
            PlayerStatus.DEAD_POISON,
            PlayerStatus.DEAD_SHOOT,
        ].includes(player.status);
        const wasPoisoned = poisonedPlayerIds.includes(player.id) ||
            player.status === PlayerStatus.DEAD_POISON;
        return eligibleDeath && (!wasPoisoned || wolfKingCanShootWhenPoisoned);
    }

    if (player.role !== Role.HUNTER) return false;
    const eligibleDeath = player.status === PlayerStatus.DEAD_VOTE ||
        player.status === PlayerStatus.DEAD_NIGHT ||
        player.status === PlayerStatus.DEAD_POISON;
    const wasPoisoned = poisonedPlayerIds.includes(player.id) ||
        player.status === PlayerStatus.DEAD_POISON;
    return eligibleDeath && (!wasPoisoned || hunterCanShootWhenPoisoned);
};

export const getPendingDeathActionIds = (
    players: Player[],
    candidateIds: number[],
    poisonedPlayerIds: number[],
    hunterCanShootWhenPoisoned: boolean,
    wolfKingCanShootWhenPoisoned: boolean = false
) => [...new Set(candidateIds)].filter(id => {
    const player = players.find(candidate => candidate.id === id);
    return !!player && canPlayerUseDeathAction(
        player,
        poisonedPlayerIds,
        hunterCanShootWhenPoisoned,
        wolfKingCanShootWhenPoisoned
    );
});

export const appendPendingDeathActionIds = (
    pendingIds: number[],
    players: Player[],
    candidateIds: number[],
    poisonedPlayerIds: number[],
    hunterCanShootWhenPoisoned: boolean,
    wolfKingCanShootWhenPoisoned: boolean = false
) => {
    const appendedIds = getPendingDeathActionIds(
        players,
        candidateIds,
        poisonedPlayerIds,
        hunterCanShootWhenPoisoned,
        wolfKingCanShootWhenPoisoned
    );
    return [...new Set([...pendingIds, ...appendedIds])];
};

export const getExileVoterIds = (
    players: Player[],
    tieCandidateIds: number[] | null | undefined
) => players
    .filter(isEffectivelyAlive)
    .filter(player => player.status !== PlayerStatus.IDIOT_REVEALED)
    .filter(player => !tieCandidateIds?.includes(player.id))
    .map(player => player.id);

export type ExileVoteResolution = {
    finalPlayerId: number | null;
    tiedPlayerIds: number[];
    shouldRevote: boolean;
};

export const resolveExileVote = (
    votes: Record<number, number>,
    tieRound: number
): ExileVoteResolution => {
    const entries = Object.entries(votes)
        .map(([target, count]) => ({ target: Number(target), count }))
        .filter(entry => entry.count > 0)
        .sort((a, b) => a.target - b.target);
    const maxVotes = entries.reduce((max, entry) => Math.max(max, entry.count), 0);
    const tiedPlayerIds = entries
        .filter(entry => entry.count === maxVotes)
        .map(entry => entry.target);

    if (tiedPlayerIds.length === 1) {
        return {
            finalPlayerId: tiedPlayerIds[0],
            tiedPlayerIds,
            shouldRevote: false,
        };
    }

    return {
        finalPlayerId: null,
        tiedPlayerIds,
        shouldRevote: tiedPlayerIds.length > 1 && tieRound === 0,
    };
};

// 平票PK轮禁止弃票：空票/无效票一律强制改投平票候选人
export const enforcePkVoteTarget = (
    target: number | null | undefined,
    pkCandidateIds: number[]
): number | null => {
    if (target != null && pkCandidateIds.includes(target)) return target;
    if (pkCandidateIds.length === 0) return null;
    return pkCandidateIds[Math.floor(Math.random() * pkCandidateIds.length)];
};

export const shouldOfferWolfExplosion = (
    enabled: boolean,
    turnCount: number,
    checkedTurn: number | null | undefined,
    players: Player[]
) => enabled &&
    checkedTurn !== turnCount &&
    players.some(canWolfSelfExplode);

export const checkWinCondition = (
    players: Player[],
    context: WinConditionContext
): WinResult | null => {
    const alive = players.filter(isEffectivelyAlive);
    const wolvesCount = alive.filter(player => WOLF_ROLES.includes(player.role)).length;
    const villagersCount = alive.filter(player => VILLAGER_ROLES.includes(player.role)).length;
    const godsCount = alive.filter(player => GOD_ROLES.includes(player.role)).length;

    if (context.thirdPartyEnabled && context.cupidIsThirdParty && context.lovers) {
        const [firstLoverId, secondLoverId] = context.lovers;
        const cupid = players.find(player => player.role === Role.CUPID);
        const thirdPartyIds = [cupid?.id, firstLoverId, secondLoverId]
            .filter((id): id is number => typeof id === 'number');
        const thirdPartyAliveCount = thirdPartyIds.filter(id =>
            alive.some(player => player.id === id)
        ).length;
        const loversAlive = alive.some(player => player.id === firstLoverId) &&
            alive.some(player => player.id === secondLoverId);
        const cupidAlive = !!cupid && isEffectivelyAlive(cupid);

        if (loversAlive && cupidAlive && thirdPartyAliveCount > alive.length - thirdPartyAliveCount) {
            return {
                winner: 'THIRD_PARTY',
                reason: 'THIRD_PARTY_WIN',
                reasonText: '丘比特与情侣形成第三方阵营并存活到最后，第三方胜利！',
            };
        }
    }

    if (wolvesCount === 0) {
        return {
            winner: 'GOOD',
            reason: 'ALL_WOLVES_DEAD',
            reasonText: '所有狼人已出局，好人阵营胜利。',
        };
    }

    if (villagersCount === 0) {
        return {
            winner: 'WOLF',
            reason: 'ALL_VILLAGERS_DEAD',
            reasonText: '所有村民已出局，狼人屠民胜利。',
        };
    }

    if (godsCount === 0) {
        return {
            winner: 'WOLF',
            reason: 'ALL_GODS_DEAD',
            reasonText: '所有神职已出局，狼人屠神胜利。',
        };
    }

    return null;
};
