import type { SkillEffectEvent } from './skillEffectModel';

export interface SkillAudioProfile {
    wave: OscillatorType;
    frequency: number;
    endFrequency: number;
    duration: number;
    gain: number;
    noise?: boolean;
}

const PROFILES: Record<string, SkillAudioProfile> = {
    neutral_ambient: { wave: 'sine', frequency: 120, endFrequency: 90, duration: 0.45, gain: 0.08, noise: true },
    wolf_slash: { wave: 'sawtooth', frequency: 150, endFrequency: 55, duration: 0.34, gain: 0.24, noise: true },
    villager_spark: { wave: 'triangle', frequency: 420, endFrequency: 620, duration: 0.18, gain: 0.12 },
    seer_crystal: { wave: 'sine', frequency: 520, endFrequency: 920, duration: 0.62, gain: 0.17 },
    witch_brew: { wave: 'sine', frequency: 210, endFrequency: 360, duration: 0.7, gain: 0.15, noise: true },
    hunter_shot: { wave: 'square', frequency: 110, endFrequency: 45, duration: 0.18, gain: 0.28, noise: true },
    guard_shield: { wave: 'triangle', frequency: 180, endFrequency: 430, duration: 0.48, gain: 0.18 },
    idiot_amulet: { wave: 'sine', frequency: 460, endFrequency: 700, duration: 0.45, gain: 0.14 },
    wolf_king_ring: { wave: 'sawtooth', frequency: 95, endFrequency: 170, duration: 0.7, gain: 0.22 },
    knight_sword: { wave: 'triangle', frequency: 260, endFrequency: 980, duration: 0.34, gain: 0.2, noise: true },
    stone_ghost_gaze: { wave: 'square', frequency: 90, endFrequency: 62, duration: 0.8, gain: 0.14, noise: true },
    white_wolf_explosion: { wave: 'sawtooth', frequency: 170, endFrequency: 35, duration: 0.58, gain: 0.3, noise: true },
    blood_moon_seal: { wave: 'sine', frequency: 72, endFrequency: 45, duration: 1.1, gain: 0.22 },
    gravekeeper_flame: { wave: 'triangle', frequency: 160, endFrequency: 250, duration: 0.7, gain: 0.13, noise: true },
    demon_hunter_bow: { wave: 'triangle', frequency: 320, endFrequency: 120, duration: 0.3, gain: 0.2 },
    cupid_heart: { wave: 'sine', frequency: 480, endFrequency: 720, duration: 0.55, gain: 0.14 },
    merchant_rune: { wave: 'sine', frequency: 330, endFrequency: 660, duration: 0.75, gain: 0.16 },
};

type AudioContextFactory = () => AudioContext | null;

const defaultFactory: AudioContextFactory = () => {
    if (typeof window === 'undefined') return null;
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Context ? new Context() : null;
};

export const routeSkillAudioCue = (event: SkillEffectEvent): string =>
    event.visibility === 'neutral' ? 'neutral_ambient' : event.audioCue;

export const getSkillAudioProfile = (cue: string): SkillAudioProfile | null =>
    PROFILES[cue] ?? null;

export class VoxelAudioEngine {
    private context: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private ambientGain: GainNode | null = null;
    private ambientTimer: number | null = null;
    private ambientEnabled = false;
    private ambientIsNight = false;
    private destroyed = false;
    private volume = 0.35;

    constructor(private readonly contextFactory: AudioContextFactory = defaultFactory) {}

    async unlock(): Promise<boolean> {
        if (this.destroyed) return false;
        if (!this.context) {
            this.context = this.contextFactory();
            if (!this.context) return false;
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.context.destination);
            this.ambientGain = this.context.createGain();
            this.ambientGain.gain.value = 0.16;
            this.ambientGain.connect(this.masterGain);
        }
        if (this.context.state === 'suspended') await this.context.resume();
        if (this.ambientEnabled) this.ensureAmbientLoop(this.ambientIsNight);
        return true;
    }

    setVolume(volume: number) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.masterGain && this.context) {
            this.masterGain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.04);
        }
    }

    setAmbientEnabled(enabled: boolean, isNight: boolean) {
        this.ambientEnabled = enabled;
        const periodChanged = this.ambientIsNight !== isNight;
        this.ambientIsNight = isNight;
        if (periodChanged && this.ambientTimer !== null && typeof window !== 'undefined') {
            window.clearInterval(this.ambientTimer);
            this.ambientTimer = null;
        }
        if (!enabled) {
            if (this.ambientTimer !== null && typeof window !== 'undefined') window.clearInterval(this.ambientTimer);
            this.ambientTimer = null;
            return;
        }
        this.ensureAmbientLoop(isNight);
    }

    playSkill(event: SkillEffectEvent) {
        if (!this.context || !this.masterGain || this.context.state !== 'running') return;
        const profile = getSkillAudioProfile(routeSkillAudioCue(event));
        if (!profile) return;
        this.synthesize(profile, this.masterGain);
    }

    destroy() {
        this.destroyed = true;
        if (this.ambientTimer !== null && typeof window !== 'undefined') window.clearInterval(this.ambientTimer);
        this.ambientTimer = null;
        this.masterGain?.disconnect();
        this.ambientGain?.disconnect();
        void this.context?.close().catch(() => undefined);
        this.context = null;
        this.masterGain = null;
        this.ambientGain = null;
    }

    private ensureAmbientLoop(isNight = false) {
        if (!this.context || !this.ambientGain || this.context.state !== 'running' || this.ambientTimer !== null || typeof window === 'undefined') return;
        const playPulse = () => {
            if (!this.context || !this.ambientGain || !this.ambientEnabled) return;
            this.synthesize({
                wave: 'sine',
                frequency: isNight ? 1400 : 180,
                endFrequency: isNight ? 1100 : 130,
                duration: isNight ? 0.09 : 1.6,
                gain: isNight ? 0.035 : 0.022,
                noise: !isNight,
            }, this.ambientGain);
        };
        playPulse();
        this.ambientTimer = window.setInterval(playPulse, isNight ? 2800 : 4200);
    }

    private synthesize(profile: SkillAudioProfile, destination: AudioNode) {
        const context = this.context;
        if (!context) return;
        const now = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, profile.gain), now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
        gain.connect(destination);

        const oscillator = context.createOscillator();
        oscillator.type = profile.wave;
        oscillator.frequency.setValueAtTime(profile.frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, profile.endFrequency), now + profile.duration);
        oscillator.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + profile.duration);
        oscillator.addEventListener('ended', () => gain.disconnect(), { once: true });

        if (profile.noise) this.playNoise(profile.duration, profile.gain * 0.35, destination);
    }

    private playNoise(duration: number, level: number, destination: AudioNode) {
        const context = this.context;
        if (!context) return;
        const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
        const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        filter.type = 'lowpass';
        filter.frequency.value = 720;
        gain.gain.setValueAtTime(level, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        source.start();
        source.addEventListener('ended', () => {
            source.disconnect();
            filter.disconnect();
            gain.disconnect();
        }, { once: true });
    }
}
