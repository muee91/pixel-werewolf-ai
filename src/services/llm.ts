
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { LLMPreset, Player, ROLE_INFO, LLMProviderConfig, Role } from '../types';
import { Capacitor } from '@capacitor/core';
import { probeLocalLlm } from '../utils/localLlmProbe';

// --- LLM Service ---

const isQclawLocalProvider = (providerConfig: LLMProviderConfig): boolean => {
    const baseUrl = (providerConfig.baseUrl || '').trim();
    const name = (providerConfig.name || '').trim();
    return /^https?:\/\/(127\.0\.0\.1|localhost):19000\b/i.test(baseUrl) || /qclaw/i.test(name);
};

const isNativePlatform = Capacitor.isNativePlatform();
const isNvidiaProvider = (providerConfig: LLMProviderConfig): boolean =>
    (providerConfig.baseUrl || '').trim().replace(/\/+$/, '') === 'https://integrate.api.nvidia.com/v1';

const canUseServerProxy = (providerConfig: LLMProviderConfig, remoteBaseUrl?: string): boolean =>
    isNvidiaProvider(providerConfig) && (!isNativePlatform || !!remoteBaseUrl);

export const getOpenAICompatibleChatUrl = (providerConfig: LLMProviderConfig, remoteBaseUrl?: string): string => {
    const baseUrl = providerConfig.baseUrl || "https://api.openai.com/v1";
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');

    if (isQclawLocalProvider(providerConfig)) {
        if (remoteBaseUrl) {
            return `${remoteBaseUrl}/proxy/llm/chat/completions`;
        }
        if (isNativePlatform) {
            return `${normalizedBaseUrl}/chat/completions`;
        }
        return '/api/local-llm';
    }

    // 本地端点(Ollama/LM Studio 等任意 loopback 端口)：浏览器直连会撞 CORS,
    // 统一走同源环回网关；原生平台(手机)无 CORS 限制,保留直连。
    // QClaw 必须先走上面的专用代理路径，不能被这里的通用 loopback 分支截走。
    if (!isNativePlatform && isLocalOpenAICompatibleProvider(providerConfig)) {
        return `/api/local-llm-gateway?target=${encodeURIComponent(`${normalizedBaseUrl}/chat/completions`)}`;
    }

    if (normalizedBaseUrl === 'https://integrate.api.nvidia.com/v1') {
        if (isNativePlatform && !remoteBaseUrl) {
            return `${normalizedBaseUrl}/chat/completions`;
        }
        if (remoteBaseUrl) {
            return `${remoteBaseUrl}/proxy/nvidia-chat`;
        }
        return '/api/nvidia-chat';
    }

    if (/\/(chat\/completions|proxy\/llm)$/i.test(normalizedBaseUrl)) {
        return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl}/chat/completions`;
};

const isLocalOpenAICompatibleProvider = (providerConfig: LLMProviderConfig): boolean => {
    return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\b/i.test((providerConfig.baseUrl || '').trim());
};

const getAuthHeaders = (providerConfig: LLMProviderConfig): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isQclawLocalProvider(providerConfig)) {
        return headers;
    }
    const apiKey = providerConfig.apiKey?.trim();
    if (apiKey && /^[\x00-\xff]+$/.test(apiKey)) {
        headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
};

export type LLMProgressStatus = 'thinking';
export type LLMProgressCallback = (progress: {
    attempt: number;
    maxAttempts: number;
    status: LLMProgressStatus;
}) => void;

const isAbortError = (error: unknown): boolean => {
    return error instanceof DOMException && error.name === 'AbortError';
};

const throwIfAborted = (signal?: AbortSignal) => {
    if (signal?.aborted) {
        throw new DOMException('LLM request aborted by user.', 'AbortError');
    }
};

// 单次 LLM 请求的硬超时（3 分钟）：外部 provider 挂起/无响应时兜底，
// 否则联机房主端整局会永远卡在等待上。调用方仍可通过自己的 AbortSignal 提前取消。
const LLM_REQUEST_TIMEOUT_MS = 180000;

const abortable = async <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return promise;
    throwIfAborted(signal);

    return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('LLM request aborted by user.', 'AbortError')), { once: true });
        })
    ]);
};

const abortableSleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
    if (!signal) {
        await new Promise(resolve => setTimeout(resolve, ms));
        return;
    }
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('LLM request aborted by user.', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
};

// 限流/服务端过载的自动退避：429 与 5xx 指数退避 + 抖动，尊重 Retry-After。
// 引擎层的 MAX_LLM_RETRY 只覆盖决策重试，这里保证撞限流时不至于线性 1.5s 硬撞。
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 8000;

const parseRetryAfterMs = (value: string | null): number | null => {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
};

type StatusedError = Error & { status?: number; retryAfterMs?: number };
export async function generateText(
    messages: { role: string; content: string }[],
    preset: LLMPreset,
    providerConfig: LLMProviderConfig,
    onProgress?: LLMProgressCallback,
    signal?: AbortSignal,
    remoteBaseUrl?: string
): Promise<string> {
    const doFetch = async () => {
        throwIfAborted(signal);
        // 内部超时控制器：调用方 signal（用户取消/引擎卸载）与硬超时先到者生效
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
        const onCallerAbort = () => controller.abort();
        signal?.addEventListener('abort', onCallerAbort, { once: true });
        try {
        if (providerConfig.type === 'gemini') {
            // --- GEMINI NATIVE SDK ---
            const apiKey = providerConfig.apiKey;
            if (!apiKey) throw new Error("No API Key configured for Gemini.");

            const ai = new GoogleGenAI({ apiKey });
            let systemInstruction = "";
            let promptParts: string[] = [];

            messages.forEach(m => {
                if (m.role === 'system') systemInstruction += m.content + "\n\n";
                else promptParts.push(`${m.role === 'user' ? 'User' : 'Model'}: ${m.content}`);
            });

            const finalPrompt = promptParts.join('\n');

            const response = await abortable(ai.models.generateContent({
                model: preset.modelId,
                contents: finalPrompt,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7,
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    ],
                }
            }), controller.signal);

            return response.text || "";

        } else {
            // --- OPENAI COMPATIBLE ---
            let effective = providerConfig;
            let effectiveModelId = preset.modelId;
            // 未配置 API Key 且非本地/代理通道时，自动探测本机推理端点兜底
            const unusableWithoutKey = !providerConfig.apiKey && !isLocalOpenAICompatibleProvider(providerConfig) && !canUseServerProxy(providerConfig, remoteBaseUrl);
            if (unusableWithoutKey) {
                const local = await probeLocalLlm();
                if (!local) throw new Error("No API Key configured for this provider.");
                effective = { ...providerConfig, type: 'openai', baseUrl: local.baseUrl, apiKey: '' };
                effectiveModelId = local.modelId;
                // 静默回退显性化:通知应用层写对局日志(引擎监听)
                try {
                    window.dispatchEvent(new CustomEvent('llm-local-fallback', { detail: { requested: preset.modelId, used: local.modelId } }));
                } catch { /* 非浏览器环境忽略 */ }
            }

            const url = getOpenAICompatibleChatUrl(effective, remoteBaseUrl);

            const body: { model: string; messages: { role: string; content: string }[]; temperature: number } = {
                model: effectiveModelId,
                messages: messages,
                temperature: 0.7
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: getAuthHeaders(effective),
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                // 标记状态码与 Retry-After，供外层限流退避判断
                const error: StatusedError = new Error(`LLM API Error (${effective.name}): ${response.status} - ${errorText}`);
                error.status = response.status;
                error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
                throw error;
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "";
        }
        } finally {
            window.clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onCallerAbort);
        }
    };

    try {
        onProgress?.({ attempt: 1, maxAttempts: 1, status: 'thinking' });
        for (let rateLimitAttempt = 0; ; rateLimitAttempt++) {
            try {
                return await doFetch();
            } catch (e) {
                if (isAbortError(e)) throw e;
                const status = (e as StatusedError).status;
                const retryable = status === 429 || (typeof status === 'number' && status >= 500);
                if (!retryable || rateLimitAttempt >= RATE_LIMIT_MAX_RETRIES) throw e;
                const backoff = Math.min(RATE_LIMIT_MAX_DELAY_MS, RATE_LIMIT_BASE_DELAY_MS * 2 ** rateLimitAttempt);
                const delay = (e as StatusedError).retryAfterMs ?? backoff + Math.random() * 500;
                await abortableSleep(delay, signal);
            }
        }
    } catch (e) {
        if (isAbortError(e)) throw e;
        console.error("LLM Generation Failed:", e);
        throw e;
    }
}

export async function validateModelAvailability(
    preset: LLMPreset,
    providerConfig: LLMProviderConfig,
    timeoutMs: number = 15000,
    remoteBaseUrl?: string
): Promise<string> {
    if (!providerConfig.apiKey && !isLocalOpenAICompatibleProvider(providerConfig) && !canUseServerProxy(providerConfig, remoteBaseUrl)) {
        return "Error: No API Key configured.";
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        if (providerConfig.type === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: providerConfig.apiKey });
            const response = await ai.models.generateContent({
                model: preset.modelId,
                contents: 'Reply only: ok',
                config: {
                    temperature: 0,
                    maxOutputTokens: 5,
                }
            });
            return response.text || "";
        }

        const url = getOpenAICompatibleChatUrl(providerConfig, remoteBaseUrl);
        const requestTargetLabel = url === '/api/local-llm' ? '本地代理 /api/local-llm' : url;

        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(providerConfig),
            body: JSON.stringify({
                model: preset.modelId,
                messages: [{ role: 'user', content: '请只回复两个字：通过' }],
                temperature: 0,
                max_tokens: 16,
                stream: false
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM API Error (${providerConfig.name} via ${requestTargetLabel}): ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
            return `Error: 验证超时，超过 ${Math.round(timeoutMs / 1000)} 秒未响应。`;
        }
        return `Error: ${e instanceof Error ? e.message : '模型验证失败。'}`;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

// --- Utilities & Prompt Builders ---

const stripThinkingLeak = (text: string): string => {
    if (!text) return "";

    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/```json\n?|\n?```/g, '')
        .split('\n')
        .filter(line => !/^\s*(思考|分析|推理|策略|内心|reasoning|thought|analysis)\s*[:：]/i.test(line))
        .join('\n')
        .replace(/^(发言|回答|speak)\s*[:：]\s*/i, '')
        .replace(/[\(（]\s*(思考|分析|推理|策略|内心)[\s\S]*?[\)）]/g, '')
        .trim();
};

const normalizePublicStrategySummary = (value: Record<string, unknown> | null, fallbackSpeech: string): string => {
    const explicitSummary = stripThinkingLeak(String((value as Record<string, unknown>)?.strategySummary || (value as Record<string, unknown>)?.summary || '')).trim();
    if (explicitSummary) return explicitSummary.slice(0, 120);

    const publicSpeech = stripThinkingLeak(fallbackSpeech).trim();
    if (!publicSpeech) return '未生成有效发言，无法提炼公开摘要。';

    const compact = publicSpeech
        .replace(/\s+/g, ' ')
        .replace(/我是\d+号[^。！？]*[。！？]?/g, '')
        .trim();

    return (compact || publicSpeech).slice(0, 80);
};

const sanitizeJsonLikeText = (text: string): string => text
    .replace(/```json\n?|\n?```/g, '')
    .trim()
    .replace(/,\s*([}\]])/g, '$1');

const stripThinkingBlocks = (text: string): string => text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();

const extractJsonObjectCandidates = (text: string): string[] => {
    const candidates: string[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (isEscaped) {
                isEscaped = false;
            } else if (char === '\\') {
                isEscaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            if (depth === 0) start = i;
            depth += 1;
            continue;
        }

        if (char === '}') {
            if (depth === 0) continue;
            depth -= 1;
            if (depth === 0 && start >= 0) {
                candidates.push(text.slice(start, i + 1));
                start = -1;
            }
        }
    }

    return candidates;
};


export type LLMResponse = {
    speak: string;
    strategySummary: string;
    actionTarget?: number | null;
    target?: number | null;
    target1?: number | null;
    target2?: number | null;
    cupidTarget1?: number | null;
    cupidTarget2?: number | null;
    action?: string;
    shouldExplode?: boolean;
    useCure?: boolean;
    poisonTarget?: number | null;
    skillType?: string | null;
    merchantSkillType?: string | null;
    wolfExplode?: boolean;
    explodeTarget?: number | null;
    summary?: string;
    speech?: string;
    secondTarget?: number | null;
    shootTarget?: number | null;
    shootActionTarget?: number | null;
    shouldWithdraw?: boolean;
} & Record<string, unknown>

const normalizeParsedLLMResponse = (value: unknown): LLMResponse => {
    if (!value || typeof value !== 'object') {
        const speak = stripThinkingLeak(String(value || ''));
        return { speak, strategySummary: normalizePublicStrategySummary(null, speak) };
    }

    const { thought, reasoning, reasoning_content, analysis, ...rest } = value as Record<string, unknown>;
    const speak = stripThinkingLeak(String(rest.speak || rest.speech || rest.content || ''));
    const strategySummary = normalizePublicStrategySummary(rest, speak);
    return { ...rest, speak, strategySummary };
};

export const parseLLMResponse = (responseText: string): LLMResponse => {
    const textWithoutThinking = stripThinkingBlocks(responseText);
    const cleanText = sanitizeJsonLikeText(textWithoutThinking || responseText);

    try {
        return normalizeParsedLLMResponse(JSON.parse(cleanText));
    } catch (e) {
        const candidates = [
            ...extractJsonObjectCandidates(cleanText),
            ...extractJsonObjectCandidates(sanitizeJsonLikeText(responseText))
        ];

        let bestParsed: LLMResponse | null = null;
        for (const candidate of candidates.reverse()) {
            try {
                const parsed = normalizeParsedLLMResponse(JSON.parse(sanitizeJsonLikeText(candidate)));
                if (parsed.speak) return parsed;
                if (!bestParsed) bestParsed = parsed;
            } catch (e2) {
                // Try next candidate.
            }
        }

        if (bestParsed) return bestParsed;

        const summaryOnlyMatch = cleanText.match(/"strategySummary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
        if (summaryOnlyMatch) {
            const strategySummary = summaryOnlyMatch[1].replace(/\\"/g, '"').trim();
            return normalizeParsedLLMResponse({ speak: '', strategySummary });
        }

        return normalizeParsedLLMResponse({ speak: responseText });
    }
};
