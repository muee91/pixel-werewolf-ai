import path from 'path';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import react from '@vitejs/plugin-react';
import { spawn, execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import net from 'net';
import { fileURLToPath } from 'url';
import { parseLoopbackLlmTarget } from './server/llm-gateway-target';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const isPortInUse = (port: number, host = '127.0.0.1') =>
    new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ port, host });
        socket.once('connect', () => {
            socket.end();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
    });

const isPortInUseSync = (port: number, host = '127.0.0.1') => {
    try {
        const result = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return result.trim().length > 0;
    } catch {
        return false;
    }
};


// ── 环回 LLM 网关：同源代理本机 Ollama/LM Studio/QClaw 等端点 ──
// 目标校验（loopback + LLM API 路径白名单）与 electron 主进程共用同一口径，
// 单一来源在 server/llm-gateway-target.ts —— 改白名单时两边要同步。

async function forwardLocalLlm(req: IncomingMessage, res: ServerResponse, target: string) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    try {
        const upstream = await fetch(target, {
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] ?? 'application/json',
                ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                Accept: req.headers.accept ?? 'application/json',
            },
            body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
        });
        const contentType = upstream.headers.get('content-type') ?? 'application/json';

        // 流式（SSE）必须边读边写。此前这里一律 `await upstream.arrayBuffer()`，
        // 再带 Content-Length 一次性回给浏览器 —— 开发期经此转发的每一次流式调用，
        // 到页面都变成"最后一个字节才到齐"，字幕永远只能显示"正在思考"。
        // 这条代理只转发 loopback，所以线上不受影响；但开发/自测看到的就是这个假象。
        if (!upstream.body || !contentType.includes('text/event-stream')) {
            const respBuf = Buffer.from(await upstream.arrayBuffer());
            res.writeHead(upstream.status, {
                'Content-Type': contentType,
                'Content-Length': String(respBuf.length),
            });
            res.end(respBuf);
            return;
        }

        res.writeHead(upstream.status, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();

        const reader = upstream.body.getReader();
        // 客户端中途关页面/取消请求：上游也要停，别让它继续烧 token
        const abort = () => { void reader.cancel().catch(() => {}); };
        req.on('close', abort);
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!res.write(Buffer.from(value))) {
                    await new Promise<void>(resolve => res.once('drain', () => resolve()));
                }
            }
        } finally {
            req.off('close', abort);
            res.end();
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (res.headersSent) { res.end(); return; }
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `本地 LLM 端点不可达: ${message}` }));
    }
}

function localLlmGatewayPlugin(): Plugin {
    return {
        name: 'local-llm-gateway',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = new URL(req.url || '/', 'http://localhost');
                if (url.pathname !== '/api/local-llm-gateway') return next();
                const raw = url.searchParams.get('target') || '';
                const target = parseLoopbackLlmTarget(raw);
                if (!target) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'target 必须是宿主机 loopback 的本地 LLM API 地址' }));
                    return;
                }
                void forwardLocalLlm(req, res, target.toString());
            });
        },
    };
}

function ttsBackendPlugin(): Plugin {
    let proc: ReturnType<typeof spawn> | null = null;
    return {
        name: 'tts-backend',
        configureServer(server: ViteDevServer) {
            let cancelled = false;
            let startPromise: Promise<void> | null = null;
            const start = () => {
                if (startPromise) return startPromise;
                startPromise = (async () => {
                if (process.env.DISABLE_AUX_SERVICES === '1') return;
                if (process.env.TTS_BACKEND_TEST_MARKER) {
                    writeFileSync(process.env.TTS_BACKEND_TEST_MARKER, 'started');
                    return;
                }
                const serverDir = path.resolve(projectRoot, 'server');
                const scriptPath = path.join(serverDir, 'main.py');
                const venvPython = path.join(serverDir, 'venv/bin/python3');
                const reqFile = path.join(serverDir, 'requirements-edge.txt');
                const ttsPort = 8000;

                if (await isPortInUse(ttsPort) || cancelled) {
                    if (!cancelled) console.log(`[TTS Backend] Reusing existing backend on http://localhost:${ttsPort}.`);
                    return;
                }

                if (!existsSync(venvPython)) {
                    console.log(`[TTS Backend] Creating venv...`);
                    try {
                        execSync('python3 -m venv venv', { cwd: serverDir, stdio: 'inherit' });
                    } catch (e) {
                        console.warn(`[TTS Backend] Failed to create venv, falling back to system python3`);
                    }
                }

                const pythonCmd = existsSync(venvPython) ? venvPython : 'python3';

                if (existsSync(reqFile)) {
                    console.log(`[TTS Backend] Installing requirements...`);
                    try {
                        execSync(`"${pythonCmd}" -m pip install -r requirements.txt --quiet`, {
                            cwd: serverDir,
                            stdio: 'inherit',
                            timeout: 300000
                        });
                    } catch (e) {
                        console.warn(`[TTS Backend] Warning: some requirements may not be installed`);
                    }
                }

                if (cancelled) return;
                console.log(`[TTS Backend] Starting on http://localhost:${ttsPort}...`);
                proc = spawn(pythonCmd, [scriptPath], {
                    cwd: serverDir,
                    stdio: ['ignore', 'inherit', 'inherit'],
                    env: { ...process.env }
                });

                proc.on('error', (err) => {
                    console.error(`[TTS Backend] Failed to start: ${err.message}`);
                });

                proc.on('exit', (code) => {
                    if (code !== null && code !== 0 && !cancelled) {
                        console.warn(`[TTS Backend] Exited with code ${code}, restarting in 3s...`);
                        setTimeout(() => {
                            if (!cancelled && !isPortInUseSync(ttsPort)) {
                                startPromise = null;
                                void start().catch((error) => {
                                    console.error(`[TTS Backend] Restart failed: ${error instanceof Error ? error.message : String(error)}`);
                                });
                            }
                        }, 3000);
                    }
                    proc = null;
                });
                })().catch(error => {
                    startPromise = null;
                    throw error;
                });
                return startPromise;
            };
            const cleanup = () => {
                cancelled = true;
                if (proc) {
                    proc.kill('SIGTERM');
                    proc = null;
                }
            };

            const startWhenListening = () => {
                void start().catch(error => {
                    console.error(`[TTS Backend] Startup failed: ${error instanceof Error ? error.message : String(error)}`);
                });
            };
            server.httpServer?.once('listening', startWhenListening);
            // Vite may call configureServer after an embedding host has already begun listening.
            if (server.httpServer?.listening) startWhenListening();
            server.httpServer?.once('close', cleanup);
            return cleanup;
        }
    };
}

function roomServerPlugin(): Plugin {
    let proc: ReturnType<typeof spawn> | null = null;
    return {
        name: 'room-server',
        configureServer(server: ViteDevServer) {
            let cancelled = false;
            const start = async () => {
                if (process.env.DISABLE_AUX_SERVICES === '1') return;
                if (process.env.ROOM_SERVER_TEST_MARKER) {
                    writeFileSync(process.env.ROOM_SERVER_TEST_MARKER, 'started');
                    return;
                }
                const roomPort = 3002;
                if (await isPortInUse(roomPort) || cancelled) {
                    if (!cancelled) console.log(`[Room Server] Reusing existing server on http://0.0.0.0:${roomPort}.`);
                    return;
                }

                console.log(`[Room Server] Starting on http://0.0.0.0:${roomPort}...`);
                proc = spawn(process.execPath, [
                    path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
                    'server/room-server.ts',
                ], {
                    cwd: projectRoot,
                    stdio: ['ignore', 'inherit', 'inherit'],
                    env: { ...process.env, ROOM_SERVER_PORT: String(roomPort) }
                });

                proc.on('error', (err) => {
                    console.error(`[Room Server] Failed to start: ${err.message}`);
                });

                proc.on('exit', (code) => {
                    if (code !== null && code !== 0 && !cancelled) {
                        console.warn(`[Room Server] Exited with code ${code}, restarting in 3s...`);
                        setTimeout(() => {
                            if (!cancelled && !isPortInUseSync(roomPort)) {
                                void start().catch((error) => {
                                    console.error(`[Room Server] Restart failed: ${error instanceof Error ? error.message : String(error)}`);
                                });
                            }
                        }, 3000);
                    }
                    proc = null;
                });
            };
            const cleanup = () => {
                cancelled = true;
                if (proc) {
                    proc.kill('SIGTERM');
                    proc = null;
                }
            };

            const startWhenListening = () => {
                void start().catch(error => {
                    console.error(`[Room Server] Startup failed: ${error instanceof Error ? error.message : String(error)}`);
                });
            };
            server.httpServer?.once('listening', startWhenListening);
            // 与 TTS 插件同款守卫：configureServer 可能在 httpServer 已监听后才执行，
            // 只挂 once('listening') 会静默漏启（实测于 Vite 6 CLI 启动路径）
            if (server.httpServer?.listening) startWhenListening();
            server.httpServer?.once('close', cleanup);
            return cleanup;
        }
    };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProdBuild = mode === 'production';
  return {
    // jotai/zustand 等依赖用 `import.meta.env ? import.meta.env.MODE : ...` 裸引用
    // 整个环境对象,Vite 会把含全部 VITE_* 变量的完整对象打成字面量——实测会让
    // VITE_NVIDIA_API_KEY 泄入产物(scripts/tests/security-build.test.ts 的根因)。
    // 仅构建期用安全字面量覆盖裸引用;成员访问(import.meta.env.VITE_X)由 Vite
    // 按具体属性正常静态替换,不受影响。dev 保持真实 import.meta.env。
    ...(command === 'build' ? {
      define: {
        'import.meta.env': `({ BASE_URL: "/", MODE: ${JSON.stringify(mode)}, DEV: ${!isProdBuild}, PROD: ${isProdBuild}, SSR: false })`,
      },
    } : {}),
    server: {
      port: 3001,
      strictPort: true,
      host: '0.0.0.0',
      proxy: {
        '/api/volcengine': {
          target: 'https://openspeech.bytedance.com/api/v1/tts',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/volcengine/, '')
        },
        '/api/edge-tts-generate': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/edge-tts-generate/, '/tts')
        },
        '/api/edge-tts-voices': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/edge-tts-voices/, '/voices')
        },
        '/api/piper-tts-generate': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/piper-tts-generate/, '/piper/tts')
        },
        '/api/piper-voices': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/piper-voices/, '/piper/voices')
        },
        '/api/chattts-generate': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/chattts-generate/, '/chattts/tts')
        },
        '/api/chattts-voices': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/chattts-voices/, '/chattts/voices')
        },
        '/api/chattts-models': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/chattts-models/, '/chattts/models')
        },
        '/api/tts-engines': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tts-engines/, '/engines')
        },
        '/api/tts-engine-install': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tts-engine-install/, '/engines')
        },
        '/api/tts-preview': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tts-preview/, '/preview')
        },
        '/api/room': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/api\/room/, '/api'),
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
                proxyRes.headers['x-accel-buffering'] = 'no';
              }
            });
          },
        },
        '/api/local-llm': {
          target: 'http://127.0.0.1:19000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/local-llm/, '/proxy/llm/chat/completions'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              proxyReq.removeHeader('sec-fetch-site');
              proxyReq.removeHeader('sec-fetch-mode');
              proxyReq.removeHeader('sec-fetch-dest');
            });
          }
        },
        '/api/nvidia-models': {
          target: 'https://integrate.api.nvidia.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/nvidia-models/, '/models'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const apiKey = env.NVIDIA_API_KEY;
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
            });
          }
        },
        '/api/nvidia-chat': {
          target: 'https://integrate.api.nvidia.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/nvidia-chat/, '/chat/completions'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const apiKey = env.NVIDIA_API_KEY;
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
            });
          }
        }
      }
    },
    plugins: [
      react(),
      localLlmGatewayPlugin(),
      ttsBackendPlugin(),
      roomServerPlugin()
    ],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, 'src'),
      }
    }
  };
});
