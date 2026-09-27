
import React, { useState } from 'react';
import { McIcon } from './game/voxel/primitives';
import { useSetAtom } from 'jotai';
import { appScreenAtom } from '../store';
import { GAME_PRESETS, ROLE_INFO, Role, WOLF_ROLES, GOD_ROLES } from '../types';
import { clsx } from 'clsx';

const ROLES_DATA = [
    {
        team: 'wolf' as const,
        teamLabel: '狼人阵营',
        teamIcon: '🐺',
        teamColor: 'from-th-accent2 to-th-accent2',
        teamBg: 'bg-th-accent2/10',
        teamBorder: 'border-th-accent2/20',
        roles: [
            { role: Role.WEREWOLF, desc: '每晚可以选择一名玩家击杀。狼人之间互相认识，可以互相沟通。', skills: ['夜间击杀', '狼人互认'] },
            { role: Role.WOLF_KING, desc: '拥有狼人全部能力。死亡后可以开枪带走一名玩家。', skills: ['夜间击杀', '狼人互认', '死亡开枪'] },
            { role: Role.WHITE_WOLF_KING, desc: '拥有狼人全部能力。白天可以自爆并指刀一名玩家（自爆后当天直接进入黑夜）。', skills: ['夜间击杀', '狼人互认', '自爆指刀'] },
            { role: Role.STONE_GHOST, desc: '狼人阵营但无法参与狼人夜间讨论。每晚可以查验一名玩家的具体身份。', skills: ['查验身份', '独立行动'] },
            { role: Role.BLOOD_MOON_DISCIPLE, desc: '狼人阵营。白天自爆后封印当晚所有神职技能（预言家不能查、女巫不能用药、守卫不能守）。', skills: ['夜间击杀', '自爆封印神职'] },
        ]
    },
    {
        team: 'god' as const,
        teamLabel: '神职阵营',
        teamIcon: '✨',
        teamColor: 'from-th-accent1 to-th-accent3',
        teamBg: 'bg-th-accent1/10',
        teamBorder: 'border-th-accent1/20',
        roles: [
            { role: Role.SEER, desc: '每晚可以查验一名玩家是好人还是狼人。是好人阵营最重要的信息来源。', skills: ['查验阵营'] },
            { role: Role.WITCH, desc: '拥有一瓶解药和一瓶毒药。解药可救夜晚被杀的人，毒药可毒杀任意一名玩家。每瓶药只能使用一次。', skills: ['解药救人', '毒药杀人'] },
            { role: Role.HUNTER, desc: '死亡时可以开枪带走一名玩家。注意：被女巫毒杀时不能开枪。', skills: ['死亡开枪'] },
            { role: Role.GUARD, desc: '每晚可以守护一名玩家使其免受狼人袭击。不能连续两晚守同一人。', skills: ['夜间守护'] },
            { role: Role.IDIOT, desc: '被投票放逐时翻牌亮明身份，不会死亡，但之后失去投票权。仍可发言。', skills: ['投票免疫'] },
            { role: Role.KNIGHT, desc: '白天可以在发言环节挑战一名玩家决斗。若对方是狼人则对方死亡，若对方是好人则骑士自己死亡。', skills: ['决斗挑战'] },
            { role: Role.GRAVEKEEPER, desc: '每晚可以查验上一轮被放逐的玩家是好人还是狼人。', skills: ['查验死者阵营'] },
            { role: Role.DEMON_HUNTER, desc: '每晚可猎杀一名玩家；若目标是狼人则目标死亡，否则猎魔人自己死亡。', skills: ['夜间猎杀'] },
            { role: Role.CUPID, desc: '第一个夜晚选择两名玩家成为情侣。情侣一方死亡则另一方殉情。情侣可成为第三方阵营。', skills: ['连结情侣'] },
            { role: Role.MIRACLE_MERCHANT, desc: '每晚将一项技能（查验/毒药/守护）发放给一名玩家。若技能给了狼人则商人死亡。', skills: ['发放技能'] },
        ]
    },
    {
        team: 'villager' as const,
        teamLabel: '平民阵营',
        teamIcon: '🧑',
        teamColor: 'from-th-muted to-th-muted',
        teamBg: 'bg-th-bg2',
        teamBorder: 'border-th-border',
        roles: [
            { role: Role.VILLAGER, desc: '没有特殊技能，依靠逻辑推理和发言分析找出狼人。是好人阵营的基石。', skills: ['投票权'] },
        ]
    }
];

const FLOW_STEPS = [
    { icon: '🌙', label: '入夜', desc: '上帝宣布天黑请闭眼' },
    { icon: '🐺', label: '狼人行动', desc: '狼人睁眼选择击杀目标' },
    { icon: '🔮', label: '神职行动', desc: '预言家查验、女巫用药、守卫守护等依次行动' },
    { icon: '☀️', label: '天亮', desc: '上帝宣布昨晚死亡情况' },
    { icon: '🗣️', label: '竞选警长', desc: '玩家竞选警长，警长票算1.5票（首日）' },
    { icon: '💬', label: '白天讨论', desc: '存活玩家依次发言' },
    { icon: '🗳️', label: '投票放逐', desc: '投票选出一名玩家放逐' },
    { icon: '🔄', label: '循环', desc: '重复夜晚-白天流程直到一方获胜' },
];

const WIN_CONDITIONS = [
    { team: '好人阵营', icon: '😇', condition: '所有狼人被消灭', color: 'text-th-accent1 bg-th-accent1/10' },
    { team: '狼人阵营', icon: '🐺', condition: '所有平民死亡 或 所有神职死亡（屠边）', color: 'text-th-accent2 bg-th-accent2/10' },
    { team: '第三方阵营', icon: '💘', condition: '丘比特情侣存活到最后（需开启第三方模式）', color: 'text-th-accent2 bg-th-accent2/10' },
];

type TabType = 'roles' | 'flow' | 'presets';

const RulesView = () => {
    const setScreen = useSetAtom(appScreenAtom);
    const [activeTab, setActiveTab] = useState<TabType>('roles');
    const [expandedRole, setExpandedRole] = useState<Role | null>(null);

    return (
        <div className="vw-settings w-full bg-th-bg flex flex-col relative overflow-hidden" style={{ height: '100dvh' }}>
            <div className="flex items-center min-h-14 sm:min-h-16 bg-th-card/70 border-b-[3px] border-th-border px-4 sm:px-6 sticky top-0 z-20 shadow-[3px_3px_0_var(--voxel-ink)] justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">📖</span>
                    <h2 className="text-lg font-black text-th-fg tracking-tight">规则手册</h2>
                </div>
                <button onClick={() => setScreen('HOME')} className="text-th-muted font-bold hover:text-th-fg transition-colors">关闭</button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative z-10">
                <div className="max-w-2xl mx-auto w-full p-4 pb-[calc(2rem+var(--safe-area-inset-bottom))]">
                    <div className="flex gap-1 p-1 bg-th-card/70 rounded-none border-[3px] border-th-border shadow-[3px_3px_0_var(--voxel-ink)] mb-4">
                        {([
                            { key: 'roles' as TabType, label: '角色图鉴', icon: '🎭' },
                            { key: 'flow' as TabType, label: '游戏流程', icon: '🔄' },
                            { key: 'presets' as TabType, label: '内置板子', icon: '🎲' },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={clsx(
                                    "flex-1 py-2.5 rounded-none text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1",
                                    activeTab === tab.key
                                        ? "bg-th-accent1 text-white shadow-[3px_3px_0_var(--voxel-ink)]"
                                        : "text-th-muted hover:text-th-fg hover:bg-th-bg2"
                                )}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {activeTab === 'roles' && (
                        <div className="space-y-4">
                            {ROLES_DATA.map(team => (
                                <div key={team.team} className={clsx("rounded-none border-[3px] overflow-hidden", team.teamBorder)}>
                                    <div className={clsx("px-4 py-3 bg-gradient-to-r text-white flex items-center gap-2", team.teamColor)}>
                                        <span className="text-xl">{team.teamIcon}</span>
                                        <span className="font-black text-base">{team.teamLabel}</span>
                                    </div>
                                    <div className={clsx("p-3 space-y-2", team.teamBg)}>
                                        {team.roles.map(r => {
                                            const info = ROLE_INFO[r.role];
                                            const isExpanded = expandedRole === r.role;
                                            return (
                                                <div
                                                    key={r.role}
                                                    onClick={() => setExpandedRole(isExpanded ? null : r.role)}
                                                    className={clsx(
                                                        "bg-th-card/70 rounded-none border-[3px] transition-all cursor-pointer",
                                                        isExpanded ? "border-th-accent1/30 shadow-[3px_3px_0_var(--voxel-ink)]" : "border-th-border hover:border-th-border"
                                                    )}
                                                >
                                                    <div className="px-4 py-3 flex items-center gap-3">
                                                        <span className="text-2xl">{info.icon}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-th-fg text-sm">{info.label}</div>
                                                            {!isExpanded && (
                                                                <div className="text-[11px] text-th-muted truncate mt-0.5">{r.desc}</div>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1 flex-shrink-0">
                                                            {r.skills.map(s => (
                                                                <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded-none bg-th-accent1/10 text-th-accent1 whitespace-nowrap">{s}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="px-4 pb-3 pt-0">
                                                            <div className="text-xs text-th-fg leading-relaxed border-t border-th-border pt-2">{r.desc}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'flow' && (
                        <div className="space-y-4">
                            <div className="bg-th-card/70 rounded-none border-[3px] border-th-border overflow-hidden shadow-[3px_3px_0_var(--voxel-ink)]">
                                <div className="px-4 py-3 bg-gradient-to-r from-th-accent1 to-th-accent3 text-white">
                                    <div className="font-black text-base flex items-center gap-2">
                                        <span>🔄</span> 标准游戏流程
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    {FLOW_STEPS.map((step, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <div className="flex flex-col items-center">
                                                <div className="w-10 h-10 rounded-none bg-th-accent1/10 flex items-center justify-center text-lg flex-shrink-0">{step.icon}</div>
                                                {i < FLOW_STEPS.length - 1 && <div className="w-0.5 h-4 bg-th-accent1/20 mt-1"></div>}
                                            </div>
                                            <div className="pt-1">
                                                <div className="font-bold text-th-fg text-sm">{step.label}</div>
                                                <div className="text-xs text-th-muted mt-0.5">{step.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-th-card/70 rounded-none border-[3px] border-th-border overflow-hidden shadow-[3px_3px_0_var(--voxel-ink)]">
                                <div className="px-4 py-3 bg-gradient-to-r from-th-accent1 to-th-accent1 text-white">
                                    <div className="font-black text-base flex items-center gap-2">
                                        <span>🏆</span> 胜利条件
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    {WIN_CONDITIONS.map((wc, i) => (
                                        <div key={i} className={clsx("px-4 py-3 rounded-none", wc.color)}>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xl">{wc.icon}</span>
                                                <span className="font-bold text-sm">{wc.team}</span>
                                            </div>
                                            <div className="text-xs mt-1 opacity-80">{wc.condition}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'presets' && (
                        <div className="space-y-3">
                            {GAME_PRESETS.map(preset => {
                                const roleCount: Record<string, { count: number; icon: string }> = {};
                                for (const r of preset.roles) {
                                    const info = ROLE_INFO[r];
                                    const label = info ? info.label : r;
                                    if (!roleCount[label]) roleCount[label] = { count: 0, icon: info?.icon || '❓' };
                                    roleCount[label].count++;
                                }
                                return (
                                    <div key={preset.key} className="bg-th-card/70 rounded-none border-[3px] border-th-border p-4 shadow-[3px_3px_0_var(--voxel-ink)]">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-2xl"><McIcon icon={preset.icon} px={2} /></span>
                                            <div>
                                                <div className="font-black text-th-fg text-sm">{preset.label}</div>
                                                <div className="text-[10px] text-th-muted font-bold">{preset.playerCount}人局</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-th-muted mb-3">{preset.description}</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(roleCount).map(([name, data]) => (
                                                <span key={name} className="text-[10px] font-bold px-2 py-1 rounded-none bg-th-bg2 text-th-fg flex items-center gap-1">
                                                    <span>{data.icon}</span>
                                                    {name}×{data.count}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RulesView;
