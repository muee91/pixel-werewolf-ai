import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PaceControl } from '../PaceControl';
import { clsx } from 'clsx';
import { useGameRoomState, getRoleColor } from '../../../hooks/useGameRoomState';
import { AutoScrollLog } from '../../GameLogs';
import HumanInputPanel from '../../HumanInputPanel';
import InGameStyleSwitcher from '../../InGameStyleSwitcher';
import { useTypewriter } from '../../../hooks/useTypewriter';
import { useAtom, useAtomValue } from 'jotai';
import { GAME_PRESETS, GamePhase, ROLE_INFO, WOLF_ROLES, Role, getPersonaLabel, canSeeRole as canSeeRoleShared, type Player } from '../../../types';
import { uiConfigAtom, gameConfigAtom, llmPresetsAtom, actorProfilesAtom } from '../../../atoms';
import { buildModelScoreboard, pickDisplayedModelLabels } from '../../../utils/modelLabels';
import { buildHighlights } from '../../../utils/gameHighlights';
import { groupLineupByTeam, type LineupTeam } from '../../../utils/gameSetup';
import { VOXEL_TOKENS as T } from '../../../themes/voxel-tokens';
import { BugIcon, SpeakerIcon, PauseIcon, PlayIcon, PersonIcon, MinusIcon, CloseIcon, CaretIcon } from '../toolbarIcons';
import {
  PixelItem, PixelAvatar, DeadStamp, PixelGrave, PixelCampfire, CampIcon,
  PixelTorch, PixelMineCart, PixelRedstoneRig, TerrainStrip,
  BlockButton, type RoleKit,
} from './primitives';
import { RoleGlossary } from '../RoleGlossary';
import { useOpenReview } from '../../../hooks/useOpenReview';

const TEAM_SHORT: Record<LineupTeam, string> = { wolf: '狼', god: '神', villager: '民' };

const isAlive = (p: { status: string }) => p.status === 'ALIVE' || p.status === 'IDIOT_REVEALED';

const phaseText = (phase: GamePhase, turn: number, isNight: boolean) => {
    if (phase === GamePhase.SETUP) return { title: '生成世界', sub: '选择地图后点燃营火' };
    if (phase === GamePhase.GAME_OVER || phase === GamePhase.GAME_REVIEW) return { title: '对局已结束', sub: '结算已生成' };
    if (isNight) return { title: '夜晚降临', sub: `第 ${turn} 夜 · 怪物频道开启` };
    return { title: '营火会议', sub: `第 ${turn} 天 · 所有人回到营地` };
};

const getRoleKit = (role?: Role, visible?: boolean): RoleKit => {
    if (!visible || !role) return { item: 'map', color: '#c9c0a4', label: '未知', shirt: '#4aa3df' };
    if (WOLF_ROLES.includes(role)) return { item: 'claw', color: T.redstone, label: '狼爪', shirt: '#7b2f2a' };
    switch (role) {
        case Role.SEER: return { item: 'gem', color: '#7f5bd6', label: '望远镜', shirt: '#5943a8' };
        case Role.WITCH: return { item: 'potion', color: '#b44bd6', label: '药瓶', shirt: '#6e3f91' };
        case Role.HUNTER: return { item: 'bow', color: '#d9913d', label: '猎弓', shirt: '#8a4f2d' };
        case Role.GUARD: return { item: 'shield', color: '#4d8ed6', label: '盾牌', shirt: '#315f93' };
        case Role.IDIOT: return { item: 'bread', color: '#d9b35f', label: '面包', shirt: '#3d9172' };
        case Role.KNIGHT: return { item: 'sword', color: '#cfd6df', label: '铁剑', shirt: '#717984' };
        case Role.CUPID: return { item: 'heart', color: '#e06aa1', label: '之心', shirt: '#9b4470' };
        case Role.MIRACLE_MERCHANT: return { item: 'emerald', color: T.emerald, label: '绿宝石', shirt: '#347d55' };
        case Role.GRAVEKEEPER: return { item: 'shovel', color: '#8d7761', label: '铁锹', shirt: '#5a5146' };
        case Role.DEMON_HUNTER: return { item: 'crossbow', color: '#c98639', label: '弩', shirt: '#794820' };
        default: return { item: 'torch', color: T.torch, label: '火把', shirt: '#3f7f42' };
    }
};

export const VoxelSurvivalRoom: React.FC = () => {
    const s = useGameRoomState();
    const [uiCfg, setUiConfig] = useAtom(uiConfigAtom);
    const gameConfig = useAtomValue(gameConfigAtom);
    const layout = s.uiConfig?.gameLayout || 'block-arena';
    const cardStyle = s.uiConfig?.playerCardStyle || 'name-sign';
    const isRedstone = layout === 'redstone-hub';
    const isMine = layout === 'survival-log';
    const scene = {
        title: isRedstone ? '红石中控' : isMine ? '矿洞日志' : '营地狼人杀',
        inventoryTitle: isRedstone ? '红石玩家通道' : isMine ? '矿工背包' : '玩家背包',
        chatTitle: isRedstone ? '红石会话通道' : isMine ? '矿洞会话' : '营火会话',
        panel: isRedstone ? '#5b2520' : isMine ? '#42484f' : '#2f6b2b',
        ground: isMine ? T.stone : isRedstone ? '#5a3528' : T.grass,
        ground2: isMine ? '#343a40' : isRedstone ? '#3f241d' : T.grassDark,
    };
    const aliveCount = s.players.filter(isAlive).length;
    // 背景是白天天空(#78bce8)时,顶部标题改用墨色系:torch/white 在天上分别只有 1.13 / 2.07
    const isDaySky = !isMine && !s.isNightPhase;

    // 开票 / 警徽交接快闪：最近的系统播报匹配时给出醒目横幅（2.4 秒自动淡出）
    const flash = useMemo(() => {
        for (let i = s.logs.length - 1; i >= Math.max(0, s.logs.length - 4); i--) {
            const l = s.logs[i];
            if (!l.isSystem) continue;
            if (Date.now() - l.timestamp > 3000) break;
            let m = l.content.match(/(\d+)号 被投票出局/);
            if (m) return { id: l.id, text: `${m[1]}号 出局`, tone: T.redstoneDeep };
            m = l.content.match(/警徽传给 (\d+)号/);
            if (m) return { id: l.id, text: `警徽 → ${m[1]}号`, tone: T.sheriffGold };
            m = l.content.match(/(\d+)号 自爆/);
            if (m) return { id: l.id, text: `${m[1]}号 自爆！`, tone: T.redstoneDeep };
        }
        return null;
    }, [s.logs]);

    // 逐票开票板：本回合投票阶段，每张已投出的票实时上榜
    const voteBoard = useMemo(() => {
        if (s.phase !== GamePhase.VOTING) return null;
        // voteDetailPublic=false 的板子只公开结果,不公开逐票对应关系
        const voteDetailPublic = gameConfig.rules?.voteDetailPublic ?? true;
        if (!voteDetailPublic) return null;
        const rows = s.logs
            .filter(l => l.turn === s.turnCount && l.phase === GamePhase.VOTING && l.debugType === 'VOTE_STRATEGY')
            .map(l => {
                const d = (l.debugData ?? {}) as { decision?: { target?: number | null }; target?: number | null };
                const target = d.decision?.target ?? d.target ?? null;
                return { id: l.id, voter: l.speakerId, target: target != null ? Number(target) : null };
            });
        return rows.length > 0 ? rows : null;
    }, [s.logs, s.phase, s.turnCount]);
    const phase = phaseText(s.phase, s.turnCount, s.isNightPhase);
    const currentSpeaker = s.currentSpeakerId ? s.players.find(p => p.id === s.currentSpeakerId) || null : null;

    // 当前发言人的最新发言文本(打字机逐字上屏)
    const currentSpeech = useMemo(() => {
        if (!currentSpeaker) return '';
        for (let i = s.visibleLogs.length - 1; i >= 0; i--) {
            const l = s.visibleLogs[i];
            if (l.speakerId === currentSpeaker.id && !l.isSystem && l.content?.trim()) return l.content;
        }
        return '';
    }, [s.visibleLogs, currentSpeaker]);
    const typedSpeech = useTypewriter(currentSpeech);
    const speechTextRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        speechTextRef.current?.scrollTo({ top: speechTextRef.current.scrollHeight });
    }, [typedSpeech]);
    const [shattering, setShattering] = useState<number[]>([]);
    // 「声音」弹出菜单:语音 + 音乐合并收纳,点外部/Esc 关闭
    const [soundOpen, setSoundOpen] = useState(false);
    const soundPanelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!soundOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (!soundPanelRef.current?.contains(event.target as Node)) setSoundOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSoundOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [soundOpen]);

    // 对局快捷键（全局唯一监听）：Esc = 关弹层 / 呼出退出确认；M = 对局音乐；V = 旁白语音。
    // 输入态（input/textarea/select/contentEditable，含 HumanInputPanel 的 textarea）与组合键一律跳过
    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            const el = target as HTMLElement | null;
            if (!el || typeof el.tagName !== 'string') return false;
            const tag = el.tagName.toUpperCase();
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
            if (isEditableTarget(event.target)) return;
            if (event.key === 'Escape') {
                // 退出确认：开着就关，没开才考虑打开（见下方守卫）
                if (s.showExitConfirm) { s.setShowExitConfirm(false); return; }
                // 声音菜单 / 更多菜单 / 术语面板各自监听 Esc 自行关闭（面板带 role=dialog,见下方守卫）,同一击不叠加第二个动作
                if (document.querySelector('[role="dialog"]')) return;
                // 外观菜单(InGameStyleSwitcher)是 body portal + 内联 fixed，没有 role=dialog
                if (document.querySelector('div[style*="position: fixed"]')) return;
                // 全屏时 Esc 留给浏览器退出全屏
                if (document.fullscreenElement) return;
                // 仅进行中的对局呼出退出确认；搭建 / 结算 / 回放不掺和
                if (s.isSetup || s.isGameOver || s.isTheater || s.isReplayMode) return;
                s.setShowExitConfirm(true);
                return;
            }
            if (event.repeat) return;
            const key = event.key.toLowerCase();
            if (key === 'm') setUiConfig(prev => ({ ...prev, bgmEnabled: !(prev.bgmEnabled ?? true) }));
            else if (key === 'v') void s.handleTtsToggle();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [s.showExitConfirm, s.setShowExitConfirm, s.isSetup, s.isGameOver, s.isTheater, s.isReplayMode, s.handleTtsToggle, setUiConfig]);
    const aliveIdsRef = useRef<Set<number>>(new Set());
    useEffect(() => {
        const aliveNow = new Set(s.players.filter(p => p.status === 'ALIVE').map(p => p.id));
        const died = [...aliveIdsRef.current].filter(id => !aliveNow.has(id));
        aliveIdsRef.current = aliveNow;
        if (died.length === 0) return;
        setShattering(prev => [...prev, ...died]);
        const timer = window.setTimeout(() => {
            setShattering(prev => prev.filter(id => !died.includes(id)));
        }, 1400);
        return () => window.clearTimeout(timer);
    }, [s.players]);

    // 结算名场面:关键阶段的真实发言 + 决斗/自爆/开枪事件。3D 结算面板共用同一份计算
    const highlights = useMemo(
        () => buildHighlights(s.visibleLogs, s.phase),
        [s.phase, s.visibleLogs],
    );
    // 入夜/天亮阶段横幅:在 NIGHT_START / DAY_ANNOUNCE 阶段弹出仪式感横幅
    const phaseBanner = useMemo(() => {
        if (s.phase === GamePhase.NIGHT_START) return { key: `night-${s.turnCount}`, text: `🌙 第 ${s.turnCount} 夜 · 怪物频道开启`, tone: T.night };
        if (s.phase === GamePhase.DAY_ANNOUNCE) return { key: `day-${s.turnCount}`, text: `☀ 第 ${s.turnCount} 天 · 营火会议`, tone: T.sky };
        return null;
    }, [s.phase, s.turnCount]);
    const speakerIndex = currentSpeaker ? Math.max(0, s.players.findIndex(p => p.id === currentSpeaker.id)) : -1;
    const speakerOffset = speakerIndex >= 0 ? Math.min(82, Math.max(18, 18 + speakerIndex * 6)) : 50;
    const dockReserve = s.humanPlayer && !s.isTheater && !s.isReplayMode
        ? (s.humanInputPanelExpanded ? 'calc(18rem + var(--safe-area-inset-bottom))' : 'calc(6rem + var(--safe-area-inset-bottom))')
        : 'calc(0.75rem + var(--safe-area-inset-bottom))';

    const canSeeRole = (player: any) =>
        canSeeRoleShared(player.id, player.role, s.humanPlayer?.id ?? null, s.humanPlayer?.role, s.canSeeGodStateDetails, s.isGameOver);

    // 术语速查只列「你能看见的职业」：与花名册同一 canSeeRoleShared 口径，玩家模式不泄露敌方板子
    const glossaryRoles = useMemo(() => {
        const seen = new Set<Role>();
        const out: Role[] = [];
        for (const p of s.players) {
            const visible = canSeeRoleShared(p.id, p.role, s.humanPlayer?.id ?? null, s.humanPlayer?.role, s.canSeeGodStateDetails, s.isGameOver);
            if (visible && !seen.has(p.role)) {
                seen.add(p.role);
                out.push(p.role);
            }
        }
        return out;
    }, [s.players, s.humanPlayer, s.canSeeGodStateDetails, s.isGameOver]);
    const glossaryNote = (s.canSeeGodStateDetails || s.isGameOver)
        ? '当前是上帝视角：这里列出本局全部职业。'
        : '为避免剧透，只列出你当前可见的职业（与队伍名册同一口径）。';

    // 当前发言名牌是纸底:职业色一律换成纸上墨色变体(纯强调色在 #f2dfaa 上仅 1.4–3.2:1)
    const currentRoleColor = currentSpeaker
        ? (canSeeRole(currentSpeaker) ? getRoleColor(currentSpeaker.role, T.redstoneInk, T.torchInk, T.emeraldInk) : T.ink)
        : (s.isNightPhase ? T.torchInk : T.waterInk);

    // 电子斗蛐蛐：每个座位可能是不同模型。只有真的混用模型时才在座位上标出来，
    // 单一模型的局不加这行噪音（那种局标了也没有信息量）。
    const llmPresets = useAtomValue(llmPresetsAtom);
    const actorProfiles = useAtomValue(actorProfilesAtom);
    // 口径统一在 utils/modelLabels：同一句话还要出现在 3D 名牌与复盘页
    const modelLabels = useMemo(
        () => pickDisplayedModelLabels(s.players, actorProfiles, llmPresets),
        [s.players, llmPresets, actorProfiles],
    );
    const mixedModels = Object.keys(modelLabels).length > 0;
    const modelLabelFor = (player: Player) => modelLabels[player.id] ?? '';

    const renderPlayerCard = (player: any) => {
        const dead = !isAlive(player);
        const speaking = s.currentSpeakerId === player.id && !dead;
        const visible = canSeeRole(player);
        const roleColor = visible ? getRoleColor(player.role, T.redstone, T.torch, T.emerald) : T.paper;
        const kit = getRoleKit(player.role, visible);
        const name = player.displayName || `${player.seatNumber}号玩家`;
        const roleLabel = visible ? (ROLE_INFO[player.role as Role]?.label || player.role) : '未知职业';
        const seat = String(player.seatNumber).padStart(2, '0');
        const modelLabel = mixedModels ? modelLabelFor(player) : '';
        const personaTag = uiCfg.personaTagsEnabled !== false ? getPersonaLabel(player.stylePrompt) : '';

        if (cardStyle === 'totem-badge') {
            return (
                <div
                    key={player.id}
                    className={clsx('vw-player-card relative flex min-w-0 flex-col items-center justify-center gap-1 border-[3px] p-1.5 text-center shadow-[3px_3px_0_var(--voxel-ink)]', speaking && 'vw-card-lit vw-card-pulse z-10')}
                    style={{
                        borderColor: speaking ? T.torch : T.ink,
                        // 职业色渐变在 40% 即收口到纯 woodDark:文字行(名牌起于 54px,最矮卡 96px/最高 116px ≈ 47%–56%)全部落在实底上,12px 粗体对 woodDark ≥5.4:1
                        background: dead ? T.deadCard : `linear-gradient(180deg, ${roleColor}33, ${T.woodDark} 40%)`,
                        color: dead ? T.deadText : T.paper,
                    }}
                >
                    <div className="absolute left-1 top-1 border-2 bg-[var(--voxel-paper)] px-1 text-xs font-black" style={{ borderColor: T.ink, color: T.ink }}>{seat}</div>
                    <div className="mt-1 flex h-[60px] w-[44px] items-center justify-center border-[3px] bg-[var(--voxel-paper)]" style={{ borderColor: T.ink }}>
                        <PixelItem type={dead ? 'shovel' : kit.item} color={dead ? T.dead : kit.color} fit={56} />
                    </div>
                    <div className="w-full truncate text-xs font-black leading-tight max-xl:text-xs" title={name}>{name}</div>
                    <div
                        className="w-full truncate text-xs font-black"
                        style={{ color: dead ? T.deadText : (visible ? getRoleColor(player.role, T.redstoneOnDark, T.torch, T.emerald) : T.paper) }}
                    >{dead ? '死亡' : roleLabel}</div>
                    {modelLabel && <div className="w-full truncate text-[10px] font-bold opacity-70 max-xl:hidden" title={`模型：${modelLabel}`}>{modelLabel}</div>}
                    {personaTag && <div className="w-full truncate text-xs font-bold text-[var(--voxel-emerald-on-dark)]" title={personaTag}>🎭 {personaTag}</div>}
                    {dead && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><DeadStamp compact /></div>}
                </div>
            );
        }

        if (cardStyle === 'hotbar-strip') {
            return (
                <div
                    key={player.id}
                    className={clsx('vw-player-card relative grid min-w-0 grid-cols-[2.2rem_minmax(0,1fr)_1.8rem] items-center gap-1 border-[3px] px-1.5 py-1 shadow-[3px_3px_0_var(--voxel-ink)]', speaking && 'vw-card-lit vw-card-pulse z-10')}
                    style={{
                        borderColor: speaking ? T.torch : T.ink,
                        background: dead ? T.deadCard : `linear-gradient(180deg, #725033, ${T.inkSoft})`,
                        color: dead ? T.deadText : T.paper,
                    }}
                >
                    <div className="flex h-7 items-center justify-center border-2 bg-[var(--voxel-paper)] text-xs font-black" style={{ borderColor: T.ink, color: T.ink }}>{seat}</div>
                    <div className="min-w-0">
                        <div className="truncate text-xs font-black leading-tight" title={name}>{name}</div>
                        <div className="truncate text-xs font-black opacity-75">{dead ? '已死亡/掉落' : roleLabel}</div>
                        {modelLabel && <div className="truncate text-[10px] font-bold opacity-70" title={`模型：${modelLabel}`}>{modelLabel}</div>}
                        {personaTag && <div className="truncate text-xs font-bold text-[var(--voxel-emerald-on-dark)]" title={personaTag}>🎭 {personaTag}</div>}
                    </div>
                    <div className="flex h-7 items-center justify-center border-2 bg-[var(--voxel-paper)]" style={{ borderColor: T.ink }}>
                        <div className="scale-[0.68]"><PixelItem type={dead ? 'shovel' : kit.item} color={dead ? T.dead : kit.color} small /></div>
                    </div>
                    {dead && <div className="absolute right-1 top-1"><DeadStamp compact /></div>}
                </div>
            );
        }

        return (
            <div
                key={player.id}
                className={clsx('vw-player-card relative flex min-w-0 items-center gap-2 border-[3px] p-2 shadow-[3px_3px_0_var(--voxel-ink)] max-xl:min-h-0 max-xl:gap-1 max-xl:p-1.5 max-xl:shadow-[2px_2px_0_var(--voxel-ink)]', speaking && 'vw-card-lit vw-card-pulse z-10')}
                style={{
                    borderColor: speaking ? T.torch : T.ink,
                    background: dead ? T.deadCard : `linear-gradient(180deg, #6b4729, ${T.woodDark})`,
                    color: dead ? T.deadText : T.paper,
                }}
            >
                <div className="shrink-0 max-xl:-mx-1 max-xl:scale-[0.72]">
                    <PixelAvatar seed={player.avatarSeed} look={player.look} color={roleColor} dead={dead} speaking={speaking} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-black leading-tight max-xl:text-xs" title={name}>{seat} · {name}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs font-black max-xl:text-xs">
                        <span className="inline-block h-3 w-3 border-2" style={{ background: roleColor, borderColor: T.ink }} />
                        <span className="truncate">{roleLabel}</span>
                    </div>
                    {modelLabel && (
                        <div className="mt-0.5 truncate text-[10px] font-bold opacity-70 max-xl:hidden" title={`模型：${modelLabel}`}>
                            🧠 {modelLabel}
                        </div>
                    )}
                    <div className="mt-1 flex items-center gap-1 text-xs font-black opacity-80 max-xl:hidden">
                        <span className="flex h-7 w-5 items-center justify-center border-2 bg-[var(--voxel-paper)]" style={{ borderColor: T.ink }}><PixelItem type={kit.item} color={kit.color} small /></span>
                        <span className="truncate">{dead ? '已死亡/掉落' : speaking ? '发言中' : kit.label}</span>
                    </div>
                    {personaTag && <div className="mt-0.5 truncate text-xs font-bold text-[var(--voxel-emerald-on-dark)]" title={personaTag}>🎭 {personaTag}</div>}
                </div>
                {dead && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                        <DeadStamp compact />
                    </div>
                )}
            </div>
        );
    };

    const renderSetup = () => (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
            {/* 弹窗改成纵向 flex：地图区吃剩余高度。原先写死 56dvh，1080×675 下 12 张图正好差一行，
                第四行被页脚整排切掉半张卡。现在放得下就全放得下，放不下才滚。 */}
            <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden border-[4px] shadow-[8px_8px_0_var(--voxel-ink)]" style={{ background: T.paperDim, borderColor: T.ink }}>
                <div className="shrink-0 border-b-[4px] px-5 py-4" style={{ background: T.woodDark, borderColor: T.ink, color: T.paper }}>
                    <div className="text-xs font-black tracking-[0.2em]">创建新世界</div>
                    <div className="mt-1 text-2xl font-black">选择一张生存地图</div>
                </div>
                <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="custom-scrollbar grid min-h-0 flex-1 gap-2.5 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[...GAME_PRESETS]
                        .sort((a, b) => a.playerCount - b.playerCount || a.label.localeCompare(b.label))
                        .map(preset => {
                            const active = s.selectedPresetKey === preset.key;
                            return (
                                <button
                                    key={preset.key}
                                    onClick={() => s.setSelectedPresetKey(preset.key)}
                                    className="flex items-center gap-2 border-[4px] px-2.5 py-2 text-left shadow-[4px_4px_0_var(--voxel-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                    style={{ background: active ? T.torch : T.paper, borderColor: T.ink, color: T.ink }}
                                >
                                    <span className="shrink-0"><CampIcon icon={preset.icon} px={2} /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1">
                                            <span className="min-w-0 truncate text-sm font-black leading-tight">{preset.label}</span>
                                            {active && <span className="shrink-0" aria-hidden="true" style={{ color: T.emeraldInk }}>✓</span>}
                                        </span>
                                        {/* 两张板子同名（都叫「经典标准局」，一张 9 人一张 12 人），只写人数不足以分辨，
                                            补一行阵营构成——首页的板子清单里也是这么标的 */}
                                        <span className="mt-0.5 block text-[11px] font-black leading-none opacity-70">
                                            {groupLineupByTeam(preset.roles).map(row => `${TEAM_SHORT[row.team]}${row.total}`).join(' · ')}
                                        </span>
                                    </span>
                                    <span className="shrink-0 border-2 px-1.5 py-0.5 text-[11px] font-black tabular-nums leading-none" style={{ borderColor: T.ink, background: active ? T.paperDim : 'rgba(0,0,0,0.1)' }}>
                                        {preset.playerCount}人
                                    </span>
                                </button>
                            );
                        })}
                </div>
                {/* 列表比可视区高时，最后一行一定是被切开的；这条渐隐至少让它读起来是"还有更多"而不是"画坏了" */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: `linear-gradient(180deg, transparent, ${T.paperDim})` }} />
                </div>
                <div className="shrink-0 border-t-[4px] p-4" style={{ borderColor: T.ink }}>
                    <button onClick={() => s.initGame(s.selectedPresetKey)} className="w-full border-[4px] px-5 py-3 text-sm font-black shadow-[4px_4px_0_var(--voxel-ink)] transition-all hover:brightness-110" style={{ background: T.torch, borderColor: T.ink, color: T.ink }}>
                        点燃营火
                    </button>
                </div>
            </div>
        </div>
    );

    const openReview = useOpenReview();
    const renderResult = () => {
        if (!s.gameResult) return null;
        const good = s.gameResult.winner === 'GOOD';
        return (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
                <div className="pointer-events-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto custom-scrollbar border-[4px] shadow-[8px_8px_0_var(--voxel-ink)]" style={{ background: T.paperDim, borderColor: T.ink, color: T.ink }}>
                    <div className="border-b-[4px] p-5" style={{ background: good ? T.emerald : T.redstoneDeep, borderColor: T.ink, color: good ? T.ink : '#fff' }}>
                        <div className="text-xs font-black tracking-[0.2em]">游戏结算</div>
                        <div className="mt-2 text-3xl font-black">{good ? '好人阵营胜利' : '狼人阵营胜利'}</div>
                        <div className="mt-1 text-sm font-black">{s.gameResult.reasonText}</div>
                    </div>
                    {!s.resultPanelMinimized && (
                        <div className="grid gap-3 p-4 md:grid-cols-2">
                            <div className="border-[3px] p-3" style={{ background: T.paper, borderColor: T.ink }}>
                                <div className="text-xs font-black">存活玩家</div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {s.aliveResultPlayers.map(p => <span key={p.id} className="px-2 py-1 text-xs font-black text-white" style={{ background: T.grassDark }}>{p.seatNumber}号</span>)}
                                </div>
                            </div>
                            <div className="border-[3px] p-3" style={{ background: T.paper, borderColor: T.ink }}>
                                <div className="text-xs font-black">出局玩家</div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {s.deadResultPlayers.map(p => <span key={p.id} className="px-2 py-1 text-xs font-black text-white" style={{ background: T.redstoneInk }}>{p.seatNumber}号</span>)}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* 名场面属于结算内容，跟着结算卡走：既不再压住左下的发言/日志，也跟着「收起面板」一起收起 */}
                    {!s.resultPanelMinimized && highlights.length > 0 && (
                        <div className="border-t-[4px] p-4" style={{ borderColor: T.ink }}>
                            <div className="text-xs font-black tracking-widest">⚡ 本局名场面</div>
                            <ul className="custom-scrollbar mt-2 max-h-40 space-y-1 overflow-y-auto text-xs font-bold leading-snug">
                                {highlights.map(h => (
                                    <li key={h.id} className="border-b-2 pb-1 last:border-0" style={{ borderColor: 'rgba(36,23,14,0.1)' }}>{h.content}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {!s.resultPanelMinimized && mixedModels && s.gameResult ? (() => {
                        // 电子斗蛐蛐的结算：按模型聚合"赢了几张牌"，而不是只看单个座位
                        const scoreOf = (playerId: number) => s.gameEvaluation?.scores?.find(sc => sc.playerId === playerId)?.score ?? null;
                        // modelLabelFor 只读座位 id，ModelSeat 子集即可
                        const ranked = buildModelScoreboard(s.players, (seat) => modelLabelFor(seat as Player), s.gameResult.winner, scoreOf);
                        return (
                            <div className="border-t-[4px] p-4" style={{ borderColor: T.ink }}>
                                <div className="text-xs font-black">模型战绩（同模型座位合并；胜率 → 总分排序）</div>
                                <div className="mt-2 space-y-1">
                                    {ranked.map(row => (
                                        <div key={row.label} className="flex items-center justify-between gap-2 border-[2px] px-2 py-1 text-xs font-black" style={{ background: T.paper, borderColor: T.ink }}>
                                            <span className="min-w-0 truncate" title={`座位 ${row.seats.join('、')}`}>🧠 {row.label}</span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                <span className="opacity-70">{row.total} 张牌</span>
                                                <span style={{ color: row.wins * 2 >= row.total ? T.grassDark : T.redstoneInk }}>胜 {row.wins}/{row.total}</span>
                                                <span className="opacity-70">{row.scored ? Math.round(row.scoreSum / row.scored) : 0} 分</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })() : null}
                    {!s.resultPanelMinimized && s.gameEvaluation?.scores?.length ? (
                        <div className="border-t-[4px] p-4" style={{ borderColor: T.ink }}>
                            <div className="text-xs font-black">本局评分（MVP=胜方最高分 · SVP=败方最高分）</div>
                            <div className="mt-2 grid grid-cols-2 gap-1 md:grid-cols-3">
                                {s.gameEvaluation.scores.map(ps => {
                                    const p = s.players.find(pl => pl.id === ps.playerId);
                                    return (
                                        <div key={ps.playerId} className="flex items-center justify-between gap-1 border-[2px] px-2 py-1 text-xs font-black" style={{ background: T.paper, borderColor: T.ink }}>
                                            <span>{p ? `${p.seatNumber}号` : `${ps.playerId}`}</span>
                                            <span className="flex items-center gap-1">
                                                {ps.isMvp && <span className="px-1 py-0.5 text-xs text-white" style={{ background: T.grassDark }}>MVP</span>}
                                                {ps.isSvp && <span className="px-1 py-0.5 text-xs text-white" style={{ background: T.waterInk }}>SVP</span>}
                                                <span>{ps.score}分</span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 border-t-[4px] p-4" style={{ borderColor: T.ink }}>
                        <span className="text-xs font-black">DAY {s.gameResult.turn} · 存活 {aliveCount}/{s.players.length}</span>
                        <div className="flex gap-2 [&_button]:min-h-11">
                            <BlockButton onClick={() => openReview(null)}>复盘</BlockButton>
                            <BlockButton onClick={s.handleConfirmExit}>返回主页</BlockButton>
                            <BlockButton onClick={() => s.setResultPanelMinimized(v => !v)}>{s.resultPanelMinimized ? '展开结算' : '收起面板'}</BlockButton>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const playerGridClass = clsx(
        // 窄容器下允许纵向滚动，而不是把玩家卡片裁掉（1024-1279px 单列挤压时卡片不可见）
        'grid min-h-0 flex-1 gap-1 overflow-y-auto custom-scrollbar content-start auto-rows-min',
        // 列数按卡片宽度需求定：名签卡(头像+文字列)在 360px 侧栏两列才放得下职业/物品文字
        cardStyle === 'name-sign' && 'grid-cols-2 md:grid-cols-3 lg:grid-cols-2 lg:gap-2',
        cardStyle === 'totem-badge' && 'grid-cols-2 md:grid-cols-4 lg:grid-cols-3 lg:gap-2',
        cardStyle === 'hotbar-strip' && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-1 lg:gap-2'
    );

    return (
        <div
            className={clsx('absolute inset-0 flex w-full select-none flex-col overflow-hidden', s.isNightPhase && 'vw-night')}
            style={{
                height: '100dvh',
                paddingTop: 'var(--safe-area-inset-top)',
                paddingBottom: dockReserve,
                color: T.paper,
                fontFamily: 'var(--voxel-font)',
                imageRendering: 'pixelated',
                transition: 'background 2400ms ease',
                background: isMine ? '#222a31' : s.isNightPhase ? T.night : T.sky,
            }}
        >
            {/* 入夜氛围层：暗角渐入渐出，夜里全体卡片剪影化、发言者点亮（见 index.css 的 vw-* 规则） */}
            <div aria-hidden className="vw-night-veil pointer-events-none absolute inset-0 z-20" style={{
                opacity: s.isNightPhase ? 1 : 0,
                background: `radial-gradient(ellipse at 50% 40%, ${T.nightVeil}14 30%, ${T.night}66 72%, ${T.nightVeil}9e 100%)`,
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="absolute left-0 right-0 top-[38%] h-24 pointer-events-none" style={{ background: `linear-gradient(180deg, ${scene.ground}, ${scene.ground2})`, clipPath: isMine ? 'none' : 'polygon(0 54%, 8% 38%, 17% 50%, 25% 28%, 37% 47%, 48% 30%, 60% 48%, 70% 34%, 82% 50%, 92% 39%, 100% 52%, 100% 100%, 0 100%)' }} />
            <div className="absolute bottom-0 left-0 right-0 h-[44%] pointer-events-none" style={{ backgroundColor: T.dirt, backgroundImage: `linear-gradient(45deg, ${T.dirtDark} 25%, transparent 25%), linear-gradient(-45deg, ${T.dirtDark} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${T.dirtDark} 75%), linear-gradient(-45deg, transparent 75%, ${T.dirtDark} 75%)`, backgroundSize: '32px 32px', backgroundPosition: '0 0, 0 16px, 16px -16px, -16px 0' }} />

            <div className="relative z-10 flex h-full min-h-0 flex-col px-3 pb-3 md:px-5">
                {/* 窄屏（手机）改两段式：标题独占一行，控件另起一行拿满宽度。
                    之前是单行 justify-between，控件簇被标题挤成 3 行、X 单独掉到最后一行，
                    看起来像没排版。>=sm 仍是左标题右控件的一行 */}
                <header className="flex shrink-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    {/* 标题不参与收缩：窄屏时让右侧按钮簇换行，而不是把「夜晚降临」截成「夜…」 */}
                    <div className="shrink-0">
                        <div className="text-xs font-black tracking-[0.22em]" style={{ color: isDaySky ? T.inkSoft : T.torch, transition: 'color 2400ms ease' }}>{scene.title}</div>
                        <div className="text-xl font-black" style={{ color: isDaySky ? T.ink : '#ffffff', transition: 'color 2400ms ease' }}>{phase.title}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-start gap-2 [&_button]:min-h-11 sm:justify-end">
                        {/* 结构化 DAY / HP 信息：与右侧按钮同一套盒子（44px 高、3px 描边、12px 字重），
                            否则一行里会混出 34 与 44 两种高度，看起来像没对齐 */}
                        <span className="flex min-h-11 items-center border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>DAY {s.turnCount}</span>
                        <span className="flex min-h-11 items-center border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]" style={{ background: aliveCount > 0 ? T.grassDark : T.dead, borderColor: T.ink, color: '#fff' }}>存活 {aliveCount}/{s.players.length}</span>
                        {s.debugMode && s.multiplayerRole !== 'guest' && (
                            <BlockButton onClick={() => s.setDebugLogOpen(true)} active={s.debugGodView}>
                                <span className="flex items-center gap-1.5">
                                    <BugIcon />
                                    调试
                                </span>
                            </BlockButton>
                        )}
                        {/* 术语速查:对局内随手查职业/黑话,Esc 关闭 */}
                        <RoleGlossary roles={glossaryRoles} note={glossaryNote} />
                        <PaceControl />
                        {/* 声音:语音 + 音乐收进一个菜单,工具栏只留一个入口 */}
                        <div ref={soundPanelRef} className="relative">
                            <button
                                type="button"
                                aria-label="声音设置"
                                aria-haspopup="dialog"
                                aria-expanded={soundOpen}
                                onClick={() => setSoundOpen(v => !v)}
                                title="语音与音乐 (M 音乐 · V 语音)"
                                className="flex items-center gap-1.5 border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                style={{ background: soundOpen ? T.torch : T.paper, borderColor: T.ink, color: T.ink }}
                            >
                                <SpeakerIcon />
                                声音
                                <CaretIcon />
                            </button>
                            {soundOpen && (
                                <div role="dialog" aria-label="声音设置" className="absolute right-0 top-full z-50 mt-1.5 w-44 border-[3px] p-2 shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>
                                    {s.multiplayerRole === 'guest' ? (
                                        <div className="flex min-h-11 items-center justify-between border-2 px-3 text-xs font-black" style={{ background: T.woodDark, borderColor: T.ink, color: T.paper }}>
                                            <span>旁白语音</span>
                                            <span>{s.ttsEnabled ? '开' : '关'}</span>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            aria-pressed={s.ttsEnabled}
                                            onClick={() => void s.handleTtsToggle()}
                                            title="旁白语音 (V)"
                                            className="flex min-h-11 w-full items-center justify-between border-2 px-3 text-xs font-black shadow-[2px_2px_0_var(--voxel-ink)]"
                                            style={{ background: T.woodDark, borderColor: T.ink, color: T.paper }}
                                        >
                                            <span>旁白语音</span>
                                            <span>{s.ttsChecking ? '检测中' : s.ttsEnabled ? '开' : '关'}</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        aria-pressed={uiCfg.bgmEnabled !== false}
                                        onClick={() => setUiConfig(prev => ({ ...prev, bgmEnabled: !(prev.bgmEnabled ?? true) }))}
                                        title="对局音乐 (M)"
                                        className="mt-1.5 flex min-h-11 w-full items-center justify-between border-2 px-3 text-xs font-black shadow-[2px_2px_0_var(--voxel-ink)]"
                                        style={{ background: T.woodDark, borderColor: T.ink, color: T.paper }}
                                    >
                                        <span>对局音乐</span>
                                        <span>{uiCfg.bgmEnabled !== false ? '开' : '关'}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        {/* 布局:切视角/卡片是高频动作,常驻顶栏 */}
                        <InGameStyleSwitcher size="tap" />
                        {/* 人设 / 最小化：原本都收在「更多」里，一个菜单只装这两项，不如直接放出来（3D 顶栏同理） */}
                        <BlockButton
                            onClick={() => setUiConfig(prev => ({ ...prev, personaTagsEnabled: !(prev.personaTagsEnabled ?? true) }))}
                            active={uiCfg.personaTagsEnabled !== false}
                            title="显示 AI 人设标记"
                        >
                            <span className="flex items-center gap-1.5">
                                <PersonIcon />
                                人设
                            </span>
                        </BlockButton>
                        {/* 最小化 / 退出：行尾符号钮 — / X，语义靠 title/aria 说明 */}
                        <BlockButton onClick={() => s.handleSuspend()} title="最小化（暂存进度，主页可继续）" ariaLabel="最小化" className="min-w-11">
                            <span className="flex items-center justify-center" aria-hidden="true">
                                <MinusIcon />
                            </span>
                        </BlockButton>
                        <BlockButton onClick={() => s.setShowExitConfirm(true)} title="退出 (Esc)" ariaLabel="退出" className="min-w-11">
                            <span className="flex items-center justify-center" aria-hidden="true">
                                <CloseIcon />
                            </span>
                        </BlockButton>
                    </div>
                </header>

                <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <section className="relative min-h-0 overflow-hidden border-[4px] p-3 shadow-[6px_6px_0_var(--voxel-ink)]" style={{ background: scene.panel, borderColor: T.ink }}>
                        {/* 无 lg 时也显式分行：场景子全 absolute，auto 行高会塌成 0，横幅与营火一起消失 */}
                        <div className="grid h-full min-h-0 gap-3 grid-rows-[minmax(240px,0.62fr)_minmax(120px,0.38fr)] lg:grid-rows-[minmax(190px,0.58fr)_minmax(180px,0.42fr)]">
    <div className="flex min-h-0 flex-col">
        <div className="vw-scene-light relative min-h-0 flex-1 overflow-hidden border-[4px]" style={{ background: isMine ? '#2d3338' : s.isNightPhase ? '#17243e' : '#86c7ef', borderColor: T.ink, transition: 'background 2400ms ease' }}>
<div className={clsx('vw-sun absolute left-6 top-6 h-14 w-14', !s.isNightPhase && 'vw-sun-glow', s.isNightPhase && 'pointer-events-none -translate-y-8 opacity-0')} style={{ background: '#ffd45a', boxShadow: 'inset -8px -8px 0 rgba(0,0,0,0.14)' }} />
                                <div className={clsx('vw-moon absolute right-[30%] top-6 h-10 w-10 rounded-full', s.isNightPhase ? 'opacity-100' : 'pointer-events-none translate-y-8 opacity-0')} style={{ background: '#e8e4d8', boxShadow: 'inset -6px -4px 0 rgba(0,0,0,0.18)' }} />
                                {!isMine && <div className="absolute right-[12%] top-10 h-6 w-24 bg-white/55 shadow-[26px_10px_0_rgba(255,255,255,0.35),-18px_8px_0_rgba(255,255,255,0.28)]" />}
                                {/* 白天：漂移方块云 */}
                                {!isMine && !s.isNightPhase && (
                                    <>
                                        <div className="vw-cloud" style={{ top: '12%', width: 36, height: 11, background: 'rgba(255,255,255,0.85)', animationDuration: '58s' }} />
                                        <div className="vw-cloud" style={{ top: '30%', width: 26, height: 8, background: 'rgba(255,255,255,0.7)', animationDuration: '80s', animationDelay: '-36s' }} />
                                    </>
                                )}
                                {/* 夜晚：星空(12 颗) + 萤火虫(6 只) */}
                                {!isMine && s.isNightPhase && (
                                    <>
                                        {[[8, 12], [16, 22], [24, 8], [32, 18], [40, 6], [48, 20], [56, 10], [64, 16], [72, 7], [80, 19], [88, 11], [94, 22]].map(([l, t], i) => (
                                            <div key={`star-${i}`} className="vw-star" style={{ left: `${l}%`, top: `${t}%` }} />
                                        ))}
                                        {[[12, 62], [28, 55], [44, 60], [60, 52], [76, 58], [90, 54]].map(([l, t], i) => (
                                            <div key={`fly-${i}`} className="vw-firefly" style={{ left: `${l}%`, top: `${t}%`, animationDuration: `${3 + i * 0.8}s`, animationDelay: `${-i * 1.4}s` }} />
                                        ))}
                                    </>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 h-20" style={{ background: `linear-gradient(180deg, ${scene.ground}, ${isMine ? '#22272d' : T.dirt})` }} />
                                <TerrainStrip mine={isMine} redstone={isRedstone} />
                                {!isMine && <div className="absolute bottom-16 left-[9%] h-24 w-8" style={{ background: T.woodDark }} />}
                                {!isMine && <div className="absolute bottom-[80px] left-[6%] h-14 w-20" style={{ background: '#2e7d32', boxShadow: '18px 6px 0 #256a2a, -12px 10px 0 #3e9138' }} />}
                                {!isMine && <PixelTorch x={31} y={64} />}
                                {!isMine && <PixelTorch x={74} y={66} />}
                                {isRedstone && <div className="absolute bottom-[86px] left-[22%] right-[18%] h-3" style={{ background: T.redstone, boxShadow: `0 0 16px ${T.redstone}` }} />}
                                {isMine && <div className="absolute inset-x-8 top-14 h-10 border-[4px] bg-[#1b2026] shadow-[0_14px_0_#15191e]" style={{ borderColor: T.ink }} />}
                                {isMine && <div className="absolute bottom-[80px] left-[10%] h-20 w-16 bg-[#42484f] shadow-[28px_-12px_0_#343a40,54px_8px_0_#59616a]" />}
                                <div className="vw-fire absolute bottom-[64px] left-1/2 z-10 -ml-12">
                                    {isMine ? <PixelMineCart /> : isRedstone ? <PixelRedstoneRig /> : <PixelCampfire />}
                                </div>
                                {/* 营火余烬:火星上升粒子 */}
                                <div className="pointer-events-none absolute bottom-[130px] left-1/2 z-10 h-16 w-20 -translate-x-1/2">
                                    {[0, 1, 2, 3, 4, 5].map(i => (
                                        <span key={`ember-${i}`} className="vw-ember" style={{ left: `${16 + i * 13}%`, ['--ex' as string]: `${(i % 2 === 0 ? 1 : -1) * (4 + i * 3)}px`, animationDelay: `${i * 0.45}s` }} />
                                    ))}
                                </div>
                                
                                <div className="absolute bottom-16 right-[10%] h-24 w-28">
                                    <div className="absolute bottom-0 left-0 right-0 h-12" style={{ background: isMine ? T.stone : T.wood, boxShadow: 'inset -6px -6px 0 rgba(0,0,0,0.2)' }} />
                                    <div className="absolute bottom-12 left-4 h-8 w-20" style={{ background: isRedstone ? T.redstone : isMine ? '#3b4249' : '#7d3f25', clipPath: isMine ? 'none' : 'polygon(50% 0, 100% 100%, 0 100%)' }} />
                                    <div className="absolute bottom-0 left-10 h-8 w-8" style={{ background: '#2a1a11' }} />
                                </div>
                                {currentSpeaker && (
                                    <div
                                        className="vw-speaker-badge-x absolute bottom-[140px] z-20 border-[3px] px-2 py-1 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]"
                                        style={{ left: `${speakerOffset}%`, background: T.paper, borderColor: T.ink, color: T.ink }}
                                    >
                                        {currentSpeaker.seatNumber}P
                                        <span className="absolute left-1/2 top-full h-4 w-2 -translate-x-1/2" style={{ background: T.ink }} />
                                    </div>
                                )}
                                {(() => {
                                    // 全员按初始站位分立篝火两侧:死亡=墓碑,存活=像素头像;篝火居中贴地不挡人
                                    const playersInSeatOrder = s.players;
                                    const half = Math.ceil(playersInSeatOrder.length / 2);
                                    const renderSeat = (player: Player) => {
                                        const speaking = s.currentSpeakerId === player.id && isAlive(player);
                                        if (!isAlive(player)) {
                                            return <PixelGrave key={player.id} seed={player.seatNumber} speaking={speaking} />;
                                        }
                                        const visible = canSeeRole(player);
                                        const roleColor = visible ? getRoleColor(player.role, T.redstone, T.torch, T.emerald) : '#4aa3df';
                                        return (
                                            <div key={player.id} className={clsx('relative', speaking && 'vw-px-speaking')}>
                                                <PixelAvatar seed={player.avatarSeed} look={player.look} color={roleColor} speaking={speaking} />
                                            </div>
                                        );
                                    };
                                    return (
                                        <>
                                            <div className="absolute bottom-16 right-[calc(50%+110px)] flex items-end gap-2">
                                                {playersInSeatOrder.slice(0, half).map(player => renderSeat(player))}
                                            </div>
                                            <div className="absolute bottom-16 left-[calc(50%+110px)] flex items-end gap-2">
                                                {playersInSeatOrder.slice(half).map(player => renderSeat(player))}
                                            </div>
                                        </>
                                    );
                                })()}
                                {/* 仪式横幅锚定在场景画布内部(vw-scene-light 为 relative + overflow-hidden):画布下方的「当前发言」在结构上不可能被它压住 */}
                                {phaseBanner && (
                                    <div key={phaseBanner.key} className="vw-phase-banner pointer-events-none absolute inset-x-0 top-[8%] z-30 flex justify-center px-3">
                                        <div className="border-[4px] px-5 py-3 text-center text-lg font-black shadow-[6px_6px_0_var(--voxel-ink)] sm:px-6 sm:text-2xl" style={{ background: phaseBanner.tone, borderColor: T.ink, /* 白字在 sky 上仅 2.07:1,白天横幅改用墨色(8.4:1);夜里 night 底白字 17.6:1 */ color: phaseBanner.tone === T.sky ? T.ink : '#ffffff', textShadow: '2px 2px 0 rgba(0,0,0,0.4)' }}>
                                            {phaseBanner.text}
                                        </div>
                                    </div>
                                )}
                                        </div>
        {/* 当前发言:画布下方的常规布局元素,不悬浮、不遮挡场景角色 */}
        <div className="mt-2 h-[6.5rem] shrink-0 overflow-hidden border-[3px] px-3 py-2 shadow-[3px_3px_0_var(--voxel-ink)]" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>
            <div className="text-xs font-black">当前发言</div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
                <div className="truncate text-lg font-black" style={{ color: currentRoleColor }}>
                    {currentSpeaker ? `${currentSpeaker.seatNumber}号 ${currentSpeaker.displayName || '玩家'}` : s.isNightPhase ? '夜幕下，营火暂歇' : '等待玩家靠近营火'}
                </div>
                {currentSpeaker && !isAlive(currentSpeaker) && <DeadStamp compact />}
            </div>
            {typedSpeech && (
                <div ref={speechTextRef} className="custom-scrollbar mt-1 max-h-16 overflow-y-auto border-t-2 pt-1 text-xs font-bold leading-snug" style={{ borderColor: `${T.ink}22` }}>
                    {typedSpeech}
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse align-middle" style={{ background: T.ink }} />
                </div>
            )}
        </div>
    </div>
    <div className="flex min-h-0 flex-col overflow-hidden border-[4px] shadow-[4px_4px_0_var(--voxel-ink)]" style={{ background: T.woodDark, borderColor: T.ink }}>
        <div className="flex shrink-0 items-center justify-between border-b-[4px] px-3 py-2" style={{ background: T.wood, borderColor: T.ink }}>
            <div className="text-xs font-black" style={{ color: T.paper }}>{scene.chatTitle}<span className="ml-2 text-xs opacity-60">仅当前可见内容</span></div>
            {/* 「AI 思考中」已由屏幕上的等待期字幕接管（带座位号、秒数与思考字数），这里不再重复一个静态角标 */}
        </div>
        <AutoScrollLog logs={s.visibleLogs} className="min-h-0 flex-1 px-3 pb-3 pt-2 text-[12px]" />
    </div>
    </div>
</section>

                    <aside className="flex min-h-0 flex-col border-[4px] p-3 shadow-[6px_6px_0_var(--voxel-ink)] max-lg:p-2" style={{ background: T.wood, borderColor: T.ink }}>
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-2 max-xl:mb-2">
                            <div className="min-w-0">
                                <div className="text-xs font-black" style={{ color: T.paper }}>{scene.inventoryTitle}</div>
                                <div className="text-xs font-black max-xl:hidden" style={{ color: T.ink }}>全员像素头像</div>
                            </div>
                            {!s.isSetup && !s.isTheater && !s.isReplayMode && s.phase !== GamePhase.GAME_REVIEW && s.multiplayerRole !== 'guest' && (
                                <BlockButton onClick={s.handleAutoPlayToggle} active={s.isAuto} className="min-h-11 shrink-0">
                                    <span className="flex items-center gap-1.5">
                                        {s.isAuto ? <PauseIcon /> : <PlayIcon />}
                                        {s.isAuto ? '暂停' : '继续'}
                                    </span>
                                </BlockButton>
                            )}
                        </div>
                        {/* 投票阶段:开票板悬浮于右栏顶部(从场景画布移出,避免压在叙事上) */}
                        {voteBoard && (
                            <div className="mb-2 flex shrink-0 flex-col items-end gap-1">
                                <div className="border-[3px] px-2 py-0.5 text-xs font-black" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>开票</div>
                                <div className="flex max-h-24 flex-col gap-1 overflow-y-auto custom-scrollbar">
                                    {voteBoard.map(v => (
                                        <div key={v.id} className="vw-vote-chip border-[3px] px-2 py-0.5 text-xs font-black" style={{ background: T.paper, borderColor: T.ink, color: T.ink }}>
                                            {v.voter}号 → {v.target != null ? `${v.target}号` : '弃票'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={playerGridClass}>
                            {(() => {
                                const ordered = [...s.players].sort((a, b) => (isAlive(b) ? 1 : 0) - (isAlive(a) ? 1 : 0));
                                const firstDeadIndex = ordered.findIndex(p => !isAlive(p));
                                return ordered.map((player, idx) => {
                                return (
                                <React.Fragment key={player.id}>
                                {idx === 0 && ordered.some(pp => isAlive(pp)) && (
                                    <div className="col-span-full border-b-2 px-1.5 pb-1 pt-0.5 text-xs font-black" style={{ borderColor: `${T.ink}55`, background: T.paper, color: T.ink }}>存活</div>
                                )}
                                {idx === firstDeadIndex && firstDeadIndex > 0 && (
                                    <div className="col-span-full mt-2 border-b-2 px-1.5 pb-1 pt-0.5 text-xs font-black" style={{ borderColor: `${T.redstone}88`, background: T.paper, color: T.redstoneInk }}>出局</div>
                                )}
                                <div className="relative min-w-0">
                                    {renderPlayerCard(player)}
                                    {shattering.includes(player.id) && (
                                        <div className="pointer-events-none absolute inset-0 z-30">
                                            {Array.from({ length: 10 }, (_, i) => (
                                                <span
                                                    key={i}
                                                    className="vw-shard"
                                                    style={{
                                                        left: '50%',
                                                        top: '40%',
                                                        background: [T.redstone, T.torch, T.emerald, T.diamond, '#c9ced6'][i % 5],
                                                        ['--dx' as string]: `${(Math.random() - 0.5) * 120}px`,
                                                        ['--dy' as string]: `${-20 - Math.random() * 70}px`,
                                                        animationDelay: `${i * 0.04}s`,
                                                    }}
                                                />
                                            ))}
                                            <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ animation: 'vw-tomb-drop 1.1s ease-in forwards' }}>💀</div>
                                        </div>
                                    )}
                                </div>
                                </React.Fragment>
                                );
                                })
                            })()}
                        </div>
                        <div className={clsx("mt-3 hidden shrink-0 grid-cols-6 gap-1", cardStyle === 'hotbar-strip' && 'xl:grid')}>
                            {['sword', 'shield', 'potion', 'torch', 'emerald', 'map'].map((item, i) => (
                                <div key={i} className="flex aspect-square items-center justify-center border-[3px] shadow-[2px_2px_0_var(--voxel-ink)]" style={{ background: T.paper, borderColor: T.ink }}><PixelItem type={item} color={[T.stone, T.water, '#b44bd6', T.torch, T.emerald, '#c9c0a4'][i]} fit={40} /></div>
                            ))}
                        </div>
                    </aside>
                </main>
                {/* 结算演出:彩带。名场面清单在结算卡内部(renderResult),不再固定压住左下发言/日志 */}
                {s.phase === GamePhase.GAME_REVIEW && (
                    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
                        {Array.from({ length: 42 }, (_, i) => (
                            <span
                                key={i}
                                className="vw-confetti"
                                style={{
                                    left: `${(i * 7.3) % 100}%`,
                                    background: [T.redstone, T.torch, T.emerald, T.diamond, '#f6e05e'][i % 5],
                                    animationDuration: `${2.4 + (i % 5) * 0.5}s`,
                                    animationDelay: `${(i % 7) * 0.18}s`,
                                }}
                            />
                        ))}
                    </div>
                )}
                {flash && (
                    <div key={flash.id} className="vw-flash pointer-events-none absolute left-1/2 top-[15%] z-50 -translate-x-1/2">
                        <div className="border-[4px] px-5 py-2 text-xl font-black text-white shadow-[5px_5px_0_var(--voxel-ink)]" style={{ background: flash.tone, borderColor: T.ink }}>
                            {flash.text}
                        </div>
                    </div>
                )}
            </div>

            {s.isPaused && (
                <div
                    role="status"
                    data-testid="game-paused-banner"
                    className="absolute left-1/2 top-16 z-50 -translate-x-1/2 border-[3px] px-4 py-2 text-xs font-black shadow-[4px_4px_0_var(--voxel-ink)]"
                    style={{ background: T.torch, borderColor: T.ink, color: T.ink }}
                >
                    游戏已暂停
                </div>
            )}
            {s.isSetup && renderSetup()}
            {s.isGameOver && renderResult()}
            {s.showExitConfirm && (
                <div role="dialog" aria-label="退出确认" className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-sm border-[4px] p-5 shadow-[8px_8px_0_var(--voxel-ink)]" style={{ background: T.paperDim, borderColor: T.ink, color: T.ink }}>
                        <div className="text-2xl font-black">退出世界？</div>
                        <p className="mt-3 text-sm font-black leading-relaxed">退出将放弃本局进度（可先「暂存并退出」稍后继续）。</p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => s.setShowExitConfirm(false)}
                                className="min-h-11 border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                            >取消</button>
                            <button
                                type="button"
                                onClick={() => s.handleSuspend('暂存并退出')}
                                title="保存当前进度，主页可从「进行中的对局」继续"
                                className="min-h-11 border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ background: T.grass, borderColor: T.ink, color: T.ink }}
                            >暂存并退出</button>
                            <button
                                type="button"
                                onClick={s.handleConfirmExit}
                                className="col-span-2 min-h-11 border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ background: T.redstoneDeep, borderColor: T.ink, color: '#ffffff' }}
                            >仍要退出</button>
                        </div>
                    </div>
                </div>
            )}
            <HumanInputPanel />
        </div>
    );
};
