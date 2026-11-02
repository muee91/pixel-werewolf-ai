import React from 'react';
import { type GamePreset, type Role } from '../../types';
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';
import { CampIcon, PixelAvatar } from '../game/voxel/primitives';
import { lookFromSeed } from '../../utils/avatarLook';
import { groupLineupByTeam, type LineupIssue, type LineupSummary, type LineupTeam } from '../../utils/gameSetup';

/**
 * 首页右侧「出征清单」。
 *
 * 旧版是三块互不相干的小字（当前地图 / 阵容 chips / 对局配置），栏内还剩一大片空白：
 * 地图只有一行文字，阵容 chips 参差不齐地折两行，视角标签挤在「阵容组成」右边，
 * 主行动「点燃营火」被夹在中间。这里重排成一条从上到下的清单：
 *   板子卡头（哪张图、什么规则、去哪改） → 阵营台账（狼/神/民各一行、右侧大数字）
 *   → 座位预览（把剩余高度变成"这局坐着谁"，而不是留白） → 出发（唯一主行动）。
 */

const TEAM_META: Record<LineupTeam, { name: string; background: string; color: string }> = {
    wolf: { name: '狼人', background: T.redstoneInk, color: T.paper },
    god: { name: '神职', background: T.diamond, color: T.ink },
    villager: { name: '村民', background: T.emerald, color: T.ink },
};

export interface HomeLaunchAsideProps {
    preset?: GamePreset;
    /** 这一局真正要发的牌（改过就是改过的），台账与摘要都只认它 */
    roles: Role[];
    summary: LineupSummary;
    sheriffEnabled: boolean;
    isHumanMode: boolean;
    modelReady: boolean;
    setupIssues: LineupIssue[];
    onOpenSetup: () => void;
    onOpenModelSettings: () => void;
    onStart: () => void;
}

export const HomeLaunchAside: React.FC<HomeLaunchAsideProps> = ({
    preset,
    roles,
    summary,
    sheriffEnabled,
    isHumanMode,
    modelReady,
    setupIssues,
    onOpenSetup,
    onOpenModelSettings,
    onStart,
}) => {
    const rows = React.useMemo(() => groupLineupByTeam(roles), [roles]);
    const blocked = setupIssues.length > 0;
    const seats = Math.min(preset?.playerCount ?? 0, 12);
    const winCondition = preset?.rules.winCondition === 'SLAUGHTER_SIDE' ? '屠边' : '屠城';

    // 只挑"开局前会被问到"的四条，问句形式给出当前板子的答案
    const presetRules = preset?.rules;
    const ruleRows = [
        {
            key: 'witch-self',
            on: presetRules?.witchSelfSave === 'FIRST_NIGHT' || presetRules?.witchSelfSave === true,
            onText: '女巫首夜可自救',
            offText: '女巫不可自救',
        },
        {
            key: 'witch-same-night',
            on: !!presetRules?.witchSameNight,
            onText: '女巫可同夜用双药',
            offText: '女巫不能同夜用双药',
        },
        {
            key: 'guard-repeat',
            on: !!presetRules?.guardCannotSameTarget,
            onText: '守卫不得连守同一人',
            offText: '守卫可连守同一人',
        },
        {
            key: 'wolf-explode',
            on: !!presetRules?.wolfExplodeEnabled,
            onText: '狼人可自爆',
            offText: '狼人不可自爆',
        },
    ];

    return (
        <aside
            data-testid="home-launch-aside"
            className="flex min-h-0 min-w-0 flex-col border-4 shadow-[5px_5px_0_var(--voxel-ink)]"
            style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
            aria-label={`本局出发清单：${preset?.label ?? '未选板子'}，${summary.total} 人，狼 ${summary.wolves} · 神 ${summary.gods} · 民 ${summary.villagers}`}
        >
            {/* 卡头：这张板子叫什么、按什么规则打、去哪改 */}
            <div className="shrink-0 border-b-4" style={{ borderColor: T.ink, background: T.paperDim }}>
                <div className="flex items-start gap-2.5 px-3 pb-2 pt-3">
                    <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center border-[3px] shadow-[2px_2px_0_var(--voxel-ink)]"
                        style={{ background: T.grassDark, borderColor: T.ink }}
                        aria-hidden="true"
                    >
                        <CampIcon icon={preset?.icon} px={1} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-55">当前地图</div>
                        <div className="mt-0.5 break-all text-lg font-black leading-tight">{preset?.label ?? '—'}</div>
                    </div>
                    <button
                        type="button"
                        data-testid="open-pregame-setup"
                        onClick={onOpenSetup}
                        title="改人数 / 神职 / 上警"
                        className="flex min-h-10 shrink-0 items-center border-[3px] px-2 text-[11px] font-black shadow-[2px_2px_0_var(--voxel-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                    >
                        调整 ›
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-1 px-3 pb-2.5">
                    <span
                        data-testid="pregame-setup-summary"
                        className="border-2 px-1.5 py-0.5 text-[11px] font-black"
                        style={{ background: T.paper, borderColor: T.ink }}
                    >
                        {preset?.playerCount ?? 0} 人 · {sheriffEnabled ? '上警' : '不上警'}
                    </span>
                    <span className="border-2 px-1.5 py-0.5 text-[11px] font-black" style={{ background: T.paper, borderColor: T.ink }}>
                        {winCondition}
                    </span>
                    {/* 身份属于"这一局怎么打"，和人数/上警/胜负条件是一类状态，放同一行。
                        它原来挤在「阵容组成」标题右边，比标题高出一截、带边框，看着像个能点的开关。 */}
                    <span
                        data-testid="identity-state"
                        title={isHumanMode ? '已入局：只看得到自己那张牌' : '旁观：全场身份可见'}
                        className="border-2 px-1.5 py-0.5 text-[11px] font-black leading-tight"
                        style={{ background: isHumanMode ? T.emerald : T.paper, borderColor: T.ink }}
                    >
                        {isHumanMode ? '入局' : '旁观'}
                    </span>
                </div>
            </div>

            {/* 中段：阵营台账 + 座位预览。座位预览吃掉剩余高度，矮窗口时整段可滚 */}
            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2.5">
                <div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-[0.18em] opacity-55">阵容组成</span>
                        <span className="text-[11px] font-black opacity-55">
                            {rows.reduce((sum, row) => sum + row.total, 0)} 张牌
                        </span>
                    </div>

                    <div className="mt-1.5 border-[3px]" style={{ borderColor: T.ink }}>
                        {rows.map((row, index) => {
                            const meta = TEAM_META[row.team];
                            return (
                                <div
                                    key={row.team}
                                    className="flex items-stretch"
                                    style={index > 0 ? { borderTop: `3px solid ${T.ink}` } : undefined}
                                >
                                    <span
                                        className="flex w-[3.25rem] shrink-0 items-center justify-center py-2 text-[11px] font-black leading-none"
                                        style={{ background: meta.background, color: meta.color }}
                                    >
                                        {meta.name}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-wrap content-center items-center gap-1 px-1.5 py-1.5 [@media(min-height:820px)]:py-2.5">
                                        {/* 狼人/村民这类"一行只有一种牌"的阵营，牌名和阵营名是同一个词，
                                            再写一遍「狼人×4」纯属重复：换成同色的方块刻度，一眼数得出来。 */}
                                        {row.roles.length === 1 && row.roles[0].label === meta.name ? (
                                            <span className="flex flex-wrap items-center gap-[3px]" aria-hidden="true">
                                                {Array.from({ length: row.total }, (_, i) => (
                                                    <span
                                                        key={i}
                                                        className="block h-3.5 w-3.5 border-2"
                                                        style={{ background: meta.background, borderColor: T.ink }}
                                                    />
                                                ))}
                                            </span>
                                        ) : (
                                            row.roles.map(item => (
                                                <span
                                                    key={item.label}
                                                    className="border-2 px-1 py-[1px] text-[11px] font-bold leading-tight"
                                                    style={{ borderColor: 'rgba(36,23,14,0.28)', background: 'rgba(36,23,14,0.05)' }}
                                                >
                                                    {item.label}
                                                    {item.count > 1 && <span className="font-black">×{item.count}</span>}
                                                </span>
                                            ))
                                        )}
                                    </span>
                                    <span
                                        data-testid={`lineup-count-${row.team}`}
                                        className="flex w-9 shrink-0 items-center justify-center border-l-[3px] text-xl font-black leading-none"
                                        style={{ borderColor: T.ink }}
                                    >
                                        {row.total}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div
                    className="hidden min-h-[96px] max-h-[190px] flex-1 flex-col overflow-hidden border-[3px] [@media(min-width:1024px)_and_(min-height:760px)]:flex"
                    style={{ borderColor: T.ink, background: T.grassDark }}
                >
                    <div className="flex shrink-0 items-center justify-between px-2 pt-1">
                        <span className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: T.paper }}>座位预览</span>
                        <span className="text-[11px] font-black" style={{ color: T.paper }}>{seats} 座</span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-wrap content-center items-end justify-center gap-x-px gap-y-0 overflow-hidden px-1.5 pb-1">
                        {Array.from({ length: seats }, (_, i) => (
                            <PixelAvatar key={i} seed={i} look={lookFromSeed(i)} preview px={1} />
                        ))}
                    </div>
                </div>

                {/* 更高窗口里再补一段「这局按什么规则打」。这里不是拿装饰填空白：
                    规则本来是玩家开局前真正会问的，之前只藏在配置面板里。 */}
                <div className="hidden shrink-0 flex-col border-[3px] [@media(min-width:1024px)_and_(min-height:920px)]:flex" style={{ borderColor: T.ink }}>
                    <div className="border-b-2 px-2 py-1" style={{ borderColor: T.ink }}>
                        <span className="text-[11px] font-black uppercase tracking-[0.16em] opacity-55">规则速览</span>
                    </div>
                    <ul className="px-2 pb-1.5 pt-1">
                        {ruleRows.map(rule => (
                            <li key={rule.key} className="flex items-center gap-1.5 py-[2px] text-[11px] font-bold leading-tight">
                                <span
                                    aria-hidden="true"
                                    className="block h-2 w-2 shrink-0 border-2"
                                    style={{ background: rule.on ? T.emeraldInk : 'transparent', borderColor: T.ink }}
                                />
                                <span className="min-w-0 flex-1 truncate">{rule.on ? rule.onText : rule.offText}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* 出发：整栏唯一的主行动 */}
            <div className="shrink-0 border-t-4 px-3 pb-3 pt-2.5 [@media(max-height:760px)]:pb-2.5 [@media(max-height:760px)]:pt-2" style={{ borderColor: T.ink }}>
                {blocked && (
                    <div
                        role="alert"
                        className="mb-2 border-[3px] px-2 py-1.5 text-[11px] font-black leading-snug"
                        style={{ borderColor: T.ink, background: T.paperDim, color: T.redstoneInk }}
                    >
                        ⚠ {setupIssues[0].message} · 点「调整」改回来
                    </div>
                )}
                <button
                    type="button"
                    data-testid="ignite-campfire-button"
                    onClick={onStart}
                    className="flex w-full items-center justify-center gap-2.5 border-4 py-4 text-2xl font-black [@media(max-height:760px)]:py-3 [@media(max-height:760px)]:text-xl shadow-[4px_4px_0_var(--voxel-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ background: blocked ? T.paperDim : T.torch, borderColor: T.ink, color: T.ink }}
                >
                    {blocked ? (
                        <span className="text-base">阵容待修正 · 去调整</span>
                    ) : (
                        <>
                            <span aria-hidden="true">🔥</span>
                            <span className="tracking-[0.06em]">点燃营火</span>
                        </>
                    )}
                </button>
                <div role="status" className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold [@media(max-height:760px)]:mt-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span
                            aria-hidden="true"
                            className="inline-block h-2 w-2 shrink-0"
                            style={{ background: modelReady ? T.emeraldInk : T.torchInk, boxShadow: `0 0 0 2px ${T.ink}` }}
                        />
                        <span className="truncate opacity-75" title={modelReady ? '模型已就绪，每局都走真模型' : '内置离线大脑，不配模型也能开局'}>
                            {modelReady ? '模型已就绪' : '离线大脑'}
                        </span>
                    </span>
                    {!modelReady && (
                        <button
                            type="button"
                            onClick={onOpenModelSettings}
                            title="去设置里接一个模型"
                            className="flex min-h-10 shrink-0 items-center border-2 px-2 text-[11px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{ background: T.paper, borderColor: T.ink }}
                        >
                            去配置 ›
                        </button>
                    )}
                </div>
            </div>
        </aside>
    );
};
