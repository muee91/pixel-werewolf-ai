import React, { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { SkeletonUtils } from 'three-stdlib';
import { buildScale, type AvatarLook } from '../../../utils/avatarLook';
import {
    ANIM_LIBRARY,
    CLIP_FOR_STATE,
    GESTURE_CLIP,
    GESTURE_INTERVAL_MAX,
    GESTURE_INTERVAL_MIN,
    GESTURE_TIME_SCALE,
    KAYKIT_MODELS,
    KAYKIT_SCALE,
    brightnessForModel,
    LOOPING_STATE,
    REDUCED_MOTION_FRACTION,
    kayKitModelUrl,
    modelForLook,
    stateFromFlags,
    tintForLook,
    type KayKitModel,
    type KayKitState,
} from './kaykitModel';

/** 状态切换的交叉淡入时长：0.24s 够盖住姿态跳变，又不至于让"受惊"迟半拍 */
const CROSS_FADE_SECONDS = 0.24;

/** 进 3D 场景时预取九只模型（2.8 MB，本地文件）：切座位时不会先看到盒子人再"跳"成模型 */
export const preloadKayKitModels = () => {
    for (const model of KAYKIT_MODELS) useGLTF.preload(kayKitModelUrl(model));
};

interface KayKitActorProps {
    look: AvatarLook;
    isSpeaking: boolean;
    startle: boolean;
    isCasting: boolean;
    concealed: boolean;
    reducedMotion: boolean;
}

/**
 * 一个有骨骼、有真动画的 CC0 角色。
 *
 * 三件必须做对的事（都在这里）：
 *  - **克隆**用 `SkeletonUtils.clone`，不能用 drei 的 `<Clone>`：后者把 skeleton 按引用
 *    搬过去，12 个座位会共享同一副骨架，一个人抬手全身一起动。
 *  - **材质要逐座位克隆**：模型只有一个材质，直接改 color 会让同桌所有人一起变色。
 *  - **蒙皮网格关掉视锥裁剪**：包围盒是按绑定姿态算的，动画一抬手就会被判为"出画"。
 */
const KayKitActor: React.FC<KayKitActorProps> = ({
    look,
    isSpeaking,
    startle,
    isCasting,
    concealed,
    reducedMotion,
}) => {
    const model = modelForLook(look);
    const gltf = useGLTF(kayKitModelUrl(model));
    // 动画只打包在 Knight 上（九只骨架同名同序，clip 可直通用）
    const library = useGLTF(kayKitModelUrl(ANIM_LIBRARY));

    const tint = concealed ? '#101010' : tintForLook(look);
    const brightness = brightnessForModel(model);
    const state = stateFromFlags({ isSpeaking, startle, isCasting });

    /**
     * 克隆只做一次，**不能把 tint 放进依赖**。
     * drei 的 useAnimations 会把 action 缓存在"第一次绑定的根"上，换了根之后
     * 旧 action 还在驱动老树，新模型会定格在绑定姿态 —— 玩家一改主色就静止。
     * 所以换色走下面那个独立副作用，只改材质色。
     */
    const scene = useMemo(() => {
        const cloned = SkeletonUtils.clone(gltf.scene) as THREE.Group;
        cloned.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // 蒙皮网格的包围盒是按绑定姿态算的，动画一抬手就会被判成"出画"
            mesh.frustumCulled = false;
            // 逐座位克隆材质：模型只有一个材质，共用会让同桌所有人一起变色
            const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const copies = source.map((material) => (material as THREE.MeshStandardMaterial).clone());
            mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
        });
        return cloned;
    }, [gltf.scene]);

    // 主色 → 材质乘色（白色 = 原贴图，混白一半 = 一层淡染色）
    useEffect(() => {
        scene.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
                const standard = material as THREE.MeshStandardMaterial;
                // 骷髅的眼睛是纯色自发光材质（没有贴图）。乘主色会把它染成别的颜色，
                // 再 ×3 提亮直接烧成白块 —— 没有贴图的材质一律不参与染色。
                if (!standard.map) return;
                // 乘色可以大于 1：既落主色，又顺手把整体亮度提起来（夜里不至于变成黑影）
                standard.color.set(tint).multiplyScalar(brightness);
            });
        });
    }, [scene, tint, brightness]);

    // 换色会重建整棵克隆体，旧材质不释放会随对局一路涨
    useEffect(() => () => {
        scene.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            // 只释放克隆出来的材质；map / skinning 贴图是加载器缓存共享的，不能碰
            materials.forEach((material) => material.dispose());
        });
    }, [scene]);

    const groupRef = useRef<THREE.Group>(null);
    const { actions, mixer } = useAnimations(library.animations, groupRef);
    const currentState = useRef<KayKitState | null>(null);

    // ── 呼吸相位 / 发言手势 ───────────────────────────────
    // 每个实例一个随机相位：12 个人同时吸气、同时抬手，一眼就能看出是同一段动画在跑。
    const phase = useRef(Math.random());
    const gestureTimer = useRef(0);
    const gestureGap = useRef(GESTURE_INTERVAL_MIN + Math.random() * (GESTURE_INTERVAL_MAX - GESTURE_INTERVAL_MIN));
    const gestureAction = useRef<THREE.AnimationAction | null>(null);

    // 手势播完淡回 Idle（LoopOnce + clampWhenFinished，不接管就会定格在挥手最后一帧）
    useEffect(() => {
        if (!mixer) return undefined;
        const onFinished = (event: { action: THREE.AnimationAction }) => {
            if (event.action !== gestureAction.current) return;
            gestureAction.current = null;
            const idle = actions[CLIP_FOR_STATE.idle];
            if (idle) {
                idle.enabled = true;
                idle.setEffectiveWeight(1);
                idle.play();
                event.action.crossFadeTo(idle, 0.3, false);
            }
        };
        mixer.addEventListener('finished', onFinished as unknown as (e: THREE.Event) => void);
        return () => mixer.removeEventListener('finished', onFinished as unknown as (e: THREE.Event) => void);
    }, [mixer, actions]);

    // 状态离开"发言"时，进行中的手势要立刻收掉，否则会和施法/受惊抢骨骼
    useEffect(() => {
        if (state === 'speak' || !gestureAction.current) return;
        gestureAction.current.fadeOut(0.2);
        gestureAction.current = null;
        gestureTimer.current = 0;
    }, [state]);

    useFrame((_, delta) => {
        if (!mixer || state !== 'speak' || reducedMotion) {
            gestureTimer.current = 0;
            return;
        }
        if (gestureAction.current) return;
        gestureTimer.current += delta;
        if (gestureTimer.current < gestureGap.current) return;

        const gesture = actions[GESTURE_CLIP];
        const idle = actions[CLIP_FOR_STATE.idle];
        gestureTimer.current = 0;
        gestureGap.current = GESTURE_INTERVAL_MIN + Math.random() * (GESTURE_INTERVAL_MAX - GESTURE_INTERVAL_MIN);
        if (!gesture) return;

        gesture.reset();
        gesture.setLoop(THREE.LoopOnce, 1);
        gesture.clampWhenFinished = true;
        gesture.setEffectiveTimeScale(GESTURE_TIME_SCALE);
        gesture.setEffectiveWeight(1);
        gesture.play();
        if (idle) idle.crossFadeTo(gesture, 0.3, false);
        gestureAction.current = gesture;
    });

    useEffect(() => {
        const clipName = CLIP_FOR_STATE[state];
        const action = actions[clipName];
        if (!action) return;
        const previous = currentState.current ? actions[CLIP_FOR_STATE[currentState.current]] ?? null : null;

        action.reset();
        action.setLoop(LOOPING_STATE[state] ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !LOOPING_STATE[state];
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(1);
        action.play();
        if (previous && previous !== action) action.crossFadeFrom(previous, CROSS_FADE_SECONDS, true);

        if (reducedMotion) {
            // 不循环但要保留状态：停在有辨识度的那一帧
            action.paused = true;
            action.time = action.getClip().duration * REDUCED_MOTION_FRACTION[state];
        } else {
            action.paused = false;
            // 待机/发言都是 Idle：按实例随机相位起播，避免整桌人同步吸气
            if (state === 'idle' || state === 'speak') {
                action.time = phase.current * action.getClip().duration;
            }
        }
        currentState.current = state;
    }, [actions, state, reducedMotion]);

    const [scaleX, scaleY] = buildScale(look.build);

    return (
        <group scale={[scaleX * KAYKIT_SCALE, scaleY * KAYKIT_SCALE, scaleX * KAYKIT_SCALE]}>
            <primitive object={scene} ref={groupRef} />
        </group>
    );
};

// ── 加载/失败兜底 ────────────────────────────────────────

interface BoundaryProps {
    children: React.ReactNode;
    fallback: React.ReactNode;
    /** 同一个座位换模型时重置，否则一次失败会永久卡在兜底上 */
    resetKey: string;
}

class ModelBoundary extends Component<BoundaryProps, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error) {
        // 模型损坏/不支持的设备：这一个座位退回体素人，整个营地不能一起黑
        console.warn('[kaykit] 模型加载失败，该座位退回体素角色', error);
    }

    componentDidUpdate(prev: BoundaryProps) {
        if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
    }

    render() {
        if (this.state.failed) return this.props.fallback;
        return this.props.children;
    }
}

interface KayKitCharacterProps extends KayKitActorProps {
    /** 模型还没到 / 加载失败时显示的体素角色 */
    fallback: React.ReactNode;
}

export const KayKitCharacter: React.FC<KayKitCharacterProps> = ({ fallback, ...actor }) => {
    const model: KayKitModel = modelForLook(actor.look);
    return (
        <ModelBoundary fallback={fallback} resetKey={`${model}:${actor.look.build}`}>
            <Suspense fallback={fallback}>
                <KayKitActor {...actor} />
            </Suspense>
        </ModelBoundary>
    );
};

KayKitCharacter.displayName = 'KayKitCharacter';
