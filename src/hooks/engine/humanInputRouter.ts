// 人类输入路由：决定一笔提交由哪个座位的 waiter 消费。纯函数、无 React。
//
// 联机路径带显式 playerId（房主按 WS 连接身份查到的 actingPlayer.id），
// 只允许命中该玩家自己的 waiter，未命中必须拒绝——绝不回退到
// currentSpeakerId 或「唯一等待者」，否则迟到/超时后的提交会把输入
// 注入到当前等待的其他玩家头上（2026-09-27 审计 P0-1）。
// 未带归属的单机旧面板保留原回退语义：当前发言者 → 唯一本地等待者。

export interface HumanInputRouteContext {
    /** 联机提交的显式归属座位；单机旧面板为 null/undefined */
    explicitPlayerId?: number | null;
    /** 当前发言者座位（单机回退第 1 顺位） */
    currentSpeakerId?: number | null;
    /** 该座位在本地 waiter 或跨实例全局登记中是否有活跃等待者 */
    isWaiting: (playerId: number) => boolean;
    /** 本地 waiter 座位列表 */
    localWaiterIds: number[];
    /** 跨实例全局登记的座位数（原语义：>1 时禁用唯一等待者兜底） */
    globalWaiterCount: number;
}

/** 返回应消费该输入的座位 id；null = 拒绝（调用方据此回 ACK failure）。 */
export function routeHumanInput(ctx: HumanInputRouteContext): number | null {
    if (ctx.explicitPlayerId != null) {
        return ctx.isWaiting(ctx.explicitPlayerId) ? ctx.explicitPlayerId : null;
    }
    const speaker = ctx.currentSpeakerId;
    if (speaker != null && ctx.isWaiting(speaker)) {
        return speaker;
    }
    if (ctx.localWaiterIds.length === 1 && ctx.globalWaiterCount <= 1) {
        return ctx.localWaiterIds[0];
    }
    return null;
}
