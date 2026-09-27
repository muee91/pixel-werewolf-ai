export type CameraDirectorMode = 'auto' | 'manual';

export type FocusPoint = { x: number; z: number };

export const getCameraDirectorMode = (manualControlActive: boolean): CameraDirectorMode =>
    manualControlActive ? 'manual' : 'auto';

export const getDirectorFocus = ({
    speaker,
    event,
}: {
    speaker: FocusPoint | null;
    event: FocusPoint | null;
}): FocusPoint | null => event ?? speaker;

// ── 运镜方式:导演在对话镜头之外如何运镜 ──
// auto=自动导播(全景↔特写切换);orbit/low-orbit/top-down/dolly=四种巡游类镜头;
// 手动拖拽由 manualControlActive 表达,不在此列。
export type CameraStyle = 'auto' | 'orbit' | 'low-orbit' | 'top-down' | 'dolly';

export interface CameraStyleMeta {
    id: CameraStyle;
    label: string;
    desc: string;
}

export const CAMERA_STYLES: CameraStyleMeta[] = [
    { id: 'auto', label: '自动导播', desc: '全景与发言人特写自动切换' },
    { id: 'orbit', label: '全景环绕', desc: '高空绕营地缓慢巡游' },
    { id: 'low-orbit', label: '低角掠野', desc: '贴地低角度快速掠过' },
    { id: 'top-down', label: '高空俯瞰', desc: '正上方俯视全场缓旋' },
    { id: 'dolly', label: '缓推缓拉', desc: '朝营火往返推拉镜头' },
];

export interface OrbitParams {
    radius: number;
    height: number;
    /** 弧度/秒 */
    speed: number;
}

/** 巡游类镜头的运动参数;auto 等非巡游镜头返回 null */
export const getOrbitParams = (style: CameraStyle): OrbitParams | null => {
    switch (style) {
        case 'orbit':
            return { radius: 20, height: 9.5, speed: 0.12 };
        case 'low-orbit':
            return { radius: 10.5, height: 2.4, speed: 0.2 };
        case 'top-down':
            return { radius: 2.5, height: 30, speed: 0.1 };
        case 'dolly':
            return { radius: 12, height: 5.5, speed: 0.03 };
        default:
            return null;
    }
};

export const isOrbitStyle = (style: CameraStyle): boolean => getOrbitParams(style) !== null;

/** 缓推缓拉的往返姿态:半径 7~17、高度 3.7~7.3 之间正弦摆动 */
export const getDollyOffset = (elapsed: number): { radius: number; height: number } => ({
    radius: 12 + 5 * Math.sin(elapsed * 0.25),
    height: 5.5 + 1.8 * Math.sin(elapsed * 0.25),
});

// The gameplay view is deliberately calmer than a cinematic replay: only a
// line currently presented to the audience may take over the camera.  Silent
// decisions (vote, decline to explode, phase cues, skill effects) stay in the
// overview and communicate through HUD/effects instead.
export const getGameplayCameraFocus = ({
  dialogueActive,
  dialogueSpeaker,
}: {
  dialogueActive: boolean;
  dialogueSpeaker: FocusPoint | null;
}): FocusPoint | null => dialogueActive ? dialogueSpeaker : null;
