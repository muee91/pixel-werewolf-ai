/**
 * SSE 与"半截 JSON"解析：流式上屏所需的两个纯函数。
 *
 * 为什么要单独一层：模型输出的是 JSON（`{"speak":"…","actionTarget":3}`），
 * 直接把增量文本贴给玩家只会看到 `{"speak":"今`。所以流式链路必须能从**未完成的 JSON**
 * 里把 speak 字段已经到达的部分抠出来，且不能因为转义序列被切成两半而吐错字。
 *
 * 这两件事都不依赖网络与 React，放在这里便于单测（见 scripts/tests/llm-stream.test.ts）。
 */

/** 从 SSE 缓冲区里切出完整事件，返回剩下不完整的那截。 */
export const splitSseEvents = (buffer: string): { events: string[]; rest: string } => {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const parts = normalized.split('\n\n');
    const rest = parts.pop() ?? '';
    return { events: parts.filter(part => part.trim().length > 0), rest };
};

/** 一个 SSE 事件里的 data 负载（多行 data: 用换行拼接）；`[DONE]` 返回 null。 */
export const readSseData = (event: string): string | null => {
    const lines = event.split('\n').filter(line => line.startsWith('data:'));
    if (lines.length === 0) return null;
    const payload = lines.map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (payload.trim() === '[DONE]') return null;
    return payload;
};

/**
 * OpenAI 兼容流里的一个 chunk：取出增量正文、增量推理、以及可能的 usage。
 * 有的网关把 delta 放在 `choices[0].delta`，也有放在 `choices[0].text` 的老格式。
 */
export interface StreamChunk {
    content: string;
    reasoning: string;
    usage: any | null;
}

export const readStreamChunk = (payload: string): StreamChunk | null => {
    let data: any;
    try {
        data = JSON.parse(payload);
    } catch {
        return null;
    }
    const choice = data?.choices?.[0];
    const content = typeof choice?.delta?.content === 'string'
        ? choice.delta.content
        : (typeof choice?.text === 'string' ? choice.text : '');
    const reasoning = typeof choice?.delta?.reasoning_content === 'string'
        ? choice.delta.reasoning_content
        : (typeof choice?.delta?.reasoning === 'string' ? choice.delta.reasoning : '');
    const usage = data?.usage ?? null;
    if (!content && !reasoning && !usage) return null;
    return { content, reasoning, usage };
};

const SPEECH_KEYS = ['speak', 'speech', 'spoke', 'spell'];

/**
 * 从**可能还没写完**的 JSON 里取出 speak 字段当前已到达的文本。
 *
 * - 还没出现 speak 键 → 返回空串（此时玩家该看到"思考中"而不是残缺 JSON）；
 * - 出现但字符串未闭合 → 返回已解码的部分；
 * - 结尾正好卡在转义符中间（`\` 或 `\u12`）→ 丢掉这半截，避免吐出乱码；
 * - 整段不是 JSON（有的模型直接说话）→ 原样返回，按普通文本上屏。
 */
export const extractPartialSpeech = (buffer: string): string => {
    const text = buffer.trimStart();
    if (!text) return '';
    if (!text.startsWith('{')) return buffer.trim();

    for (const key of SPEECH_KEYS) {
        const marker = `"${key}"`;
        const keyAt = text.indexOf(marker);
        if (keyAt < 0) continue;
        let cursor = keyAt + marker.length;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
        if (text[cursor] !== ':') continue;
        cursor += 1;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
        if (text[cursor] !== '"') return '';
        cursor += 1;

        let out = '';
        while (cursor < text.length) {
            const ch = text[cursor];
            if (ch === '"') return out;
            if (ch !== '\\') { out += ch; cursor += 1; continue; }

            const esc = text[cursor + 1];
            if (esc === undefined) return out; // 转义符刚被切断
            switch (esc) {
                case 'n': out += '\n'; cursor += 2; break;
                case 't': out += '\t'; cursor += 2; break;
                case 'r': out += '\r'; cursor += 2; break;
                case 'b': out += '\b'; cursor += 2; break;
                case 'f': out += '\f'; cursor += 2; break;
                case '"': out += '"'; cursor += 2; break;
                case '\\': out += '\\'; cursor += 2; break;
                case '/': out += '/'; cursor += 2; break;
                case 'u': {
                    const hex = text.slice(cursor + 2, cursor + 6);
                    if (hex.length < 4) return out; // \uXXXX 还没收全
                    const code = Number.parseInt(hex, 16);
                    if (Number.isNaN(code)) { cursor += 2; break; }
                    out += String.fromCharCode(code);
                    cursor += 6;
                    break;
                }
                default: out += esc; cursor += 2; break;
            }
        }
        return out;
    }
    return '';
};
