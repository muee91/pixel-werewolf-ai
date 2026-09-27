// 演出音效引擎:纯 WebAudio 程序化合成,零外部素材、零版权、离线可用。
// 覆盖阶段音效(入夜狼嚎/天亮鸡鸣/放逐钟声/投票鼓点)与技能音效(查验/泡药/盾击/上膛)。
// BGM 为双轨程序化和弦垫(白天明亮/夜晚压抑),TTS 播报时自动闪避压低。

export type SfxName =
    | 'night-wolf' | 'day-rooster' | 'exile-bell' | 'vote-drum' | 'fanfare'
    | 'skill-seer' | 'skill-witch' | 'skill-guard' | 'skill-hunter';

type BgmMode = 'day' | 'night';

const DAY_CHORDS = [
    [261.6, 329.6, 392.0], // C
    [196.0, 246.9, 293.7], // G
    [220.0, 261.6, 329.6], // Am
    [174.6, 220.0, 261.6], // F
];
const NIGHT_CHORDS = [
    [220.0, 261.6, 311.1], // Am 增张力
    [174.6, 220.0, 258.7], // Fm 张力
    [146.8, 174.6, 220.0], // Dm
    [164.8, 196.0, 246.9], // E
];

class GameSfxEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private bgmGain: GainNode | null = null;
    private bgmOscs: OscillatorNode[] = [];
    private bgmMode: BgmMode | null = null;
    private bgmBar = 0;
    private bgmTimer: number | null = null;
    private ducked = false;
    private bgmEnabledFlag = true;
    private lastBgmMode: BgmMode | null = null;
    enabled = true;
    volume = 0.5;

    private ensure(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.ctx) {
            const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return null;
            this.ctx = new Ctor();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return this.ctx;
    }

    setEnabled(v: boolean): void {
        this.enabled = v;
        if (!v) this.stopBgm();
        else if (this.lastBgmMode) this.startBgm(this.lastBgmMode);
    }

    /** 音乐独立开关:关掉只停 BGM,音效不受影响 */
    setBgmEnabled(v: boolean): void {
        this.bgmEnabledFlag = v;
        if (!v) this.stopBgm();
        else if (this.lastBgmMode) this.startBgm(this.lastBgmMode);
    }

    setVolume(v: number): void {
        this.volume = Math.max(0, Math.min(1, v));
        if (this.master) this.master.gain.value = this.volume;
    }

    /** TTS 播报时压低 BGM,结束后恢复 */
    setDuck(on: boolean): void {
        if (this.ducked === on || !this.ctx || !this.bgmGain) return;
        this.ducked = on;
        const target = this.volume * (on ? 0.22 : 1);
        this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.bgmGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.4);
    }

    private tone(opts: {
        freq: number; startAt: number; dur: number; type?: OscillatorType;
        peak?: number; sweepTo?: number; filter?: number;
    }): void {
        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = opts.type ?? 'sine';
        osc.frequency.setValueAtTime(opts.freq, opts.startAt);
        if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), opts.startAt + opts.dur);
        const peak = opts.peak ?? 0.5;
        gain.gain.setValueAtTime(0.0001, opts.startAt);
        gain.gain.exponentialRampToValueAtTime(peak, opts.startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, opts.startAt + opts.dur);
        if (opts.filter) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = opts.filter;
            osc.connect(lp).connect(gain);
        } else {
            osc.connect(gain);
        }
        gain.connect(this.master!);
        osc.start(opts.startAt);
        osc.stop(opts.startAt + opts.dur + 0.05);
    }

    private noise(opts: { startAt: number; dur: number; peak?: number; filterFreq?: number; type?: BiquadFilterType }): void {
        const ctx = this.ctx!;
        const len = Math.max(1, Math.floor(ctx.sampleRate * opts.dur));
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = opts.type ?? 'bandpass';
        filter.frequency.value = opts.filterFreq ?? 800;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(opts.peak ?? 0.4, opts.startAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, opts.startAt + opts.dur);
        src.connect(filter).connect(gain).connect(this.master!);
        src.start(opts.startAt);
    }

    play(name: SfxName): void {
        if (!this.enabled) return;
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime + 0.02;
        switch (name) {
            case 'night-wolf': {
                // 两声狼嚎:锯齿波滑音 + 颤动
                for (const [off, f0, f1] of [[0, 200, 480], [0.55, 170, 420]] as const) {
                    this.tone({ freq: f0, startAt: t + off, dur: 1.1, type: 'sawtooth', sweepTo: f1, peak: 0.22, filter: 1200 });
                    this.tone({ freq: f0 * 1.01, startAt: t + off + 0.05, dur: 0.9, type: 'sawtooth', sweepTo: f1 * 0.9, peak: 0.1, filter: 900 });
                }
                break;
            }
            case 'day-rooster': {
                // 三段鸡鸣
                const seg = [[660, 0.12], [880, 0.1], [520, 0.2], [700, 0.12], [920, 0.1], [560, 0.22]] as const;
                let off = 0;
                seg.forEach(([f, d], i) => {
                    this.tone({ freq: f, startAt: t + off, dur: d, type: 'square', peak: 0.12, filter: 2400 });
                    off += d + (i === 2 ? 0.12 : 0.02);
                });
                break;
            }
            case 'exile-bell': {
                this.tone({ freq: 660, startAt: t, dur: 2.2, peak: 0.3 });
                this.tone({ freq: 1318, startAt: t, dur: 1.2, peak: 0.12 });
                this.tone({ freq: 662, startAt: t + 0.95, dur: 2.0, peak: 0.22 });
                break;
            }
            case 'vote-drum': {
                let off = 0;
                for (let i = 0; i < 5; i++) {
                    this.noise({ startAt: t + off, dur: 0.12, peak: 0.5, filterFreq: 160, type: 'lowpass' });
                    off += 0.28 - i * 0.04;
                }
                break;
            }
            case 'fanfare': {
                [523, 659, 784, 1046].forEach((f, i) => {
                    this.tone({ freq: f, startAt: t + i * 0.16, dur: 0.22, type: 'triangle', peak: 0.28 });
                });
                [523, 659, 784, 1046].forEach(f => {
                    this.tone({ freq: f, startAt: t + 0.7, dur: 0.9, type: 'triangle', peak: 0.2 });
                });
                break;
            }
            case 'skill-seer': {
                [880, 1100, 1320].forEach((f, i) => {
                    this.tone({ freq: f, startAt: t + i * 0.09, dur: 0.14, type: 'sine', peak: 0.24 });
                });
                break;
            }
            case 'skill-witch': {
                for (let i = 0; i < 5; i++) {
                    this.tone({ freq: 300 + Math.random() * 500, startAt: t + i * 0.08, dur: 0.07, type: 'sine', peak: 0.2 });
                }
                break;
            }
            case 'skill-guard': {
                this.tone({ freq: 210, startAt: t, dur: 0.14, type: 'square', peak: 0.26 });
                this.noise({ startAt: t + 0.02, dur: 0.18, peak: 0.2, filterFreq: 2400, type: 'highpass' });
                break;
            }
            case 'skill-hunter': {
                this.noise({ startAt: t, dur: 0.04, peak: 0.5, filterFreq: 3000, type: 'highpass' });
                this.noise({ startAt: t + 0.03, dur: 0.3, peak: 0.45, filterFreq: 500, type: 'lowpass' });
                break;
            }
        }
    }

    // ── 双轨 BGM:白天明亮四和弦 / 夜晚压抑小调,程序化和弦垫 ──
    startBgm(mode: BgmMode): void {
        this.lastBgmMode = mode;
        if (!this.enabled || !this.bgmEnabledFlag) return;
        if (this.bgmMode === mode) return;
        this.stopBgm();
        const ctx = this.ensure();
        if (!ctx) return;
        this.bgmMode = mode;
        this.bgmGain = ctx.createGain();
        this.bgmGain.gain.value = this.volume * (this.ducked ? 0.22 : 1);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = mode === 'night' ? 520 : 760;
        this.bgmGain.connect(lp).connect(this.master!);

        const scheduleBar = () => {
            if (!this.bgmMode || !this.ctx || !this.bgmGain) return;
            const chords = this.bgmMode === 'night' ? NIGHT_CHORDS : DAY_CHORDS;
            const chord = chords[this.bgmBar % chords.length];
            this.bgmBar += 1;
            const t0 = this.ctx.currentTime + 0.05;
            chord.forEach(freq => {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                osc.detune.value = (Math.random() - 0.5) * 8;
                gain.gain.setValueAtTime(0.0001, t0);
                gain.gain.linearRampToValueAtTime(0.05, t0 + 1.2);
                gain.gain.linearRampToValueAtTime(0.0001, t0 + 4.2);
                osc.connect(gain).connect(this.bgmGain!);
                osc.start(t0);
                osc.stop(t0 + 4.4);
                this.bgmOscs.push(osc);
            });
        };
        scheduleBar();
        this.bgmTimer = window.setInterval(scheduleBar, 4000);
    }

    stopBgm(): void {
        if (this.bgmTimer != null) {
            clearInterval(this.bgmTimer);
            this.bgmTimer = null;
        }
        const oscs = this.bgmOscs;
        this.bgmOscs = [];
        this.bgmMode = null;
        if (this.ctx && this.bgmGain) {
            this.bgmGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
            const gainNode = this.bgmGain;
            window.setTimeout(() => {
                oscs.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
                try { gainNode.disconnect(); } catch { /* noop */ }
            }, 700);
        } else {
            oscs.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
        }
        this.bgmGain = null;
    }
}

export const gameSfx = new GameSfxEngine();
