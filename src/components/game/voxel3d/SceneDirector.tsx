import React, { useRef, useEffect, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getCameraFocusTarget, getOverviewCameraPose } from './sceneModel';
import { getDirectorFocus, getDollyOffset, getOrbitParams, isOrbitStyle, type CameraStyle } from './cameraDirectorModel';

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
}

const OVERVIEW_TRANSITION_SECONDS = 1.05;
const DIALOGUE_TRANSITION_SECONDS = 1.25;

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
}) => {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 5, 8));
  const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const currentLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const transitionStartPos = useRef(new THREE.Vector3());
  const transitionStartLookAt = useRef(new THREE.Vector3());
  const transitionElapsed = useRef(0);
  const transitionDuration = useRef(OVERVIEW_TRANSITION_SECONDS);
  const orbitAngle = useRef(0.9);
  const dollyElapsed = useRef(0);
  const campTarget = useRef(new THREE.Vector3(0, 1.6, 0));
  /** 巡游镜头在对话镜头结束后从此刻方位角续接,避免跳变 */
  const prevDialogueRef = useRef(dialogueMode);
  const orbitParams = getOrbitParams(cameraStyle);
  const styled = isOrbitStyle(cameraStyle);
  const directed = !manualControlActive; // 自动导播与巡游的对话镜头共用同一条过渡通路

  // Update target when focus changes
  useEffect(() => {
    if (manualControlActive) return;
    // 巡游类镜头由 useFrame 连续运镜接管;仅对话镜头出现时切到特写过渡
    if (styled && !dialogueMode) return;
    transitionStartPos.current.copy(camera.position);
    transitionStartLookAt.current.copy(currentLookAt.current);
    transitionElapsed.current = 0;
    transitionDuration.current = dialogueMode
      ? DIALOGUE_TRANSITION_SECONDS
      : OVERVIEW_TRANSITION_SECONDS;
    const activeFocus = getDirectorFocus({
      speaker: focusSeatX === null || focusSeatZ === null ? null : { x: focusSeatX, z: focusSeatZ },
      event: dialogueMode || eventFocusX === null || eventFocusZ === null ? null : { x: eventFocusX, z: eventFocusZ },
    });
    if (!activeFocus) {
      const overview = getOverviewCameraPose(isNight);
      targetPos.current.set(overview.position.x, overview.position.y, overview.position.z);
      targetLookAt.current.set(overview.target.x, overview.target.y, overview.target.z);
      return;
    }
    const focus = getCameraFocusTarget({ seatX: activeFocus.x, seatZ: activeFocus.z, isNight });
    targetLookAt.current.set(focus.x, dialogueMode ? 1.25 : focus.y, focus.z);
    // Camera position: elevated and pulled back from the focus point
    const dx = focus.x;
    const dz = focus.z;
    const dist = dialogueMode ? 3.4 : 7;
    const angle = Math.atan2(dz, dx);
    const direction = dialogueMode ? -1 : 1;
    targetPos.current.set(
      focus.x + Math.cos(angle) * dist * direction,
      dialogueMode ? 2.25 : 5,
      focus.z + Math.sin(angle) * dist * direction,
    );
    if (dialogueMode && snapDialogueCamera) {
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
    const controls = controlsRef?.current;
    // 巡游类镜头:连续运镜;对话镜头时让位,结束后从当前方位角续接
    if (styled && orbitParams && !manualControlActive) {
      if (dialogueMode) {
        prevDialogueRef.current = true;
      } else {
        if (prevDialogueRef.current) {
          // 对话刚结束:从当前机位续接巡游,避免硬切
          orbitAngle.current = Math.atan2(camera.position.z, camera.position.x);
        }
        prevDialogueRef.current = false;
        if (cameraStyle === 'dolly') {
          dollyElapsed.current += delta;
          orbitAngle.current += delta * orbitParams.speed;
          const { radius, height } = getDollyOffset(dollyElapsed.current);
          camera.position.set(
            Math.cos(orbitAngle.current) * radius,
            height,
            Math.sin(orbitAngle.current) * radius,
          );
        } else {
          orbitAngle.current += delta * orbitParams.speed;
          camera.position.set(
            Math.cos(orbitAngle.current) * orbitParams.radius,
            orbitParams.height,
            Math.sin(orbitAngle.current) * orbitParams.radius,
          );
        }
        currentLookAt.current.lerp(campTarget.current, 0.12);
        camera.lookAt(currentLookAt.current);
        if (controls) controls.target.copy(currentLookAt.current);
        return;
      }
    } else if (styled) {
      prevDialogueRef.current = dialogueMode;
    }
    if (manualControlActive) return;
    transitionElapsed.current = Math.min(
      transitionDuration.current,
      transitionElapsed.current + delta,
    );
    const linear = transitionElapsed.current / transitionDuration.current;
    const eased = linear * linear * (3 - 2 * linear);
    camera.position.lerpVectors(transitionStartPos.current, targetPos.current, eased);
    currentLookAt.current.lerpVectors(transitionStartLookAt.current, targetLookAt.current, eased);
    // OrbitControls is disabled while the director owns the camera, so this
    // is the only update path and cannot fight Drei's own frame update.
    if (controls) controls.target.copy(currentLookAt.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

SceneDirector.displayName = 'SceneDirector';
