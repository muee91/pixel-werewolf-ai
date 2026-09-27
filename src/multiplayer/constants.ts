export const DEFAULT_DISCONNECT_GRACE_MS = 10_000;

// 联机座位人类输入等待上限,超时由 AI 托管接管(与引擎/输入面板共用)
export const HUMAN_INPUT_TIMEOUT_MS = 120_000;

// 单机人类输入等待上限:避免挂机/漏看询问导致对局永久卡死,超时同样由 AI 托管
export const SINGLE_PLAYER_HUMAN_INPUT_TIMEOUT_MS = 120_000;

export const TERMINAL_WS_CLOSE_CODES = new Set([4001, 4002, 4003, 4004, 4005]);

export const isTerminalWsCloseCode = (code: number) => TERMINAL_WS_CLOSE_CODES.has(code);
