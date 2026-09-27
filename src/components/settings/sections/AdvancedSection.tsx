import { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import { actorProfilesAtom, debugGodViewAtom, debugLogPanelOpenAtom, debugModeAtom, gameArchivesLoadableAtom, globalApiConfigAtom } from '../../../store';
import { publishConfig, fetchSharedConfig, applySharedConfig } from '../../../utils/configShare';
import { ActionButton, SectionLabel, Toggle } from '../../ui/pixel';
import type { SettingsImportExportApi } from '../useSettingsImportExport';

interface AdvancedSectionProps {
    io: SettingsImportExportApi;
}

export const AdvancedSection = ({ io }: AdvancedSectionProps) => {
    const [debugMode, setDebugMode] = useAtom(debugModeAtom);
    const setDebugLogPanelOpen = useSetAtom(debugLogPanelOpenAtom);
    const [debugGodView, setDebugGodView] = useAtom(debugGodViewAtom);
    const config = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const archivesLoadable = useAtomValue(gameArchivesLoadableAtom);
    const isArchivesLoading = archivesLoadable.state === 'loading';
    const [shareIncludeKeys, setShareIncludeKeys] = useState(false);
    const [shareStatus, setShareStatus] = useState('');

    return (
        <div className="space-y-6">
            <div>
                <SectionLabel>调试</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>Debug 模式</span>
                                <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>开启后游戏内显示 LOG 排错面板</span>
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
                                <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>显示所有玩家身份和角色信息</span>
                            </div>
                            <Toggle value={debugGodView} onChange={() => setDebugGodView(p => !p)} />
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>配置同步（局域网）</SectionLabel>
                <div className="rounded-none border-[3px] p-4 space-y-3" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                        房主把当前配置发布到房间服务，同一局域网的成员可一键拉取，免去逐项手填。发布前可选是否包含 API Key。
                    </p>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold" style={{ color: 'var(--color-fg)' }}>包含 API Key（仅信任的局域网时勾选）</span>
                        <Toggle value={shareIncludeKeys} onChange={() => setShareIncludeKeys(v => !v)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <ActionButton variant="primary" onClick={async () => {
                            const result = await publishConfig(shareIncludeKeys, actors.find(a => a.id === config.narratorActorId)?.name || 'host');
                            setShareStatus(result.ok ? `已发布${shareIncludeKeys ? '（含密钥）' : '（已脱敏）'}` : `发布失败：${result.error}`);
                        }}>发布配置到房间服务</ActionButton>
                        <ActionButton variant="ghost" onClick={async () => {
                            const result = await fetchSharedConfig();
                            if (!result.ok || !result.snapshot) { setShareStatus(`拉取失败：${result.error}`); return; }
                            const { applied } = applySharedConfig(result.snapshot);
                            setShareStatus(`已应用 ${applied.length} 项配置（${new Date(result.snapshot.publishedAt).toLocaleTimeString()} 发布）`);
                        }}>从房间服务拉取配置</ActionButton>
                    </div>
                    {shareStatus && <p className="text-[11px] font-bold" style={{ color: 'var(--color-accent1)' }}>{shareStatus}</p>}
                </div>
            </div>

            <div>
                <SectionLabel>数据管理</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="p-4">
                            <div className="text-sm font-bold mb-3" style={{ color: 'var(--color-fg)' }}>设置配置</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <ActionButton variant="ghost" onClick={io.handleSettingsExport}>导出设置</ActionButton>
                                <ActionButton variant="ghost" onClick={io.handleSettingsImportClick}>导入设置</ActionButton>
                            </div>
                            <input type="file" ref={io.settingsFileInputRef} onChange={io.handleSettingsFileChange} accept=".werewolf-settings,.json" className="hidden" />
                        </div>
                        <div className="p-4">
                            <div className="text-sm font-bold mb-3" style={{ color: 'var(--color-fg)' }}>完整备份</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <ActionButton variant="ghost" onClick={io.handleExport} disabled={isArchivesLoading}>
                                    {isArchivesLoading ? '加载中...' : '导出备份'}
                                </ActionButton>
                                <ActionButton variant="ghost" onClick={io.handleImportClick}>导入备份</ActionButton>
                            </div>
                            <input type="file" ref={io.fileInputRef} onChange={io.handleFileChange} accept=".werewolf-backup,.json" className="hidden" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
