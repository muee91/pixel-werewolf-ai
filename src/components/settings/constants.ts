import type { PixelIconName } from '../game/voxel/primitives';

export type SectionId = 'appearance' | 'game' | 'model' | 'players' | 'advanced';
export type SubPage =
    | { type: 'PROVIDER_EDIT'; id?: string }
    | { type: 'LLM_EDIT'; id?: string }
    | { type: 'TTS_EDIT'; id?: string }
    | { type: 'ACTOR_EDIT'; id?: string };

export const SECTIONS: { id: SectionId; icon: PixelIconName; label: string }[] = [
    { id: 'appearance', icon: 'palette', label: '外观' },
    { id: 'game', icon: 'sword', label: '游戏' },
    { id: 'model', icon: 'chip', label: '模型与语音' },
    { id: 'players', icon: 'player', label: '玩家与分身' },
    { id: 'advanced', icon: 'wrench', label: '高级' },
];

export const SECTION_DETAILS: Record<SectionId, { title: string; description: string }> = {
    appearance: { title: '外观', description: '主题、首页风格和视觉密度。' },
    game: { title: '游戏', description: '板子规则、白天流程和朗读速度。' },
    model: { title: '模型与语音', description: 'LLM 供应商、模型和 TTS 引擎。' },
    players: { title: '玩家与分身', description: '旁白与角色分身的模型、音色配置。' },
    advanced: { title: '高级', description: '调试开关、导入导出和完整备份。' },
};
