const ROOM_SERVER_BASE_STORAGE_KEY = 'ai-werewolf.roomServerBaseUrl';
const DEFAULT_ROOM_HTTP_BASE = '/api/room';

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const normalizeRoomServerBase = (value: string) => {
    const trimmed = stripTrailingSlashes(value.trim());
    if (!trimmed) return '';
    if (trimmed.startsWith('/')) return trimmed;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const getEnvRoomServerBase = () => {
    const envBase = import.meta.env.VITE_ROOM_SERVER_BASE_URL;
    return typeof envBase === 'string' ? normalizeRoomServerBase(envBase) : '';
};

export const getRoomServerBaseSetting = () => {
    if (typeof window === 'undefined') return getEnvRoomServerBase();
    return normalizeRoomServerBase(window.localStorage.getItem(ROOM_SERVER_BASE_STORAGE_KEY) || getEnvRoomServerBase());
};

export const setRoomServerBaseSetting = (value: string) => {
    if (typeof window === 'undefined') return;
    const normalized = normalizeRoomServerBase(value);
    if (normalized) {
        window.localStorage.setItem(ROOM_SERVER_BASE_STORAGE_KEY, normalized);
    } else {
        window.localStorage.removeItem(ROOM_SERVER_BASE_STORAGE_KEY);
    }
};

const appendApiPath = (base: string) => {
    if (!base) return DEFAULT_ROOM_HTTP_BASE;
    if (base.endsWith('/api') || base.endsWith('/api/room')) return base;
    return `${base}/api`;
};

const toAbsoluteWsBase = (httpBase: string) => {
    const wsPath = `${httpBase}/ws`;
    if (typeof window === 'undefined') return wsPath;
    if (httpBase.startsWith('/')) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}${wsPath}`;
    }
    const parsed = new URL(wsPath);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return parsed.toString();
};

export const getRoomHttpBase = () => appendApiPath(getRoomServerBaseSetting());

export const getRoomWsBase = () => toAbsoluteWsBase(getRoomHttpBase());
