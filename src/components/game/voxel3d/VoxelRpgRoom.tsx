import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useAtom, useAtomValue } from 'jotai';
import { useGameRoomState } from '../../../hooks/useGameRoomState';
import HumanInputPanel from '../../HumanInputPanel';
import InGameStyleSwitcher from '../../InGameStyleSwitcher';
import { GamePhase, Role, ROLE_INFO, WOLF_ROLES, getPersonaLabel, canSeeRoleShared } from '../../../types';
import { uiConfigAtom, actorProfilesAtom, llmPresetsAtom } from '../../../atoms';
import { pickDisplayedModelLabels } from '../../../utils/modelLabels';
import { ForestCampScene } from './ForestCampScene';
import { resolveSceneId, SCENES } from './biomes';
import RpgHud from './RpgHud';
import { worldTargetAtom } from './worldTarget';
import { useSkillEffectTimeline } from './useSkillEffectTimeline';
import { useVoxelAudio } from './useVoxelAudio';
import { PhaseTransitionOverlay } from './PhaseTransitionOverlay';
import { RpgDialogueOverlay } from './RpgDialogueOverlay';
import { getDialogueDurationMs, isDialoguePresentationLog, shouldConcealDialogueIdentity, type DialoguePresentation } from './dialogueModel';
import { CAMERA_STYLES, type CameraStyle } from './cameraDirectorModel';
import { useOpenReview } from '../../../hooks/useOpenReview';
import { BugIcon, SpeakerIcon, PauseIcon, PlayIcon, CamcorderIcon, MinusIcon, CloseIcon, CaretIcon } from '../toolbarIcons';

const supportsWebGL = () => {
    if (typeof document === 'undefined') return true;
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
};

/**
 * Html labels are rendered outside the WebGL canvas.  Without this probe a
 * lost canvas can leave those labels floating over a blank page, which looks
 * like a black-screen game rather than a recoverable renderer failure.
 */
const RenderProbe: React.FC<{ onFrame: () => void }> = ({ onFrame }) => {
    useFrame(() => onFrame());
    return null;
};

const ToolbarButton = ({ children, onClick, active, title, ariaLabel, ariaHasPopup, ariaExpanded, className }: {
    children: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
    title?: string;
    ariaLabel?: string;
    ariaHasPopup?: 'dialog' | 'menu';
    ariaExpanded?: boolean;
    className?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaExpanded}
        className={`pointer-events-auto border-[3px] border-[var(--voxel-ink)] px-3 py-1.5 max-sm:px-2 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${className ?? ''}`}
        style={{ background: active ? 'var(--voxel-torch)' : 'var(--voxel-paper)', color: 'var(--voxel-ink)' }}
    >
        {children}
    </button>
);

export const VoxelRpgRoom: React.FC = () => {
    const s = useGameRoomState();
    const openReview = useOpenReview();
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);
    const [worldTarget, setWorldTarget] = useAtom(worldTargetAtom);
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const manualTimerRef = useRef<number | null>(null);
    const dialogueTimerRef = useRef<number | null>(null);
    const seenDialogueLogIdsRef = useRef<Set<string> | null>(null);
    const [manualControlActive, setManualControlActive] = useState(false);
    // 运镜方式:自动导播 / 四种巡游镜头;手动拖拽时暂停,8 秒无操作自动恢复
    const [cameraStyle, setCameraStyleState] = useState<CameraStyle>('auto');
    const [camMenuOpen, setCamMenuOpen] = useState(false);
    // 「声音」弹出菜单:对局内唯一的声音入口——旁白语音/对局音乐/环境声/技能声/音量全在这里
    const [soundOpen, setSoundOpen] = useState(false);
    const soundPanelRef = useRef<HTMLDivElement | null>(null);
    // 3D 场景预设：局内「布局」面板可随时切换
    const scenePreset = useMemo(() => SCENES[resolveSceneId(s.uiConfig.sceneId)], [s.uiConfig.sceneId]);
    const setCameraStyle = (style: CameraStyle) => {
        setCameraStyleState(style);
        setManualControlActive(false);
        setCamMenuOpen(false);
    };
    const cameraStyleLabel = CAMERA_STYLES.find(style => style.id === cameraStyle)?.label ?? '自动导播';
    const [webglAvailable] = useState(supportsWebGL);
    const [rendererFailed, setRendererFailed] = useState(false);
    const [rendererReady, setRendererReady] = useState(false);
    const [dialogue, setDialogue] = useState<DialoguePresentation | null>(null);
    const [dialogueQueue, setDialogueQueue] = useState<DialoguePresentation[]>([]);
    // 字幕积压超限被丢弃的条数（队列播完且 8 秒无新字幕时提示消失）
    const [droppedDialogueCount, setDroppedDialogueCount] = useState(0);
    const [dialogueCurtainVisible, setDialogueCurtainVisible] = useState(false);
    const [dialogueCameraActive, setDialogueCameraActive] = useState(false);

    const handleRendererFailure = () => {
        setRendererFailed(true);
        setRendererReady(false);
    };

    const dialogueSpeaker = dialogue
        ? s.players.find(player => player.id === dialogue.speakerId) ?? null
        : null;
    const dialogueConcealed = shouldConcealDialogueIdentity(s.isNightPhase, s.canSeeGodStateDetails) &&
        // 隐名按查看者口径收敛：发言者是本人、或与本人同属狼人阵营时不再匿名，
        // 与右侧花名册的队友可见规则保持一致（否则一边保密一边公开自相矛盾）
        !!dialogue && !!s.humanPlayer &&
        dialogue.speakerId !== s.humanPlayer.id &&
        !(WOLF_ROLES.includes(s.humanPlayer.role) && !!dialogueSpeaker && WOLF_ROLES.includes(dialogueSpeaker.role));

    // 混用模型时，3D 世界里的每张牌也要标出背后是哪个模型（口径与 2D 座位卡共用一份）
    const llmPresets = useAtomValue(llmPresetsAtom);
    const actorProfiles = useAtomValue(actorProfilesAtom);
    const modelLabels = useMemo(
        () => pickDisplayedModelLabels(s.players, actorProfiles, llmPresets),
        [s.players, llmPresets, actorProfiles],
    );

    const visiblePlayers = useMemo(() => s.players.map(player => ({
        id: player.id,
        seatNumber: player.seatNumber,
        displayName: player.displayName,
        status: player.status,
        avatarSeed: player.avatarSeed,
        isSpeaking: !dialogueConcealed && dialogue?.speakerId === player.id,
        isHuman: player.isHuman,
        concealed: false,
        hideLabel: !!dialogue,
        modelLabel: modelLabels[player.id],
        look: player.look,
    })), [dialogue?.speakerId, dialogueConcealed, s.players, modelLabels]);

    const visibleRoleLabels = useMemo(() => {
        const result: Record<number, string> = {};
        for (const player of s.players) {
            const visible = canSeeRoleShared(player.id, player.role, s.humanPlayer?.id ?? null, s.humanPlayer?.role, s.canSeeGodStateDetails, s.isGameOver);
            result[player.id] = visible ? ROLE_INFO[player.role]?.label ?? player.role : '未知职业';
        }
        return result;
    }, [s.canSeeGodStateDetails, s.humanPlayer, s.isGameOver, s.players]);

    // 术语速查的职业清单：与名册同一 canSeeRoleShared 口径，玩家模式不泄露敌方板子
    const glossaryRoles = useMemo(() => {
        const seen = new Set<Role>();
        const out: Role[] = [];
        for (const player of s.players) {
            const visible = canSeeRoleShared(player.id, player.role, s.humanPlayer?.id ?? null, s.humanPlayer?.role, s.canSeeGodStateDetails, s.isGameOver);
            if (visible && !seen.has(player.role)) {
                seen.add(player.role);
                out.push(player.role);
            }
        }
        return out;
    }, [s.canSeeGodStateDetails, s.humanPlayer, s.isGameOver, s.players]);
    const glossaryNote = (s.canSeeGodStateDetails || s.isGameOver)
        ? '当前是上帝视角：这里列出本局全部职业。'
        : '为避免剧透，只列出你当前可见的职业（与队伍名册同一口径）。';

    // 人设标记(可在工具栏关闭)
    const personaLabels = useMemo(() => {
        if (uiConfig.personaTagsEnabled === false) return {};
        const result: Record<number, string> = {};
        for (const p of s.players) {
            const label = getPersonaLabel(p.stylePrompt);
            if (label) result[p.id] = label;
        }
        return result;
    }, [s.players, uiConfig.personaTagsEnabled]);

    const effectVisiblePlayers = useMemo(() => s.players.map(player => ({
        id: player.id,
        role: s.canSeeGodStateDetails || player.id === s.humanPlayer?.id
            ? player.role
            : Role.VILLAGER,
    })), [s.canSeeGodStateDetails, s.humanPlayer?.id, s.players]);

    const skillEvents = useSkillEffectTimeline({
        visibleLogs: s.visibleLogs,
        visiblePlayers: effectVisiblePlayers,
        viewerId: s.humanPlayer?.id ?? null,
        viewerRole: s.humanPlayer?.role ?? null,
        isOmniscient: s.canSeeGodStateDetails,
        phase: s.phase,
        turn: s.turnCount,
    });

    useVoxelAudio({
        events: skillEvents,
        ambientEnabled: s.uiConfig.worldAmbientAudioEnabled,
        skillEnabled: s.uiConfig.worldSkillAudioEnabled,
        volume: s.uiConfig.worldAudioVolume,
        isNight: s.isNightPhase,
    });

    useEffect(() => {
        setManualControlActive(false);
    }, [s.currentSpeakerId, s.phase]);

    useEffect(() => () => {
        if (manualTimerRef.current) window.clearTimeout(manualTimerRef.current);
        if (dialogueTimerRef.current) window.clearTimeout(dialogueTimerRef.current);
    }, []);

    useEffect(() => {
        if (!soundOpen) return undefined;
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

    // 「运镜」常驻顶栏（原来埋在「更多」里，得先点一次才看得见），点开就是这个下拉
    const camPanelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!camMenuOpen) return undefined;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (camPanelRef.current?.contains(target)) return;
            // 「布局」面板(InGameStyleSwitcher)portal 到 body 且内联 position:fixed,点它不算点菜单外
            if (target instanceof Element && target.closest('div[style*="position: fixed"]')) return;
            setCamMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setCamMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [camMenuOpen]);

    // 对局快捷键（3D 场景的全局唯一监听）：Esc = 关弹层 / 呼出退出确认；M = 对局音乐；V = 旁白语音。
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
                if (s.showExitConfirm) { s.setShowExitConfirm(false); return; }
                // 声音菜单 / 更多菜单 / 术语面板 / HUD 过程日志的声音菜单各自监听 Esc 自行关闭（面板带 role=dialog,见下方守卫）,同一击不叠加第二个动作
                if (document.querySelector('[role="dialog"]')) return;
                // 外观菜单(InGameStyleSwitcher)是 body portal + 内联 fixed，没有 role=dialog
                if (document.querySelector('div[style*="position: fixed"]')) return;
                // 全屏时 Esc 留给浏览器退出全屏；字幕演出期间不打断
                if (document.fullscreenElement || dialogue) return;
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
    }, [s.showExitConfirm, s.setShowExitConfirm, s.isSetup, s.isGameOver, s.isTheater, s.isReplayMode, s.handleTtsToggle, setUiConfig, dialogue]);

    useEffect(() => {
        const currentIds = new Set(s.visibleLogs.map(log => log.id));
        if (seenDialogueLogIdsRef.current === null) {
            seenDialogueLogIdsRef.current = currentIds;
            return;
        }

        const newSpeeches = s.visibleLogs.filter(log =>
            !seenDialogueLogIdsRef.current!.has(log.id) &&
            isDialoguePresentationLog(log),
        );
        seenDialogueLogIdsRef.current = currentIds;
        if (newSpeeches.length === 0) return;

        // 引擎不等待人类局的字幕播放，积压会无限增长；只保留最新 4 条，被丢弃的条数在字幕框提示（过程日志仍可查）
        const merged = [...dialogueQueue, ...newSpeeches.map(log => ({
            logId: log.id,
            speakerId: log.speakerId as number,
            content: log.content.trim(),
        }))];
        const overflow = merged.length - 4;
        if (overflow > 0) setDroppedDialogueCount(count => count + overflow);
        setDialogueQueue(merged.slice(-4));
    }, [s.visibleLogs, dialogueQueue, setDroppedDialogueCount]);

    // 人类回合开始时清空字幕积压并丢弃正在播放的旧发言，让镜头/字幕回到当前进度
    const isHumanTurnNow = !!s.humanPlayer && s.currentSpeakerId === s.humanPlayer.id;
    useEffect(() => {
        if (!isHumanTurnNow) return;
        setDialogueQueue([]);
        setDialogue(null);
        seenDialogueLogIdsRef.current = new Set(s.visibleLogs.map(log => log.id));
    }, [isHumanTurnNow, s.visibleLogs]);

    // 被丢弃条数的提示：队列播完且 8 秒内无新字幕时自动消失
    useEffect(() => {
        if (dialogueQueue.length > 0 || droppedDialogueCount === 0) return;
        const timer = window.setTimeout(() => setDroppedDialogueCount(0), 8000);
        return () => window.clearTimeout(timer);
    }, [dialogueQueue.length, droppedDialogueCount]);

    useEffect(() => {
        if (dialogue || dialogueQueue.length === 0) return;
        const [nextDialogue, ...remaining] = dialogueQueue;
        setDialogueQueue(remaining);
        setManualControlActive(false);
        setDialogue(nextDialogue);
    }, [dialogue, dialogueQueue]);

    useEffect(() => {
        if (!dialogue) return undefined;
        if (dialogueTimerRef.current) window.clearTimeout(dialogueTimerRef.current);
        dialogueTimerRef.current = window.setTimeout(
            () => setDialogue(current => current?.logId === dialogue.logId ? null : current),
            getDialogueDurationMs(dialogue.content),
        );
        return () => {
            if (dialogueTimerRef.current) window.clearTimeout(dialogueTimerRef.current);
        };
    }, [dialogue]);

    useEffect(() => {
        if (!dialogue) {
            setDialogueCameraActive(false);
            setDialogueCurtainVisible(false);
            return undefined;
        }
        setDialogueCameraActive(false);
        setDialogueCurtainVisible(true);
        const cameraTimer = window.setTimeout(() => setDialogueCameraActive(true), 170);
        const curtainTimer = window.setTimeout(() => setDialogueCurtainVisible(false), 520);
        return () => {
            window.clearTimeout(cameraTimer);
            window.clearTimeout(curtainTimer);
        };
    }, [dialogue]);

    useEffect(() => {
        if (rendererReady || rendererFailed) return undefined;
        // 低端设备 / 软件渲染下首帧着色器编译可能明显超过 3 秒，
        // 给到 8 秒仍无首帧才判定渲染失败，避免误伤慢机器。
        const timeout = window.setTimeout(handleRendererFailure, 8000);
        return () => window.clearTimeout(timeout);
    }, [rendererFailed, rendererReady]);

    const handleManualStart = () => {
        if (manualTimerRef.current) window.clearTimeout(manualTimerRef.current);
        // 拖拽期间暂停运镜;8 秒无操作自动恢复所选运镜方式
        setManualControlActive(true);
    };

    const handleManualEnd = () => {
        if (manualTimerRef.current) window.clearTimeout(manualTimerRef.current);
        manualTimerRef.current = window.setTimeout(() => setManualControlActive(false), 8000);
    };

    if (!webglAvailable || rendererFailed) {
        return (
            <div data-testid="voxel-rpg-room" className="flex h-[100dvh] items-center justify-center bg-[#11180f] p-6 text-[var(--voxel-paper)]">
                <div className="max-w-md border-[4px] border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] p-6 shadow-[8px_8px_0_var(--voxel-ink)]">
                    <h2 className="text-2xl font-black">{rendererFailed ? '3D 世界渲染未启动' : '当前设备不支持 3D 世界'}</h2>
                    <p className="mt-3 text-sm">对局仍在继续。已安全降级，请返回经典 2D 模式。</p>
                    <button
                        type="button"
                        onClick={() => setUiConfig(prev => ({ ...prev, gameViewMode: '2d' }))}
                        className="mt-5 w-full border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-torch)] px-4 py-3 font-black text-[var(--voxel-ink)]"
                    >
                        返回经典 2D
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div data-testid="voxel-rpg-room" className="relative h-[100dvh] w-full overflow-hidden bg-[#0d140d] text-[var(--voxel-paper)]">
            {!rendererReady && (
                <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#29466e] text-sm font-black tracking-[0.14em] text-[var(--voxel-paper)]">
                    正在点亮营地...
                </div>
            )}
            <Canvas
                data-testid="voxel-rpg-canvas"
                className="absolute inset-0 z-0"
                camera={{ position: [14, 8.4, 16], fov: 52, near: 0.1, far: 150 }}
                dpr={[1, 1]}
                shadows={s.uiConfig.effectLevel !== 'subtle' ? 'soft' : false}
                gl={{ alpha: false, antialias: false, powerPreference: 'default' }}
                onCreated={({ gl }) => {
                    gl.domElement.addEventListener('webglcontextlost', handleRendererFailure, { once: true });
                }}
            >
                {/* Keep the night sky visibly blue: a near-black clear color makes the
                    entire 3D world read as a rendering failure on dark displays. */}
                {/* 背景色跟着群系走：深渊圣殿是封闭室内，白天也不能从穹顶缝里透出一条亮蓝 */}
                <color
                    attach="background"
                    args={[scenePreset.indoor
                        ? scenePreset.sky.dayTop
                        : (s.isNightPhase ? '#29466e' : '#87ceeb')]}
                />
                {/* key 挂在场景 id 上：切换 3D 场景（局内「布局」面板）时整套世界干净重挂，不留旧方块/旧墙 */}
                <ForestCampScene
                    key={scenePreset.id}
                    scene={scenePreset}
                    players={visiblePlayers}
                    currentSpeakerId={dialogueConcealed ? null : dialogue?.speakerId ?? null}
                    isNight={s.isNightPhase}
                    effectLevel={s.uiConfig.effectLevel}
                    manualControlActive={manualControlActive}
                    controlsRef={controlsRef}
                    selectedPlayerId={worldTarget}
                    onNpcClick={setWorldTarget}
                    skillEvents={skillEvents}
                    dialogueMode={dialogueCameraActive}
                    dialogueConcealed={dialogueConcealed}
                    snapDialogueCamera={dialogueCameraActive}
                    cameraStyle={cameraStyle}
                />
                {/* 字幕期间不再整体禁用：拖拽即触发 manualControlActive 暂停运镜，8 秒无操作自动恢复 */}
                {/* 室内：柱圈 17.4、檐口 10.8。拉远上限压到 15（还在柱圈里侧），
                    仰角上限压到 57°（14m 处算下来正好 9.4m 高，进不了穹顶）。
                    SceneDirector 另有逐帧夹取做兜底，这里只是让操作手感是对的。 */}
                <OrbitControls
                    ref={controlsRef}
                    enableDamping={manualControlActive}
                    dampingFactor={0.08}
                    enablePan={false}
                    minDistance={5}
                    maxDistance={SCENES[resolveSceneId(s.uiConfig.sceneId)].indoor ? 15 : 28}
                    minPolarAngle={SCENES[resolveSceneId(s.uiConfig.sceneId)].indoor ? 1.0 : Math.PI / 5}
                    maxPolarAngle={SCENES[resolveSceneId(s.uiConfig.sceneId)].indoor ? Math.PI / 2.06 : Math.PI / 2.15}
                    onStart={handleManualStart}
                    onEnd={handleManualEnd}
                />
                <RenderProbe onFrame={() => setRendererReady(true)} />
            </Canvas>

            <RpgHud
                visibleLogs={s.visibleLogs}
                visibleRoleLabels={visibleRoleLabels}
                glossaryRoles={glossaryRoles}
                glossaryNote={glossaryNote}
                personaLabels={personaLabels}
                modelLabels={modelLabels}
                onPlayerSelect={setWorldTarget}
                dialogueActive={!!dialogue}
                concealSpeakerIdentity={dialogueConcealed && !!dialogue}
                isNight={s.isNightPhase}
                onExitRequest={s.handleConfirmExit}
            />

            {dialogue && dialogueCameraActive && (
                <RpgDialogueOverlay
                    key={dialogue.logId}
                    concealed={dialogueConcealed}
                    speakerLabel={dialogueConcealed
                        ? '神秘发言者'
                        : `${dialogueSpeaker?.seatNumber ?? dialogue.speakerId}号 ${dialogueSpeaker?.displayName ?? '旅人'}`}
                    content={dialogue.content}
                    queuedCount={dialogueQueue.length}
                    droppedCount={droppedDialogueCount}
                />
            )}

            {dialogueCurtainVisible && (
                <div
                    data-testid="rpg-camera-curtain"
                    className="voxel-camera-curtain pointer-events-none absolute inset-0 z-[54] bg-[#080b08]"
                    aria-hidden="true"
                />
            )}

            <PhaseTransitionOverlay phase={s.phase} isNight={s.isNightPhase} />

            <header className="pointer-events-none absolute left-3 right-3 top-24 z-[60] flex flex-wrap justify-end gap-2 sm:top-3 sm:pr-24">
                {/* 移动端：工具按钮单行放不下，flex 收缩会把文字竖排堆叠；改为自然换行成两行（每行 ≥44px 触控行高），
                    行高固定后整体停留在 y96–192，与下方队伍按钮/名册错开 */}
                <div className="pointer-events-none flex flex-wrap items-center justify-end gap-2 [&_button]:min-h-11 max-sm:[&_button]:min-w-11 max-sm:[&_button]:shrink-0 max-sm:[&_span]:shrink-0">
                    {s.debugMode && s.multiplayerRole !== 'guest' && (
                        <ToolbarButton onClick={() => s.setDebugLogOpen(true)} active={s.debugGodView} title="打开调试日志">
                            <span className="flex items-center gap-1.5">
                                <BugIcon />
                                调试
                            </span>
                        </ToolbarButton>
                    )}
                    {/* 声音:全站唯一入口,五项声音开关 + 音量收在一个菜单里 */}
                    <div ref={soundPanelRef} className="pointer-events-auto relative">
                        <ToolbarButton
                            onClick={() => setSoundOpen(v => !v)}
                            active={soundOpen}
                            title="语音与音乐 (M 音乐 · V 语音)"
                            ariaLabel="声音设置"
                            ariaHasPopup="dialog"
                            ariaExpanded={soundOpen}
                        >
                            <span className="flex items-center gap-1.5">
                                <SpeakerIcon />
                                声音
                                <CaretIcon />
                            </span>
                        </ToolbarButton>
                        {soundOpen && (
                            <div
                                role="dialog"
                                aria-label="声音设置"
                                data-testid="world-audio-controls"
                                className="absolute right-0 top-full z-50 mt-1.5 w-60 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] p-2 shadow-[4px_4px_0_var(--voxel-ink)]"
                            >
                                {/* 一个入口管全部声音：原先环境声/技能声/音量藏在左下过程日志上方，
                                    与这里同名同图标，同一屏出现两个「声音」，玩家分不清该点哪个 */}
                                <div className="mb-1.5 text-[11px] font-black tracking-[0.18em] text-[var(--voxel-wood-dark)]">能听到什么</div>
                                {s.multiplayerRole === 'guest' ? (
                                    <div className="flex min-h-11 items-center justify-between border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 text-xs font-black text-[var(--voxel-paper)]">
                                        <span>旁白语音</span>
                                        <span>{s.ttsEnabled ? '开' : '关'}</span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        aria-pressed={s.ttsEnabled}
                                        onClick={() => void s.handleTtsToggle()}
                                        title="旁白语音 (V)"
                                        className="flex min-h-11 w-full items-center justify-between border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 text-xs font-black text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)]"
                                    >
                                        <span>旁白语音</span>
                                        <span>{s.ttsChecking ? '检测中' : s.ttsEnabled ? '开' : '关'}</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    aria-pressed={uiConfig.bgmEnabled !== false}
                                    onClick={() => setUiConfig(v => ({ ...v, bgmEnabled: !(v.bgmEnabled ?? true) }))}
                                    title="对局音乐 (M)"
                                    className="mt-1.5 flex min-h-11 w-full items-center justify-between border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 text-xs font-black text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)]"
                                >
                                    <span>对局音乐</span>
                                    <span>{uiConfig.bgmEnabled !== false ? '开' : '关'}</span>
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={uiConfig.worldAmbientAudioEnabled}
                                    onClick={() => setUiConfig(v => ({ ...v, worldAmbientAudioEnabled: !v.worldAmbientAudioEnabled }))}
                                    title="环境声：风、火、虫鸣"
                                    className="mt-1.5 flex min-h-11 w-full items-center justify-between border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 text-xs font-black text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)]"
                                >
                                    <span>环境声</span>
                                    <span>{uiConfig.worldAmbientAudioEnabled ? '开' : '关'}</span>
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={uiConfig.worldSkillAudioEnabled}
                                    onClick={() => setUiConfig(v => ({ ...v, worldSkillAudioEnabled: !v.worldSkillAudioEnabled }))}
                                    title="技能声：查验、用药、开枪等动作音"
                                    className="mt-1.5 flex min-h-11 w-full items-center justify-between border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 text-xs font-black text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)]"
                                >
                                    <span>技能声</span>
                                    <span>{uiConfig.worldSkillAudioEnabled ? '开' : '关'}</span>
                                </button>
                                <label className="mt-2 flex min-h-11 items-center gap-2 border-2 border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 text-xs font-black text-[var(--voxel-paper)] shadow-[2px_2px_0_var(--voxel-ink)]">
                                    <span className="shrink-0">音量</span>
                                    <input
                                        aria-label="世界音量"
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={uiConfig.worldAudioVolume}
                                        onChange={event => {
                                            const worldAudioVolume = Number(event.target.value);
                                            setUiConfig(v => ({ ...v, worldAudioVolume }));
                                        }}
                                        className="min-w-0 flex-1 accent-[var(--voxel-torch)]"
                                    />
                                    <span className="w-8 shrink-0 text-right tabular-nums">{Math.round(uiConfig.worldAudioVolume * 100)}</span>
                                </label>
                            </div>
                        )}
                    </div>
                    {s.multiplayerRole !== 'guest' && !s.isSetup && !s.isTheater && !s.isReplayMode && s.phase !== GamePhase.GAME_REVIEW && (
                        <ToolbarButton onClick={s.handleAutoPlayToggle} active={s.isAuto}>
                            <span className="flex items-center gap-1.5">
                                {s.isAuto ? <PauseIcon /> : <PlayIcon />}
                                {s.isAuto ? '暂停' : '继续'}
                            </span>
                        </ToolbarButton>
                    )}
                    {/* 布局：切视角/卡片是高频动作，常驻顶栏 */}
                    <InGameStyleSwitcher />
                    {/* 运镜：原来埋在「更多」里，得先展开一次才看得见，等于藏起来了；改成顶栏常驻 + 一个下拉直选 */}
                    <div ref={camPanelRef} className="pointer-events-auto relative">
                        <ToolbarButton
                            onClick={() => setCamMenuOpen(v => !v)}
                            active={camMenuOpen || cameraStyle !== 'auto'}
                            title={`运镜：${cameraStyleLabel}`}
                            ariaLabel="运镜方式"
                            ariaHasPopup="dialog"
                            ariaExpanded={camMenuOpen}
                        >
                            <span className="flex items-center gap-1.5">
                                <CamcorderIcon />
                                运镜
                                <CaretIcon />
                            </span>
                        </ToolbarButton>
                        {camMenuOpen && (
                            <div role="dialog" aria-label="运镜方式" data-testid="camera-menu" className="absolute right-0 top-full z-50 mt-1.5 w-60 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] shadow-[4px_4px_0_var(--voxel-ink)]">
                                <div className="border-b-2 border-[rgba(36,23,14,0.15)] px-3 py-1.5 text-[11px] font-black tracking-[0.16em] text-[rgba(36,23,14,0.6)]">
                                    当前：{cameraStyleLabel}
                                </div>
                                {CAMERA_STYLES.map(style => (
                                    <button
                                        key={style.id}
                                        type="button"
                                        onClick={() => setCameraStyle(style.id)}
                                        aria-pressed={cameraStyle === style.id}
                                        className="block w-full min-h-11 border-b-2 border-[rgba(36,23,14,0.15)] px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[rgba(139,90,43,0.25)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                        style={{ background: cameraStyle === style.id ? 'rgba(246,180,67,0.25)' : undefined }}
                                    >
                                        <div className="text-xs font-black text-[var(--voxel-ink)]">
                                            {cameraStyle === style.id ? '▶ ' : ''}{style.label}
                                        </div>
                                        <div className="text-xs leading-tight text-[rgba(36,23,14,0.6)]">{style.desc}</div>
                                    </button>
                                ))}
                                <div className="px-3 py-1.5 text-xs leading-tight text-[rgba(36,23,14,0.5)]">拖拽画面可临时手动操控，8 秒无操作恢复运镜</div>
                            </div>
                        )}
                    </div>
                    {/* 复盘：只在结束局出现；3D 视角没有结算面板，入口挪到顶栏 */}
                    {s.isGameOver && (
                        <ToolbarButton onClick={() => openReview(null)} title="逐轮发言与关键票型" active>复盘</ToolbarButton>
                    )}
                    {/* 最小化 / 退出：行尾符号钮 — / X，语义靠 title/aria 说明 */}
                    <ToolbarButton onClick={s.handleSuspend} title="最小化（暂存进度，主页可继续）" ariaLabel="最小化" className="min-w-11">
                        <span className="flex items-center justify-center" aria-hidden="true">
                            <MinusIcon />
                        </span>
                    </ToolbarButton>
                    <ToolbarButton onClick={() => s.setShowExitConfirm(true)} title="退出 (Esc)" ariaLabel="退出" className="min-w-11">
                        <span className="flex items-center justify-center" aria-hidden="true">
                            <CloseIcon />
                        </span>
                    </ToolbarButton>
                </div>
            </header>

            {s.isPaused && (
                <div
                    role="status"
                    data-testid="game-paused-banner"
                    className="absolute left-1/2 top-20 z-[70] -translate-x-1/2 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-torch)] px-4 py-2 text-xs font-black text-[var(--voxel-ink)] shadow-[4px_4px_0_var(--voxel-ink)]"
                >
                    游戏已暂停
                </div>
            )}

            {s.isSetup && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-sm border-[4px] border-[var(--voxel-ink)] bg-[var(--voxel-paper-dim)] p-5 text-center text-[var(--voxel-ink)] shadow-[8px_8px_0_var(--voxel-ink)]">
                        <div className="text-2xl font-black">尚未开始对局</div>
                        <p className="mt-3 text-sm font-bold">3D 视图不支持在局内开局，请返回主页点燃营火。</p>
                        <div className="mt-5 [&_button]:min-h-11">
                            <ToolbarButton onClick={s.handleConfirmExit} active>返回主页</ToolbarButton>
                        </div>
                    </div>
                </div>
            )}

            {s.showExitConfirm && (
                <div role="dialog" aria-label="退出确认" className="absolute inset-0 z-[110] flex items-center justify-center bg-black/65 p-4">
                    <div className="w-full max-w-sm border-[4px] border-[var(--voxel-ink)] bg-[var(--voxel-paper-dim)] p-5 text-[var(--voxel-ink)] shadow-[8px_8px_0_var(--voxel-ink)]">
                        <div className="text-2xl font-black">退出世界？</div>
                        <p className="mt-3 text-sm font-black leading-relaxed">退出将放弃本局进度（可先「暂存并退出」稍后继续）。已结束的对局会自动存档，可在「历史」回顾。</p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => s.setShowExitConfirm(false)}
                                className="min-h-11 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-3 text-xs font-black text-[var(--voxel-ink)] shadow-[3px_3px_0_var(--voxel-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >取消</button>
                            <button
                                type="button"
                                onClick={() => s.handleSuspend('暂存并退出')}
                                title="保存当前进度，主页可从「进行中的对局」继续"
                                className="min-h-11 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-grass)] px-3 text-xs font-black text-[var(--voxel-ink)] shadow-[3px_3px_0_var(--voxel-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >暂存并退出</button>
                            <button
                                type="button"
                                onClick={s.handleConfirmExit}
                                className="col-span-2 min-h-11 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-redstone-deep)] px-3 text-xs font-black text-white shadow-[3px_3px_0_var(--voxel-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >仍要退出</button>
                        </div>
                    </div>
                </div>
            )}

            <HumanInputPanel />
        </div>
    );
};

export default VoxelRpgRoom;
