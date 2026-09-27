import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOpenAICompatibleChatUrl, parseLLMResponse } from '../../src/services/llm';

// parseLLMResponse 是引擎与 LLM 之间唯一的格式兜底层：
// 六级解析链（直接 JSON → 围栏剥离 → 花括号扫描 → strategySummary 正则 → 全文兜底）
// 的任何回归都会让整局决策变成空发言，这里锁定关键行为。

test('parses a clean JSON response', () => {
    const result = parseLLMResponse('{"speak":"我认为3号有问题","actionTarget":3,"strategySummary":"怀疑3号"}');
    assert.equal(result.speak, '我认为3号有问题');
    assert.equal(result.actionTarget, 3);
    assert.equal(result.strategySummary, '怀疑3号');
});

test('parses JSON wrapped in markdown fences', () => {
    const result = parseLLMResponse('```json\n{"speak":"过","actionTarget":null}\n```');
    assert.equal(result.speak, '过');
    assert.equal(result.actionTarget, null);
});

test('extracts JSON object embedded in prose', () => {
    const result = parseLLMResponse('我的发言如下：\n{"speak":"我是好人，请投5号","actionTarget":5}\n以上。');
    assert.equal(result.speak, '我是好人，请投5号');
    assert.equal(result.actionTarget, 5);
});

test('strips deepseek-style thinking blocks before parsing', () => {
    const result = parseLLMResponse('<think>我是狼人，不能暴露</think>{"speak":"昨晚是平安夜","actionTarget":null}');
    assert.equal(result.speak, '昨晚是平安夜');
    assert.ok(!result.speak.includes('我是狼人'));
});

test('drops leading 思考/策略 label lines from speech', () => {
    const result = parseLLMResponse('{"speak":"思考：先分析局势\\n发言内容"}');
    assert.equal(result.speak, '发言内容');
});

test('falls back to treating whole text as speech when no JSON exists', () => {
    const result = parseLLMResponse('我觉得2号发言有问题，今天投2号。');
    assert.ok(result.speak.includes('2号'));
});

test('recovers strategySummary via regex when speech is missing', () => {
    const result = parseLLMResponse('broken {"strategySummary": "弃票观察"} text');
    assert.equal(result.strategySummary, '弃票观察');
});

test('removes thought/reasoning fields from the parsed payload', () => {
    const result = parseLLMResponse('{"speak":"发言","thought":"我是预言家","reasoning_content":"验了2号"}');
    assert.equal((result as Record<string, unknown>).thought, undefined);
    assert.equal((result as Record<string, unknown>).reasoning_content, undefined);
});

test('sanitizes trailing commas in near-JSON text', () => {
    const result = parseLLMResponse('{"speak":"发言内容","actionTarget":2,}');
    assert.equal(result.speak, '发言内容');
    assert.equal(result.actionTarget, 2);
});

test('maps speech/summary/content aliases onto speak', () => {
    assert.equal(parseLLMResponse('{"speech":"别名发言"}').speak, '别名发言');
    assert.equal(parseLLMResponse('{"content":"content别名"}').speak, 'content别名');
});

test('returns empty-speak response for empty input without crashing', () => {
    const result = parseLLMResponse('');
    assert.equal(typeof result.speak, 'string');
});

test('routes QClaw through its local proxy instead of the generic loopback gateway', () => {
    assert.equal(getOpenAICompatibleChatUrl({
        id: 'qclaw',
        name: 'QClaw',
        type: 'openai',
        baseUrl: 'http://127.0.0.1:19000',
        apiKey: '',
    }), '/api/local-llm');
});
