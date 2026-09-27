export interface PlayerActionEnvelope {
    actionId: string;
    clientSeq: number;
    ts: number;
}

export const createPlayerActionMessage = (envelope: PlayerActionEnvelope, actionData: unknown) => ({
    type: 'PLAYER_ACTION' as const,
    ...envelope,
    actionData,
});

export const createAdvisorRequestMessage = (requestPayload: unknown) => ({
    type: 'ADVISOR_REQUEST' as const,
    requestPayload,
});

export const createPauseStateMessage = (paused: boolean) => ({
    type: paused ? 'GAME_PAUSED' as const : 'GAME_RESUMED' as const,
});
