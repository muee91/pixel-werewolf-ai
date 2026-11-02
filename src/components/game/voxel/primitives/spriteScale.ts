/**
 * 像素道具的放大倍数：按"容器高度预算"取最大整数倍，1× 保底。
 *
 * 为什么不能写死 2×：0x72 的手持物是 16×28（剑 10×21、弓 26 行），
 * 在 32px 的预算里 2× 会到 56px，直接顶穿座位卡与道具栏。
 * 16×16 的道具仍然照旧 2×，两者混排时各自落位、互不溢出。
 */
export interface SpriteSize {
    w: number;
    h: number;
}

export const itemPixelScale = (sprite: SpriteSize | undefined, small = false, fit?: number): number => {
    const maxPx = small ? 1 : 2;
    if (!sprite) return maxPx;
    const budget = fit ?? (small ? 16 : 32);
    return Math.max(1, Math.min(maxPx, Math.floor(budget / sprite.h)));
};
