# 贡献指南（Contributing）

一个模拟器项目，欢迎 PR。开工前请先读 [README.md](README.md) 的"产品定位与安全边界"和
[SECURITY.md](SECURITY.md)：很多看起来该加固的地方是设计内取舍，改动前请确认我们说的是同一件事。

## 环境要求

- **Node.js 22 + npm**（CI 固定在 22，请用 `npm ci` 按 lockfile 安装）。
- Python 3：只有需要本机 TTS 后端时才用；`npm run dev` 首次启动会自动在 `server/` 下建 `venv`
  并安装依赖，不需要你手动准备。
- **JDK 21 + Android SDK 36：只有做 Android 打包时才需要。** macOS 上可用 Homebrew 安装：
  `brew install openjdk@21`。
- `npm run gen:icon`（重生成 App 图标）需要 macOS 的 `iconutil`，其他平台只能产出 PNG 图标组。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm ci` | 按 `package-lock.json` 安装依赖 |
| `npm run dev` | Vite 开发服务。端口 **3001**（`vite.config.ts` 里 `port: 3001` + `strictPort: true`），并且 `host: '0.0.0.0'`，局域网其他设备可直接访问 `http://<本机IP>:3001/`。启动时自动拉起 TTS 后端（`localhost:8000`）与房间服务（`0.0.0.0:3002`），端口已被占用时复用现有进程 |
| `npm start` | 就是 `bash scripts/start_app.command`，内容仅一句 `npm run dev`（附带提示"TTS 由 Vite 托管"）。它**不会**多做任何事，也不等同于生产部署 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `tsx --test scripts/tests/*.test.ts`，纯函数 / 协议 / 构建安全检查，不起浏览器 |
| `npm run build` | 构建前端到 `dist/` |
| `npm run test:e2e` | Playwright（`scripts/e2e/**`）。配置自己会在 `127.0.0.1:39011` 起一个 `DISABLE_AUX_SERVICES=1` 的 Vite，不需要你先手动开 dev |

其他：`npm run check` = typecheck + build；`npm run tts` 单独起 Python TTS 后端；
`npm run app:dev` / `npm run app:build` 见 README 桌面版一节。

## 关键约定

1. **不要手改生成的素材数据文件。** `src/components/game/voxel/primitives/camp-tiles.ts` 与
   `src/components/game/voxel3d/camp-blocks.ts` 是 `npm run gen:art` 的产物。要改美术，请改生成器
   `scripts/gen-pixel-art.ts`（材质色阶、光照方向、噪声种子）或其中的 `EXTERNAL` 覆盖表，然后重跑
   `npm run gen:art`；App 图标同理，改 `scripts/gen-app-icon.ts` 后跑 `npm run gen:icon`。
   任何人重跑脚本都应能复现同一份美术，这是这条约定存在的理由。
   引入新的外部帧图时，放进 `assets-src/` 并在该目录 README 与 `THIRD_PARTY_NOTICES.md` 里
   写清来源、版本与许可依据。
2. **提交前 typecheck 与单测都要过**：`npm run typecheck && npm test`。CI 跑的就是这两条
   （外加 build），本地过不了就别开 PR。改了引擎 / 协议 / 提示词时，请在 `scripts/tests/` 里补一条
   能挡住回退的断言，而不只是改代码。
3. **不要提交**：`dist/`、`dist-electron/`、`release/`、`node_modules/`、`server/venv*`、
   `test-results/`、`playwright-report/`、`output/`，以及游戏截图、临时录制、调试工具产物。
   大部分已在 `.gitignore` 里，请在 `git add` 前确认没有用 `-f` 绕过，也确认没有把截图留在根目录。
   同理，`.env` 与 `server/config-share.json` 永远不该出现——里面可能有真实密钥。
4. **中文文案一致性。** 本项目玩家可见文案全部是中文，术语已经定死，请沿用而不是另造同义词：
   **板子**（角色配置模板）、**局**（一次对局）、**座位**（玩家位）、**分身**（扮演某角色的 AI）、
   **模型**（提供推理的 LLM）、**房间**（联机房间）、**AI 玩家**（联机房里由规则大脑驱动的内置离线玩家，不消耗模型配置）。
   新增文案时顺手检查同一界面里的量词、阶段名（"夜晚第 X 夜""白天"）和按钮动词是否和邻居一致。
   另外：不要自称"官方"（避免来源混淆），不要写不可证实的最高级宣传语（如"全网最火"）。
5. **PR 描述里请说明影响面**：单机 / 联机（房主或客人）/ 回放、以及 Web / Electron / Android 哪个形态，
   方便判断是否需要跑 `npm run test:e2e`。UI 改动请附一张截图给 reviewer，但不要把截图提交进仓库。

## 提交前自查

```bash
npm run typecheck && npm run lint && npm test
```

CI 跑的就是这三条（外加 build）。`lint` 的 error 级规则（hooks 规则、未使用变量、prefer-const）
会直接挂 CI；`no-explicit-any` 与非空断言目前是 warn 级，收敛后再升级。

## 许可

提交即表示同意你的贡献以本仓库的 MIT 许可证发布（见 [LICENSE](LICENSE)）。
不要引入 GPL/LGPL/AGPL 依赖，也不要加入来自其他商业游戏的素材——需要第三方素材时优先 CC0，
并按规定记录来源。
