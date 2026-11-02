// 环回 LLM 网关的目标校验（vite dev 插件与单测共用这一份）。
// electron/main.cjs 是 CommonJS，无法直接 import TS，其内联实现由
// llm-gateway-target.test.ts 做漂移断言 —— 改白名单时两边要同步。
//
// 为什么不能只校验 loopback：局域网客人借房主身份打 127.0.0.1 时，
// 若不限制路径，就能触达本机其它 loopback-only 服务
// （如 MCP hub 的 /decision、各类本地管理面板），等于把宿主机回环开给客人。
// 白名单只覆盖本地 LLM API 的常见路径，业务上用到的目标全部落在其中。

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const EXACT_PATHS = new Set([
    '/chat/completions',
    '/completions',
    '/models',
    '/embeddings',
    '/api/tags',
    '/api/chat',
    '/api/generate',
    '/api/show',
    '/api/version',
]);

/** 合法的转发目标 = loopback 主机 + LLM API 路径白名单；否则返回 null */
export function parseLoopbackLlmTarget(raw: string): URL | null {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) return null;
    const pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    if (pathname === '/') return null;
    if (pathname.startsWith('/v1/') || EXACT_PATHS.has(pathname)) return parsed;
    return null;
}
