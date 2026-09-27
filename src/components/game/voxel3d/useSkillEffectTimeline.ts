import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameLog, GamePhase, Role } from '../../../types';
import { getPhaseDefaultEffects, type SkillEffectEvent, type ViewerContext, type VisiblePlayerRole } from './skillEffectModel';
import {
    collectNewSkillEffectEvents,
    trimSkillEffectEvents,
    type TimedSkillEffectEvent,
} from './skillEffectTimeline';

const EVENT_LIMIT = 6;

export const useSkillEffectTimeline = ({
    visibleLogs,
    visiblePlayers,
    viewerId,
    viewerRole,
    isOmniscient,
    phase,
    turn,
}: {
    visibleLogs: GameLog[];
    visiblePlayers: VisiblePlayerRole[];
    viewerId: number | null;
    viewerRole: Role | null;
    isOmniscient: boolean;
    phase: GamePhase;
    turn: number;
}): SkillEffectEvent[] => {
    const seenLogIdsRef = useRef<Set<string> | null>(null);
    const timersRef = useRef(new Set<number>());
    const [entries, setEntries] = useState<TimedSkillEffectEvent[]>([]);
    const phaseKeyRef = useRef<string | null>(null);

    const viewer = useMemo<ViewerContext>(() => ({
        isOmniscient,
        isActor: viewerId !== null,
        actorId: viewerId,
        viewerRole,
    }), [isOmniscient, viewerId, viewerRole]);

    useEffect(() => {
        const now = Date.now();
        const collected = collectNewSkillEffectEvents({
            visibleLogs,
            seenLogIds: seenLogIdsRef.current,
            visiblePlayers,
            viewer,
        });
        seenLogIdsRef.current = collected.seenLogIds;
        const phaseKey = `${turn}:${phase}`;
        const phaseEvents = phaseKeyRef.current !== null && phaseKeyRef.current !== phaseKey
            ? getPhaseDefaultEffects(phase, turn)
            : [];
        phaseKeyRef.current = phaseKey;
        const incomingEvents = [...collected.events, ...phaseEvents];
        if (incomingEvents.length === 0) return;

        const added = incomingEvents.map(event => ({
            event,
            expiresAt: now + event.durationMs,
        }));
        setEntries(previous => trimSkillEffectEvents([...previous, ...added], now, EVENT_LIMIT));

        for (const item of added) {
            const timer = window.setTimeout(() => {
                timersRef.current.delete(timer);
                setEntries(previous => trimSkillEffectEvents(previous, Date.now(), EVENT_LIMIT));
            }, item.event.durationMs + 16);
            timersRef.current.add(timer);
        }
    }, [phase, turn, visibleLogs, visiblePlayers, viewer]);

    useEffect(() => () => {
        for (const timer of timersRef.current) window.clearTimeout(timer);
        timersRef.current.clear();
    }, []);

    return useMemo(() => entries.map(entry => entry.event), [entries]);
};
