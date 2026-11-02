# 营地道具模型（KayKit Dungeon Remastered）

`public/models/kaykit-props/*.glb` 是原包的 `.gltf.glb` 直接改名而来，没有改动内容。

## 来源与授权

- 素材：[KayKit – Dungeon Remastered 1.0](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0)
- 授权：**CC0 1.0 Universal**（公有领域：可商用、可修改、可再分发，无需署名）
- 作者：Kay Lousberg（KayKit）。CC0 不要求署名，这里写明是出于尊重。

## 目前用到的 10 件

`barrel_large`、`barrel_small_stack`、`crates_stacked`、`keg`、`chest`、
`trunk_medium_A`、`table_small`、`stool`、`torch_lit`、`banner_red`

合计约 630 KB（单件 24~101 KB，贴图烘焙在 GLB 内）。

## 为什么用这套

跟角色模型（`public/models/kaykit/`）同一位作者、同一张渐变贴图，
放进同一个方块场景里不会出现"两种画风并排"的割裂感。

尺寸不写死：`KayKitProps.tsx` 读包围盒后按"目标高度 / 原始高度"换算比例，
所以每件道具只需要在布局表里声明想要多高（见 `ForestCampScene.tsx` 的 `CAMP_PROP_SPECS`）。

## 想加更多

其余 200+ 件的文件名见原包 `Assets/gltf/`（墙、地砖、楼梯、桌椅、瓶子、金币、旗帜…）。
加一件 = 拷一个 `.glb` 进来 + 在 `KAYKIT_PROP_NAMES` 与布局表里各加一行。
