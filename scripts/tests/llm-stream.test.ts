import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPartialSpeech, readSseData, readStreamChunk, splitSseEvents } from '../../src/services/llmStream';

// 流式上屏的两个纯函数：SSE 切帧 + 半截 JSON 取 speak。
// 它们必须能扛住"网络把一帧切两半""转义序列被切断""模型不按 JSON 说话"三种现场。

test('splitSseEvents keeps the incomplete tail for the next chunk', () => {
    const first = splitSseEvents('data: {"a":1}\n\ndata: {"b":');
    assert.deepEqual(first.events, ['data: {"a":1}']);
    assert.equal(first.rest, 'data: {"b":');

    const second = splitSseEvents(first.rest + '2}\n\n');
    assert.deepEqual(second.events, ['data: {"b":2}']);
    assert.equal(second.rest, '');
});

test('splitSseEvents tolerates CRLF and heartbeat blank lines', () => {
    const { events, rest } = splitSseEvents('data: a\r\n\r\n\r\n\ndata: b\r\n\r\n');
    assert.deepEqual(events, ['data: a', 'data: b']);
    assert.equal(rest, '');
});

test('readSseData joins multi-line payloads and drops the done marker', () => {
    assert.equal(readSseData('data: line1\ndata: line2'), 'line1\nline2');
    assert.equal(readSseData('data: [DONE]'), null);
    assert.equal(readSseData('event: ping'), null);
    assert.equal(readSseData('data:{"a":1}'), '{"a":1}', '冒号后没有空格也要能读');
});

test('readStreamChunk reads content, reasoning and usage', () => {
    assert.deepEqual(
        readStreamChunk('{"choices":[{"delta":{"content":"你"}}]}'),
        { content: '你', reasoning: '', usage: null },
    );
    const withReasoning = readStreamChunk('{"choices":[{"delta":{"reasoning_content":"想"}}]}');
    assert.equal(withReasoning?.reasoning, '想');
    assert.equal(withReasoning?.content, '');
    const usageOnly = readStreamChunk('{"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":34}}');
    assert.equal(usageOnly?.usage.completion_tokens, 34);
    assert.equal(readStreamChunk('not json'), null);
    assert.equal(readStreamChunk('{"choices":[{"delta":{}}]}'), null);
});

test('extractPartialSpeech waits instead of leaking raw JSON', () => {
    assert.equal(extractPartialSpeech(''), '');
    assert.equal(extractPartialSpeech('{"speak"'), '');
    assert.equal(extractPartialSpeech('{"speak":'), '');
    assert.equal(extractPartialSpeech('{"speak":"'), '');
    assert.equal(extractPartialSpeech('{"actionTarget":3,"strategySummary":"先看'), '', 'speak 之前的内容不该被当成发言');
});

test('extractPartialSpeech decodes escapes and survives a cut escape sequence', () => {
    assert.equal(extractPartialSpeech('{"speak":"今天先过 4 号'), '今天先过 4 号');
    assert.equal(extractPartialSpeech('{"speak":"他说\\"我信你'), '他说"我信你');
    assert.equal(extractPartialSpeech('{"speak":"第一行\\n第二'), '第一行\n第二');
    assert.equal(extractPartialSpeech('{"speak":"结尾是反斜杠\\'), '结尾是反斜杠', '半个转义符必须丢掉');
    assert.equal(extractPartialSpeech('{"speak":"\\u4f60'), '你');
    assert.equal(extractPartialSpeech('{"speak":"\\u4f'), '', '\\uXXXX 没收全时先不吐字');
    assert.equal(extractPartialSpeech('{"speak":"说完了","actionTarget":3}'), '说完了');
});

test('extractPartialSpeech falls back to plain speech when the model ignores JSON', () => {
    assert.equal(extractPartialSpeech('我觉得 5 号有问题，先投他'), '我觉得 5 号有问题，先投他');
    assert.equal(extractPartialSpeech('  我怀疑 3 号  '), '我怀疑 3 号');
});

test('streaming a real response character by character never regresses', () => {
    const json = JSON.stringify({
        speak: '我站 3 号，他昨天的票型最干净；如果今天没人跳预言家，我的票就锁 7 号。',
        actionTarget: 7,
        strategySummary: '跟票 3 号的归票',
    });
    let shown = '';
    for (let i = 1; i <= json.length; i += 1) {
        const next = extractPartialSpeech(json.slice(0, i));
        assert.ok(next.startsWith(shown), `第 ${i} 个字符处文本回退了：${shown} -> ${next}`);
        shown = next;
    }
    assert.equal(shown, '我站 3 号，他昨天的票型最干净；如果今天没人跳预言家，我的票就锁 7 号。');
});
