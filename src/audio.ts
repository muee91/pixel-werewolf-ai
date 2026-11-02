import { get, set, keys } from 'idb-keyval';
import { getPace } from './hooks/engine/pacing';

// TTS 请求超时：后端不存在或挂起时必须快速失败回落到字幕，
// 否则玩家会看到对局卡在朗读上不动。
// 20s 的依据：Edge TTS 已迁到 api.msedgeservices.com，进程内第一条连接要重新做
// DNS + TLS 握手，实测冷启动 11.8s、复用连接 6.7s。原 15s 会把冷启动那一条判死。
const TTS_FETCH_TIMEOUT_MS = 20000;
// 前一段播放未释放时的最长排队时间（防止一次挂死的播放饿死整条队列）
const PLAYBACK_LOCK_WAIT_MS = 60000;
import { TTSPreset, TTSFineTune } from './types';

import { RemoteServerConfig } from './atoms';

export type PrefetchResult = 'CACHED' | 'DOWNLOADED' | 'FAILED';

type VoiceOptions = {
    rate: string;
    pitch: string;
};

const parseSignedNumber = (value: string | undefined, unitPattern: RegExp): number | null => {
    if (!value) return null;
    const match = value.trim().match(unitPattern);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};

const getVoiceOptions = (speed: number, preset?: TTSPreset, actorFineTune?: TTSFineTune): VoiceOptions => {
    const baseRate = Math.round((speed - 1.0) * 100);
    const presetRate = parseSignedNumber(preset?.fineTune?.rate, /^([+-]?\d+)%$/);
    const actorRate = parseSignedNumber(actorFineTune?.rate, /^([+-]?\d+)%$/);
    const pitch = actorFineTune?.pitch || preset?.fineTune?.pitch || '+0Hz';
    const finalRate = actorRate ?? presetRate ?? baseRate;

    return {
        rate: finalRate >= 0 ? `+${finalRate}%` : `${finalRate}%`,
        pitch
    };
};

export class AudioService {
    private static instance: AudioService;
    private currentAudio: HTMLAudioElement | null = null;

    private playbackId = 0;
    private currentResolve: (() => void) | null = null;
    private currentBlobUrl: string | null = null;

    private playbackLock: Promise<void> = Promise.resolve();

    private constructor() { }

    public static getInstance(): AudioService {
        if (!AudioService.instance) {
            AudioService.instance = new AudioService();
        }
        return AudioService.instance;
    }

    public async checkAvailability(remoteConfig?: RemoteServerConfig): Promise<boolean> {
        const baseUrl = remoteConfig?.ttsRemoteUrl
            ? `${remoteConfig.ttsRemoteUrl}/engines`
            : '/api/tts-engines';
        try {
            const response = await fetch(baseUrl, { method: 'GET' });
            if (!response.ok) return false;
            const engines = await response.json();
            return Array.isArray(engines) && engines.some(engine => engine?.id === 'edge-tts' && engine?.available !== false);
        } catch (error) {
            console.error('TTS availability check failed:', error);
            return false;
        }
    }

    private async fetchFromEdge(text: string, voiceId: string, speed: number = 1.0, remoteConfig?: RemoteServerConfig, preset?: TTSPreset, actorFineTune?: TTSFineTune): Promise<Blob | null> {
        try {
            const { rate, pitch } = getVoiceOptions(speed, preset, actorFineTune);

            let baseUrl = '/api/edge-tts-generate';
            if (remoteConfig?.ttsRemoteUrl) {
                baseUrl = `${remoteConfig.ttsRemoteUrl}/tts`;
            }

            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voice: voiceId || 'zh-CN-XiaoxiaoNeural',
                    rate,
                    pitch
                }),
                signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS)
            });

            if (response.ok) return await response.blob();

            const errText = await response.text();
            console.error(`Edge TTS Backend failed (${response.status}):`, errText);
            return null;
        } catch (e) {
            console.error("Edge TTS Critical Error:", e);
            return null;
        }
    }

    public async fetchTTS(text: string, voiceId: string, preset?: TTSPreset, speed: number = 1.0, remoteConfig?: RemoteServerConfig, actorFineTune?: TTSFineTune): Promise<Blob | null> {
        return this.fetchFromEdge(text, voiceId, speed, remoteConfig, preset, actorFineTune);
    }

    public async checkCacheStatus(targetKeys: string[]): Promise<number> {
        if (!targetKeys || targetKeys.length === 0) return 0;
        try {
            const allKeys = await keys();
            const keySet = new Set(allKeys);
            let count = 0;
            for (const k of targetKeys) {
                if (keySet.has(k)) count++;
            }
            return count;
        } catch (e) {
            console.error("Cache check failed", e);
            return 0;
        }
    }

    public async prefetch(
        text: string,
        voiceId: string,
        cacheKey: string,
        _ttsPreset?: TTSPreset,
        playbackSpeed: number = 1.0,
        remoteConfig?: RemoteServerConfig
    ): Promise<PrefetchResult> {
        if (!text) return 'FAILED';

        const speedKey = `${cacheKey}_spd${playbackSpeed.toFixed(2)}`;
        try {
            const cached = await get(speedKey);
            if (cached) return 'CACHED';

            const audioBlob = await this.fetchTTS(text, voiceId, _ttsPreset, playbackSpeed, remoteConfig);

            if (!audioBlob) return 'FAILED';

            await set(speedKey, audioBlob);
            return 'DOWNLOADED';
        } catch (e) {
            console.error("Prefetch error", e);
            return 'FAILED';
        }
    }

    public async playOrGenerate(
        text: string,
        voiceId: string,
        cacheKey: string,
        _unused_preset?: TTSPreset,
        onPlayStart?: () => void,
        onPlayEnd?: () => void,
        playbackSpeed: number = 1.0,
        remoteConfig?: RemoteServerConfig,
        _actorFineTune?: TTSFineTune
    ): Promise<boolean> {
        if (!text) return false;

        let releaseLock: () => void;
        const lockPromise = new Promise<void>(resolve => { releaseLock = resolve; });
        const previousLock = this.playbackLock;
        this.playbackLock = lockPromise;

        this.stop();

        await Promise.race([previousLock, new Promise(r => setTimeout(r, Math.max(5000, Math.round(PLAYBACK_LOCK_WAIT_MS / Math.max(1, getPace())))))]);

        await new Promise(r => setTimeout(r, Math.round(80 / Math.max(1, getPace()))));

        try {
            const myId = this.playbackId;

            const speedKey = `${cacheKey}_spd${playbackSpeed.toFixed(2)}`;
            let audioBlob = await get(speedKey);

            if (this.playbackId !== myId) {
                return false;
            }

            if (!audioBlob) {
                audioBlob = await this.fetchTTS(text, voiceId, _unused_preset, playbackSpeed, remoteConfig, _actorFineTune);

                if (this.playbackId !== myId) {
                    return false;
                }

                if (audioBlob) {
                    await set(speedKey, audioBlob);
                } else {
                    console.warn("TTS API failed to generate audio.");
                    return false;
                }
            }

            if (this.playbackId !== myId) {
                return false;
            }

            return new Promise<boolean>((resolve) => {
                if (this.playbackId !== myId) {
                    resolve(false);
                    return;
                }

                const url = URL.createObjectURL(audioBlob!);
                this.currentBlobUrl = url;
                const audio = new Audio(url);
                audio.playbackRate = Math.min(4, Math.max(0.5, playbackSpeed * getPace()));
                this.currentAudio = audio;
                // 看门狗：WebView 后台挂起等原因让 onended/onerror 都不触发时主动放行，
                // 避免房主端与引擎主循环永久等待一段永远不会播完的语音。
                window.setTimeout(() => {
                    if (this.currentAudio !== audio) return;
                    console.warn('TTS 播放超时未结束（可能被系统挂起），已跳过本段语音。');
                    try { audio.pause(); } catch { /* 已停止 */ }
                    URL.revokeObjectURL(url);
                    if (this.currentBlobUrl === url) this.currentBlobUrl = null;
                    this.currentAudio = null;
                    const settle = this.currentResolve;
                    this.currentResolve = null;
                    if (onPlayEnd) onPlayEnd();
                    if (settle) settle(); else resolve(false);
                }, Math.max(8000, Math.round((text.length * 400 + 20000) / Math.max(1, getPace()))));
                this.currentResolve = () => resolve(false);

                audio.onplay = () => {
                    if (this.playbackId !== myId) {
                        audio.pause();
                        URL.revokeObjectURL(url);
                    if (this.currentBlobUrl === url) this.currentBlobUrl = null;
                        resolve(false);
                        return;
                    }
                    if (onPlayStart) window.setTimeout(onPlayStart, 0);
                };

                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    if (this.currentBlobUrl === url) this.currentBlobUrl = null;
                    if (this.playbackId !== myId) {
                        resolve(false);
                        return;
                    }
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                        this.currentResolve = null;
                    }
                    if (onPlayEnd) onPlayEnd();
                    resolve(true);
                };

                audio.onerror = (e) => {
                    console.error("Audio Playback Error", e);
                    URL.revokeObjectURL(url);
                    if (this.currentBlobUrl === url) this.currentBlobUrl = null;
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                        this.currentResolve = null;
                    }
                    resolve(false);
                };

                audio.play().catch(e => {
                    console.warn("Autoplay blocked or error", e);
                    URL.revokeObjectURL(url);
                    if (this.currentBlobUrl === url) this.currentBlobUrl = null;
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                        this.currentResolve = null;
                    }
                    resolve(false);
                });
            });

        } catch (e) {
            console.error("TTS Service Fatal Error", e);
            return false;
        } finally {
            releaseLock!();
        }
    }

    public stop() {
        this.playbackId++;

        if (this.currentAudio) {
            try {
                this.currentAudio.onplay = null;
                this.currentAudio.onended = null;
                this.currentAudio.onerror = null;
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
                this.currentAudio.removeAttribute('src');
                this.currentAudio.load();
            } catch (e) {
                console.warn("Error stopping audio:", e);
            }
            this.currentAudio = null;
        }

        if (this.currentResolve) {
            this.currentResolve();
            this.currentResolve = null;
        }
    }
}
