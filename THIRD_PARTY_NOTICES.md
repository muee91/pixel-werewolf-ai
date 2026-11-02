# Third-party notices

本项目的游戏逻辑、界面代码、服务端代码与**全部像素美术**均由项目作者维护与原创。下列内容说明第三方素材、模型与服务的来源和适用条款。

## 像素素材：项目原创，程序化生成

- 道具、头像、方块贴图的源数据由生成脚本产出：`npm run gen:art`（`scripts/gen-pixel-art.ts` → `src/components/game/voxel/primitives/camp-tiles.ts`、`src/components/game/voxel3d/camp-blocks.ts`）。
- App 图标同样由脚本合成：`npm run gen:icon`（`scripts/gen-app-icon.ts` → `build/icon.icns`、`build/icon-1024.png`）。
- 其中 **3 个 2D 道具图标**（药瓶 `potion`、心形 `heart`、骨头/死亡标记 `bone`）、**2 个手持物**（剑 `sword`、弓 `bow`）与 **2 套 2D 角色形象**（骑士 `charA`、精灵 `charB`，各 4 帧待机）取自 **0x72 DungeonTileset II v1.7**（CC0，公有领域）：来源、版本、许可依据与"哪些帧、为什么是 16×28 槽位"记录在 `assets-src/0x72_DungeonTilesetII_v1.7/README.md`，生成脚本把它们量化进 `palette + rows`，运行时不依赖任何 PNG 文件。其余像素仍为项目程序化生成。
- 改风格请改生成器参数（材质色阶、光照方向、噪声种子）或 `EXTERNAL` 覆盖表，不要手改生成的 `.ts` 数据文件，以保证任何人 `npm run gen:art` 可复现同一份美术。
- 说明：早期版本曾内嵌从 Minecraft 资源整理的逐像素贴图与图标。因 Minecraft 素材受 Mojang EULA 约束、不允许再分发，相关数据与文件已全部删除并替换为上述原创生成素材。本项目与 Mojang、Microsoft 无任何隶属、赞助或授权关系。

## Fusion Pixel 字体

`src/assets/fonts/fusion-pixel-12px-zh_hans.woff2` 来自 [TakWolf/fusion-pixel-font](https://github.com/TakWolf/fusion-pixel-font)，按 **SIL Open Font License 1.1** 分发，完整许可证文本保存在 `src/assets/fonts/Fusion-Pixel-OFL.txt`。字体未经修改（若将来做子集化或改字形，须按 OFL 的 Reserved Font Name 规则改名）。

## 3D 角色与道具模型（KayKit，CC0）

- 角色：`public/models/kaykit/*.glb` 取自 KayKit **Character Pack: Adventurers 1.0** 与 **Skeletons 1.0**，
  经 `scripts/build-kaykit-assets.mjs` 裁剪打包（35.6 MB → 2.8 MB）；来源与裁剪依据见同目录 `README.md`。
- 道具：`public/models/kaykit-props/*.glb` 取自 KayKit **Dungeon Remastered 1.0**（10 件，约 630 KB）。
- 两套均由 **Kay Lousberg（KayKit）** 制作，授权 **CC0 1.0 Universal**：公有领域，可商用、可修改、可再分发，
  不要求署名。此处署名出于尊重。
- 3D 场景的地形、方块贴图、天空与光照仍由本项目程序化生成，不依赖第三方贴图。

## 模型与语音服务（用户自带，不随仓库分发）

- **内置离线小模型**：`src/services/builtinLlm.ts` 在玩家主动点击后从 ModelScope / HuggingFace 运行时下载 `Qwen2.5-0.5B-Instruct` GGUF（Apache-2.0）。**权重不在本仓库内**，本项目不重新分发模型。
- **模型 API**：玩家自带 Key（OpenAI 兼容端点 / Gemini / 本机 Ollama、LM Studio 等）。本项目不代理、不转售、不内置任何云端默认模型；使用第三方模型服务由玩家自行接受其服务条款。
- **Edge TTS**：`server/main.py`（Python `edge-tts`）与 `electron/edge-tts.cjs` 调用微软的非公开语音端点。第三方客户端属于社区实现，**随时可能失效，无 SLA**；`edge-tts` 包本身为 MIT，但微软服务条款并不认可第三方自动化调用，请自行评估。语音关闭时游戏完全可玩。

## 代码依赖许可

全部直接依赖均为 **MIT 或 Apache-2.0**，无 GPL/LGPL/AGPL 等 copyleft 依赖（截至 2026-10-25 扫描 35 个 dependencies + devDependencies 的结果）。摘要：

| 许可 | 依赖 |
|---|---|
| Apache-2.0 | `@google/genai`、`typescript`、`@playwright/test`、`idb-keyval` |
| MIT | `react`、`react-dom`、`jotai`、`clsx`、`three`、`@react-three/fiber`、`@react-three/drei`、`ws`、`bonjour-service`、`@wllama/wllama`、`@capacitor/*`、`@capawesome/capacitor-file-picker`、`vite`、`@vitejs/plugin-react`、`tailwindcss`、`postcss`、`autoprefixer`、`tsx`、`esbuild`、`electron`、`electron-builder`、`cross-env`、`pngjs`、`@types/*` |

分发桌面版/安卓版时，运行时依赖的许可证文本由 Electron、Capacitor 与各自打包工具随产物附带；完整清单可用 `npx license-checker`（未列为项目依赖）按需生成。
