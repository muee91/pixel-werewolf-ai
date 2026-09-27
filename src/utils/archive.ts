import { GameArchive, TimelineEvent } from '../types';

export const CURRENT_ARCHIVE_SCHEMA_VERSION = 2;

export const sanitizeTimelineForArchive = (timeline: TimelineEvent[] = []): TimelineEvent[] => timeline.map(event => ({
    ...event,
    ttsApiKey: ''
}));

export const normalizeGameArchive = (archive: Partial<GameArchive>): GameArchive => {
    const logs = Array.isArray(archive.logs) ? archive.logs : [];
    const timeline = sanitizeTimelineForArchive(Array.isArray(archive.timeline) ? archive.timeline : []);
    const players = Array.isArray(archive.players) ? archive.players : [];

    return {
        id: archive.id || `legacy-${archive.timestamp || Date.now()}`,
        timestamp: archive.timestamp || Date.now(),
        duration: archive.duration || 0,
        playerCount: archive.playerCount || players.length,
        winner: archive.winner || 'UNKNOWN',
        roles: Array.isArray(archive.roles) ? archive.roles : players.map(player => player.role),
        result: archive.result ?? null,
        logs,
        timeline,
        players,
        turnCount: archive.turnCount ?? Math.max(1, ...logs.map(log => log.turn || 1)),
        keyEvents: Array.isArray(archive.keyEvents) ? archive.keyEvents : [],
        debugLogCount: archive.debugLogCount ?? logs.filter(log => !!log.debugType || !!log.debugData).length,
        publicLogCount: archive.publicLogCount ?? logs.filter(log => !log.visibleTo?.length && !log.debugType).length,
        schemaVersion: CURRENT_ARCHIVE_SCHEMA_VERSION,
    };
};
