import React, { useRef, useEffect, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getCameraFocusTarget, getOverviewCameraPose } from './sceneModel';
import { getDialoguePose, getDirectorFocus, getDollyOffset, getOrbitParams, isOrbitStyle, type CameraStyle } from './cameraDirectorModel';
import {
  applyClearance,
  clampCameraToRoom,
  getClearanceFactor,
  type CameraBlocker,
  type RoomBounds,
} from './cameraClearance';

interface SceneDirectorProps {
  focusSeatX: number | null;
  focusSeatZ: number | null;
  eventFocusX?: number | null;
  eventFocusZ?: number | null;
  isNight: boolean;
  manualControlActive: boolean;
  controlsRef?: RefObject<OrbitControlsImpl | null>;
  dialogueMode?: boolean;
  snapDialogueCamera?: boolean;
  /** 运镜方式:auto=自动导播;orbit/low-orbit/top-down/dolly=巡游类镜头 */
  cameraStyle?: CameraStyle;
  /** 会挡住视线的道具（木屋/塔/井…），机位绕到它们背后时自动拉近 */
  blockers?: readonly CameraBlocker[];
  /** 座位圈半径（发言镜头按它算距离） */
  seatRadius?: number;
  /** 座位数（发言镜头按半格座位角错开火把） */
  seatCount?: number;
  /** 室内场景（石殿）：巡游半径/全景机位全部收进柱廊里侧、俯视高度压在穹顶下 */
  indoor?: boolean;
  /**
   * 室内房间边界。给了就把机位逐帧夹在房间内——
   * 不然玩家手一拉就穿墙/钻穹顶，画面只剩名称牌和背景色。
   */
  roomBounds?: RoomBounds;
}

const OVERVIEW_TRANSITION_SECONDS = 1.05;
const DIALOGUE_TRANSITION_SECONDS = 1.25;
/** 进入巡游镜头(切款式 / 手拖恢复 / 对话结束)的混合时长：巡游是逐帧算机位的,不混合就等于瞬移 */
const PATROL_BLEND_SECONDS = 1.1;

// 减少动态偏好：模块级读取一次；减弱时过渡直接落到终点、巡游镜头停在定格机位
const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

export const SceneDirector: React.FC<SceneDirectorProps> = ({
  focusSeatX,
  focusSeatZ,
  eventFocusX = null,
  eventFocusZ = null,
  isNight,
  manualControlActive,
  controlsRef,
  dialogueMode = false,
  snapDialogueCamera = false,
  cameraStyle = 'auto',
  blockers,
  seatRadius = 4,
  seatCount = 9,
  indoor = false,
  roomBounds,
}) => {
  const { camera } = useThree();

  /**
   * 视场角按"这一幕要交代什么"来定，不是一格固定值：
   *
   * - 全景（室内）：66°。52° 在 12.4m 处只能拍到 9.0m 高，柱头（9.6）和檐口（10.8）
   *   全在画面上沿之外，柱廊看起来像几根光杆撑着天；再想靠抬高机位补救，人就变成俯视了。
   * - 营地：52°（户外本来就要看宽，也没有墙顶要交代）。
   *
   * 发言镜头**不要**收窄：试过 46°，邻座反而更大 —— 邻座离机位 3.7m、发言人 5.7m，
   * 收窄只是把整个画面一起缩小，近的那个占屏比例反而从 43% 涨到 51%。
   * 真正的解法是把机位往中心挪（见 getDialoguePose），让两者的距离拉平。
   */
  React.useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const want = indoor ? 66 : 52;
    if (cam.isPerspectiveCamera && Math.abs(cam.fov - want) > 1e-6) {
      cam.fov = want;
      cam.updateProjectionMatrix();
    }
  }, [camera, indoor, dialogueMode]);
  // 调试探针：compare3d/_camera-probe.mjs 用它量机位轨迹（仅 dev 构建挂载，不影响生产）
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    (window as unknown as { __rpgCam?: unknown }).__rpgCam = camera;
    return () => { delete (window as unknown as { __rpgCam?: unknown }).__rpgCam; };
  }, [camera]);
  const targetPos = useRef(new THREE.Vector3(0, 5, 8));
  const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const currentLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const transitionStartPos = useRef(new THREE.Vector3());
  const transitionStartLookAt = useRef(new THREE.Vector3());
  const transitionElapsed = useRef(0);
  const transitionDuration = useRef(OVERVIEW_TRANSITION_SECONDS);
  const orbitAngle = useRef(0.9);
  const dollyElapsed = useRef(0);
  const idleElapsed = useRef(0);
  const campTarget = useRef(new THREE.Vector3(0, 1.6, 0));
  /** 是否处在巡游状态（上一帧）；从非巡游进入巡游要混合，否则机位会瞬移 */
  const patrolActiveRef = useRef(false);
  const prevStyleRef = useRef(cameraStyle);
  const patrolBlend = useRef(1);
  const patrolBlendStartPos = useRef(new THREE.Vector3());
  const patrolBlendStartLook = useRef(new THREE.Vector3());
  const desiredPos = useRef(new THREE.Vector3());
  const blendedLook = useRef(new THREE.Vector3());
  /** 避让系数（1=不缩），收进去快、退出来慢，避免在挡物边缘来回抽 */
  const clearanceRef = useRef(1);
  const orbitParams = getOrbitParams(cameraStyle, indoor);
  const styled = isOrbitStyle(cameraStyle);

  // Update target when focus changes
  useEffect(() => {
    if (manualControlActive) return;
    // 巡游类镜头由 useFrame 连续运镜接管;仅对话镜头出现时切到特写过渡
    if (styled && !dialogueMode) return;
    transitionStartPos.current.copy(camera.position);
    transitionStartLookAt.current.copy(currentLookAt.current);
    transitionDuration.current = dialogueMode
      ? DIALOGUE_TRANSITION_SECONDS
      : OVERVIEW_TRANSITION_SECONDS;
    // 减弱动态:起点即终点,首帧渲染就位(等效瞬间完成,不播插值)
    transitionElapsed.current = prefersReducedMotion ? transitionDuration.current : 0;
    const activeFocus = getDirectorFocus({
      speaker: focusSeatX === null || focusSeatZ === null ? null : { x: focusSeatX, z: focusSeatZ },
      event: dialogueMode || eventFocusX === null || eventFocusZ === null ? null : { x: eventFocusX, z: eventFocusZ },
    });
    if (!activeFocus) {
      const overview = getOverviewCameraPose(isNight, indoor, seatRadius);
      targetPos.current.set(overview.position.x, overview.position.y, overview.position.z);
      targetLookAt.current.set(overview.target.x, overview.target.y, overview.target.z);
      return;
    }
    const focus = getCameraFocusTarget({ seatX: activeFocus.x, seatZ: activeFocus.z, isNight });
    // 发言镜头：正面机位 —— 与发言人同一条半径线、脸的正前方 2.6m 中景（见 getDialoguePose 的注释）。
    // 中央的火堆/祭坛整个落在机位背后，不会糊在镜头前。
    if (dialogueMode) {
      const pose = getDialoguePose({ x: focus.x, z: focus.z }, seatRadius, seatCount);
      targetPos.current.set(pose.position.x, pose.position.y, pose.position.z);
      targetLookAt.current.set(pose.look.x, pose.look.y, pose.look.z);
    } else {
      targetLookAt.current.set(focus.x, focus.y, focus.z);
      const angle = Math.atan2(focus.z, focus.x);
      targetPos.current.set(
        focus.x + Math.cos(angle) * 7,
        5,
        focus.z + Math.sin(angle) * 7,
      );
    }
    /**
     * 避挡只对全景/事件镜头生效，**对话镜头不参与**。
     * 正面对话机位（半径 1.4m）到发言人的视线段离中轴最近也有 1.4m，而祭坛
     * 避挡判据是"俯视圆 1.9 + 0.7 余量 = 2.6"——从旁边擦过的视线会被误判成遮挡，
     * 把机位一路拉到脸上；事实上火/祭坛整个在正面机位的**背后**，根本不需要避挡。
     */
    if (blockers?.length && !dialogueMode) {
      const clear = applyClearance(
        targetLookAt.current,
        targetPos.current,
        getClearanceFactor(targetLookAt.current, targetPos.current, blockers),
      );
      targetPos.current.set(clear.x, clear.y, clear.z);
    }
    if ((dialogueMode && snapDialogueCamera) || prefersReducedMotion) {
      camera.position.copy(targetPos.current);
      currentLookAt.current.copy(targetLookAt.current);
      transitionStartPos.current.copy(targetPos.current);
      transitionStartLookAt.current.copy(targetLookAt.current);
      transitionElapsed.current = transitionDuration.current;
      const controls = controlsRef?.current;
      if (controls) controls.target.copy(targetLookAt.current);
      camera.lookAt(targetLookAt.current);
    }
  }, [camera, controlsRef, dialogueMode, eventFocusX, eventFocusZ, focusSeatX, focusSeatZ, isNight, manualControlActive, snapDialogueCamera, styled]);

  useFrame((_, delta) => {
    // 调试探针：compare3d/_crypt-shots.mjs 用它在 dev 下摆固定机位截图
    // （导演每帧都在改相机，不接管就永远拍不到指定角度）。仅 dev 构建生效。
    if (import.meta.env.DEV) {
      const forced = (window as unknown as {
        __rpgCamPose?: { pos: [number, number, number]; look: [number, number, number] };
      }).__rpgCamPose;
      if (forced) {
        camera.position.set(forced.pos[0], forced.pos[1], forced.pos[2]);
        camera.lookAt(forced.look[0], forced.look[1], forced.look[2]);
        const ctrl = controlsRef?.current;
        if (ctrl) ctrl.target.set(forced.look[0], forced.look[1], forced.look[2]);
        return;
      }
    }
    /** 室内边界：穿墙/钻穹顶一律夹回来（手拖、巡游、导播三条路都覆盖） */
    const clampToRoom = () => {
      if (!roomBounds) return;
      const c = clampCameraToRoom(camera.position, roomBounds);
      if (c.x !== camera.position.x || c.y !== camera.position.y || c.z !== camera.position.z) {
        camera.position.set(c.x, c.y, c.z);
      }
    };
    const controls = controlsRef?.current;
    // 巡游类镜头:连续运镜;对话镜头时让位,结束后从当前方位角续接
    if (styled && orbitParams && !manualControlActive) {
      if (dialogueMode) {
        // 对话期间机位由下面的过渡接管,巡游态先记为「未激活」,对话结束才算重新进入
        patrolActiveRef.current = false;
      } else {
        const styleChanged = prevStyleRef.current !== cameraStyle;
        prevStyleRef.current = cameraStyle;
        if (!patrolActiveRef.current || styleChanged) {
          // 三条进入巡游的路:换运镜方式、手拖 8 秒后恢复、对话结束。
          // 三条都从「当前机位」起步混合过去——巡游每帧自己算机位,不混合就是一次瞬移。
          patrolBlendStartPos.current.copy(camera.position);
          patrolBlendStartLook.current.copy(currentLookAt.current);
          orbitAngle.current = Math.atan2(camera.position.z, camera.position.x);
          patrolBlend.current = prefersReducedMotion ? 1 : 0;
          patrolActiveRef.current = true;
        }
        // 减弱动态:方位角/时间轴不推进,机位每帧重算但停在同一视点(可见、不巡游)
        if (cameraStyle === 'dolly') {
          if (!prefersReducedMotion) {
            dollyElapsed.current += delta;
            orbitAngle.current += delta * orbitParams.speed;
          }
          const { radius, height } = getDollyOffset(dollyElapsed.current, indoor);
          desiredPos.current.set(
            Math.cos(orbitAngle.current) * radius,
            height,
            Math.sin(orbitAngle.current) * radius,
          );
        } else {
          if (!prefersReducedMotion) {
            orbitAngle.current += delta * orbitParams.speed;
          }
          desiredPos.current.set(
            Math.cos(orbitAngle.current) * orbitParams.radius,
            orbitParams.height,
            Math.sin(orbitAngle.current) * orbitParams.radius,
          );
        }
        patrolBlend.current = Math.min(1, patrolBlend.current + delta / PATROL_BLEND_SECONDS);
        const t = patrolBlend.current;
        const eased = t * t * (3 - 2 * t);
        camera.position.copy(patrolBlendStartPos.current).lerp(desiredPos.current, eased);
        if (t < 1) {
          blendedLook.current.copy(patrolBlendStartLook.current).lerp(campTarget.current, eased);
          currentLookAt.current.copy(blendedLook.current);
        } else {
          currentLookAt.current.lerp(campTarget.current, 0.12);
        }
        camera.lookAt(currentLookAt.current);
        if (controls) controls.target.copy(currentLookAt.current);
        return;
      }
    } else {
      patrolActiveRef.current = false;
      if (!styled) prevStyleRef.current = cameraStyle;
    }
    if (manualControlActive) {
      // OrbitControls 每帧从 camera.position 重新解算球坐标，所以这里改完不会被它拉回去，
      // 玩家继续往外拉时表现为"被墙挡住"。
      clampToRoom();
      return;
    }
    transitionElapsed.current = Math.min(
      transitionDuration.current,
      transitionElapsed.current + delta,
    );
    const linear = transitionElapsed.current / transitionDuration.current;
    const eased = linear * linear * (3 - 2 * linear);
    camera.position.lerpVectors(transitionStartPos.current, targetPos.current, eased);
    currentLookAt.current.lerpVectors(transitionStartLookAt.current, targetLookAt.current, eased);
    // 自动导播在「没人说话」的空档会长时间定在全景上，静止到像卡住了。
    // 过渡走完后给一点极缓的游移（±3°、±0.2m，20 秒一个来回），只在不做特写时生效。
    if (!styled && !dialogueMode && !prefersReducedMotion && transitionElapsed.current >= transitionDuration.current) {
      idleElapsed.current += delta;
      const angle = Math.atan2(camera.position.z, camera.position.x) + Math.sin(idleElapsed.current * 0.26) * 0.05;
      const radius = Math.hypot(camera.position.x, camera.position.z);
      camera.position.x = Math.cos(angle) * radius;
      camera.position.z = Math.sin(angle) * radius;
      camera.position.y += Math.sin(idleElapsed.current * 0.19) * 0.2;
    }
    // 机位绕到木屋/瞭望塔背后时把镜头拉近：宁可贴一点，也不要隔着木板看营火。
    // 只缩不转，方向保持原样，所以看起来像"往前凑一步"而不是换镜头。
    //
    // 对话镜头同样排除在外（和上面 effect 里那条一致）：正面机位与发言人同在一条
    // 半径线上，视线段离中轴最近 1.4m，会被祭坛的 2.6m 避挡圆误判，把镜头怼到脸上。
    // 而火/祭坛在正面机位背后，本来就无需避挡。
    if (!manualControlActive && !dialogueMode && blockers?.length) {
      const wanted = getClearanceFactor(currentLookAt.current, camera.position, blockers);
      const cur = clearanceRef.current;
      const k = 1 - Math.exp(-delta * (wanted < cur ? 18 : 5));
      clearanceRef.current = cur + (wanted - cur) * k;
      if (clearanceRef.current < 0.999) {
        const pulled = applyClearance(currentLookAt.current, camera.position, clearanceRef.current);
        camera.position.set(pulled.x, pulled.y, pulled.z);
      }
    } else {
      clearanceRef.current = 1;
    }
    clampToRoom();
    if (import.meta.env.DEV) {
      // 调试探针：compare3d/_crypt-dialogue-shot.mjs 用它核对"算出来的机位"和"真正渲染的机位"
      (window as unknown as { __rpgPose?: unknown }).__rpgPose = {
        seatRadius, seatCount, indoor, dialogueMode,
        focus: [focusSeatX, focusSeatZ],
        target: targetPos.current.toArray().map(n => +n.toFixed(2)),
        snap: snapDialogueCamera,
        elapsed: +transitionElapsed.current.toFixed(3),
        dur: transitionDuration.current,
        start: transitionStartPos.current.toArray().map(n => +n.toFixed(2)),
        cam: camera.position.toArray().map(n => +n.toFixed(2)),
        look: targetLookAt.current.toArray().map(n => +n.toFixed(2)),
      };
    }
    // OrbitControls is disabled while the director owns the camera, so this
    // is the only update path and cannot fight Drei's own frame update.
    if (controls) controls.target.copy(currentLookAt.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

SceneDirector.displayName = 'SceneDirector';
