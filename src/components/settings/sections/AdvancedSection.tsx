import { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import { actorProfilesAtom, debugGodViewAtom, debugLogPanelOpenAtom, debugModeAtom, gameArchivesLoadableAtom, globalApiConfigAtom } from '../../../store';
import { remoteServerConfigAtom } from '../../../atoms';
import { publishConfig, fetchSharedConfig, applySharedConfig } from '../../../utils/configShare';
import { ActionButton, SectionLabel, SettingsInput, Toggle } from '../../ui/pixel';
import type { SettingsImportExportApi } from '../useSettingsImportExport';

interface AdvancedSectionProps {
    io: SettingsImportExportApi;
}

// 高级 = 玩家日常不会碰的三类:调试开关、网络转发、数据搬家。
// 四组导入导出(设置/模型/玩家/完整备份)以前分散在三个分区,现在全部收在这一处。
export const AdvancedSection = ({ io }: AdvancedSectionProps) => {
    const [debugMode, setDebugMode] = useAtom(debugModeAtom);
    const setDebugLogPanelOpen = useSetAtom(debugLogPanelOpenAtom);
    const [debugGodView, setDebugGodView] = useAtom(debugGodViewAtom);
    const [remoteConfig, setRemoteConfig] = useAtom(remoteServerConfigAtom);
    const config = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const archivesLoadable = useAtomValue(gameArchivesLoadableAtom);
    const isArchivesLoading = archivesLoadable.state === 'loading';
    const [shareIncludeKeys, setShareIncludeKeys] = useState(false);
    const [shareStatus, setShareStatus] = useState('');
    const [shareCodeInput, setShareCodeInput] = useState('');

    const transferRows = [
        {
            key: 'settings', title: '设置配置', desc: '板子规则 + 全局开关',
            onExport: io.handleSettingsExport, onImport: io.handleSettingsImportClick,
        },
        {
            key: 'model', title: '模型配置', desc: 'AI 供应商 + 模型预设',
            onExport: io.handleModelConfigExport, onImport: io.handleModelConfigImportClick,
        },
        {
            key: 'actors', title: '玩家配置', desc: '旁白与分身的名字、模型、音色',
            onExport: io.handleActorsExport, onImport: io.handleActorsImportClick,
        },
        {
            key: 'backup', title: '完整备份', desc: '以上全部 + 历史对局归档',
            onExport: io.handleExport, onImport: io.handleImportClick,
            exportLabel: isArchivesLoading ? '加载中...' : undefined,
            disabled: isArchivesLoading,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <SectionLabel>调试</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>Debug 模式</span>
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>开启后游戏内显示 LOG 排错面板</span>
                            </div>
                            <Toggle value={debugMode} onChange={() => {
                                const next = !debugMode;
                                setDebugMode(next);
                                if (!next) { setDebugLogPanelOpen(false); setDebugGodView(false); }
                            }} />
                        </div>
                        <div className={clsx("flex items-center justify-between p-4", !debugMode && "opacity-40 pointer-events-none")}>
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>上帝视角</span>
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>显示所有玩家身份和角色信息</span>
                            </div>
                            <Toggle value={debugGodView} onChange={() => setDebugGodView(p => !p)} />
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>网络与转发</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>LLM 代理</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>通过远程代理转发 LLM 请求（NVIDIA 兼容端点用）</span>
                                </div>
                                <Toggle value={remoteConfig.llmProxyEnabled} onChange={() => setRemoteConfig(p => ({ ...p, llmProxyEnabled: !p.llmProxyEnabled }))} />
                            </div>
                            {remoteConfig.llmProxyEnabled && (
                                <div className="mt-3">
                                    <SettingsInput label="代理地址" value={remoteConfig.llmProxyUrl}
                                        onChange={(e) => setRemoteConfig(p => ({ ...p, llmProxyUrl: e.target.value }))}
                                        placeholder="http://192.168.1.100:8000" sub="LLM 请求将通过此服务器转发" />
                                </div>
                            )}
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>配置同步（局域网）</span>
                                <span className="text-xs leading-relaxed block mt-1" style={{ color: 'var(--color-muted)' }}>
                                    房主把当前配置发布到房间服务，同一局域网的成员凭一次性口令拉取，免去逐项手填。
                                    快照可能含明文 API Key，因此拉取必须带 10 位口令；
                                    重新发布即换新口令，覆盖旧快照也需出示当前口令。请只在私人网络使用。
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold" style={{ color: 'var(--color-fg)' }}>包含 API Key（仅信任的局域网时勾选）</span>
                                <Toggle value={shareIncludeKeys} onChange={() => setShareIncludeKeys(v => !v)} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <ActionButton variant="primary" onClick={async () => {
                                    const previousCode = sessionStorage.getItem('werewolf-share-code') || undefined;
                                    const result = await publishConfig(shareIncludeKeys, actors.find(a => a.id === config.narratorActorId)?.name || 'host', previousCode);
                                    if (result.ok && result.shareCode) sessionStorage.setItem('werewolf-share-code', result.shareCode);
                                    setShareStatus(result.ok
                                        ? `已发布${shareIncludeKeys ? '（含密钥）' : '（已脱敏）'}，把口令告诉朋友：${result.shareCode ?? '(未取到，请重新发布)'}`
                                        : `发布失败：${result.error}`);
                                }}>发布配置到房间服务</ActionButton>
                                <input
                                    value={shareCodeInput}
                                    onChange={e => setShareCodeInput(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 10))}
                                    placeholder="口令 10 位"
                                    inputMode="text"
                                    autoCapitalize="off"
                                    aria-label="配置分享口令"
                                    className="w-full border-[3px] px-3 py-2 text-xs font-black sm:w-28"
                                    style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}
                                />
                                <ActionButton variant="ghost" onClick={async () => {
                                    const result = await fetchSharedConfig(shareCodeInput);
                                    if (!result.ok || !result.snapshot) { setShareStatus(`拉取失败：${result.error}`); return; }
                                    const { applied } = applySharedConfig(result.snapshot);
                                    setShareStatus(`已应用 ${applied.length} 项配置（${new Date(result.snapshot.publishedAt).toLocaleTimeString()} 发布）`);
                                }}>从房间服务拉取配置</ActionButton>
                            </div>
                            {shareStatus && <p className="text-xs font-bold" style={{ color: 'var(--color-accent1)' }}>{shareStatus}</p>}
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>数据搬家</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        {transferRows.map(row => (
                            <div key={row.key} className="p-4">
                                <div className="mb-2 flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-bold" style={{ color: 'var(--color-fg)' }}>{row.title}</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{row.desc}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <ActionButton variant="ghost" onClick={row.onExport} disabled={row.disabled}>{row.exportLabel || '导出'}</ActionButton>
                                    <ActionButton variant="ghost" onClick={row.onImport}>导入</ActionButton>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <input type="file" ref={io.settingsFileInputRef} onChange={io.handleSettingsFileChange} accept=".werewolf-settings,.json" className="hidden" />
                <input type="file" ref={io.modelConfigInputRef} onChange={io.handleModelConfigFileChange} accept=".werewolf-model,.json" className="hidden" />
                <input type="file" ref={io.actorsFileInputRef} onChange={io.handleActorsFileChange} accept=".werewolf-actors,.json" className="hidden" />
                <input type="file" ref={io.fileInputRef} onChange={io.handleFileChange} accept=".werewolf-backup,.json" className="hidden" />
            </div>
        </div>
    );
};
