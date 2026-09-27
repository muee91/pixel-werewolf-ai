// 逐板子玩法审计:对全部 GAME_PRESETS 做一致性/平衡性检查(只读,不修改)
// 运行:npx tsx scripts/audit-boards.ts
import { GAME_PRESETS, GOD_ROLES, VILLAGER_ROLES, ROLE_INFO, WOLF_ROLES, type Role } from '../src/types';

type Issue = { level: 'P0' | 'P1' | 'P2' | 'INFO'; msg: string };

const SPECIAL_ROLE_RULES: Partial<Record<Role, { flag: keyof typeof rulesRef; desc: string }>> = {};
// rules 引用占位:在循环内按 preset.rules 取值
const rulesRef = {
    knightChallengeEnabled: null,
    stoneGhostCheckIdentity: null,
    gravekeeperCheckIdentity: null,
    demonHunterHunt: null,
    cupidLinkLovers: null,
    miracleMerchantGiveSkill: null,
    whiteWolfKingExplodeShoot: null,
    bloodMoonBlockAbilities: null,
} as Record<string, unknown>;

const issuesByBoard = new Map<string, Issue[]>();
const report = (board: string, level: Issue['level'], msg: string) => {
    if (!issuesByBoard.has(board)) issuesByBoard.set(board, []);
    issuesByBoard.get(board)!.push({ level, msg });
};

let totalIssues = 0;
for (const preset of GAME_PRESETS) {
    const tag = `${preset.key}(${preset.label})`;
    const issues: Issue[] = [];
    const roles = preset.roles as string[];
    const count = (r: string) => roles.filter(x => x === r).length;
    const wolves = roles.filter(r => WOLF_ROLES.includes(r as Role)).length;
    const villagers = roles.filter(r => VILLAGER_ROLES.includes(r as Role)).length;
    const gods = roles.filter(r => GOD_ROLES.includes(r as Role)).length;
    const rules = preset.rules;

    // 1) 人数一致性
    if (roles.length !== preset.playerCount) {
        issues.push({ level: 'P0', msg: `角色数 ${roles.length} ≠ 板子人数 ${preset.playerCount}` });
    }

    // 2) 阵营基本盘
    if (wolves === 0) issues.push({ level: 'P0', msg: '没有狼人,游戏无法进行' });
    if (wolves >= preset.playerCount - wolves) {
        issues.push({ level: 'P0', msg: `狼 ${wolves} vs 好人 ${preset.playerCount - wolves}:狼人不少于好人,白天投票永远投不过` });
    }
    if (villagers === 0 && gods === 0) issues.push({ level: 'P0', msg: '没有好人阵营' });
    if (villagers === 0) issues.push({ level: 'P2', msg: '无纯村民(屠边判定下狼人只需屠尽神职)' });
    if (gods === 0) issues.push({ level: 'P2', msg: '无神职(屠边判定下狼人只需屠尽村民)' });

    // 3) 狼人比例参考
    const ratio = Math.round((wolves / preset.playerCount) * 100);
    if (ratio < 20 || ratio > 40) {
        issues.push({ level: 'INFO', msg: `狼人比例 ${ratio}% 偏离常见区间(20%~40%)` });
    }

    // 4) 特殊角色 ↔ 规则开关一致性
    const has = (r: string) => roles.includes(r);
    if (has('KNIGHT') && !rules.knightChallengeEnabled) {
        issues.push({ level: 'P1', msg: '板子含骑士,但 knightChallengeEnabled=false:骑士整局无技能(纯白板神职)' });
    }
    if (has('STONE_GHOST') && !rules.stoneGhostCheckIdentity) {
        issues.push({ level: 'P1', msg: '板子含石像鬼,但 stoneGhostCheckIdentity=false:石像鬼整局无技能' });
    }
    if (has('GRAVEKEEPER') && !rules.gravekeeperCheckIdentity) {
        issues.push({ level: 'P1', msg: '板子含守墓人,但 gravekeeperCheckIdentity=false:守墓人整局无技能' });
    }
    if (has('DEMON_HUNTER') && !rules.demonHunterHunt) {
        issues.push({ level: 'P1', msg: '板子含猎魔人,但 demonHunterHunt=false:猎魔人整局无技能' });
    }
    if (has('CUPID') && !rules.cupidLinkLovers) {
        issues.push({ level: 'P0', msg: '板子含丘比特,但 cupidLinkLovers=false:丘比特整局无技能' });
    }
    if (has('MIRACLE_MERCHANT') && !rules.miracleMerchantGiveSkill) {
        issues.push({ level: 'P0', msg: '板子含奇迹商人,但 miracleMerchantGiveSkill=false:商人整局无技能' });
    }
    if (has('WHITE_WOLF_KING') && !rules.whiteWolfKingExplodeShoot) {
        issues.push({ level: 'P1', msg: '板子含白狼王,但 whiteWolfKingExplodeShoot=false:白狼王自爆带人失效' });
    }
    if (has('BLOOD_MOON_DISCIPLE') && !rules.bloodMoonBlockAbilities) {
        issues.push({ level: 'P1', msg: '板子含血月使徒,但 bloodMoonBlockAbilities=false:封印能力失效' });
    }

    // 5) 关键单例角色重复
    for (const singleton of ['WITCH', 'SEER', 'HUNTER', 'GUARD', 'KNIGHT', 'CUPID', 'MIRACLE_MERCHANT', 'STONE_GHOST', 'GRAVEKEEPER', 'DEMON_HUNTER'] as Role[]) {
        const n = count(singleton);
        if (n > 1) {
            const extra = singleton === 'WITCH' ? '(注意:每位女巫各有一套解药+毒药,药水翻倍)' : '';
            issues.push({ level: 'P2', msg: `${ROLE_INFO[singleton]?.label ?? singleton} × ${n},非标准配置${extra}` });
        }
    }

    // 6) 女巫/守卫互爆组合提示
    if (has('GUARD') && has('WITCH')) {
        issues.push({
            level: 'INFO',
            msg: `守卫+女巫同板:同守同救冲突=${rules.guardHealConflictKills ? '死亡' : '存活'},守卫挡毒=${rules.guardBlocksPoison ? '可挡' : '不可挡'}`,
        });
    }

    // 7) 血月使徒在无神局
    if (has('BLOOD_MOON_DISCIPLE') && gods === 0) {
        issues.push({ level: 'P1', msg: '血月使徒的封印目标(神职)不存在' });
    }

    // 8) 警长权重与人数
    if (rules.sheriffElection && rules.sheriffVoteWeight !== 1 && rules.sheriffVoteWeight !== 1.5) {
        issues.push({ level: 'INFO', msg: `警长票权 ${rules.sheriffVoteWeight} 为非标准值` });
    }

    if (issues.length) totalIssues += issues.length;
    issuesByBoard.set(preset.key, issues);

    // 摘要行
    console.log(
        `${tag}  ${preset.playerCount}人 | 狼${wolves} 民${villagers} 神${gods} | 狼比${ratio}%` +
        (issues.length ? '' : '  ✅ 无问题'),
    );
}

console.log('\n════════ 发现的问题 ════════');
for (const preset of GAME_PRESETS) {
    const issues = issuesByBoard.get(preset.key) ?? [];
    if (!issues.length) continue;
    console.log(`\n[${preset.key} ${preset.label}]`);
    for (const it of issues) {
        console.log(`  [${it.level}] ${it.msg}`);
    }
}
console.log(`\n共 ${totalIssues} 条意见,覆盖 ${GAME_PRESETS.length} 个板子`);
