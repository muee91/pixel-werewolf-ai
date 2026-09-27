import React, { useState, useRef, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { appScreenAtom, gameArchivesLoadableAtom, llmPresetsAtom, llmProvidersAtom, ttsPresetsAtom, actorProfilesAtom } from '../../store';
import { uiConfigAtom } from '../../atoms';
import { THEMES } from '../../themes/index';
import { PixelIcon, type PixelIconName } from '../game/voxel/primitives';
import { OverviewBadge, SectionStat } from '../ui/pixel';
import { SECTIONS, SECTION_DETAILS } from './constants';
import type { SectionId, SubPage } from './constants';
import { useModelReadiness } from './useModelReadiness';
import { useSettingsImportExport } from './useSettingsImportExport';
import { AppearanceSection } from './sections/AppearanceSection';
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

    const uiConfig = useAtomValue(uiConfigAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const actors = useAtomValue(actorProfilesAtom);
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
            case 'game': return <GameSection />;
            case 'model': return <ModelSection setSubPage={setSubPage} io={io} readiness={readiness} />;
            case 'players': return <PlayersSection setSubPage={setSubPage} io={io} />;
            case 'advanced': return <AdvancedSection io={io} />;
        }
    };

    const activeSectionDetail = SECTION_DETAILS[activeSection];
    const activeSectionIcon = SECTIONS.find(section => section.id === activeSection)?.icon || 'wrench';
    const isDetailView = !!subPage;
    const detailTitle = subPage?.type === 'PROVIDER_EDIT'
        ? '供应商详情'
        : subPage?.type === 'LLM_EDIT'
            ? '编辑模型'
            : subPage?.type === 'TTS_EDIT'
                ? 'TTS 引擎详情'
                : subPage?.type === 'ACTOR_EDIT'
                    ? '角色配置'
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
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--color-muted)' }}>控制台</div>
                            <div className="mt-2 text-lg font-black" style={{ color: 'var(--color-fg)' }}>设置中心</div>
                            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>把外观、规则、模型和角色配置收在同一条操作链里。</div>
                        </div>
                        <button onClick={() => setScreen('HOME')}
                            className="shrink-0 rounded-none border px-3 py-2 text-xs font-bold"
                            style={{ borderColor: 'var(--color-border)', background: 'var(--voxel-wood)', color: 'var(--color-accent1)' }}>
                            返回
                        </button>
                    </div>
                </div>

                <div className="flex-1 px-3 py-3 space-y-1.5">
                    {SECTIONS.map(section => (
                        <button key={section.id}
                            onClick={() => { setActiveSection(section.id); setSubPage(null); }}
                            className="w-full flex items-center gap-3 px-3 py-3 text-sm font-extrabold transition-all text-left"
                            style={{
                                background: activeSection === section.id && !subPage ? 'var(--voxel-wood)' : 'transparent',
                                color: activeSection === section.id && !subPage ? 'var(--color-fg)' : 'var(--color-muted)',
                                border: activeSection === section.id && !subPage ? '3px solid var(--color-accent1)' : '3px solid transparent',
                                boxShadow: activeSection === section.id && !subPage ? '3px 3px 0 var(--color-border)' : 'none',
                            }}>
                            <span className="shrink-0"><PixelIcon name={section.icon} px={3} /></span>
                            <div className="min-w-0">
                                <div className="font-bold">{section.label}</div>
                                <div className="text-[10px] mt-0.5 opacity-80">
                                    {SECTION_DETAILS[section.id].description}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="p-4 border-t-[3px] grid grid-cols-2 gap-2" style={{ borderColor: 'var(--color-border)' }}>
                    <SectionStat label="供应商" value={`${llmProviders.length}`} />
                    <SectionStat label="玩家" value={`${Math.max(0, actors.length - 1)}`} />
                </div>
            </div>

            <div ref={contentRef} className="vw-settings flex-1 min-w-0 overflow-y-auto custom-scrollbar">
                <div className="sticky top-0 z-20 border-b-[3px]"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="inline-block align-middle"><PixelIcon name={activeSectionIcon as PixelIconName} px={3} /></span>
                                    <span className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--color-muted)' }}>
                                        {isDetailView ? '细项' : '分组'}
                                    </span>
                                </div>
                                <h1 className="mt-2 text-xl sm:text-2xl font-black" style={{ color: 'var(--color-fg)' }}>{detailTitle}</h1>
                                <p className="mt-1 text-xs sm:text-sm max-w-2xl" style={{ color: 'var(--color-muted)' }}>{detailDescription}</p>
                            </div>
                            <button onClick={() => setScreen('HOME')}
                                className="lg:hidden shrink-0 rounded-none border px-3 py-2 text-xs font-bold"
                                style={{ borderColor: 'var(--color-border)', background: 'var(--voxel-wood)', color: 'var(--color-accent1)' }}>
                                返回
                            </button>
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-2">
                            <OverviewBadge label="主题" value={THEMES[uiConfig.themeId].label} />
                            <OverviewBadge label="模型" value={`${llmPresets.length}`} />
                            <OverviewBadge label="TTS" value={`${ttsPresets.length}`} />
                            <OverviewBadge label="存档" value={`${archives.length}`} />
                        </div>

                        <div className="mt-4 lg:hidden -mx-1 overflow-x-auto">
                            <div className="flex gap-2 px-1 min-w-max">
                                {SECTIONS.map(section => (
                                    <button
                                        key={section.id}
                                        onClick={() => { setActiveSection(section.id); setSubPage(null); }}
                                        className="rounded-none border px-3 py-2 text-xs font-bold whitespace-nowrap transition-all"
                                        style={{
                                            borderColor: activeSection === section.id && !subPage ? 'var(--color-accent1)' : 'var(--color-border)',
                                            background: activeSection === section.id && !subPage ? 'var(--color-accent1)' : 'var(--voxel-wood)',
                                            color: activeSection === section.id && !subPage ? '#fff' : 'var(--color-fg)',
                                        }}
                                    >
                                        <PixelIcon name={section.icon} px={2} /> {section.label}
                                    </button>
                                ))}
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
