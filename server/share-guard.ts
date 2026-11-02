// 配置分享的安全原语：口令生成、格式校验、脱敏展示、按 IP 的尝试限速。
// 纯逻辑、无 I/O，便于单测；room-server.ts 的 GET(拉取)与 POST(发布)两个分支共用。
import { randomBytes } from 'crypto';

// 10 位小写十六进制（40 bit）：对"照着房主屏幕手抄"可承受；
// 配合按 IP 的失败锁定后，同网段设备无法在合理时间内穷举。
export const SHARE_CODE_LENGTH = 10;

export function generateShareCode(): string {
    return randomBytes(5).toString('hex');
}

export function isValidShareCode(code: unknown): code is string {
    return typeof code === 'string' && new RegExp(`^[0-9a-f]{${SHARE_CODE_LENGTH}}$`).test(code);
}

/** 日志里只留口令片段，完整口令只返回给发布方 */
export function maskShareCode(code: string): string {
    return code.length <= 4 ? '****' : `${code.slice(0, 2)}…${code.slice(-2)}`;
}

export interface AttemptLimiter {
    /** 记录一次失败；达到阈值时返回锁定截止时间戳，否则返回 null */
    recordFailure(key: string): number | null;
    /** 处于锁定中返回剩余毫秒；否则返回 0 并清掉已过期的记录 */
    lockRemainingMs(key: string): number;
    clear(key: string): void;
}

export function createAttemptLimiter(maxFailures: number, lockMs: number): AttemptLimiter {
    const attempts = new Map<string, { count: number; until: number }>();
    return {
        recordFailure(key) {
            const cur = attempts.get(key) || { count: 0, until: 0 };
            cur.count += 1;
            attempts.set(key, cur);
            if (cur.count >= maxFailures) {
                cur.until = Date.now() + lockMs;
                cur.count = 0;
                return cur.until;
            }
            return null;
        },
        lockRemainingMs(key) {
            const cur = attempts.get(key);
            if (!cur) return 0;
            const remaining = cur.until - Date.now();
            if (remaining <= 0) {
                // until=0 表示尚未锁定过，只累计失败计数、不清记录；
                // 已锁定但过期的才删掉，让下一次失败从头计起。
                if (cur.until > 0) attempts.delete(key);
                return 0;
            }
            return remaining;
        },
        clear(key) {
            attempts.delete(key);
        },
    };
}
