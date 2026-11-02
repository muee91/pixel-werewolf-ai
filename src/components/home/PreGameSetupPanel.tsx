import React from 'react';
import { clsx } from 'clsx';
import { GAME_PRESETS, GOD_ROLES, ROLE_INFO, WOLF_ROLES, type GamePreset, type Role } from '../../types';
import { canEnableRole, countRole, summarizeLineup, toggleRoleInLineup, validateLineup } from '../../utils/gameSetup';
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';

/**
 * 开局前对局配置：人数 / 神职 / 是否上警。
 *
 * 只在这里改"这一局怎么开"，不改设置页里的默认值——
 * 设置页管的是长期偏好，开局面板管的是这一次，两者混在一起会让人不敢下手。
 */

export interface SetupDraft {
    roles: Role[];
    sheriffEnabled: boolean;
}

interface Props {
    preset: GamePreset;
    draft: SetupDraft;
    onChange: (next: SetupDraft) => void;
    onSelectCount: (count: number) => void;
    onReset: () => void;
    onClose: () => void;
}

const COUNT_OPTIONS = [...new Set(GAME_PRESETS.map(item => item.playerCount))].sort((a, b) => a - b);

const ChipButton = ({ active, disabled, onClick, children, title }: {
    active?: boolean;
    disabled?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
    title?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-pressed={active}
        className={clsx(
            'min-h-11 border-[3px] px-2.5 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] transition-transform active:translate-y-[2px] active:shadow-none',
            disabled && 'cursor-not-allowed opacity-40',
        )}
        style={{
            borderColor: T.ink,
            background: active ? T.torch : T.paper,
            color: T.ink,
        }}
    >
        {children}
    </button>
);

export const PreGameSetupPanel: React.FC<Props> = ({ preset, draft, onChange, onSelectCount, onReset, onClose }) => {
    const summary = summarizeLineup(draft.roles);
    const issues = validateLineup(draft.roles, preset.playerCount);
    const canAddGod = canEnableRole(draft.roles);

    const setRoles = (roles: Role[]) => onChange({ ...draft, roles });
    const toggleGod = (role: Role) => {
        const active = draft.roles.includes(role);
        setRoles(toggleRoleInLineup(draft.roles, role, !active));
    };

    return (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="对局配置">
            <div
                className="flex max-h-full w-full max-w-2xl flex-col border-[4px] shadow-[8px_8px_0_var(--voxel-ink)]"
                style={{ background: T.paperDim, borderColor: T.ink, color: T.ink }}
            >
                <div className="flex items-center justify-between gap-3 border-b-[4px] px-4 py-3" style={{ background: T.woodDark, borderColor: T.ink, color: T.paper }}>
                    <div className="min-w-0">
                        <div className="text-xs font-black tracking-[0.2em] opacity-80">开局前配置</div>
                        <div className="truncate text-lg font-black">{preset.label}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-11 shrink-0 border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] active:translate-y-[2px] active:shadow-none"
                        style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                    >
                        完成
                    </button>
                </div>

                <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <section>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-black">人数</h3>
                            <span className="text-xs font-bold opacity-60">换人数会换成该人数下的第一张板子</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {COUNT_OPTIONS.map(count => (
                                <ChipButton
                                    key={count}
                                    active={count === preset.playerCount}
                                    onClick={() => onSelectCount(count)}
                                >
                                    {count} 人
                                </ChipButton>
                            ))}
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-black">神职</h3>
                            <span className="text-xs font-bold opacity-60">
                                狼 {summary.wolves} · 神 {summary.gods} · 民 {summary.villagers}
                            </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {GOD_ROLES.map(role => {
                                const active = draft.roles.includes(role);
                                return (
                                    <ChipButton
                                        key={role}
                                        active={active}
                                        disabled={!active && !canAddGod}
                                        onClick={() => toggleGod(role)}
                                        title={!active && !canAddGod ? '没有村民可以换成神职了' : undefined}
                                    >
                                        {ROLE_INFO[role]?.icon} {ROLE_INFO[role]?.label}
                                        {countRole(draft.roles, role) > 1 ? ` ×${countRole(draft.roles, role)}` : ''}
                                    </ChipButton>
                                );
                            })}
                        </div>
                        <div className="mt-2 text-xs font-bold opacity-60">
                            开关神职等于拿一个村民互换，总人数不变；狼牌固定不可改（改了会动到屠边胜负判定）。
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-black">是否上警</h3>
                            <span className="text-xs font-bold opacity-60">
                                {draft.sheriffEnabled ? '有警长竞选 · 警徽 1.5 票权' : '直接进入白天讨论'}
                            </span>
                        </div>
                        <div className="mt-2 flex gap-2">
                            <ChipButton active={draft.sheriffEnabled} onClick={() => onChange({ ...draft, sheriffEnabled: true })}>上警</ChipButton>
                            <ChipButton active={!draft.sheriffEnabled} onClick={() => onChange({ ...draft, sheriffEnabled: false })}>不上警</ChipButton>
                        </div>
                    </section>

                    <section className="border-[3px] p-3" style={{ borderColor: T.ink, background: T.paper }}>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-black">本局阵容</h3>
                            <button
                                type="button"
                                onClick={onReset}
                                className="min-h-11 border-[3px] px-2.5 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] active:translate-y-[2px] active:shadow-none"
                                style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                            >
                                还原板子默认
                            </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {draft.roles
                                .slice()
                                .sort((a, b) => {
                                    const rank = (role: Role) => (WOLF_ROLES.includes(role) ? 0 : GOD_ROLES.includes(role) ? 1 : 2);
                                    return rank(a) - rank(b) || (ROLE_INFO[a]?.label ?? '').localeCompare(ROLE_INFO[b]?.label ?? '');
                                })
                                .map((role, index) => (
                                    <span
                                        key={`${role}-${index}`}
                                        className="border-2 px-1.5 py-0.5 text-xs font-black"
                                        style={{
                                            borderColor: T.ink,
                                            background: WOLF_ROLES.includes(role) ? T.redstoneInk : GOD_ROLES.includes(role) ? T.diamond : T.emerald,
                                            color: WOLF_ROLES.includes(role) ? T.paper : T.ink,
                                        }}
                                    >
                                        {ROLE_INFO[role]?.label ?? role}
                                    </span>
                                ))}
                        </div>
                        {issues.length > 0 && (
                            <ul className="mt-2 space-y-1">
                                {issues.map(issue => (
                                    <li key={issue.message} className="text-xs font-black" style={{ color: T.redstoneInk }}>
                                        ⚠ {issue.message}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>

                <div className="border-t-[4px] p-3" style={{ borderColor: T.ink }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={issues.length > 0}
                        className={clsx(
                            'flex min-h-12 w-full items-center justify-center border-[4px] px-4 text-sm font-black shadow-[4px_4px_0_var(--voxel-ink)]',
                            issues.length > 0 && 'cursor-not-allowed opacity-50',
                        )}
                        style={{ background: T.torch, borderColor: T.ink, color: T.ink }}
                    >
                        记下这套配置（回营地点燃营火）
                    </button>
                </div>
            </div>
        </div>
    );
};
