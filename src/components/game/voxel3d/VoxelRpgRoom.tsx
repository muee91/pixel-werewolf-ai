import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useAtom } from 'jotai';
import { useGameRoomState } from '../../../hooks/useGameRoomState';
import HumanInputPanel from '../../HumanInputPanel';
import InGameStyleSwitcher from '../../InGameStyleSwitcher';
import { GamePhase, Role, ROLE_INFO, WOLF_ROLES, getPersonaLabel, canSeeRoleShared } from '../../../types';
import { uiConfigAtom } from '../../../atoms';
import { ForestCampScene } from './ForestCampScene';
import RpgHud from './RpgHud';
import { worldTargetAtom } from './worldTarget';
import { useSkillEffectTimeline } from './useSkillEffectTimeline';
import { useVoxelAudio } from './useVoxelAudio';
import { PhaseTransitionOverlay } from './PhaseTransitionOverlay';
import { RpgDialogueOverlay } from './RpgDialogueOverlay';
import { getDialogueDurationMs, isDialoguePresentationLog, shouldConcealDialogueIdentity, type DialoguePresentation } from './dialogueModel';
import { CAMERA_STYLES, type CameraStyle } from './cameraDirectorModel';

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

const ToolbarButton = ({ children, onClick, active, title }: {
    children: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
    title?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className="pointer-events-auto border-[3px] border-[var(--voxel-ink)] px-3 py-1.5 text-[11px] font-black shadow-[3px_3px_0_var(--voxel-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        style={{ background: active ? 'var(--voxel-torch)' : 'var(--voxel-paper)', color: 'var(--voxel-ink)' }}
    >
        {children}
    </button>
);

export const VoxelRpgRoom: React.FC = () => {
    const s = useGameRoomState();
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
    const setCameraStyle = (style: CameraStyle) => {
        setCameraStyleState(style);
        setManualControlActive(false);
        setCamMenuOpen(false);
    };
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
    })), [dialogue?.speakerId, dialogueConcealed, s.players]);

    const visibleRoleLabels = useMemo(() => {
        const result: Record<number, string> = {};
        for (const player of s.players) {
            const visible = canSeeRoleShared(player.id, player.role, s.humanPlayer?.id ?? null, s.humanPlayer?.role, s.canSeeGodStateDetails, s.isGameOver);
            result[player.id] = visible ? ROLE_INFO[player.role]?.label ?? player.role : '未知职业';
        }
        return result;
    }, [s.canSeeGodStateDetails, s.humanPlayer, s.isGameOver, s.players]);

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
                <color attach="background" args={[s.isNightPhase ? '#29466e' : '#87ceeb']} />
                <ForestCampScene
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
                <OrbitControls
                    ref={controlsRef}
                    enableDamping={manualControlActive}
                    dampingFactor={0.08}
                    enablePan={false}
                    minDistance={5}
                    maxDistance={28}
                    minPolarAngle={Math.PI / 5}
                    maxPolarAngle={Math.PI / 2.15}
                    onStart={handleManualStart}
                    onEnd={handleManualEnd}
                />
                <RenderProbe onFrame={() => setRendererReady(true)} />
            </Canvas>

            <RpgHud
                visibleLogs={s.visibleLogs}
                visibleRoleLabels={visibleRoleLabels}
                personaLabels={personaLabels}
                onPlayerSelect={setWorldTarget}
                ambientAudioEnabled={s.uiConfig.worldAmbientAudioEnabled}
                skillAudioEnabled={s.uiConfig.worldSkillAudioEnabled}
                audioVolume={s.uiConfig.worldAudioVolume}
                onAmbientAudioToggle={() => setUiConfig(previous => ({
                    ...previous,
                    worldAmbientAudioEnabled: !previous.worldAmbientAudioEnabled,
                }))}
                onSkillAudioToggle={() => setUiConfig(previous => ({
                    ...previous,
                    worldSkillAudioEnabled: !previous.worldSkillAudioEnabled,
                }))}
                onAudioVolumeChange={worldAudioVolume => setUiConfig(previous => ({
                    ...previous,
                    worldAudioVolume,
                }))}
                dialogueActive={!!dialogue}
                concealSpeakerIdentity={dialogueConcealed && !!dialogue}
                isNight={s.isNightPhase}
                onExitRequest={s.handleConfirmExit}
            />

            {dialogue && dialogueCameraActive && (
                <RpgDialogueOverlay
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
                <div className="pointer-events-none flex items-center gap-2">
                    {s.debugMode && s.multiplayerRole !== 'guest' && (
                        <ToolbarButton onClick={() => s.setDebugLogOpen(true)} active={s.debugGodView} title="打开调试日志">调试</ToolbarButton>
                    )}
                    {s.multiplayerRole === 'guest'
                        ? <span className="border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-3 py-1.5 text-[11px] font-black text-[var(--voxel-ink)]">{s.ttsEnabled ? '语音开' : '语音关'}</span>
                        : <ToolbarButton onClick={() => void s.handleTtsToggle()} active={s.ttsEnabled} title="切换旁白语音">{s.ttsChecking ? '检测语音' : s.ttsEnabled ? '语音开' : '语音关'}</ToolbarButton>}
                    <ToolbarButton
                        onClick={() => setUiConfig(v => ({ ...v, bgmEnabled: !(v.bgmEnabled ?? true) }))}
                        active={uiConfig.bgmEnabled !== false}
                        title="对局音乐（BGM）"
                    >
                        🎵 {uiConfig.bgmEnabled !== false ? '音乐开' : '音乐关'}
                    </ToolbarButton>
                    {s.multiplayerRole !== 'guest' && !s.isSetup && !s.isTheater && !s.isReplayMode && s.phase !== GamePhase.GAME_REVIEW && (
                        <ToolbarButton onClick={s.handleAutoPlayToggle} active={s.isAuto}>
                            {s.isAuto ? '暂停世界' : '继续世界'}
                        </ToolbarButton>
                    )}
                    <div className="pointer-events-auto relative">
                        <ToolbarButton onClick={() => setCamMenuOpen(v => !v)} active={camMenuOpen || cameraStyle !== 'auto'} title="运镜方式">🎥 运镜</ToolbarButton>
                        {camMenuOpen && (
                            <div className="absolute right-0 top-full z-50 mt-1 w-56 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] shadow-[4px_4px_0_var(--voxel-ink)]">
                                {CAMERA_STYLES.map(style => (
                                    <button
                                        key={style.id}
                                        type="button"
                                        onClick={() => setCameraStyle(style.id)}
                                        className="block w-full border-b-2 border-[var(--voxel-ink)]/15 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--voxel-wood)]/25"
                                        style={{ background: cameraStyle === style.id ? 'rgba(246,180,67,0.25)' : undefined }}
                                    >
                                        <div className="text-[11px] font-black text-[var(--voxel-ink)]">
                                            {cameraStyle === style.id ? '▶ ' : ''}{style.label}
                                        </div>
                                        <div className="text-[9px] leading-tight text-[var(--voxel-ink)]/60">{style.desc}</div>
                                    </button>
                                ))}
                                <div className="px-3 py-1.5 text-[9px] leading-tight text-[var(--voxel-ink)]/50">拖拽画面可临时手动操控，8 秒无操作恢复运镜</div>
                            </div>
                        )}
                    </div>
                    <InGameStyleSwitcher />
                    <ToolbarButton
                        onClick={() => {
                            // 联机最小化会卸载视图并断开 WebSocket（其他玩家将看到你离线），必须先讲清楚
                            if (s.multiplayerRole && !window.confirm('联机对局最小化将断开与房间的连接，其他玩家会看到你离线。确定最小化？')) return;
                            s.handleMinimize();
                        }}
                        title="最小化"
                    >_</ToolbarButton>
                    <ToolbarButton onClick={() => s.setShowExitConfirm(true)} title="退出">X</ToolbarButton>
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
                        <div className="mt-5">
                            <ToolbarButton onClick={s.handleConfirmExit} active>返回主页</ToolbarButton>
                        </div>
                    </div>
                </div>
            )}

            {s.showExitConfirm && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/65 p-4">                    <div className="w-full max-w-sm border-[4px] border-[var(--voxel-ink)] bg-[var(--voxel-paper-dim)] p-5 text-[var(--voxel-ink)] shadow-[8px_8px_0_var(--voxel-ink)]">
                        <div className="text-2xl font-black">退出世界？</div>
                        <p className="mt-3 text-sm font-black">退出后返回主页。已结束的对局会自动存档（可在「历史」回顾）；进行中的对局将中止，当前进度不保留。</p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <ToolbarButton onClick={() => s.setShowExitConfirm(false)}>取消</ToolbarButton>
                            <ToolbarButton onClick={s.handleConfirmExit} active>退出</ToolbarButton>
                        </div>
                    </div>
                </div>
            )}

            <HumanInputPanel />
        </div>
    );
};

export default VoxelRpgRoom;
