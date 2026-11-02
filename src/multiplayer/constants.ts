// 与 server/room-manager.ts 的 DEFAULT_DISCONNECT_GRACE_MS 保持一致：
// 客户端重连计划（1s/2s/4s/8s/15s/25s，合计 55 秒）必须落在宽限期内，
// 否则手机锁屏一次就会把座位踢掉。服务端下发的 disconnectGraceMs 优先于这个默认值。
export const DEFAULT_DISCONNECT_GRACE_MS = 60_000;

// 联机座位人类输入等待上限,超时由 AI 托管接管(与引擎/输入面板共用)
// 默认值;GameConfig.humanInputTimeoutMs 可覆盖
export const HUMAN_INPUT_TIMEOUT_MS = 120_000;

// 单机人类输入等待上限:避免挂机/漏看询问导致对局永久卡死,超时同样由 AI 托管
// 默认值;GameConfig.humanInputTimeoutMs 可覆盖
export const SINGLE_PLAYER_HUMAN_INPUT_TIMEOUT_MS = 120_000;

export const TERMINAL_WS_CLOSE_CODES = new Set([4001, 4002, 4003, 4004, 4005]);

export const isTerminalWsCloseCode = (code: number) => TERMINAL_WS_CLOSE_CODES.has(code);
