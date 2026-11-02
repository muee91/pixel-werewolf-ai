import React, { useState, useRef, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { appScreenAtom, gameArchivesLoadableAtom, llmPresetsAtom, ttsPresetsAtom } from '../../store';
import { PixelIcon, type PixelIconName } from '../game/voxel/primitives';
import { OverviewBadge } from '../ui/pixel';
import { SECTIONS, SECTION_DETAILS } from './constants';
import type { SectionId, SubPage } from './constants';
import { useModelReadiness } from './useModelReadiness';
import { useSettingsImportExport } from './useSettingsImportExport';
import { AppearanceSection } from './sections/AppearanceSection';
import { SoundSection } from './sections/SoundSection';
import { GameSection } from './sections/GameSection';
import { ModelSection } from './sections/ModelSection';
import { PlayersSection } from './sections/PlayersSection';
import { AdvancedSection } from './sections/AdvancedSection';
import { ProviderEditPage } from './details/ProviderEditPage';
import { LlmEditPage } from './details/LlmEditPage';
import { TtsEditPage } from './details/TtsEditPage';
import { ActorEditPage } from './details/ActorEditPage';

// 设置中心 Shell:侧边栏 + 粘性头部 + 分区/子页路由。
// 各分区与编辑子页在 ./sections 与 ./details,共享的导入导出在 useSettingsImportExport。
const SettingsView = () => {
    const setScreen = useSetAtom(appScreenAtom);
    const [activeSection, setActiveSection] = useState<SectionId>(() => {
        // 首页「去配置模型」等入口可预置落地分区
        try {
            const pre = sessionStorage.getItem('werewolf-settings-section') as SectionId | null;
            if (pre) {
                sessionStorage.removeItem('werewolf-settings-section');
                return pre;
            }
        } catch { /* ignore */ }
        return 'appearance';
    });
    const [subPage, setSubPage] = useState<SubPage | null>(null);

    const contentRef = useRef<HTMLDivElement>(null);

    const llmPresets = useAtomValue(llmPresetsAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const archivesLoadable = useAtomValue(gameArchivesLoadableAtom);
    const archives = archivesLoadable.state === 'hasData' ? archivesLoadable.data : [];

    const readiness = useModelReadiness();
    const [providerModelOptions, setProviderModelOptions] = useState<Record<string, string[]>>({});
    const io = useSettingsImportExport({ setProviderModelOptions });

    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [activeSection, subPage]);

    const renderContent = () => {
        if (subPage) {
            switch (subPage.type) {
                case 'PROVIDER_EDIT': return <ProviderEditPage subPage={subPage} setSubPage={setSubPage} providerModelOptions={providerModelOptions} setProviderModelOptions={setProviderModelOptions} />;
                case 'LLM_EDIT': return <LlmEditPage subPage={subPage} setSubPage={setSubPage} providerModelOptions={providerModelOptions} />;
                case 'TTS_EDIT': return <TtsEditPage subPage={subPage} setSubPage={setSubPage} />;
                case 'ACTOR_EDIT': return <ActorEditPage subPage={subPage} setSubPage={setSubPage} />;
            }
        }
        switch (activeSection) {
            case 'appearance': return <AppearanceSection modelReady={readiness.modelReady} />;
            case 'sound': return <SoundSection setSubPage={setSubPage} />;
            case 'game': return <GameSection />;
            case 'model': return <ModelSection setSubPage={setSubPage} readiness={readiness} />;
            case 'players': return <PlayersSection setSubPage={setSubPage} />;
            case 'advanced': return <AdvancedSection io={io} />;
        }
    };

    const activeSectionDetail = SECTION_DETAILS[activeSection];
    const activeSectionIcon = SECTIONS.find(section => section.id === activeSection)?.icon || 'wrench';
    const detailTitle = subPage?.type === 'PROVIDER_EDIT'
        ? '供应商详情'
        : subPage?.type === 'LLM_EDIT'
            ? '编辑模型'
            : subPage?.type === 'TTS_EDIT'
                ? 'TTS 引擎详情'
                : subPage?.type === 'ACTOR_EDIT'
                    ? '分身配置'
                    : activeSectionDetail.title;
    const detailDescription = subPage
        ? '当前正在编辑具体配置项，修改会即时保存在本地。'
        : activeSectionDetail.description;

    return (
        <div className="vw-settings fixed inset-0 z-40 flex flex-col lg:flex-row" style={{ background: 'var(--color-bg)' }}>
            <div className="hidden lg:flex w-[240px] flex-shrink-0 flex-col border-r-[3px] h-full"
                style={{ background: 'color-mix(in srgb, var(--color-bg-secondary) 92%, transparent)', borderColor: 'var(--color-border)' }}>
                <div className="p-5 border-b-[3px]" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--color-muted)' }}>控制台</div>
                            <div className="mt-2 text-lg font-black" style={{ color: 'var(--color-fg)' }}>设置中心</div>
                            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>把外观、规则、模型和分身配置收在同一条操作链里。</div>
                        </div>
                        <button onClick={() => setScreen('HOME')}
                            className="flex min-h-10 shrink-0 items-center gap-1 rounded-none border-[3px] py-1.5 pl-1.5 pr-2.5 text-xs font-black"
                            style={{ borderColor: 'var(--voxel-ink)', background: 'var(--voxel-paper)', color: 'var(--voxel-ink)' }}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                            返回
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 px-3 py-3 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {SECTIONS.map(section => (
                        <button key={section.id}
                            data-testid={`settings-section-${section.id}`}
                            onClick={() => { setActiveSection(section.id); setSubPage(null); }}
                            className="w-full flex items-center gap-3 px-3 py-3 text-sm font-extrabold transition-all text-left"
                            style={{
                                background: activeSection === section.id && !subPage ? 'var(--color-card)' : 'transparent',
                                color: activeSection === section.id && !subPage ? 'var(--color-fg)' : 'var(--color-muted)',
                                border: activeSection === section.id && !subPage ? '3px solid var(--color-accent1)' : '3px solid transparent',
                                boxShadow: activeSection === section.id && !subPage ? '3px 3px 0 var(--color-border)' : 'none',
                            }}>
                            <span className="shrink-0"><PixelIcon name={section.icon} px={3} /></span>
                            <div className="min-w-0">
                                <div className="font-bold">{section.label}</div>
                                {/* text-balance:不做处理时 180px 宽会把「视角、首页风格、布局与特效。」压成
                                    11 字 + 一个孤零零的「效。」。均衡换行宁可两行也不要孤字。 */}
                                <div className="mt-0.5 text-[11px] leading-snug text-balance opacity-80">
                                    {SECTION_DETAILS[section.id].description}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div ref={contentRef} className="vw-settings flex-1 min-w-0 overflow-y-auto custom-scrollbar">
                <div className="sticky top-0 z-20 border-b-[3px]"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h1 className="flex items-center gap-2 text-xl font-black sm:text-2xl" style={{ color: 'var(--color-fg)' }}>
                                        <span className="inline-block shrink-0 align-middle"><PixelIcon name={activeSectionIcon as PixelIconName} px={3} /></span>
                                        {detailTitle}
                                    </h1>
                                    <p className="mt-1 text-xs sm:text-sm max-w-2xl" style={{ color: 'var(--color-muted)' }}>{detailDescription}</p>
                                </div>
                            <button onClick={() => setScreen('HOME')}
                                className="flex min-h-10 shrink-0 items-center gap-1 rounded-none border-[3px] py-1.5 pl-1.5 pr-2.5 text-xs font-black lg:hidden"
                                style={{ borderColor: 'var(--voxel-ink)', background: 'var(--voxel-paper)', color: 'var(--voxel-ink)' }}>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                返回
                            </button>
                        </div>

                        {/* 三个能跳的总览入口。主题徽章原先和下方外观选择器完全重复，已删除。 */}
                        <div className="mt-3 flex flex-wrap gap-2">
                            <div className="min-w-[calc(50%-0.25rem)] flex-1 lg:min-w-0" data-testid="overview-model">
                                <OverviewBadge label="模型" value={`${llmPresets.length} 个 ›`} onClick={() => { setActiveSection('model'); setSubPage(null); }} />
                            </div>
                            <div className="min-w-[calc(50%-0.25rem)] flex-1 lg:min-w-0" data-testid="overview-tts">
                                <OverviewBadge label="TTS" value={`${ttsPresets.length} 个 ›`} onClick={() => { setActiveSection('sound'); setSubPage(null); }} />
                            </div>
                            <div className="min-w-[calc(50%-0.25rem)] flex-1 lg:min-w-0" data-testid="overview-archives">
                                <OverviewBadge label="存档" value={`${archives.length} 局 ›`} onClick={() => setScreen('HISTORY')} />
                            </div>
                        </div>

                        <div className="mt-4 lg:hidden settings-tab-edge">
                            <div className="-mx-1 overflow-x-auto overscroll-x-contain settings-tab-scroll">
                                <div className="flex gap-2 px-1 pb-1.5 min-w-max">
                                    {SECTIONS.map(section => (
                                        <button
                                            key={section.id}
                                            onClick={() => { setActiveSection(section.id); setSubPage(null); }}
                                            className="flex min-h-10 shrink-0 items-center gap-1 rounded-none border px-3 py-2 text-xs font-bold whitespace-nowrap transition-all"
                                            style={{
                                                borderColor: activeSection === section.id && !subPage ? 'var(--color-accent1)' : 'var(--color-border)',
                                                background: activeSection === section.id && !subPage ? 'var(--color-accent1)' : 'var(--color-card)',
                                                // 激活态是火把金底:字用墨色(白字只有 1.8:1)
                                                color: activeSection === section.id && !subPage ? 'var(--voxel-ink)' : 'var(--color-fg)',
                                            }}
                                        >
                                            <PixelIcon name={section.icon} px={2} /> {section.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6 pb-24">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
