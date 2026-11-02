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
    { id: 'orbit', label: '全景环绕', desc: '绕营地缓慢巡游' },
    { id: 'low-orbit', label: '低角掠野', desc: '贴近地面低角度掠过' },
    { id: 'top-down', label: '高空俯瞰', desc: '高处俯视全场缓旋' },
    { id: 'dolly', label: '缓推缓拉', desc: '朝营火往返推拉镜头' },
];

export interface OrbitParams {
    radius: number;
    height: number;
    /** 弧度/秒 */
    speed: number;
}

/**
 * 巡游类镜头的运动参数;auto 等非巡游镜头返回 null。
 *
 * indoor = 室内石殿：柱廊在 12.2m、墙在 14.2m，营地那套"11.5m 绕圈"会直接绕到柱子外面，
 * 每一帧都被柱身切开视线。室内统一收到柱圈里侧，俯视机位也不能穿出穹顶。
 */
export const getOrbitParams = (style: CameraStyle, indoor = false): OrbitParams | null => {
    const k = indoor ? 0.8 : 1;
    switch (style) {
        case 'orbit':
            // 半径 20 那版机位跑到了营地外圈的树/瞭望塔背面，镜头前常年立着一堵木板墙。
            // 收到 11.5（所有建筑都在 13m 开外）之后，营地填满画面、也没有东西挡在中间。
            return { radius: 11.5 * k, height: indoor ? 4.4 : 6.8, speed: 0.12 };
        case 'low-orbit':
            // 9m 会从座位背后擦过去，近处那个人的帽子能占掉三分之一屏幕；退到 10.2 好一些
            return { radius: 10.2 * k, height: 2.6, speed: 0.2 };
        case 'top-down':
            // 半径 2.5/高度 30 那版几乎是垂直俯视：既看不出立体感，绕轴旋转也只剩 0.25m/s，
            // 选进来像一张静止的小地图。抬到 20° 左右的俯角，转速补到 1.3m/s 才看得出在动。
            // 室内**必须**压在起拱高度（WALL_HEIGHT 8.4）以下：机位一旦升到穹顶内部，
            // 视野就被屋顶内表面接管，画面上只剩名称牌和背景色（实测 11m 就已经全空）。
            return { radius: indoor ? 6.2 : 8, height: indoor ? 7.4 : 24, speed: 0.16 };
        case 'dolly':
            // 远端 17m 会退到建筑外面，被避让逻辑一拉就"顿"一下；压到 7.3~13.7 全程在院内。
                return { radius: 10.5 * k, height: indoor ? 4.4 : 5.2, speed: 0.03 };
        default:
            return null;
    }
};

export const isOrbitStyle = (style: CameraStyle): boolean => getOrbitParams(style) !== null;

/** 缓推缓拉的往返姿态:半径 7.3~13.7、高度 4~6.4 之间正弦摆动（室内同样按 0.8 收） */
export const getDollyOffset = (elapsed: number, indoor = false): { radius: number; height: number } => {
    const k = indoor ? 0.8 : 1;
    return {
        radius: (10.5 + 3.2 * Math.sin(elapsed * 0.25)) * k,
        height: (indoor ? 4.4 : 5.2) + 1.2 * Math.sin(elapsed * 0.25),
    };
};

export interface CameraPose2 {
    position: { x: number; y: number; z: number };
    look: { x: number; y: number; z: number };
}

/**
 * 发言镜头：正面机位 —— 与发言人同一条半径线、站在他脸的正前方。
 *
 * 这个机位改了四代，每一代都是被实拍打回来的：
 * 1.0 站在发言人背后 4.6m、3.6m 高 —— 角色坐下后一律朝营火，所以画面里是后脑勺 + 俯视；
 * 2.0 站在营火与发言人之间（半径 = 座位半径×0.6）—— 方向对了但离脸只有 1.6m，
 *     帽檐占掉半屏，构图上就是怼脸大特写；
 * 3.0 站在座位圈的缝隙上拍 3/4 侧脸 —— 不怼脸了，但用户要的是**正面镜头**；
 * 4.0（本版）回到 2.0 的径向几何，把脸距拉开到 2.6m 的标准中景：
 *     - 正对：机位与发言人同方位角，径向就是角色的正脸方向；
 *     - 遮挡：中央的火堆/祭坛整个落在机位**背后**（机位半径 ≥1.15 > 火盆 0.85），
 *       根本不会进画面；机位本体站在台阶顶面（0.78m）之上，不穿任何实体；
 *     - 邻座：±step 方位、距机位 ≥3m，与视轴夹角 ≥50°，在水平半视野（≤50°）之外。
 */
export const getDialoguePose = (
    focus: FocusPoint,
    seatRadius = 4,
    /** 形参保留（调用方签名不变）；正面机位不再按座位缝隙取位 */
    _seatCount = 9,
    /** 中央遮挡物要求机位退出的水平半径；默认 = 火盆口径 0.85 + 0.3 余量 */
    centerClearRadius = 1.15,
): CameraPose2 => {
    const R = Math.max(2.4, seatRadius);
    const base = Math.atan2(focus.z, focus.x);
    /** 脸距 2.6m：再近帽檐怼脸，再远表情看不清 */
    const radius = Math.max(centerClearRadius, R - 2.6);
    /** 坐姿眼高：站着是 1.7，坐下后眼睛在 1.35 上下 */
    const eyeY = 1.45;
    return {
        position: { x: Math.cos(base) * radius, y: eyeY, z: Math.sin(base) * radius },
        look: { x: focus.x, y: 1.35, z: focus.z },
    };
};

// The gameplay view is deliberately calmer than a cinematic replay: only a// line currently presented to the audience may take over the camera.  Silent
// decisions (vote, decline to explode, phase cues, skill effects) stay in the
// overview and communicate through HUD/effects instead.
export const getGameplayCameraFocus = ({
  dialogueActive,
  dialogueSpeaker,
}: {
  dialogueActive: boolean;
  dialogueSpeaker: FocusPoint | null;
}): FocusPoint | null => dialogueActive ? dialogueSpeaker : null;
