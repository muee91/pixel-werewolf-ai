# 体素 RPG 3D 篝火议会 Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement. 当前项目没有 Git 元数据；每个任务以测试通过和修改范围审计代替提交。

**Goal:** 新增可切换、可完整参与狼人杀的 3D 森林篝火议会，同时保持经典 2D、规则引擎、多人同步和角色隐私不变。

**Architecture:** `GameRoomView` 懒加载独立的 `VoxelRpgRoom`。3D 场景从 `useGameRoomState` 获取经过现有权限边界处理的状态，纯场景模型负责座位、镜头和视觉描述，RPG HUD 与 `HumanInputPanel` 共享预选目标但不新增提交协议。

**Tech Stack:** React 19、Jotai、TypeScript、Three.js、React Three Fiber、Drei、Tailwind CSS、Node Test、Playwright。

---

### Task 1: 3D 模式配置契约

**Files:**
- Modify: `src/themes/types.ts`
- Modify: `src/atoms.ts`
- Modify: `src/components/InGameStyleSwitcher.tsx`
- Test: `scripts/tests/ui-config.test.ts`

**Step 1: Write the failing test**

测试旧版持久化 UI 配置缺少 `gameViewMode` 时归一化为 `2d`，显式设置 `3d` 时保持不变。

**Step 2: Run test — confirm it fails**

Command: `npx tsx --test scripts/tests/ui-config.test.ts`
Expected: FAIL — `normalizeUiConfig` 未导出或缺少 `gameViewMode`。

**Step 3: Write minimal implementation**

新增：

```ts
export type GameViewMode = '2d' | '3d';

export interface UIConfig {
  // existing fields
  gameViewMode: GameViewMode;
}
```

`normalizeUiConfig` 合并默认值并保留合法配置。对局外观面板新增“经典 2D / 3D RPG”切换。

**Step 4: Run test — confirm it passes**

Command: `npx tsx --test scripts/tests/ui-config.test.ts && npm run typecheck`
Expected: PASS。

### Task 2: 可测试的 3D 场景模型

**Files:**
- Create: `src/components/game/voxel3d/sceneModel.ts`
- Test: `scripts/tests/voxel-scene-model.test.ts`

**Step 1: Write the failing tests**

覆盖：8–12 人圆形排座无重叠、当前发言者镜头目标、昼夜光照配置、未知角色视觉不依赖真实身份、死亡状态返回墓碑描述。

**Step 2: Run test — confirm it fails**

Command: `npx tsx --test scripts/tests/voxel-scene-model.test.ts`
Expected: FAIL — 模块不存在。

**Step 3: Write minimal implementation**

导出 `buildSeatPlacements`、`buildVisibleAvatarDescriptor`、`getLightingPreset`、`getCameraFocusTarget`。函数只接收显式可见字段，禁止读取隐藏身份。

**Step 4: Run test — confirm it passes**

Command: `npx tsx --test scripts/tests/voxel-scene-model.test.ts`
Expected: PASS。

### Task 3: 森林营地与体素角色

**Files:**
- Create: `src/components/game/voxel3d/ForestCampScene.tsx`
- Create: `src/components/game/voxel3d/VoxelCharacter.tsx`
- Create: `src/components/game/voxel3d/SceneDirector.tsx`
- Create: `src/components/game/voxel3d/WorldEffects.tsx`

**Step 1: Run scene model tests before production code**

Command: `npx tsx --test scripts/tests/voxel-scene-model.test.ts`
Expected: PASS；这些测试固定场景组件依赖的数据契约。

**Step 2: Implement minimal scene**

创建低面数森林地面、树木、木屋、火把和动态篝火。按 `buildSeatPlacements` 渲染 NPC；死亡显示墓碑；发言者显示光圈和气泡锚点。点击 NPC 回调玩家 ID。

**Step 3: Implement smart camera**

`SceneDirector` 在发言者或关键阶段变化时补间到目标；OrbitControls 的 `start` 事件记录临时手动控制，新的关键事件重新取得导演权。

**Step 4: Verify**

Command: `npm run typecheck && npm run build`
Expected: PASS，无 WebGL 资源警告。

### Task 4: RPG HUD 与世界目标桥接

**Files:**
- Modify: `src/atoms.ts`
- Modify: `src/components/HumanInputPanel.tsx`
- Create: `src/components/game/voxel3d/RpgHud.tsx`
- Test: `scripts/tests/world-target.test.ts`

**Step 1: Write the failing test**

测试世界点击只在目标属于当前合法候选集合时预选，并在阶段/当前行动人变化后清空。

**Step 2: Run test — confirm it fails**

Command: `npx tsx --test scripts/tests/world-target.test.ts`
Expected: FAIL — 目标桥接函数或 atom 不存在。

**Step 3: Implement minimal bridge and HUD**

新增 `worldTargetAtom` 和纯函数 `resolveWorldTargetSelection`。`HumanInputPanel` 读取合法世界目标后更新本地 `targetId`。`RpgHud` 展示任务、阶段、存活人数、玩家队伍、当前发言和可折叠日志。

**Step 4: Verify**

Command: `npx tsx --test scripts/tests/world-target.test.ts && npm run typecheck`
Expected: PASS。

### Task 5: 页面组合、懒加载与错误回退

**Files:**
- Create: `src/components/game/voxel3d/VoxelRpgRoom.tsx`
- Create: `src/components/game/voxel3d/ThreeSceneErrorBoundary.tsx`
- Modify: `src/components/GameRoomView.tsx`
- Modify: `src/components/SettingsView.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Install dependencies**

Command: `npm install three @react-three/fiber @react-three/drei && npm install -D @types/three`
Expected: 安装成功，`npm audit` 为 0 漏洞。

**Step 2: Implement lazy composition**

`GameRoomView` 仅在 `gameViewMode === '3d'` 时 import `VoxelRpgRoom`。加载态显示“正在生成世界”。错误边界提供“返回经典 2D”，并写回持久化配置。

**Step 3: Verify chunks**

Command: `npm run build`
Expected: PASS，构建产物包含独立 3D chunk，经典入口不静态导入 3D 页面。

### Task 6: 3D 对局 E2E 与隐私回归

**Files:**
- Create: `scripts/e2e/voxel-3d.spec.ts`
- Modify: `scripts/e2e/multiplayer.spec.ts` only if a shared helper is required

**Step 1: Write the failing E2E**

覆盖进入对局、切换 3D、Canvas/HUD 可见、未知身份仍遮罩、暂停提示、切回 2D。模型请求使用现有确定性拦截。

**Step 2: Run test — confirm it fails before integration**

Command: `npx playwright test scripts/e2e/voxel-3d.spec.ts`
Expected: FAIL — 3D 切换或 Canvas 不存在。

**Step 3: Complete integration**

修正测试揭示的确定性接线问题，不扩大功能范围。

**Step 4: Full verification**

Command: `npm run typecheck && npm test && npm run build && npm run test:e2e && npm audit`
Expected: 全部通过，0 漏洞。

### Task 7: 审计与交付

**Files:**
- Review all files listed above

**Step 1: Spec review**

确认实现满足设计文档全部验收项，没有自由移动、地图二/三或规则层改动。

**Step 2: Quality review**

检查 Three.js 资源释放、重复材质、React hook 生命周期、角色隐私、移动端布局和降级路径。

**Step 3: Final report**

说明影响范围、验证方法、性能和 WebGL 风险；不执行 Git 或 APK 操作。
