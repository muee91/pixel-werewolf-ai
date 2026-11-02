import assert from 'node:assert/strict';
import test from 'node:test';
import { corsHintError, isCorsLikelyError } from '../../src/utils/llmErrors';

// 这条守的是"别把跨域被拦说成模型坏了"：
// 玩家看到"模型不可用"会去改 key、改模型名，改一百次也不会好。

test('各浏览器的"请求没发出去"都算跨域高概率', () => {
    for (const message of [
        'TypeError: Failed to fetch',
        'NetworkError when attempting to fetch resource.',
        'Load failed',
        'Network request failed',
        'fetch failed',
    ]) {
        assert.equal(isCorsLikelyError(new Error(message)), true, message);
    }
});

test('真正的模型错误不能被误判成跨域', () => {
    const cases = [
        new Error('LLM API Error (网关): 401 - {"error":"invalid_api_key"}'),
        new Error('LLM API Error (网关): 404 - model not found'),
        new Error('LLM API Error (网关): 429 - rate limited'),
        new DOMException('LLM request aborted by user.', 'AbortError'),
        undefined,
        null,
        '',
    ];
    for (const error of cases) {
        assert.equal(isCorsLikelyError(error), false, String(error));
    }
});

test('打出标记的错误一律算跨域，文案能直接给玩家看', () => {
    const error = corsHintError('TypeError: Failed to fetch');
    assert.equal(isCorsLikelyError(error), true);
    assert.match(error.message, /CORS/);
    assert.match(error.message, /与 key、模型名无关/);
    assert.match(error.message, /401/);
});
