
import { useEffect, useRef, type MutableRefObject } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
    timelineAtom,
    isTheaterModeAtom,
    currentSpeakerIdAtom,
    logsAtom,
    replaySourceLogsAtom,
    gamePhaseAtom,
    playersAtom,
    globalApiConfigAtom,
    actorProfilesAtom,
    ttsPresetsAtom,
    replayPerspectiveAtom,
    replayPausedAtom,
    replayProgressAtom,
    remoteServerConfigAtom
} from '../atoms';
import { useGameTurn } from './useGameTurn';
import { TTSPreset, TTSFineTune, Perspective, GameLog, Player, GamePhase, TimelineEvent, GlobalApiConfig, ActorProfile } from '../types';
import { shouldExperienceLog } from '../utils/visibility';
import { detectDeaths } from '../utils/replayDeaths';
import { AudioService } from '../audio';

// 死亡识别逻辑见 src/utils/replayDeaths.ts（纯函数，带单元测试）

const shouldReplayTtsReadLog = (log: GameLog) => {
    if (!log.isSystem) return true;

    const content = log.content || '';
    return !(
        content.includes('LLM 思考失败') ||
        content.includes('AI 思考失败') ||
        content.includes('LLM Generation Failed')
    );
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitWhilePaused = async (pausedRef: MutableRefObject<boolean>, isCancelledRef: MutableRefObject<boolean>) => {
    while (pausedRef.current && !isCancelledRef.current) {
        await wait(120);
    }
};

const waitWithPause = async (ms: number, pausedRef: MutableRefObject<boolean>, isCancelledRef: MutableRefObject<boolean>) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < ms && !isCancelledRef.current) {
        await waitWhilePaused(pausedRef, isCancelledRef);
        await wait(Math.min(120, ms - (Date.now() - startedAt)));
    }
};

// --- Helper: Resolve Audio Config ---
const resolveAudioConfig = (
    event: TimelineEvent,
    speakerId: number | undefined,
    players: Player[],
    globalConfig: GlobalApiConfig,
    actors: ActorProfile[],
    ttsPresets: TTSPreset[]
): { voiceId: string, ttsPreset: TTSPreset, actorFineTune?: TTSFineTune } => {
    if (event.type === 'NARRATOR' && event.voiceId === 'GLOBAL_NARRATOR') {
        const narratorActorId = globalConfig.narratorActorId;
        const narratorActor = actors.find(a => a.id === narratorActorId) || actors[0];
        const narratorTts = ttsPresets.find(p => p.id === narratorActor.ttsPresetId) || ttsPresets[0];
        return {
            voiceId: narratorActor.voiceId,
            ttsPreset: narratorTts,
            actorFineTune: narratorActor.fineTune
        };
    }

    const player = speakerId ? players.find(p => p.id === speakerId || p.seatNumber === speakerId) : null;
    const actor = player ? actors.find(a => a.id === player.actorId) : null;
    const actorTts = actor ? ttsPresets.find(p => p.id === actor.ttsPresetId) : null;
    if (actor && actorTts) {
        return {
            voiceId: actor.voiceId,
            ttsPreset: actorTts,
            actorFineTune: actor.fineTune
        };
    }

    return {
        voiceId: event.voiceId,
        ttsPreset: {
            id: `archive-${event.id}`,
            name: `${event.speakerName || 'Archive'} Voice`,
            provider: event.ttsProvider,
        }
    };
};

export const useTheaterEngine = () => {
    const timeline = useAtomValue(timelineAtom);
    const replayLogs = useAtomValue(replaySourceLogsAtom);

    const [isTheater, setIsTheater] = useAtom(isTheaterModeAtom);
    const setSpeaker = useSetAtom(currentSpeakerIdAtom);
    const setLogs = useSetAtom(logsAtom);
    const setPhase = useSetAtom(gamePhaseAtom);

    const globalConfig = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const remoteConfig = useAtomValue(remoteServerConfigAtom);
    const replayPaused = useAtomValue(replayPausedAtom);
    const setReplayProgress = useSetAtom(replayProgressAtom);
    const globalTtsEnabledRef = useRef(globalConfig.enabled);
    useEffect(() => { globalTtsEnabledRef.current = globalConfig.enabled; }, [globalConfig.enabled]);
    const pausedRef = useRef(replayPaused);
    useEffect(() => { pausedRef.current = replayPaused; }, [replayPaused]);

    const [perspective, setPerspective] = useAtom(replayPerspectiveAtom);
    const perspectiveRef = useRef(perspective);
    useEffect(() => { perspectiveRef.current = perspective; }, [perspective]);

    const { setTurn } = useGameTurn();

    const [playersAtomVal, setPlayersAtom] = useAtom(playersAtom);
    const playersRef = useRef(playersAtomVal);
    useEffect(() => { playersRef.current = playersAtomVal; }, [playersAtomVal]);

    useEffect(() => {
        if (!isTheater || replayLogs.length === 0) return;

        let isCancelled = false;
        const isCancelledRef = { current: false };
        setReplayProgress({ current: 0, total: replayLogs.length, isFinished: false });

        // Cursor to track position in timeline.
        let timelineCursor = 0;

        const playSequence = async () => {
            // Using index loop for lookahead capabilities
            for (let i = 0; i < replayLogs.length; i++) {
                if (isCancelled) return;
                await waitWhilePaused(pausedRef, isCancelledRef);
                if (isCancelled) return;

                const log = replayLogs[i];

                // 1. Update World State (Always happens, to keep state in sync)
                setPhase(log.phase);
                setTurn(log.turn);

                // 2. Add Log (Visual text log)
                setLogs(prev => {
                    if (prev.find(l => l.id === log.id)) return prev;
                    return [...prev, log];
                });

                // 3. Check for Deaths & Game Over
                if (log.isSystem) {
                    const deaths = detectDeaths(log.content);
                    if (deaths.length > 0) {
                        setPlayersAtom(prev => prev.map(p => {
                            const death = deaths.find(d => d.id === p.seatNumber);
                            return death ? { ...p, status: death.status } : p;
                        }));
                    }

                    // Auto-Switch to GOD view on Game End
                    if (log.content.includes("游戏结束")) {
                        setPerspective('GOD');
                    }
                }

                // --- 4. Experience (Audio & Visuals) ---
                const currentPerspective = perspectiveRef.current;
                const isVisible = shouldExperienceLog(log, currentPerspective, playersRef.current);
                const shouldPlayAudio = globalTtsEnabledRef.current && isVisible && shouldReplayTtsReadLog(log);

                if (isVisible) {
                    // Only animate speaker if visible
                    if (log.speakerId) {
                        setSpeaker(log.speakerId);
                    }

                    // Play Audio
                    // IMPORTANT: Search from timelineCursor to handle duplicate IDs correctly
                    const eventIndex = timeline.findIndex((t, idx) => idx >= timelineCursor && t.id === log.id);

                    if (shouldPlayAudio && eventIndex !== -1) {
                        const event = timeline[eventIndex];
                        timelineCursor = eventIndex + 1; // Advance cursor past this event

                        // Resolve config for CURRENT event
                        const { voiceId, ttsPreset, actorFineTune } = resolveAudioConfig(
                            event,
                            log.speakerId,
                            playersRef.current,
                            globalConfig,
                            actors,
                            ttsPresets
                        );

                        const audioKey = event.audioKey;

                        // --- Just-In-Time Prefetch Logic ---
                        let nextEvent: TimelineEvent | null = null;
                        let nextSpeakerId: number | undefined = undefined;
                        let lookaheadCursor = timelineCursor; // Start searching from where we left off

                        for (let j = i + 1; j < replayLogs.length; j++) {
                            const futureLog = replayLogs[j];
                            const isFutureVisible = shouldExperienceLog(futureLog, currentPerspective, playersRef.current);
                            if (isFutureVisible) {
                                const futureIndex = timeline.findIndex((t, idx) => idx >= lookaheadCursor && t.id === futureLog.id);
                                if (futureIndex !== -1) {
                                    nextEvent = timeline[futureIndex];
                                    nextSpeakerId = futureLog.speakerId;
                                    break;
                                }
                            }
                        }

                        // Callback when current audio starts: Prefetch next
                        const onPlayStart = () => {
                            if (!isCancelled && nextEvent) {
                                const nextConfig = resolveAudioConfig(
                                    nextEvent,
                                    nextSpeakerId,
                                    playersRef.current,
                                    globalConfig,
                                    actors,
                                    ttsPresets
                                );

                                const nextAudioKey = nextEvent.audioKey;

                                AudioService.getInstance().prefetch(
                                    nextEvent.text,
                                    nextConfig.voiceId,
                                    nextAudioKey,
                                    nextConfig.ttsPreset,
                                    1.0,
                                    remoteConfig
                                ).catch(e => console.warn("Prefetch warning", e));
                            }
                        };

                        await waitWhilePaused(pausedRef, isCancelledRef);
                        if (isCancelled) return;

                        try {
                            await AudioService.getInstance().playOrGenerate(
                                event.text,
                                voiceId,
                                audioKey,
                                ttsPreset,
                                onPlayStart,
                                undefined,
                                globalConfig.ttsSpeed || 1.0,
                                remoteConfig,
                                actorFineTune
                            );
                        } catch (e) {
                            console.warn("Replay TTS error, continuing:", e);
                        }

                        if (pausedRef.current) {
                            AudioService.getInstance().stop();
                            await waitWhilePaused(pausedRef, isCancelledRef);
                        }
                    } else {
                        // Text-only delay (e.g. System logs without audio)
                        await waitWithPause(1500, pausedRef, isCancelledRef);
                    }

                    if (isCancelled) return;

                    // Reset Speaker
                    setSpeaker(null);

                    // Gap between visible turns
                    await waitWithPause(500, pausedRef, isCancelledRef);

                } else {
                    // Hidden Log: Fast Forward
                    await waitWithPause(10, pausedRef, isCancelledRef);
                }

                if (isCancelled) return;
                setReplayProgress({ current: i + 1, total: replayLogs.length, isFinished: false });
            }

            setReplayProgress({ current: replayLogs.length, total: replayLogs.length, isFinished: true });

            // Loop finished. 
            // IMPORTANT: We do NOT set isTheater(false) here. 
            // Keeping it true keeps the Replay Perspective UI active and prevents "jumping" to live game state.
            // The user will exit manually.
        };

        playSequence();

        return () => {
            isCancelled = true;
            isCancelledRef.current = true;
            setSpeaker(null);
            AudioService.getInstance().stop();
        };
    }, [isTheater, replayLogs, timeline, setLogs, setSpeaker, setPhase, setTurn, setPlayersAtom, globalConfig, actors, ttsPresets, setReplayProgress]);
};
