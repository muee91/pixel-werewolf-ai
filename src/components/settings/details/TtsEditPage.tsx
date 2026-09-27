import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { Capacitor } from '@capacitor/core';
import { edgeTtsVoicesAtom, ttsPresetsAtom } from '../../../store';
import { ActionButton, BackButton, PixelSelect, PixelSlider, SettingsInput, pixelInputClass } from '../../ui/pixel';
import type { SubPage } from '../constants';

interface TtsEditPageProps {
    subPage: Extract<SubPage, { type: 'TTS_EDIT' }>;
    setSubPage: (subPage: SubPage | null) => void;
}

export const TtsEditPage = ({ subPage, setSubPage }: TtsEditPageProps) => {
    const [ttsPresets, setTtsPresets] = useAtom(ttsPresetsAtom);
    const [voices, setVoices] = useAtom(edgeTtsVoicesAtom);
    const [previewVoiceId, setPreviewVoiceId] = useState('');
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const updateTts = (id: string, updates: Partial<(typeof ttsPresets)[number]>) => setTtsPresets(p => p.map(i => i.id === id ? { ...i, ...updates } : i));

    // 切换/编辑 TTS 预设时重置试听音色,避免把 A 引擎的音色带进 B 引擎
    useEffect(() => {
        if (subPage?.type === 'TTS_EDIT' && subPage.id) {
            const tts = ttsPresets.find(i => i.id === subPage.id);
            if (tts) setPreviewVoiceId('');
        }
    }, [subPage, ttsPresets]);

    const syncVoices = async () => {
        setIsSyncing(true);
        try {
            if (Capacitor.isNativePlatform()) {
                alert('Android 客户端暂不支持音色同步，请在浏览器中使用此功能。');
                setIsSyncing(false);
                return;
            }
            const resp = await fetch('/api/edge-tts-voices');
            if (resp.ok) {
                const data = await resp.json();
                setVoices(data);
                alert(`同步成功！已发现 ${data.length} 个音色。`);
            } else {
                alert('同步失败，请确保后端服务已启动。');
            }
        } catch (e) {
            console.error(e);
            alert('网络错误，请检查后端运行状态。');
        } finally {
            setIsSyncing(false);
        }
    };

    const tts = (subPage as { type: 'TTS_EDIT'; id?: string }).id
        ? ttsPresets.find(i => i.id === (subPage as { type: 'TTS_EDIT'; id?: string }).id)
        : null;
    if (!tts) return null;

    const edgeVoiceGroups = (() => {
        if (voices.length === 0) return {} as Record<string, typeof voices>;
        const groups: Record<string, typeof voices> = {};
        voices.forEach(v => { const locale = v.Locale || 'other'; if (!groups[locale]) groups[locale] = []; groups[locale].push(v); });
        return groups;
    })();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <BackButton onClick={() => setSubPage(null)} />
                <span className="text-sm" style={{ color: 'var(--color-muted)' }}>TTS 引擎详情</span>
            </div>

            <div className="rounded-none border-[3px] p-5" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-accent1)' }}>
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-none flex items-center justify-center text-lg"
                        style={{ background: 'var(--color-accent1)', color: '#fff' }}>
                        🌐
                    </div>
                    <div className="flex-1">
                        <div className="font-bold text-base" style={{ color: 'var(--color-fg)' }}>{tts.name}</div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                            微软 Edge TTS，500+ 多语言音色，需联网
                        </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none text-xs font-bold"
                        style={{ background: 'var(--color-accent1)', color: '#fff', opacity: 0.9 }}>
                        可用
                    </span>
                </div>

                <SettingsInput label="引擎名称" value={tts.name}
                    onChange={(e) => updateTts(tts.id, { name: e.target.value })} placeholder="TTS 引擎名称" />

                <div className="rounded-none border-[3px] p-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-accent1)' }}>🎤 默认音色</div>

                    {voices.length > 0 ? (
                        <PixelSelect value={previewVoiceId} onChange={e => { setPreviewVoiceId(e.target.value); }} className="mb-3">
                            <option value="">-- 选择音色 --</option>
                            {Object.entries(edgeVoiceGroups).sort(([a], [b]) => a.localeCompare(b)).map(([locale, vList]) => (
                                <optgroup key={locale} label={locale}>
                                    {vList.map(v => <option key={v.ShortName} value={v.ShortName}>{v.FriendlyName || v.ShortName}</option>)}
                                </optgroup>
                            ))}
                        </PixelSelect>
                    ) : (
                        <p className="text-[11px] mb-3" style={{ color: 'var(--color-muted)' }}>暂无音色列表，请先同步音色库</p>
                    )}
                    <ActionButton size="sm" className="w-full" disabled={isSyncing}
                        onClick={syncVoices}
                    >
                        {isSyncing ? '同步中...' : '🔄 同步 Edge TTS 音色库'}
                    </ActionButton>

                    <div className="mt-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 ml-1" style={{ color: 'var(--color-muted)' }}>手动输入音色 ID</label>
                        <input type="text" value={previewVoiceId}
                            onChange={e => setPreviewVoiceId(e.target.value)}
                            className={clsx(pixelInputClass, 'p-3 text-xs')}
                            placeholder="zh-CN-XiaoxiaoNeural" />
                    </div>
                </div>

                <div className="mt-5 rounded-none border-[3px] p-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-accent2)' }}>🎧 试听</div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input id={`preview-text-${tts.id}`} className={clsx(pixelInputClass, 'flex-1 p-2.5 text-xs')}
                            placeholder="输入试听文本..." defaultValue="你好，我是你的语音助手。" />
                        <button onClick={async () => {
                            if (isPreviewPlaying) return;
                            const input = document.getElementById(`preview-text-${tts.id}`) as HTMLInputElement;
                            const text = input?.value || "你好，我是你的语音助手。";
                            const voiceId = previewVoiceId || 'zh-CN-XiaoxiaoNeural';
                            setIsPreviewPlaying(true);
                            try {
                                const resp = await fetch('/api/tts-preview', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ text, engine: 'edge-tts', voice: voiceId, speed: 1.0, rate: '+0%', pitch: '+0Hz' })
                                });
                                if (resp.ok) {
                                    const blob = await resp.blob();
                                    const url = URL.createObjectURL(blob);
                                    const audio = new Audio(url);
                                    audio.onended = () => setIsPreviewPlaying(false);
                                    audio.onerror = () => setIsPreviewPlaying(false);
                                    try {
                                        await audio.play();
                                    } catch (playError) {
                                        console.warn("Audio play failed:", playError);
                                        alert("无法播放声音，请先与页面交互（如点击空白处）后再试。");
                                        setIsPreviewPlaying(false);
                                    }
                                } else {
                                    const err = await resp.text();
                                    alert(`试听失败: ${err}`);
                                    setIsPreviewPlaying(false);
                                }
                            } catch (e) {
                                alert(`试听出错: ${e}`);
                                setIsPreviewPlaying(false);
                            }
                        }} disabled={isPreviewPlaying}
                            className="px-4 py-2 text-xs rounded-none font-bold transition-all active:scale-[0.98] bg-[var(--color-accent1)] hover:brightness-110 text-white shadow-[4px_4px_0_var(--voxel-ink)] disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                            {isPreviewPlaying ? (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    播放中
                                </span>
                            ) : '▶ 试听'}
                        </button>
                    </div>
                    {previewVoiceId && <p className="text-[10px] mt-2 ml-1" style={{ color: 'var(--color-muted)' }}>当前音色：{previewVoiceId}</p>}
                </div>

                <div className="mt-5 rounded-none border-[3px] p-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-fg)' }}>🎛️ 引擎参数</div>
                    <div className="space-y-3">
                        <PixelSlider
                            label="语速 (Rate)"
                            badge={tts.fineTune?.rate || '+0%'}
                            min={-50} max={50} step={1}
                            value={parseInt(tts.fineTune?.rate || '+0%')}
                            onChange={e => updateTts(tts.id, { fineTune: { ...tts.fineTune, rate: `${parseInt(e.target.value) > 0 ? '+' : ''}${e.target.value}%` } })}
                        />
                        <PixelSlider
                            label="音调 (Pitch)"
                            badge={tts.fineTune?.pitch || '+0Hz'}
                            min={-50} max={50} step={1}
                            value={parseInt(tts.fineTune?.pitch || '+0Hz')}
                            onChange={e => updateTts(tts.id, { fineTune: { ...tts.fineTune, pitch: `${parseInt(e.target.value) > 0 ? '+' : ''}${e.target.value}Hz` } })}
                        />
                    </div>
                    <button onClick={() => updateTts(tts.id, { fineTune: undefined })}
                        className="mt-3 text-[10px] font-bold transition-colors"
                        style={{ color: 'var(--color-muted)' }}>重置为默认值</button>
                </div>
            </div>
        </div>
    );
};
