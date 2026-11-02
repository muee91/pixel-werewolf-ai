# AI Werewolf Simulator

AI 狼人杀模拟器，基于 React、Vite、Jotai、Tailwind CSS 构建。仓库里同时包含前端游戏界面、
本地 TTS 代理与局域网房间服务（`server/`）、Electron 桌面壳（`electron/`）、Capacitor Android 工程
（`android/`）、MCP 外脑桥（`mcp/`）以及像素素材生成脚本（`scripts/`）。

## 产品定位与安全边界（请先阅读）

本项目是**单机 + 局域网熟人游戏**，不面向公网部署，也不用于陌生人联机。基于这一定位：

- **API Key 泄露不在考虑范围内**。模型 API Key 明文保存在本地（localStorage），联机时房主可通过"分享配置（含 API Key）"把密钥经局域网共享给熟人玩家，这是**有意设计的便利功能**，不是缺陷。
- 局域网内 HTTP/WS 明文传输、房间服务与内置站点对局域网设备无鉴权，均属设计内的取舍，信任前提是"同一 Wi-Fi 下的都是朋友"。
- 联机采用房主权威（host-authoritative）模型，房主天然可见全部信息；防作弊边界只覆盖"客人之间按视角脱敏"，不设防恶意房主。
- **不要**把房间服务、静态站点或 MCP hub 暴露到公网；如需公网联机，须先自行补齐鉴权、加密传输与速率限制。

更完整的威胁模型、设计内取舍清单与漏洞报告渠道见 [SECURITY.md](SECURITY.md)，贡献约定见
[CONTRIBUTING.md](CONTRIBUTING.md)，版本改动见 [CHANGELOG.md](CHANGELOG.md)。

## 像素素材与第三方许可

道具、头像、方块贴图与 App 图标全部由脚本程序化生成（`npm run gen:art` / `npm run gen:icon`），不取自任何第三方游戏资源；字体、模型与语音服务的来源和条款见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

生成脚本与产物：

| 命令 | 脚本 | 产物 |
| --- | --- | --- |
| `npm run gen:art` | `scripts/gen-pixel-art.ts` | `src/components/game/voxel/primitives/camp-tiles.ts`（2D 道具/头像）、`src/components/game/voxel3d/camp-blocks.ts`（3D 方块贴图 + 角色正脸） |
| `npm run gen:icon` | `scripts/gen-app-icon.ts` | `build/icon.icns`、`build/icon-1024.png`（需 macOS 的 `iconutil`；其他平台只写出 PNG 图标组） |

**不要手改这两个 `.ts` 数据文件**——它们是生成产物。要改风格就改生成器的参数（材质色阶、光照方向、
噪声种子）或脚本里的 `EXTERNAL` 外部帧覆盖表，再重跑 `npm run gen:art`，保证任何人都能生成同一份美术。
`npm run gen:icon` 只影响桌面/Android 的 App 图标，不改游戏内素材。

## 目录结构

```text
AI-Werewolf-Simulator/
├─ src/                  # 前端源码
│  ├─ App.tsx
│  ├─ main.tsx           # Vite 入口
│  ├─ index.css
│  ├─ atoms.ts           # Jotai 原子（含 localStorage 持久化）
│  ├─ store.ts
│  ├─ types.ts           # 角色、板子（GAME_PRESETS）、规则、阶段枚举
│  ├─ audio.ts
│  ├─ assets/            # OFL 字体等随前端分发的资源
│  ├─ components/        # 界面组件（首页、设置、历史、规则等）
│  │  └─ game/           # 2D 像素与 3D（voxel / voxel3d）营地渲染
│  ├─ hooks/             # 游戏引擎与回合驱动
│  ├─ game/              # 规则纯逻辑（rules.ts）
│  ├─ services/          # LLM 调用、内置小模型、技能/角色实现
│  ├─ multiplayer/       # 联机客户端与房间视图
│  ├─ themes/            # 配色与像素风格 token
│  └─ utils/             # 配置导入导出、配置分享等工具
├─ server/               # Node/Python 后端：TTS 代理（main.py）+ 局域网房间服务（room-server.ts / room-manager.ts / visibility.ts / bots.ts）
├─ electron/             # Electron 主进程与内置站点（main.cjs、edge-tts.cjs）
├─ mcp/                  # MCP 外脑桥：standalone-hub.mjs / standalone-agent.mjs / werewolf-mcp.mjs
├─ scripts/              # 素材生成、启动脚本、单测（tests/）与 Playwright 用例（e2e/）、调试工具
├─ assets-src/           # 外部 CC0 帧图与来源/许可记录（不参与前端构建）
├─ docs/                 # 审计报告（audit/）与历史设计记录（archive/）
├─ build/                # App 图标源文件（icon.icns / icon-1024.png），由 npm run gen:icon 生成
├─ android/              # Capacitor Android 工程，首次需 npm run android:add 生成
├─ dist/                 # 前端构建产物，可由 npm run build 生成
├─ dist-electron/        # Electron 用的房间服务打包产物（room-server.cjs）
├─ release/              # electron-builder 输出的桌面安装包
├─ index.html
├─ package.json
├─ vite.config.ts
├─ playwright.config.ts
├─ tailwind.config.js
├─ tsconfig.json
├─ capacitor.config.ts
├─ LICENSE
├─ SECURITY.md
└─ CONTRIBUTING.md
```

## 启动

安装依赖：

```bash
npm ci
```

启动前端开发服务（Vite 端口固定 `3001`，`strictPort`；`host` 为 `0.0.0.0`，因此局域网内其他设备可直接访问）。
Vite 插件会同时拉起两个本地服务：TTS 后端（`localhost:8000`，首次会自动创建 `server/venv` 并安装依赖）与
局域网房间服务（`0.0.0.0:3002`）。若端口已有实例则复用，不重复启动；设 `DISABLE_AUX_SERVICES=1` 可只跑前端：

```bash
npm run dev
```

浏览器打开：

```text
http://localhost:3001/
```

**零配置即可开一局**：没有 API Key 时，首页会显示“本局由内置离线大脑驱动”，用内置规则引擎跑完整对局（决策较简单，但流程、结算、回放都完整）。想更接近真人表现，可在“设置 → 模型与语音”填写自己的模型 API（或配置远程代理）并完成模型验证；已运行的本机 Ollama、LM Studio 或 QClaw 会自动探测并可直接使用。应用不会自动绑定任何云端默认模型。

`npm start` 等价于 `npm run dev`：它只是 `scripts/start_app.command` 的快捷入口，脚本内容就是打印一句
“TTS Backend will be managed by Vite during development.” 后执行 `npm run dev`，不做额外的事，也不产出
生产构建。需要"完整环境"请直接记 `npm run dev`。

单独启动 TTS 后端（仅当前端不由 Vite 托管或需要单独调试时使用）：

```bash
npm run tts
```

## 校验与测试

```bash
npm run typecheck   # tsc --noEmit
npm test            # scripts/tests/*.test.ts（纯函数与协议层单测）
npm run build       # 构建前端到 dist/
npm run check       # typecheck + build
npm run test:e2e    # Playwright，会自行在 127.0.0.1:39011 起一个不带辅助服务的 Vite
```

`npm run typecheck && npm test` 是提交前的最低门槛，与 `.github/workflows/ci.yml` 一致。

## 桌面版（Electron）

```bash
npm run app:dev     # 用 Electron 窗口加载开发站点（未打包模式）
npm run app:build   # build + 打包房间服务 + electron-builder --mac
```

`npm run app:dev` 走未打包分支：只开窗口并加载 `http://127.0.0.1:3001`，TTS 与房间服务仍由 `npm run dev`
的 Vite 插件负责，所以需要先在另一个终端把 dev 服务起起来。

`npm run app:build` 依次执行 `vite build` → 用 esbuild 把 `server/room-server.ts` 打成
`dist-electron/room-server.cjs` → `electron-builder --mac`，产物（`.dir` 与 `.dmg`）输出到 `release/`。
打包后的应用不再依赖 Vite：主进程自己起内置站点（候选端口 `3001/3011–3015`，绑 `0.0.0.0`，局域网玩家用浏览器
访问 `http://<本机IP>:<端口>` 即可零安装加入）、房间服务子进程（`3002`）与 MCP 外脑桥子进程（`127.0.0.1:3015`）。
当前配置 `mac.identity` 为 `null`，即不做签名与公证，本机组装可用，分发到他人机器需自行处理签名。

### MCP 外脑桥（可选）

```bash
npm run mcp-bridge   # 单机模式 MCP 中心枢纽，默认端口 3015（可用 MCP_BRIDGE_PORT 覆盖）
```

`mcp/standalone-hub.mjs` 接收浏览器引擎的决策请求，按分身名字路由给已认领的外部 AI 会话；每个 AI 会话注册
`mcp/standalone-agent.mjs`（stdio 瘦代理），会话之间互相看不到对方提示词。打包后的桌面 App 会自动拉起这个桥。
细节见 [mcp/README.md](mcp/README.md)。

## Android / Capacitor

Android 工程使用 Capacitor 8，需要 Android Studio、Android SDK 36 和 JDK 21。macOS Homebrew 可安装：

```bash
brew install openjdk@21
```

当前仓库已经包含 `android/` 工程。仅在重新生成工程时使用：

```bash
npm run android:add
```

同步 Android 工程：

```bash
npm run android:sync
```

打开 Android 工程：

```bash
npm run android:open
```

生成 Debug APK：

```bash
npm run android:apk
```

## 文件规范

- 前端源码统一放在 `src/`。
- `server/` 是后端代码：`main.py` 提供 TTS 代理（Edge/Piper/ChatTTS 等引擎，监听 `localhost:8000`），
  `room-server.ts` + `room-manager.ts` + `visibility.ts` + `bots.ts` 提供局域网联机房间服务
  （HTTP + WebSocket，监听 `0.0.0.0:3002`，含 `/api/config/share` 配置同步）。
- Python 虚拟环境放在 `server/venv/`、`server/venv-edge/`，不纳入项目文件管理。
- `server/config-share.json`（共享配置快照落盘）与 `.env` 含敏感内容，已在 `.gitignore` 内，不要提交。
- 构建产物 `dist/`、`dist-electron/`、`release/` 不手动维护。
- `src/components/game/voxel/primitives/camp-tiles.ts` 与 `src/components/game/voxel3d/camp-blocks.ts`
  是 `npm run gen:art` 的生成产物，不要手改（改素材请改脚本，见上文"像素素材与第三方许可"）。
- 临时调试脚本不放根目录，必要时放入 `scripts/debug/` 或正式测试目录。
- 项目文档：约定与威胁模型见 `SECURITY.md`、`CONTRIBUTING.md`，版本改动见 `CHANGELOG.md`，
  素材与依赖许可见 `THIRD_PARTY_NOTICES.md`。
