# 3D 角色模型（KayKit Adventurers + Skeletons）

`public/models/kaykit/*.glb` 不是原包，是 `scripts/build-kaykit-assets.mjs` 裁出来的运行时版本。
九只：活人 5（骑士/法师/盗贼/兜帽盗贼/蛮人）+ 亡灵 4（骷髅战士/骷髅盗贼/骷髅法师/骷髅小兵）。

## 来源与授权

- 素材：[KayKit – Character Pack: Adventurers 1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
- 素材：[KayKit – Character Pack: Skeletons 1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)
- 授权：**CC0 1.0 Universal**（公有领域，可商用、可修改、可再分发，无需署名）
- 作者：Kay Lousberg（KayKit）。CC0 不要求署名，这里是出于尊重。

两个包**共用同一副 41 骨骨架**（关节名与顺序逐一相同），所以亡灵不需要自己的动画，
直接读 Knight 上那一份。这是合并的前提，脚本每次运行都会断言。

## 为什么要裁

原包九只各 3.5~4.6 MB（合计 35.6 MB），其中：

- **1.27 MB × 9 是同一套动画**（Adventurers 76 段 / Skeletons 95 段，主要部分同名）；
- 1.9 MB × 9 是这些动画的 accessor JSON；
- 每只角色把身体拆成 6 段 SkinnedMesh，外加 9 个手持武器/盾牌节点**同时可见**
  （骑士一次挂着副手剑 + 3 面盾 + 单手剑 + 双手剑）。

裁完之后合计 **2.8 MB**，每只 2~4 个网格节点（骷髅多一段：眼睛是独立的 `Glow` 材质）。

## 怎么重新生成

```bash
# 1. 取两个原包（CC0，直接 clone 即可）
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 /tmp/kaykit
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 /tmp/kaykit-skel

# 2. 生成（第二个参数省略时只做活人五只）
node scripts/build-kaykit-assets.mjs \
  /tmp/kaykit/addons/kaykit_character_pack_adventures/Characters/gltf \
  /tmp/kaykit-skel/addons/kaykit_character_pack_skeletons/Characters/gltf
```

脚本做五件事，每一步的取舍都写在脚本注释里：

| 步骤 | 处理 | 效果 |
| --- | --- | --- |
| 合并蒙皮 | 同材质的身体段拼成一个 SkinnedMesh（按材质分组） | 12 个座位 draw call 从 300 降到 ~50 |
| 挑附件 | 只留头盔/帽子/兜帽/披风，不留手持武器 | 原包武器是按瞄准姿态做的，待机时会横着怼脸；围营火也不该人人提着刀 |
| 收动画 | 只留 10 段用得上的 clip，只存在 Knight 上 | 1.9 MB × 9 JSON → 0.3 MB |
| 去根位移 | 删掉 `root.translation` 轨道 | 否则播施法/倒地时整排人会往前滑 |
| 断骨架 | 每只都与 Knight 比对关节名与顺序 | 上游改版换了骨架会在这里炸，而不是在运行时把人拧成麻花 |

## 运行时约定（改脚本时要同步）

- `src/components/game/voxel3d/kaykitModel.ts` 里的 `CLIP_FOR_STATE` 必须与脚本的 `KEEP_CLIPS` 对得上；
- 九只模型共用 Knight 的动画，前提是**骨架同名同序**（脚本和测试都会断言）；
- 模型脚底在 `y=0`，身高 2.19~2.32，代码里统一乘 `KAYKIT_SCALE = 0.88`；
- 亡灵用单独的提亮倍数（`KAYKIT_BRIGHTNESS_UNDEAD`）：骨头贴图本来就浅，按活人的 3 倍会烧成白块；
- `Glow` 材质（骷髅眼睛）**不参与染色**，否则会被主色盖掉、再被提亮烧成白点。
