import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_INFO, Role, WOLF_ROLES } from '../../types';
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';
import { BubbleIcon, CaretIcon } from './toolbarIcons';

// 职业速查文案：与主页「规则」页口径一致（RulesView 不可编辑，此处保持同一套产品文案）
const ROLE_DESCRIPTIONS: Record<Role, string> = {
    [Role.WEREWOLF]: '每晚可以选择一名玩家击杀。狼人之间互相认识，可以互相沟通。',
    [Role.VILLAGER]: '没有特殊技能，依靠逻辑推理和发言分析找出狼人。是好人阵营的基石。',
    [Role.SEER]: '每晚可以查验一名玩家是好人还是狼人。是好人阵营最重要的信息来源。',
    [Role.WITCH]: '拥有一瓶解药和一瓶毒药。解药可救夜晚被杀的人，毒药可毒杀任意一名玩家。每瓶药只能使用一次。',
    [Role.HUNTER]: '死亡时可以开枪带走一名玩家。注意：被女巫毒杀时不能开枪。',
    [Role.GUARD]: '每晚可以守护一名玩家使其免受狼人袭击。不能连续两晚守同一人。',
    [Role.IDIOT]: '被投票放逐时翻牌亮明身份，不会死亡，但之后失去投票权。仍可发言。',
    [Role.WOLF_KING]: '拥有狼人全部能力。死亡后可以开枪带走一名玩家。',
    [Role.KNIGHT]: '白天可以在发言环节挑战一名玩家决斗。若对方是狼人则对方死亡，若对方是好人则骑士自己死亡。',
    [Role.STONE_GHOST]: '狼人阵营但无法参与狼人夜间讨论。每晚可以查验一名玩家的具体身份。',
    [Role.WHITE_WOLF_KING]: '拥有狼人全部能力。白天可以自爆并指刀一名玩家（自爆后当天直接进入黑夜）。',
    [Role.BLOOD_MOON_DISCIPLE]: '狼人阵营。白天自爆后封印当晚所有神职技能（预言家不能查、女巫不能用药、守卫不能守）。',
    [Role.GRAVEKEEPER]: '每晚可以查验上一轮被放逐的玩家是好人还是狼人。',
    [Role.DEMON_HUNTER]: '每晚可猎杀一名玩家；若目标是狼人则目标死亡，否则猎魔人自己死亡。',
    [Role.CUPID]: '第一个夜晚选择两名玩家成为情侣。情侣一方死亡则另一方殉情。情侣可成为第三方阵营。',
    [Role.MIRACLE_MERCHANT]: '每晚将一项技能（查验/毒药/守护）发放给一名玩家。若技能给了狼人则商人死亡。',
};

const COMMON_TERMS: { term: string; desc: string }[] = [
    { term: '警长', desc: '白天竞选产生的领袖：有归票权，投票权重按规则设置（默认 1.5 票）；出局时可把警徽传给他人。' },
    { term: '自爆', desc: '狼人白天主动亮明身份，立即终止当天流程直接入夜；常用来吞掉警徽、打断发言节奏。' },
    { term: '金水', desc: '预言家查验后宣告「这个人是好人」的黑话，代表一张已验证的好人牌。' },
    { term: '悍跳', desc: '冒充神职带节奏的打法，最常见的是悍跳预言家发假金水，扰乱好人判断。' },
    { term: '双爆吞警徽', desc: '同一局累计两名狼人自爆后，警徽直接流失，警长不复存在。' },
];

interface RoleGlossaryProps {
    /** 经 canSeeRoleShared 过滤后的本局职业（与队伍名册同一口径） */
    roles: Role[];
    /** 可见性说明，向玩家解释为什么只列出这些职业 */
    note?: string;
}

/**
 * 对局内「术语」速查：头部一个小按钮 + 营火纸面风格的对话框。
 * 面板 portal 到 body 并用 fixed 定位（同 InGameStyleSwitcher），
 * 以便在 3D HUD 的 z-40 层级之上仍然可见可点。
 */
export const RoleGlossary: React.FC<RoleGlossaryProps> = ({ roles, note }) => {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const lastCloseRef = useRef<'escape' | 'outside' | 'toggle'>('toggle');
    const wasOpenRef = useRef(false);

    const close = useCallback((reason: 'escape' | 'outside' | 'toggle') => {
        lastCloseRef.current = reason;
        setOpen(false);
    }, []);

    const updatePosition = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(320, window.innerWidth - 24);
        const height = panelRef.current?.offsetHeight ?? 0;
        let left = Math.min(rect.right - width, window.innerWidth - width - 12);
        left = Math.max(12, left);
        let top = rect.bottom + 6;
        if (height > 0 && top + height > window.innerHeight - 12) {
            top = Math.max(12, rect.top - 6 - height);
        }
        setPosition(prev => (prev && prev.left === left && prev.top === top && prev.width === width)
            ? prev
            : { left, top, width });
    }, []);

    // 开启期间：面板定位跟随滚动/缩放；首次开启时面板尚未挂载，定位补跑在下面的 effect 里
    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }
        updatePosition();
        const handler = () => updatePosition();
        window.addEventListener('resize', handler);
        window.addEventListener('scroll', handler, true);
        return () => {
            window.removeEventListener('resize', handler);
            window.removeEventListener('scroll', handler, true);
        };
    }, [open, updatePosition]);

    // 点击面板外关闭（与声音菜单同模式）
    useEffect(() => {
        if (!open) return undefined;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            close('outside');
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close('escape');
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, close]);

    // 面板挂载后：校准一次含高度的定位，并把焦点送进面板（不滚动页面）
    useEffect(() => {
        if (!open) return;
        updatePosition();
        if (document.activeElement !== panelRef.current) {
            panelRef.current?.focus({ preventScroll: true });
        }
    }, [open, position, updatePosition]);

    // 关闭后：仅键盘(Esc)关闭时把焦点还给触发按钮，点击外部关闭不抢焦点
    useEffect(() => {
        if (open) {
            wasOpenRef.current = true;
            return;
        }
        if (wasOpenRef.current) {
            wasOpenRef.current = false;
            if (lastCloseRef.current === 'escape') triggerRef.current?.focus({ preventScroll: true });
        }
    }, [open]);

    const portalRoot = typeof document !== 'undefined' ? document.body : null;

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                ref={triggerRef}
                type="button"
                data-testid="role-glossary-trigger"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label="说明：本局职业与常用黑话"
                title="说明：本局职业与常用黑话（Esc 关闭）"
                onClick={() => (open ? close('toggle') : setOpen(true))}
                className="flex min-h-11 shrink-0 items-center whitespace-nowrap border-[3px] px-3 py-1.5 max-sm:px-2 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ background: open ? T.torch : T.paper, borderColor: T.ink, color: T.ink }}
            >
                <span className="flex items-center gap-1.5">
                    <BubbleIcon />
                    说明
                    <CaretIcon />
                </span>
            </button>
            {open && position && portalRoot && createPortal(
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="说明：本局职业与常用黑话"
                    data-testid="role-glossary-panel"
                    tabIndex={-1}
                    className="custom-scrollbar fixed z-[95] max-h-[min(70dvh,28rem)] overflow-y-auto border-[4px] p-3 shadow-[6px_6px_0_var(--voxel-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                        left: position.left,
                        top: position.top,
                        width: position.width,
                        background: T.paper,
                        borderColor: T.ink,
                        color: T.ink,
                        fontFamily: 'var(--voxel-font)',
                    }}
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-black tracking-[0.2em]" style={{ color: T.inkSoft }}>这局怎么玩</div>
                        <button
                            type="button"
                            aria-label="关闭说明"
                            onClick={() => close('toggle')}
                            className="flex h-8 min-w-8 shrink-0 items-center justify-center border-2 px-2 text-xs font-black"
                            style={{ background: T.paperDim, borderColor: T.ink, color: T.ink }}
                        >
                            ✕
                        </button>
                    </div>

                    <div className="mt-4 text-xs font-black tracking-[0.18em]" style={{ color: T.inkSoft }}>场上都有谁</div>
                    <div className="mt-1.5 space-y-1.5">
                        {roles.length === 0 ? (
                            <div className="border-2 px-2 py-1.5 text-xs font-bold leading-snug" style={{ borderColor: T.ink, color: T.inkSoft }}>
                                对局开始后，这里会列出本局在场的职业。
                            </div>
                        ) : roles.map(role => (
                            <div key={role} className="border-2 px-2 py-1.5" style={{ borderColor: T.ink }}>
                                <div className="flex items-center justify-between gap-2 text-xs font-black leading-tight">
                                    <span className="min-w-0 truncate">{ROLE_INFO[role]?.icon} {ROLE_INFO[role]?.label ?? role}</span>
                                    <span className="shrink-0 text-xs font-bold" style={{ color: WOLF_ROLES.includes(role) ? T.redstoneInk : T.emeraldInk }}>
                                        {WOLF_ROLES.includes(role) ? '狼人阵营' : '好人阵营'}
                                    </span>
                                </div>
                                <div className="mt-0.5 text-xs font-bold leading-snug" style={{ color: T.inkSoft }}>
                                    {ROLE_DESCRIPTIONS[role]}
                                </div>
                            </div>
                        ))}
                    </div>
                    {note && (
                        <div className="mt-1.5 text-xs font-bold leading-snug" style={{ color: T.inkSoft }}>{note}</div>
                    )}

                    <div className="mt-4 text-xs font-black tracking-[0.18em]" style={{ color: T.inkSoft }}>常听到的黑话</div>
                    <div className="mt-1.5 space-y-1.5">
                        {COMMON_TERMS.map(item => (
                            <div key={item.term} className="border-2 px-2 py-1.5" style={{ borderColor: T.ink }}>
                                <div className="text-xs font-black leading-tight">{item.term}</div>
                                <div className="mt-0.5 text-xs font-bold leading-snug" style={{ color: T.inkSoft }}>{item.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>,
                portalRoot
            )}
        </div>
    );
};

export default RoleGlossary;
