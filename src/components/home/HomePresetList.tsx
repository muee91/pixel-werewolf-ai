import React from 'react';
import { type GamePreset, type Role } from '../../types';
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';
import { CampIcon, PixelIcon } from '../game/voxel/primitives';
import { groupLineupByTeam, type LineupTeam } from '../../utils/gameSetup';

/**
 * 首页中栏「选板子」列表。
 *
 * 旧版是两列卡片：每张卡都要塞 图标 / 板名 / 三行描述 / 阵容行 / 人数徽章。
 * 1280 宽时每张只有 204px 还勉强，1080×675 时掉到 143px —— 描述被挤成一列字，
 * 「9人 · 已选」徽章直接顶出卡片右边缘被容器裁掉，第三张卡还被下边缘切成半张
 * （实测滚动容器 363px 装 503px 内容，溢出 140px）。
 *
 * 改成一行一张的清单：左边图标、中间「板名 + 阵容 + 一句描述」、右边人数。
 * 名字和人数永远优先（它们决定你选哪个），描述在未选中时压成一行、选中才展开。
 * 高度从 223+187 降到 ~72/行，3 张板子 1080 窗口不用滚动就能看全。
 */

const TEAM_SHORT: Record<LineupTeam, string> = { wolf: '狼', god: '神', villager: '民' };

const lineupLine = (roles: Role[]): string =>
    groupLineupByTeam(roles).map(row => `${TEAM_SHORT[row.team]}${row.total}`).join(' · ');

interface HomePresetListProps {
    presets: GamePreset[];
    selectedKey: string;
    onSelect: (preset: GamePreset) => void;
}

export const HomePresetList: React.FC<HomePresetListProps> = ({ presets, selectedKey, onSelect }) => (
    <div
        data-testid="home-preset-list"
        className="custom-scrollbar flex min-h-0 flex-col overflow-y-auto pr-2"
        role="radiogroup"
        aria-label="选择板子"
    >
        {/* my-auto 而不是 justify-center：容器可滚动时 justify-center 会把超出部分裁在顶部，
            auto margin 在内容超高时自动归零、短列表才居中。3 张板子时中栏下半不再留一片绿地 */}
        <div className="my-auto flex flex-col gap-2">
            {presets.map((preset, index) => {
                const active = selectedKey === preset.key;
                return (
                    <button
                        key={preset.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onSelect(preset)}
                        className="animate-fade-in-up group flex w-full shrink-0 items-start gap-2.5 border-4 px-2.5 py-2 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                            borderColor: active ? 'var(--color-accent1)' : T.ink,
                            background: active ? T.paper : T.woodMid,
                            color: T.ink,
                            boxShadow: `3px 3px 0 var(--voxel-ink)`,
                            animationDelay: `${Math.min(index, 12) * 40}ms`,
                            animationFillMode: 'backwards',
                        }}
                    >
                        <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border-[3px]"
                            style={{ background: active ? T.torch : T.paperDim, borderColor: T.ink }}
                        >
                            <CampIcon icon={preset.icon} px={2} />
                        </span>

                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                                <span className="min-w-0 truncate text-sm font-black leading-tight">{preset.label}</span>
                                {active && (
                                    <span className="shrink-0" style={{ color: 'var(--color-accent1)' }} aria-hidden="true">
                                        <PixelIcon name="check" px={2} />
                                    </span>
                                )}
                            </span>
                            <span className="mt-0.5 block text-[11px] font-black leading-none opacity-75">
                                {lineupLine(preset.roles)}
                            </span>
                            {/* 未选中的行不显示描述：298px 宽里只能放下半句（「六人入门配置：2狼人、2村民，神…」），
                                半截话比没有话更糟。差异已经由阵容行说清楚，想看细节点一下这张板子就展开。 */}
                            {active && (
                                <span className="mt-1 block text-[11px] font-bold leading-snug opacity-70">
                                    {preset.description}
                                </span>
                            )}
                        </span>

                        <span
                            className="shrink-0 border-2 px-1.5 py-0.5 text-[11px] font-black tabular-nums leading-tight"
                            style={{ background: active ? T.paperDim : 'rgba(0,0,0,0.16)', borderColor: T.ink }}
                        >
                            {preset.playerCount}人
                        </span>
                    </button>
                );
            })}
        </div>
    </div>
);

export default HomePresetList;
