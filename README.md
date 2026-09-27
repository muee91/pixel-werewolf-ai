# AI Werewolf Simulator

AI 狼人杀模拟器，基于 React、Vite、Jotai、Tailwind CSS 构建，包含前端游戏界面、TTS 后端代理、历史对局和调试日志能力。

## 产品定位与安全边界（请先阅读）

本项目是**单机 + 局域网熟人游戏**，不面向公网部署，也不用于陌生人联机。基于这一定位：

- **API Key 泄露不在考虑范围内**。模型 API Key 明文保存在本地（localStorage），联机时房主可通过"分享配置（含 API Key）"把密钥经局域网共享给熟人玩家，这是**有意设计的便利功能**，不是缺陷。
- 局域网内 HTTP/WS 明文传输、房间服务与内置站点对局域网设备无鉴权，均属设计内的取舍，信任前提是"同一 Wi-Fi 下的都是朋友"。
- 联机采用房主权威（host-authoritative）模型，房主天然可见全部信息；防作弊边界只覆盖"客人之间按视角脱敏"，不设防恶意房主。
- **不要**把房间服务、静态站点或 MCP hub 暴露到公网；如需公网联机，须先自行补齐鉴权、加密传输与速率限制。

## 第三方素材

项目中的 Minecraft 派生像素数据与 Fusion Pixel 字体不属于本项目原创内容，具体来源、许可证和使用边界见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 目录结构

```text
AI-Werewolf-Simulator/
├─ src/                  # 前端源码
│  ├─ App.tsx
│  ├─ main.tsx           # Vite 入口
│  ├─ index.css
│  ├─ atoms.ts
│  ├─ store.ts
│  ├─ types.ts
│  ├─ audio.ts
│  ├─ components/
│  ├─ hooks/
│  └─ services/
├─ server/               # TTS 后端代理
├─ scripts/              # 启动脚本
├─ android/              # Capacitor Android 工程，首次需 npm run android:add 生成
├─ dist/                 # 前端构建产物，可由 npm run build 生成
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.js
├─ tsconfig.json
└─ capacitor.config.ts
```

## 启动

安装依赖：

```bash
npm install
```

启动前端开发服务（Vite 会自动托管本地 TTS 后端，默认端口 `8000`）：

```bash
npm run dev
```

浏览器打开：

```text
http://localhost:3001/
```

首次运行请先进入“设置 → 模型与语音”，填写自己的模型 API（或配置远程代理）并完成模型验证。应用不会再自动绑定云端默认模型；未配置可用模型时，首页不会启动 AI 对局。已运行的本机 Ollama、LM Studio 或 QClaw 仍会自动探测并可直接使用本机模型。

启动完整开发环境：

```bash
npm start
```

单独启动 TTS 后端（仅当前端不由 Vite 托管或需要单独调试时使用）：

```bash
npm run tts
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。

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
- 运行脚本统一放在 `scripts/`。
- Python 虚拟环境放在 `server/venv/`，不纳入项目文件管理。
- `dist/` 是构建产物，不手动维护。
- 临时调试脚本不放根目录，必要时放入 `scripts/debug/` 或正式测试目录。
