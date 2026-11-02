#!/usr/bin/env node
/**
 * 项目专用 3D 对局 canvas 检查入口。
 *
 * 复用 threejs-game-skills 的 inspect-threejs-canvas.mjs 指标管线
 * （像素统计 / 截图 / GPU 识别 / 渲染预算对照），并额外注入两件本项目特有的事：
 *
 *  1. 测试钩子：首页「亲自上场 → 点燃营火」进入 3D 营地，等待首帧就绪后
 *     采样 GL draw 拦估算每帧 draw calls / 三角形，写入
 *     window.__THREE_GAME_DIAGNOSTICS__（本项目没有脚手架的 renderer.info 钩子，
 *     用页面内拦截 GL draw* 调用按帧均值估算，避免伪造预算数据）。
 *  2. 拦截外部 LLM 请求（example.test），返回最小 OpenAI 响应并带 CORS 头，
 *     防止 DNS/网络错误进入控制台证据（检查器对任何 console error 判失败）。
 *
 * 用法与检查器一致：
 *   node scripts/inspect-3d-active-play.mjs --url http://127.0.0.1:39012 \
 *     --out artifacts/pass-1 --state active-play --run-id pass-1 [--mobile]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SKILL_INSPECTOR =
  '/Users/muee/Library/Application Support/Xiaomi MiMo/engine-config/skills/threejs-game-skills/scripts/inspect-threejs-canvas.mjs';

const { parseArgs, inspectPage, loadDependency } = await import(pathToFileURL(SKILL_INSPECTOR).href);

const args = parseArgs(process.argv.slice(2));
if (args.state === null) args.state = 'active-play';
// 进入对局 + 世界生成比脚手架的状态切换慢得多，放宽准备阶段截止时间
args.timeoutMs = 60_000;
args.wait = Math.max(args.wait, 1200);

await mkdir(args.out, { recursive: true });

async function installHooks(context) {
  // 外部主机（example.test 的假 LLM）一律拦截：OPTIONS 预检 + OpenAI 形状响应
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, GET, OPTIONS',
          'access-control-allow-headers': '*',
        },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '我先观望一轮，大家理性发言。' } }],
      }),
    });
  });
  // 站内缺失资源不制造控制台错误（如 favicon）
  await context.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  // 本机探测端点（Ollama 11434 / LM Studio 1234 / QClaw 19000 / MCP 桥 3015 等）
  // 未运行时会产生 net::ERR_CONNECTION_REFUSED 控制台错误，而检查器对任何
  // console error 判失败。回 200 + 无模型的空列表：探测逻辑仍得到「无本地模型」，
  // 行为与真实失败一致（probeLocalLlm 返回 null），且不污染控制台证据。
  const previewPort = String(new URL(args.url).port || (args.url.startsWith('https') ? 443 : 80));
  await context.route(
    url => {
      const u = new URL(url);
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && port !== previewPort;
    },
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [], models: [], claimed: [] }),
    }),
  );

  await context.addInitScript(() => {
    // ── e2e 同款种子（scripts/e2e/voxel-3d.spec.ts） ──
    localStorage.setItem('werewolf-e2e', '1');
    localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: true, narratorActorId: 'n1' }));
    localStorage.setItem('werewolf-llmProviders', JSON.stringify([{
      id: 'provider-test', name: '测试供应商', type: 'openai',
      baseUrl: 'https://example.test/v1', apiKey: 'test-api-key',
    }]));
    localStorage.setItem('werewolf-llmPresets', JSON.stringify([{
      id: 'llm-test', name: '测试模型', providerId: 'provider-test', modelId: 'test-model',
    }]));
    // 直接以 3D 视图开局（normalizeUiConfig 会补齐其余字段）
    const prev = (() => {
      try { return JSON.parse(localStorage.getItem('werewolf-uiConfig') || '{}'); }
      catch { return {}; }
    })();
    prev.gameViewMode = '3d';
    localStorage.setItem('werewolf-uiConfig', JSON.stringify(prev));

    HTMLMediaElement.prototype.play = function () {
      queueMicrotask(() => this.dispatchEvent(new Event('play')));
      queueMicrotask(() => this.dispatchEvent(new Event('ended')));
      return Promise.resolve();
    };

    // ── GL draw 拦截：估算每帧 draw calls 与三角形（不修改游戏代码） ──
    window.__GL__ = window.__GL__ || { draws: 0, tris: 0 };
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const ctx = origGetContext.call(this, type, attrs);
      if ((type === 'webgl2' || type === 'webgl') && ctx && !ctx.__drawPatched) {
        try {
          ctx.__drawPatched = true;
          const wrap = (name, countArg, instArg) => {
            if (typeof ctx[name] !== 'function') return;
            const orig = ctx[name].bind(ctx);
            ctx[name] = (...a) => {
              if (a[0] === 4) { // mode === TRIANGLES
                const n = a[countArg];
                const inst = instArg != null ? a[instArg] : 1;
                window.__GL__.tris += Math.floor(n / 3) * (typeof inst === 'number' ? inst : 1);
              }
              window.__GL__.draws += 1;
              return orig(...a);
            };
          };
          wrap('drawArrays', 2);              // (mode, first, count)
          wrap('drawElements', 1);            // (mode, count, type, offset)
          wrap('drawArraysInstanced', 2, 3);  // (mode, first, count, instanceCount)
          wrap('drawElementsInstanced', 1, 4);// (mode, count, type, offset, instanceCount)
        } catch { /* 拦截失败不影响游戏，只影响估算指标 */ }
      }
      return ctx;
    };

    // ── 测试钩子 ──
    const q = sel => document.querySelector(sel);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const buttons = () => Array.from(document.querySelectorAll('button'));
    const clickWhen = async (re, timeout) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const b = buttons().find(x => re.test(x.textContent || ''));
        if (b) { b.click(); return true; }
        await sleep(120);
      }
      return false;
    };
    const waitFor = async (fn, timeout) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (fn()) return true;
        await sleep(150);
      }
      return false;
    };
    const roomReady = () =>
      !!q('[data-testid="voxel-rpg-canvas"]') &&
      !!q('[data-testid="rpg-hud"]') &&
      !String(document.body.innerText || '').includes('正在点亮营地');

    window.__THREE_GAME_TEST_HOOKS__ = {
      async setState(state) {
        if (state !== 'active-play') throw new Error(`unknown state: ${state}`);
        if (!roomReady()) {
          await clickWhen(/亲自上场/, 2500);
          if (!(await clickWhen(/点燃营火/, 6000))) throw new Error('「点燃营火」按钮未出现');
          if (!(await waitFor(roomReady, 40_000))) throw new Error('3D 营地未在 40s 内就绪');
        }
        // 场景就绪后采样约 900ms 的 GL draw 与 rAF 帧数，估算每帧开销
        const t0 = performance.now();
        const s0 = { draws: window.__GL__.draws, tris: window.__GL__.tris };
        let frames = 0;
        await new Promise(resolve => {
          const tick = () => {
            frames += 1;
            if (performance.now() - t0 >= 900) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const dt = performance.now() - t0;
        const draws = window.__GL__.draws - s0.draws;
        const tris = window.__GL__.tris - s0.tris;
        const fps = frames > 0 ? Math.round((frames / dt) * 10000) / 10 : null;
        // 项目内 RenderDiagnostics（ForestCampScene）已逐帧发布真实 renderer.info；
        // 只有在钩子缺失时才回退到 GL draw 拦截估算。保持同一对象引用，
        // 让钩子在采样后的帧里继续刷新 renderer 字段。
        const diagnostics = (window.__THREE_GAME_DIAGNOSTICS__ ??= {});
        const hasRealRenderer = !!diagnostics.renderer && typeof diagnostics.renderer.calls === 'number';
        if (!hasRealRenderer) {
          diagnostics.renderer = frames > 0
            ? { calls: Math.round(draws / frames), triangles: Math.round(tris / frames) }
            : null;
        }
        diagnostics.perf = { fps, frames, windowMs: Math.round(dt), drawCallsSampled: draws, trianglesSampled: tris };
        diagnostics.note = hasRealRenderer
          ? 'renderer.* 来自项目 RenderDiagnostics 钩子（renderer.info）；perf 为 900ms rAF 采样'
          : '项目未提供 renderer.info 钩子，calls/triangles 为 GL draw 拦截按帧均值估算；geometries/textures 不可得';
        return { state };
      },
      async setPausedForScreenshot(paused) {
        // 按钮文案 = 当前可执行的动作：运行中显示「暂停世界」，已暂停显示「继续世界」。
        // 想让画面停下来（paused=true），就要让它最终显示「继续世界」。
        const want = paused ? '继续世界' : '暂停世界';
        const end = Date.now() + 5000;
        while (Date.now() < end) {
          const b = buttons().find(x => /暂停世界|继续世界/.test(x.textContent || ''));
          if (!b) return; // 对局未开始（首页阶段）或按钮正处于重渲染间隙
          if ((b.textContent || '').includes(want)) return;
          b.click();
          await sleep(200);
        }
        throw new Error(`setPausedForScreenshot(${paused}) 未达到「${want}」状态`);
      },
    };
  });
}

const { devices, chromium } = await loadDependency('@playwright/test', process.cwd());

async function launch() {
  // 完整 Chromium 新无头模式才走真实 GPU；chromium_headless_shell 会退到 SwiftShader
  try { return await chromium.launch({ channel: 'chromium' }); }
  catch { return await chromium.launch(); }
}

const browser = await launch();
let report;
try {
  const context = await browser.newContext(args.mobile
    ? { ...devices['iPhone 13'], userAgent: undefined }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await installHooks(context);
  const page = await context.newPage();
  // 控制台错误不带 URL；失败请求单独打到 stderr 便于定位
  page.on('requestfailed', req =>
    console.error(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText ?? 'unknown'}`));
  report = await inspectPage(page, args);
} finally {
  await browser.close();
}

const baseName = args.state ? `${report.mode}-${args.state}` : report.mode;
await writeFile(path.join(args.out, `${baseName}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.result.ok || report.consoleErrors.length > 0 || report.pageErrors.length > 0) {
  process.exitCode = 1;
}
