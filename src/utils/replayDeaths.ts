import { PlayerStatus } from '../types';

export type DeathInfo = { id: number; status: PlayerStatus };

const extractSeatNumbers = (text: string): number[] => {
    const numbers: number[] = [];
    const groups = text.match(/(\d+(?:[、，,和\s]+\d+)*)号/g);
    if (groups) {
        groups.forEach(g => {
            const found = g.match(/\d+/g);
            if (found) found.forEach(n => numbers.push(parseInt(n)));
        });
    }
    return numbers;
};

// 回放中用精确句式识别死亡，并按句式标注正确的死亡子状态，
// 避免宽泛的“含死亡/倒牌就抓所有X号”把“警徽传给X号/带走Y号”里的幸存者误标死亡。
export const detectDeaths = (content: string): DeathInfo[] => {
    const deaths = new Map<number, PlayerStatus>();

    // --- 精确句式 ---
    const vote = content.match(/(\d+)号\s*被投票出局/);
    if (vote) deaths.set(parseInt(vote[1]), PlayerStatus.DEAD_VOTE);

    const sheriffOut = content.match(/(\d+)号警长出局/);
    if (sheriffOut) deaths.set(parseInt(sheriffOut[1]), PlayerStatus.DEAD_VOTE);

    const poison = content.match(/毒死了\s*(\d+)号/);
    if (poison) deaths.set(parseInt(poison[1]), PlayerStatus.DEAD_POISON);

    const explode = content.match(/(\d+)号\s*自爆/);
    if (explode) deaths.set(parseInt(explode[1]), PlayerStatus.EXPLODED);

    const carried = content.match(/自爆带走了\s*(\d+)号/);
    if (carried) deaths.set(parseInt(carried[1]), PlayerStatus.DEAD_SHOOT);

    const duelWolf = content.match(/决斗！(\d+)号\s*是狼人，被决斗击杀/);
    if (duelWolf) deaths.set(parseInt(duelWolf[1]), PlayerStatus.DEAD_SHOOT);

    const duelKnight = content.match(/(\d+)号骑士自己死亡/);
    if (duelKnight) deaths.set(parseInt(duelKnight[1]), PlayerStatus.DEAD_SHOOT);

    const martyr = content.match(/(\d+)号(?:警长)?\s*殉情死亡/);
    if (martyr) deaths.set(parseInt(martyr[1]), PlayerStatus.DEAD_NIGHT);

    const sheriffNight = content.match(/(\d+)号警长夜间死亡/);
    if (sheriffNight) deaths.set(parseInt(sheriffNight[1]), PlayerStatus.DEAD_NIGHT);

    // 兼容两种句式：新版“昨晚 3号、1号 死亡”与旧版“昨晚 3, 1号 死亡”（历史存档/回放）
    const nightDeath = content.match(/昨晚\s*((?:\d{1,2}\s*号?[、，,\s]+)*\d{1,2}\s*号?)\s*死亡/);
    if (nightDeath) {
        extractSeatNumbers(nightDeath[0]).forEach(id => deaths.set(id, PlayerStatus.DEAD_NIGHT));
    }

    // 倒牌播报形如“猎人 4号、狼王 9号 倒牌”/“猎人开枪，7号 倒牌”，
    // 角色词会夹在编号之间，因此对整行提取全部 X号（该行内所有编号都是死者）。
    if (content.includes("倒牌")) {
        extractSeatNumbers(content).forEach(id => deaths.set(id, PlayerStatus.DEAD_SHOOT));
    }

    // --- 兜底：仅当没有精确句式命中、且正文不含“幸存者锚点词”时，
    // 用“含死亡/倒牌关键词就抓所有X号”覆盖未知的新播报句式。
    if (deaths.size === 0 && !/(警徽|传给|继承|移交|带走|不是狼人|后续)/.test(content)) {
        const hasDeathKeyword = content.includes("死亡") || content.includes("倒牌") || content.includes("出局");
        if (hasDeathKeyword) {
            extractSeatNumbers(content).forEach(id => deaths.set(id, content.includes("倒牌") ? PlayerStatus.DEAD_SHOOT : PlayerStatus.DEAD_NIGHT));
        }
    }

    return Array.from(deaths.entries()).map(([id, status]) => ({ id, status }));
};