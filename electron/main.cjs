// 方块狼人杀 · Mac 客户端主进程
// 职责:窗口 + 内置站点(:3001,静态资源 + API 代理) + 编排房间服务(:3002)与 TTS 后端(:8000)。
// 局域网玩家用浏览器打开 http://<本机IP>:3001 即可加入,零安装。
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const edgeTts = require('./edge-tts.cjs');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const net = require('net');

const APP_PORT = 3001;
const ROOM_PORT = 3002;

const isDev = !app.isPackaged;
const projectRoot = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, '..');
const resourcesDir = isDev ? projectRoot : process.resourcesPath;
const distDir = isDev ? path.join(projectRoot, 'dist') : path.join(resourcesDir, 'dist');
const serverDir = isDev ? path.join(projectRoot, 'server') : path.join(resourcesDir, 'server');

// ── .env 解析(优先 process.env) ────────────────────────────
const envVars = { ...process.env };
for (const candidate of [
    path.join(projectRoot, '.env'),
    path.join(resourcesDir, '.env'),
]) {
    try {
        if (fs.existsSync(candidate)) {
            for (const line of fs.readFileSync(candidate, 'utf8').split('\n')) {
                const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
                if (m && !(m[1] in process.env)) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '');
            }
            break;
        }
    } catch { /* ignore */ }
}

// ── 子进程编排(崩溃 3 秒自愈) ──────────────────────────────
const children = new Map();

function spawnGuarded(name, cmd, args, opts = {}) {
    let restarts = 0;
    const start = () => {
        if (children.has(name)) return;
        if (opts.port && isPortOpenSync(opts.port)) return; // 已有实例,复用
        console.log(`[app] starting ${name}...`);
        const child = spawn(cmd, args, {
            cwd: opts.cwd || projectRoot,
            env: { ...envVars, ...(opts.env || {}) },
            stdio: ['ignore', 'inherit', 'inherit'],
        });
        children.set(name, child);
        child.on('exit', (code) => {
            children.delete(name);
            if (code !== null && code !== 0) {
                if (typeof opts.maxRestarts === 'number' && restarts >= opts.maxRestarts) {
                    console.warn(`[app] ${name} 连续失败 ${restarts + 1} 次,停止重启`);
                    opts.onGiveUp?.();
                    return;
                }
                restarts += 1;
                console.warn(`[app] ${name} exited (${code}), restarting in 3s`);
                setTimeout(start, 3000);
            }
        });
    };
    start();
}

function stopAll() {
    for (const [name, child] of children) {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        children.delete(name);
    }
}

function startRoomServer() {
    // room-server 预打包为单文件 CJS,放 extraResources(asar 内 RUN_AS_NODE 读不到)
    const script = path.join(resourcesDir, 'dist-electron', 'room-server.cjs');
    spawnGuarded('room', process.execPath, [script], {
        port: ROOM_PORT,
        env: {
            ELECTRON_RUN_AS_NODE: '1',
            ROOM_SERVER_PORT: String(ROOM_PORT),
            CONFIG_SHARE_DIR: app.getPath('userData'),
        },
    });
}

// MCP 外脑桥(127.0.0.1:3015):外部 AI 认领分身用;随 App 自动拉起,无需手动开终端
function startMcpHub() {
    const script = path.join(resourcesDir, 'mcp', 'standalone-hub.mjs');
    spawnGuarded('mcp-hub', process.execPath, [script], {
        port: 3015,
        env: {
            ELECTRON_RUN_AS_NODE: '1',
        },
    });
}



// 同步版:检查端口是否被占用(用于启动前防冲突)
function isPortOpenSync(port) {
    try {
        const { execFileSync } = require('child_process');
        const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out.trim().length > 0;
    } catch {
        return false;
    }
}

// ── 内置站点:静态资源 + API 代理 ───────────────────────────
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveStatic(req, res, pathname) {
    let filePath = path.join(distDir, decodeURIComponent(pathname));
    if (!filePath.startsWith(distDir)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html'); // SPA 回退
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
}

const PROXY_TARGETS = [
    { prefix: '/api/room/', target: `http://127.0.0.1:${ROOM_PORT}`, rewrite: p => p.replace(/^\/api\/room/, '/api') },
    { prefix: '/api/nvidia-models', target: 'https://integrate.api.nvidia.com', rewrite: p => p.replace(/^\/api\/nvidia-models/, '/v1/models'), injectAuth: true },
    { prefix: '/api/nvidia-chat', target: 'https://integrate.api.nvidia.com', rewrite: p => p.replace(/^\/api\/nvidia-chat/, '/v1/chat/completions'), injectAuth: true },
    { prefix: '/api/volcengine', target: 'https://openspeech.bytedance.com', rewrite: p => p.replace(/^\/api\/volcengine/, '') },
];

// 环回 LLM 网关：同源代理宿主机本机端点(Ollama/LM Studio/QClaw),仅允许 loopback
function forwardLocalLlmGateway(req, res, target) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const isHttps = target.protocol === 'https:';
        const mod = isHttps ? https : http;
        const upstream = mod.request({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || (isHttps ? 443 : 80),
            path: target.pathname + target.search,
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] ?? 'application/json',
                ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                Accept: req.headers.accept ?? 'application/json',
            },
        }, (proxyRes) => {
            const respBuf = [];
            proxyRes.on('data', c => respBuf.push(c));
            proxyRes.on('end', () => {
                const buf = Buffer.concat(respBuf);
                res.writeHead(proxyRes.statusCode || 502, {
                    'Content-Type': proxyRes.headers['content-type'] ?? 'application/json',
                    'Content-Length': String(buf.length),
                });
                res.end(buf);
            });
        });
        upstream.on('error', (err) => {
            if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `本地 LLM 端点不可达: ${err.message}` }));
        });
        if (body) upstream.write(body);
        upstream.end();
    });
}

function handleLocalLlmGateway(req, res) {
    const url = new URL(req.url, `http://127.0.0.1`);
    const raw = url.searchParams.get('target') || '';
    let target = null;
    try {
        const parsed = new URL(raw);
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:')
            && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
            target = parsed;
        }
    } catch { /* 保持 null */ }
    if (!target) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'target 必须是宿主机 loopback 地址' }));
        return;
    }
    forwardLocalLlmGateway(req, res, target);
}

// ── 原生 Edge TTS(微软云,零本地依赖):App 环境不再依赖 Python ──
async function handleEdgeTtsGenerate(req, res) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
        try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            const mp3 = await edgeTts.synthesize(
                String(body.text || ''),
                String(body.voice || 'zh-CN-XiaoxiaoNeural'),
                String(body.rate || '+0%'),
                String(body.pitch || '+0Hz'),
            );
            res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': String(mp3.length) });
            res.end(mp3);
        } catch (err) {
            console.warn('[app] Edge TTS 合成失败:', err.message);
            if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Edge TTS 合成失败: ${err.message}` }));
        }
    });
}

async function handleEdgeTtsVoices(req, res) {
    try {
        const voices = await edgeTts.listVoices();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(voices));
    } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `音色列表获取失败: ${err.message}` }));
    }
}

async function handleTtsPreview(req, res) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
        try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            const mp3 = await edgeTts.synthesize(
                String(body.text || '你好，我是你的语音助手。'),
                String(body.voice || 'zh-CN-XiaoxiaoNeural'),
                String(body.rate || '+0%'),
                String(body.pitch || '+0Hz'),
            );
            res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': String(mp3.length) });
            res.end(mp3);
        } catch (err) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `试听失败: ${err.message}` }));
        }
    });
}

function proxyRequest(req, res) {
    const pathname = req.url.split('?')[0];
    if (pathname === '/api/local-llm-gateway') return handleLocalLlmGateway(req, res);
    if (pathname === '/api/edge-tts-generate') return handleEdgeTtsGenerate(req, res);
    if (pathname === '/api/edge-tts-voices') return handleEdgeTtsVoices(req, res);
    if (pathname === '/api/tts-preview') return handleTtsPreview(req, res);
    if (pathname === '/api/tts-engines') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ id: 'edge-tts', name: 'Edge TTS (微软)', available: true, installStatus: 'installed', installMessage: '', description: '微软 Edge TTS 云端语音，支持 500+ 多语言音色' }]));
        return;
    }
    const rule = PROXY_TARGETS.find(r => pathname.startsWith(r.prefix));
    if (!rule) { res.writeHead(404); res.end('not found'); return; }
    const newPath = rule.rewrite(req.url);
    const target = new URL(newPath, rule.target);
    const isHttps = target.protocol === 'https:';
    const mod = isHttps ? https : http;
    const headers = { ...req.headers };
    delete headers.host;
    if (rule.injectAuth && envVars.NVIDIA_API_KEY) {
        headers.authorization = `Bearer ${envVars.NVIDIA_API_KEY}`;
    }
    const proxyReq = mod.request({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: target.pathname + target.search,
        method: req.method,
        headers,
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
        console.warn(`[app] proxy error ${pathname}: ${err.message}`);
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `代理不可用: ${err.message}` }));
    });
    req.pipe(proxyReq);
}

// WS 隧道:/api/room/* 的 upgrade 原样转发到房间服务
function proxyUpgrade(req, socket, head) {
    if (!req.url.startsWith('/api/room/')) { socket.destroy(); return; }
    const upstream = net.connect(ROOM_PORT, '127.0.0.1', () => {
        const newPath = req.url.replace(/^\/api\/room/, '/api');
        upstream.write(
            `${req.method} ${newPath} HTTP/1.1\r\n` +
            Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
            '\r\n\r\n',
        );
        if (head && head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
}

let siteReadyFired = false;

function startSiteServer(onReady) {
    // 候选端口:3001 优先(和网页版一致),被占则跳到 3011-3020(避开房间 3002)
    const candidates = [APP_PORT, 3011, 3012, 3013, 3014, 3015];
    const tryNext = (index) => {
        if (siteReadyFired) return;
        if (index >= candidates.length) {
            console.error('[app] 站点启动失败: 无可用端口');
            onReady(null);
            return;
        }
        const port = candidates[index];
        if (isPortOpenSync(port)) { tryNext(index + 1); return; }
        const server = http.createServer((req, res) => {
            const pathname = req.url.split('?')[0];
            if (pathname.startsWith('/api/')) return proxyRequest(req, res);
            return serveStatic(req, res, pathname);
        });
        server.on('upgrade', proxyUpgrade);
        server.once('error', (err) => {
            console.warn(`[app] 端口 ${port} 不可用: ${err.code || err.message}`);
            tryNext(index + 1);
        });
        server.listen(port, '0.0.0.0', () => {
            if (siteReadyFired) { server.close(); return; }
            siteReadyFired = true;
            console.log(`[app] 站点已就绪: http://localhost:${port} (局域网玩家可访问)`);
            onReady(port);
        });
    };
    tryNext(0);
}

// ── 窗口 ───────────────────────────────────────────────────
let mainWindow = null;

function createWindow(loadUrl) {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        title: '方块狼人杀',
        autoHideMenuBar: true,
        backgroundColor: '#78bce8',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.loadURL(loadUrl || `http://127.0.0.1:${APP_PORT}`);
    // 把安装路径告诉前端:邀请提示词里用绝对路径起桥,目标会话无需到处找项目
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow?.webContents.executeJavaScript(
            `window.__WEREWOLF_PROJECT_ROOT__ = ${JSON.stringify(resourcesDir)};`,
        ).catch(() => {});
    });
    mainWindow.on('closed', () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

    app.whenReady().then(() => {
        if (isDev) {
            // 开发模式:复用 vite dev(vite 插件会拉起房间/TTS),仅开窗口
            createWindow();
        } else {
            startRoomServer();
            startMcpHub();
            startSiteServer((port) => {
                if (port) createWindow(`http://127.0.0.1:${port}`);
            });
        }
    });

    app.on('window-all-closed', () => {
        stopAll();
        app.quit();
    });
}
