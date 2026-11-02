/**
 * 对局节奏（观战倍速）
 *
 * 为什么需要：云模型实测每条发言中位 22.5 秒，而固定演出等待（入夜、阶段切换、空场、
 * 台词占台）是叠加在模型延迟之上的。玩家想看得快，必须有一个总开关，
 * 而不是去改散布在引擎与各阶段里的十几个 setTimeout。
 *
 * 设计约束：
 * - 这里只管"演出与推进的等待"，不碰错误重试退避与人类操作超时（那些是安全边界，不该被倍速压缩）。
 * - 值持久化到 localStorage，但只在内存里广播，避免为一个按钮引入额外状态库依赖。
 * - 任何模块都可以 import，本文件不 import 任何 UI/引擎代码（防循环依赖）。
 */

const STORAGE_KEY = 'werewolf-gamePace';
// 这个键曾被一次改代码事故截断成一个含省略号的字符串（'werewol…ase'），
// 读写都用同一个错键，所以功能上没炸，但任何外部设置（E2E、排障脚本）写进去都无效。
// 保留一次迁移：老用户本地存的值不能因为改名而丢。
const LEGACY_STORAGE_KEY = 'werewol…ase';
const MAX_PACE = 8;

export const PACE_LEVELS = [1, 2, 4] as const;
export type PaceLevel = (typeof PACE_LEVELS)[number];

const clampPace = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return 1;
    return Math.min(MAX_PACE, Math.max(1, Math.round(value)));
};

const readInitialPace = (): number => {
    if (typeof window === 'undefined') return 1;
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const raw = Number(stored);
    return PACE_LEVELS.includes(raw as PaceLevel) ? raw : 1;
};

let currentPace = readInitialPace();
const listeners = new Set<() => void>();

export const getPace = (): number => currentPace;

export const subscribePace = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const setPace = (pace: number): void => {
    const next = clampPace(pace);
    if (next === currentPace) return;
    currentPace = next;
    try {
        window?.localStorage?.setItem(STORAGE_KEY, String(next));
    } catch { /* 隐私模式/配额不足时仅本次会话生效 */ }
    listeners.forEach(listener => listener());
};

/** HUD 用：1× → 2× → 4× → 1× 循环 */
export const cyclePace = (): number => {
    const idx = PACE_LEVELS.indexOf(currentPace as PaceLevel);
    const next = PACE_LEVELS[(idx + 1 + PACE_LEVELS.length) % PACE_LEVELS.length];
    setPace(next);
    return next;
};

/** 把一段固定等待折算成当前倍速下的毫秒数（倍速 ≥4 时演出等待基本归零，等价"跳过"） */
export const scaleWait = (ms: number): number => {
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.max(0, Math.round(ms / currentPace));
};

export const pacedWait = (ms: number): Promise<void> => new Promise(resolve => {
    const scaled = scaleWait(ms);
    if (scaled <= 0) { resolve(); return; }
    setTimeout(resolve, scaled);
});

/**
 * 2D 观战的台词占台时长：按"每秒约 7 个汉字"的阅读速度估算，
 * 落在 1.6s ~ 14s 之间（下限保证短句也看得见，上限避免长文把局拖死）。
 * 3D 的对白模型有自己的节奏（8~60s），由引擎侧继续用 getDialogueDurationMs。
 */
export const estimateSpectatorHold2d = (text: string): number => {
    const chars = (text || '').trim().length;
    if (!chars) return 0;
    return Math.min(14000, Math.max(1600, Math.round(chars * 140)));
};
