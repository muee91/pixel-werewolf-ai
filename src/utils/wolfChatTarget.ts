// 狼刀兜底解析:最后决策的狼人漏填 actionTarget 时,
// 从本轮狼聊里统计"刀/杀/带走/猎 + X号"的多数意见,
// 避免引擎随机刀口与狼队商议的目标相互矛盾。

const CN_NUM: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9,
};

const parseSeatToken = (raw: string): number | null => {
    if (/^\d{1,2}$/.test(raw)) return parseInt(raw, 10);
    if (raw === '十') return 10;
    if (raw.length === 2 && raw.startsWith('十')) {
        const unit = CN_NUM[raw[1]];
        return unit ? 10 + unit : null;
    }
    return CN_NUM[raw] ?? null;
};

// 只认明确带伤害指向的动词,避免把"6号跳预言家""12号集中投票"里的座位号当成刀口
const KILL_INTENT = /(?:刀|杀|斩|干掉|带走|猎)[^。！？]{0,6}?(十一|十二|十|[一二三四五六七八九]|\d{1,2})\s*号/g;

export const extractWolfChatTarget = (texts: string[], validTargets: number[]): number | null => {
    const counts = new Map<number, number>();
    let lastMention: number | null = null;
    for (const text of texts) {
        if (!text) continue;
        KILL_INTENT.lastIndex = 0;
        for (let m = KILL_INTENT.exec(text); m; m = KILL_INTENT.exec(text)) {
            const seat = parseSeatToken(m[1]);
            if (seat === null || !validTargets.includes(seat)) continue;
            counts.set(seat, (counts.get(seat) ?? 0) + 1);
            lastMention = seat;
        }
    }
    let best: number | null = null;
    let bestCount = 0;
    for (const [seat, count] of counts) {
        if (count > bestCount || (count === bestCount && seat === lastMention)) {
            best = seat;
            bestCount = count;
        }
    }
    return best;
};
