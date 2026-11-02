import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { parseLoopbackLlmTarget } from '../../server/llm-gateway-target';

const projectRoot = resolve(import.meta.dirname, '../..');

// ── 目标校验：loopback + LLM API 路径白名单 ────────────────

test('loopback targets on known llm api paths are allowed', () => {
    assert.ok(parseLoopbackLlmTarget('http://127.0.0.1:11434/v1/chat/completions'));
    assert.ok(parseLoopbackLlmTarget('http://localhost:1234/v1/models'));
    assert.ok(parseLoopbackLlmTarget('http://127.0.0.1:8080/chat/completions'));
    assert.ok(parseLoopbackLlmTarget('http://127.0.0.1:9000/models'));
    assert.ok(parseLoopbackLlmTarget('http://127.0.0.1:11434/api/tags'));
    assert.ok(parseLoopbackLlmTarget('http://127.0.0.1:11434/api/chat'));
    // baseUrl 尾随斜杠与重复斜杠要被归一化后仍放行
    assert.ok(parseLoopbackLlmTarget('http://127.0.0.1:11434/v1//chat/completions'));
    assert.ok(parseLoopbackLlmTarget('http://127.0.0.1:11434/models/'));
});

test('non-llm paths, non-loopback hosts and bad urls are rejected', () => {
    // SSRF 的核心目标：本机 loopback-only 服务
    assert.equal(parseLoopbackLlmTarget('http://127.0.0.1:3015/decision'), null);
    assert.equal(parseLoopbackLlmTarget('http://127.0.0.1:3015/agent/poll'), null);
    assert.equal(parseLoopbackLlmTarget('http://127.0.0.1:9000/admin'), null);
    assert.equal(parseLoopbackLlmTarget('http://127.0.0.1:9000/'), null);
    // 非 loopback 主机一律拒绝
    assert.equal(parseLoopbackLlmTarget('http://10.0.0.5:11434/models'), null);
    assert.equal(parseLoopbackLlmTarget('http://example.com/v1/models'), null);
    // 非 http(s) 与坏输入
    assert.equal(parseLoopbackLlmTarget('file:///etc/passwd'), null);
    assert.equal(parseLoopbackLlmTarget('not a url'), null);
    assert.equal(parseLoopbackLlmTarget(''), null);
});

// ── 漂移断言：electron 主进程（CJS）内联的白名单与 TS 单一来源一致 ──

test('electron main keeps the same gateway path allowlist as the shared validator', () => {
    const main = readFileSync(resolve(projectRoot, 'electron/main.cjs'), 'utf8');
    for (const p of ['/chat/completions', '/completions', '/models', '/embeddings', '/api/tags', '/api/chat', '/api/generate', '/api/show', '/api/version']) {
        assert.ok(main.includes(`'${p}'`), `electron/main.cjs 缺少白名单路径 ${p}`);
    }
    assert.ok(main.includes("startsWith('/v1/')"), 'electron/main.cjs 缺少 /v1/* 前缀放行');
});

test('vite dev gateway uses the shared validator', () => {
    const viteConfig = readFileSync(resolve(projectRoot, 'vite.config.ts'), 'utf8');
    assert.ok(viteConfig.includes('parseLoopbackLlmTarget'));
    assert.ok(!viteConfig.includes('function isLoopbackTarget'), '旧的宽松校验应已移除');
});
