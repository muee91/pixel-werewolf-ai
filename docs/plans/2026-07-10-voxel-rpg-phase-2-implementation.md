# 体素 RPG 第二阶段 Implementation Plan

> 采用 TDD；每项先写失败测试，再实现。设计与权限策略由主模型负责，外部智能体只执行明确任务。不得使用 Paseo、Git、worktree 或 APK。

## Task 1：技能事件与权限纯模型

**Files**
- Create: `src/components/game/voxel3d/skillEffectModel.ts`
- Create: `scripts/tests/skill-effect-model.test.ts`

建立 16 职业配置、阶段到职业映射、公开事件识别、可见日志目标解析和 `neutral / role / omniscient` 裁剪。测试所有职业覆盖、普通视角无施法者/目标/职业色、行动者只能看自己的专属事件、上帝模式看全部、重连不重播所需的稳定事件 ID。

## Task 2：时间线 Hook 与一次性事件生命周期

**Files**
- Create: `src/components/game/voxel3d/useSkillEffectTimeline.ts`
- Modify: `src/components/game/voxel3d/VoxelRpgRoom.tsx`
- Test: `scripts/tests/skill-effect-timeline.test.ts`

只消费新增的权限裁剪日志。初次挂载把历史日志设为已见；新增日志生成事件，按持续时间到期，阶段变化只更新环境事件。限制并发事件数，清理全部定时器。

## Task 3：全职业 3D 技能渲染

**Files**
- Create: `src/components/game/voxel3d/SkillEffects.tsx`
- Modify: `src/components/game/voxel3d/ForestCampScene.tsx`
- Modify: `src/components/game/voxel3d/SceneDirector.tsx`

用共享几何体和材质配置渲染光环、射线、护盾、符文、冲击波与粒子。根据效果等级限制粒子和动态光。事件镜头只使用已授权的施法者/目标座位。

## Task 4：程序化环境音与技能音

**Files**
- Create: `src/components/game/voxel3d/voxelAudio.ts`
- Create: `src/components/game/voxel3d/useVoxelAudio.ts`
- Modify: `src/themes/types.ts`
- Modify: `src/atoms.ts`
- Modify: `src/components/game/voxel3d/RpgHud.tsx`
- Test: `scripts/tests/voxel-audio.test.ts`
- Modify: `scripts/tests/ui-config.test.ts`

加入持久化环境音/技能音开关和世界音量。Web Audio 在用户手势后解锁；合成环境循环和每类技能提示；未授权事件只播放中性提示。测试配置映射、音效路由和无 AudioContext 降级。

## Task 5：角色动作、状态反馈和昼夜过场

**Files**
- Modify: `src/components/game/voxel3d/VoxelCharacter.tsx`
- Modify: `src/components/game/voxel3d/WorldEffects.tsx`
- Create: `src/components/game/voxel3d/PhaseTransitionOverlay.tsx`
- Modify: `src/components/game/voxel3d/VoxelRpgRoom.tsx`

增加待机、发言、施法、受击与死亡过渡；昼夜混色、雾与阶段标题。动画不得读取隐藏身份。

## Task 6：隐私、移动端与多人 E2E

**Files**
- Modify: `scripts/e2e/voxel-3d.spec.ts`
- Modify: `scripts/e2e/multiplayer.spec.ts`

验证普通视角只出现中性事件、当前行动者专属事件可见、上帝模式完整事件可见、移动端 HUD 和声音控制可用、重连不重播、2D 切回与多人 ACK 不受影响。

## Task 7：性能和完整交付审计

运行：

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
```

检查独立 3D chunk、共享资源生命周期、定时器/AudioContext 清理、桌面和移动端 Canvas 像素、环绕镜头交互、WebGL/Web Audio 降级。报告影响范围、验证方法和风险。
