import type { PixelIconName } from '../game/voxel/primitives';

export type SectionId = 'appearance' | 'sound' | 'model' | 'game' | 'players' | 'advanced';
export type SubPage =
    | { type: 'PROVIDER_EDIT'; id?: string }
    | { type: 'LLM_EDIT'; id?: string }
    | { type: 'TTS_EDIT'; id?: string }
    | { type: 'ACTOR_EDIT'; id?: string };

// 分区的唯一判据是「改的是哪一类东西」，不是「在哪个界面出现」：
// 外观只放看得见的视觉，声音放听得到的一切（含朗读），模型只放大脑。
export const SECTIONS: { id: SectionId; icon: PixelIconName; label: string }[] = [
    { id: 'appearance', icon: 'palette', label: '外观' },
    { id: 'sound', icon: 'sound', label: '声音' },
    { id: 'model', icon: 'chip', label: '模型' },
    { id: 'game', icon: 'sword', label: '游戏' },
    { id: 'players', icon: 'player', label: '玩家与分身' },
    { id: 'advanced', icon: 'wrench', label: '高级' },
];

export const SECTION_DETAILS: Record<SectionId, { title: string; description: string }> = {
    appearance: { title: '外观', description: '视角、首页风格、布局与特效。' },
    sound: { title: '声音', description: '环境声、音效、音乐、音量与朗读语速。' },
    model: { title: '模型', description: '供应商、模型与内置小模型。' },
    game: { title: '游戏', description: '板子规则与白天流程。' },
    players: { title: '玩家与分身', description: '旁白与角色分身的模型、音色配置。' },
    advanced: { title: '高级', description: '调试、网络转发、数据搬家。' },
};
