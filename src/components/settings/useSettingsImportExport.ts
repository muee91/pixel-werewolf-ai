import React, { useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { globalApiConfigAtom, gameConfigAtom, gameArchivesAtom, gameArchivesLoadableAtom, llmPresetsAtom, llmProvidersAtom, ttsPresetsAtom, actorProfilesAtom } from '../../store';
import type { LLMPreset, LLMProviderConfig } from '../../types';
import { normalizeGameArchive } from '../../utils/archive';

interface UseSettingsImportExportOptions {
    // 模型配置导入会还原「已同步的模型下拉列表」缓存,该状态由 Shell 持有
    setProviderModelOptions: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

export interface SettingsImportExportApi {
    // 完整备份
    handleExport: () => Promise<void>;
    handleImportClick: () => Promise<void>;
    handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    // 模型配置
    handleModelConfigExport: () => Promise<void>;
    handleModelConfigImportClick: () => Promise<void>;
    handleModelConfigFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    modelConfigInputRef: React.RefObject<HTMLInputElement | null>;
    // 设置配置
    handleSettingsExport: () => Promise<void>;
    handleSettingsImportClick: () => Promise<void>;
    handleSettingsFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    settingsFileInputRef: React.RefObject<HTMLInputElement | null>;
    // 玩家配置
    handleActorsExport: () => Promise<void>;
    handleActorsImportClick: () => Promise<void>;
    handleActorsFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    actorsFileInputRef: React.RefObject<HTMLInputElement | null>;
}

// 设置中心的四组导入/导出(完整备份 / 模型配置 / 设置 / 玩家配置),
// 连同各自的隐藏 file input 一起收敛到这一个 hook
export const useSettingsImportExport = ({ setProviderModelOptions }: UseSettingsImportExportOptions): SettingsImportExportApi => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modelConfigInputRef = useRef<HTMLInputElement>(null);
    const settingsFileInputRef = useRef<HTMLInputElement>(null);
    const actorsFileInputRef = useRef<HTMLInputElement>(null);

    const [config, setConfig] = useAtom(globalApiConfigAtom);
    const [gameConfig, setGameConfig] = useAtom(gameConfigAtom);
    const [llmPresets, setLlmPresets] = useAtom(llmPresetsAtom);
    const [llmProviders, setLlmProviders] = useAtom(llmProvidersAtom);
    const [ttsPresets, setTtsPresets] = useAtom(ttsPresetsAtom);
    const [actors, setActors] = useAtom(actorProfilesAtom);
    const archivesLoadable = useAtomValue(gameArchivesLoadableAtom);
    const setArchives = useSetAtom(gameArchivesAtom);
    const archives = archivesLoadable.state === 'hasData' ? archivesLoadable.data : [];

    const formatExportTimestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    const downloadStructuredJson = async (payload: unknown, filename: string, mimeType: string) => {
        const isNative = Capacitor.isNativePlatform();
        if (isNative) {
            try {
                const content = JSON.stringify(payload, null, 2);
                let savedFile;
                try {
                    savedFile = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Documents, encoding: Encoding.UTF8 });
                } catch {
                    try {
                        savedFile = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.External, encoding: Encoding.UTF8 });
                    } catch {
                        savedFile = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
                    }
                }
                try {
                    await Share.share({ title: filename, text: '备份已保存，也可分享到其他应用', url: savedFile.uri, dialogTitle: '导出备份' });
                } catch {
                    alert(`备份已保存到：${savedFile.uri}`);
                }
            } catch (error) {
                alert(`导出失败：${error}`);
            }
        } else {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: `${mimeType};charset=utf-8` });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    const handleExport = async () => {
        const exportedAt = new Date().toISOString();
        await downloadStructuredJson({
            exportKind: 'FULL_BACKUP', displayName: '完整应用备份',
            description: '包含 AI 狼人杀应用设置、模型配置、TTS 配置、玩家分身和历史归档',
            schemaVersion: 1, app: 'ai-werewolf-simulator',
            contentScope: ['llmPresets', 'ttsPresets', 'actorProfiles', 'globalApiConfig', 'gameArchives'],
            exportedAt, llmPresets, ttsPresets, actorProfiles: actors, globalApiConfig: config, gameArchives: archives,
        }, `werewolf-完整备份-${formatExportTimestamp()}.werewolf-backup`, 'application/vnd.ai-werewolf.full-backup+json');
    };

    const processImportText = (text: string, expectedKind: string) => {
        try {
            const importedData = JSON.parse(text);
            if (importedData.exportKind && importedData.exportKind !== expectedKind) {
                alert(`导入失败：这是${importedData.displayName || importedData.exportKind}，请使用对应的导入口。`);
                return;
            }
            if (expectedKind === 'FULL_BACKUP') {
                if ('llmPresets' in importedData && 'ttsPresets' in importedData && 'actorProfiles' in importedData && 'globalApiConfig' in importedData) {
                    setLlmPresets(importedData.llmPresets);
                    setTtsPresets(importedData.ttsPresets);
                    setActors(importedData.actorProfiles);
                    setConfig(importedData.globalApiConfig);
                    if (Array.isArray(importedData.gameArchives)) {
                        setArchives(importedData.gameArchives.map(normalizeGameArchive));
                    }
                    alert('完整应用备份恢复成功！');
                } else {
                    alert('导入失败：文件格式不正确。');
                }
            }
        } catch (error) {
            alert(`导入失败：无法解析文件。 ${error}`);
        }
    };

    const handleImportClick = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await FilePicker.pickFiles({ types: ['application/json', 'application/octet-stream', 'text/plain'], readData: true, limit: 1 });
                const picked = result.files[0];
                if (!picked?.data) return;
                processImportText(atob(picked.data), 'FULL_BACKUP');
            } catch (error) {
                if (String(error).includes('canceled')) return;
                alert(`选择文件失败：${error}`);
            }
        } else {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => processImportText(e.target?.result as string, 'FULL_BACKUP');
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const handleModelConfigExport = async () => {
        await downloadStructuredJson({
            exportKind: 'MODEL_CONFIG', displayName: '模型配置导出',
            description: '仅包含 AI 供应商与 LLM 模型预设',
            schemaVersion: 1, app: 'ai-werewolf-simulator',
            contentScope: ['llmProviders', 'llmPresets'],
            exportedAt: new Date().toISOString(), llmProviders, llmPresets,
        }, `werewolf-模型配置-${formatExportTimestamp()}.werewolf-model`, 'application/vnd.ai-werewolf.model-config+json');
    };

    const handleModelConfigImportClick = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await FilePicker.pickFiles({ types: ['application/json', 'application/octet-stream', 'text/plain'], readData: true, limit: 1 });
                const picked = result.files[0];
                if (!picked?.data) return;
                processModelConfigImport(atob(picked.data));
            } catch (error) {
                if (String(error).includes('canceled')) return;
                alert(`选择文件失败：${error}`);
            }
        } else {
            modelConfigInputRef.current?.click();
        }
    };

    const processModelConfigImport = (text: string) => {
        try {
            const importedData = JSON.parse(text);
            if (importedData.exportKind && importedData.exportKind !== 'MODEL_CONFIG') {
                alert(`导入失败：这是${importedData.displayName || importedData.exportKind}，请使用对应的导入口。`);
                return;
            }
            if (!Array.isArray(importedData.llmProviders) || !Array.isArray(importedData.llmPresets)) {
                alert('导入失败：不是有效的模型配置文件。');
                return;
            }
            const validProviders = importedData.llmProviders.filter((item: Partial<LLMProviderConfig>) =>
                typeof item.id === 'string' && typeof item.name === 'string' && (item.type === 'gemini' || item.type === 'openai')
            ) as LLMProviderConfig[];
            const providerIds = new Set(validProviders.map(item => item.id));
            const validPresets = importedData.llmPresets.filter((item: Partial<LLMPreset>) =>
                typeof item.id === 'string' && typeof item.name === 'string' && typeof item.providerId === 'string' && typeof item.modelId === 'string' && providerIds.has(item.providerId)
            ) as LLMPreset[];
            if (validProviders.length === 0) { alert('导入失败：配置文件里没有可用供应商。'); return; }
            setLlmProviders(validProviders);
            setLlmPresets(validPresets);
            setProviderModelOptions(Object.fromEntries(validProviders.map(provider => [provider.id, provider.models || []])));
            alert(`模型配置导入成功：${validProviders.length} 个供应商，${validPresets.length} 个模型。`);
        } catch (error) {
            alert(`模型配置导入失败：无法解析文件。 ${error}`);
        }
    };

    const handleModelConfigFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => processModelConfigImport(e.target?.result as string);
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const handleSettingsExport = async () => {
        await downloadStructuredJson({
            exportKind: 'SETTINGS', displayName: '设置配置', description: '仅包含设置页面的配置项',
            schemaVersion: 1, app: 'ai-werewolf-simulator', contentScope: ['gameConfig', 'globalApiConfig'],
            exportedAt: new Date().toISOString(), gameConfig, globalApiConfig: config,
        }, `werewolf-游戏设置-${formatExportTimestamp()}.werewolf-settings`, 'application/vnd.ai-werewolf.settings+json');
    };

    const handleSettingsImportClick = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await FilePicker.pickFiles({ types: ['application/json', 'application/octet-stream', 'text/plain'], readData: true, limit: 1 });
                const picked = result.files[0];
                if (!picked?.data) return;
                processSettingsImport(atob(picked.data));
            } catch (error) {
                if (String(error).includes('canceled')) return;
                alert(`选择文件失败：${error}`);
            }
        } else {
            settingsFileInputRef.current?.click();
        }
    };

    const processSettingsImport = (text: string) => {
        try {
            const importedData = JSON.parse(text);
            if (importedData.exportKind && importedData.exportKind !== 'SETTINGS') {
                alert(`导入失败：这是${importedData.displayName || importedData.exportKind}，请使用对应的导入口。`);
                return;
            }
            if (importedData.gameConfig) {
                setGameConfig(prev => {
                    const importedConfig = importedData.gameConfig;
                    const sheriffElection = importedConfig.rules?.sheriffElection ??
                        importedConfig.sheriffEnabled ??
                        prev.rules.sheriffElection;
                    return {
                        ...prev,
                        ...importedConfig,
                        sheriffEnabled: sheriffElection,
                        rules: {
                            ...prev.rules,
                            ...importedConfig.rules,
                            sheriffElection,
                        },
                    };
                });
            }
            if (importedData.globalApiConfig) setConfig(importedData.globalApiConfig);
            alert('设置配置导入成功！');
        } catch (error) {
            alert(`导入失败：无法解析文件。 ${error}`);
        }
    };

    const handleSettingsFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => processSettingsImport(e.target?.result as string);
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const handleActorsExport = async () => {
        await downloadStructuredJson({
            exportKind: 'ACTORS', displayName: '玩家配置', description: '仅包含玩家分身配置',
            schemaVersion: 1, app: 'ai-werewolf-simulator', contentScope: ['actorProfiles'],
            exportedAt: new Date().toISOString(), actorProfiles: actors,
        }, `werewolf-玩家列表-${formatExportTimestamp()}.werewolf-actors`, 'application/vnd.ai-werewolf.actors+json');
    };

    const handleActorsImportClick = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await FilePicker.pickFiles({ types: ['application/json', 'application/octet-stream', 'text/plain'], readData: true, limit: 1 });
                const picked = result.files[0];
                if (!picked?.data) return;
                processActorsImport(atob(picked.data));
            } catch (error) {
                if (String(error).includes('canceled')) return;
                alert(`选择文件失败：${error}`);
            }
        } else {
            actorsFileInputRef.current?.click();
        }
    };

    const processActorsImport = (text: string) => {
        try {
            const importedData = JSON.parse(text);
            if (importedData.exportKind && importedData.exportKind !== 'ACTORS') {
                alert(`导入失败：这是${importedData.displayName || importedData.exportKind}，请使用对应的导入口。`);
                return;
            }
            if (Array.isArray(importedData.actorProfiles)) {
                setActors(importedData.actorProfiles);
                alert('玩家配置导入成功！');
            } else {
                alert('导入失败：文件格式不正确。');
            }
        } catch (error) {
            alert(`导入失败：无法解析文件。 ${error}`);
        }
    };

    const handleActorsFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => processActorsImport(e.target?.result as string);
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    return {
        handleExport, handleImportClick, handleFileChange, fileInputRef,
        handleModelConfigExport, handleModelConfigImportClick, handleModelConfigFileChange, modelConfigInputRef,
        handleSettingsExport, handleSettingsImportClick, handleSettingsFileChange, settingsFileInputRef,
        handleActorsExport, handleActorsImportClick, handleActorsFileChange, actorsFileInputRef,
    };
};
