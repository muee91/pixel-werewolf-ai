import type { GameLog } from '../../../types';
import {
    buildSkillEffectEventFromLog,
    type SkillEffectEvent,
    type ViewerContext,
    type VisiblePlayerRole,
} from './skillEffectModel';

export interface TimedSkillEffectEvent {
    event: SkillEffectEvent;
    expiresAt: number;
}

export interface SkillEffectCollection {
    events: SkillEffectEvent[];
    seenLogIds: Set<string>;
    visibleLogs: GameLog[];
}

export const collectNewSkillEffectEvents = ({
    visibleLogs,
    seenLogIds,
    visiblePlayers,
    viewer,
}: {
    visibleLogs: GameLog[];
    seenLogIds: ReadonlySet<string> | null;
    visiblePlayers: VisiblePlayerRole[];
    viewer: ViewerContext;
}): SkillEffectCollection => {
    const nextSeenLogIds = new Set(visibleLogs.map(log => log.id));
    if (seenLogIds === null) {
        return { events: [], seenLogIds: nextSeenLogIds, visibleLogs };
    }

    const events = visibleLogs
        .filter(log => !seenLogIds.has(log.id))
        .map(log => buildSkillEffectEventFromLog(log, visiblePlayers, viewer))
        .filter((event): event is SkillEffectEvent => event !== null);

    return { events, seenLogIds: nextSeenLogIds, visibleLogs };
};

export const trimSkillEffectEvents = (
    entries: TimedSkillEffectEvent[],
    now: number,
    limit: number,
): TimedSkillEffectEvent[] => entries
    .filter(entry => entry.expiresAt > now)
    .slice(-Math.max(0, limit));

