/**
 * 开局前改板子：人数不变，只换"神职 ↔ 村民"这一格。
 *
 * 为什么只动神职：狼人数量是胜负条件的基数，改一个狼就可能出现
 * "只剩屠边/屠城二选一"的规则空洞；而神职与村民互换永远是同一阵营内部换牌，
 * 屠边判定的分母不变，规则层不需要任何特殊处理。
 */

import { GOD_ROLES, ROLE_INFO, Role, VILLAGER_ROLES, WOLF_ROLES } from '../types';

export const countRole = (roles: Role[], role: Role): number =>
    roles.reduce((total, item) => (item === role ? total + 1 : total), 0);

export interface LineupSummary {
    total: number;
    wolves: number;
    gods: number;
    villagers: number;
}

export const summarizeLineup = (roles: Role[]): LineupSummary => ({
    total: roles.length,
    wolves: roles.filter(role => WOLF_ROLES.includes(role)).length,
    gods: roles.filter(role => GOD_ROLES.includes(role)).length,
    villagers: roles.filter(role => VILLAGER_ROLES.includes(role)).length,
});

export type LineupTeam = 'wolf' | 'god' | 'villager';

export const LINEUP_TEAM_ORDER: LineupTeam[] = ['wolf', 'god', 'villager'];

export const lineupTeamOf = (role: Role): LineupTeam => {
    if (WOLF_ROLES.includes(role)) return 'wolf';
    if (GOD_ROLES.includes(role)) return 'god';
    return 'villager';
};

export interface LineupRow {
    team: LineupTeam;
    /** 这个阵营的牌数，等于 roles 里所有 count 之和 */
    total: number;
    roles: { role: Role; label: string; count: number }[];
}

/**
 * 把一手牌按阵营摊平：狼/神/民各一行，行内按具体角色去重计数。
 *
 * 首页侧栏原来直接展示「板子预设」的阵容，而下方摘要展示的是「玩家改过的草稿」，
 * 改过神职之后两处人数会当场打架（截图里 狼4·神6·民1 对上 狼4 预言家1 女巫1 猎人1 村民4）。
 * 现在两边都从这里出，只认一个来源。空阵营不占行。
 */
export const groupLineupByTeam = (roles: Role[]): LineupRow[] =>
    LINEUP_TEAM_ORDER
        .map(team => {
            const inTeam = roles.filter(role => lineupTeamOf(role) === team);
            const counts = new Map<Role, number>();
            inTeam.forEach(role => counts.set(role, (counts.get(role) ?? 0) + 1));
            return {
                team,
                total: inTeam.length,
                roles: [...counts.entries()]
                    .map(([role, count]) => ({ role, label: ROLE_INFO[role]?.label || String(role), count })),
            };
        })
        .filter(row => row.total > 0);

/**
 * 开/关一个神职：开 = 拿一个村民换它；关 = 把它换回村民。
 *
 * 没有村民可换时"开"无效（不能凭空多一个座位），
 * 板子里没有这个神职时"关"也无效。返回新数组，调用方不用自己判空。
 */
export const toggleRoleInLineup = (roles: Role[], role: Role, enabled: boolean): Role[] => {
    const next = [...roles];
    if (enabled) {
        const villagerIndex = next.findIndex(item => VILLAGER_ROLES.includes(item));
        if (villagerIndex < 0) return roles;
        next[villagerIndex] = role;
        return next;
    }
    const roleIndex = next.indexOf(role);
    if (roleIndex < 0) return roles;
    next[roleIndex] = Role.VILLAGER;
    return next;
};

export interface LineupIssue {
    level: 'error';
    message: string;
}

/**
 * 开局前的硬校验。轮子不该在"少一张牌"的局里转起来，
 * 所以这里宁可拦下来，也不让引擎跑到一半发现人数不对。
 */
export const validateLineup = (roles: Role[], playerCount: number): LineupIssue[] => {
    const issues: LineupIssue[] = [];
    if (roles.length !== playerCount) {
        issues.push({ level: 'error', message: `座位 ${playerCount} 个，但牌发了 ${roles.length} 张` });
    }
    const summary = summarizeLineup(roles);
    if (summary.wolves === 0) {
        issues.push({ level: 'error', message: '至少要有一张狼人牌，否则开局即判好人胜利' });
    }
    if (summary.wolves > 0 && summary.total - summary.wolves === 0) {
        issues.push({ level: 'error', message: '不能全是狼人：需要一个好人阵营' });
    }
    return issues;
};

/** 这个神职能不能被打开（还有村民可以换） */
export const canEnableRole = (roles: Role[]): boolean =>
    roles.some(role => VILLAGER_ROLES.includes(role));
