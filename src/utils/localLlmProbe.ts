import { toLoopbackGatewayUrl } from './llmConfig';

export type LocalLlmProbeResult = {
    baseUrl: string;
    modelId: string;
};

const LOCAL_LLM_CANDIDATES = [
    'http://127.0.0.1:11434/v1', // Ollama
    'http://127.0.0.1:1234/v1',  // LM Studio
    'http://127.0.0.1:19000',    // QClaw 本地
];

let localLlmProbe: Promise<LocalLlmProbeResult | null> | null = null;

/** Probe common local OpenAI-compatible endpoints once per page session. */
export function probeLocalLlm(): Promise<LocalLlmProbeResult | null> {
    if (!localLlmProbe) {
        localLlmProbe = (async () => {
            if (typeof window === 'undefined') return null;

            for (const baseUrl of LOCAL_LLM_CANDIDATES) {
                const controller = new AbortController();
                const timer = window.setTimeout(() => controller.abort(), 1500);
                try {
                    const res = await fetch(toLoopbackGatewayUrl(`${baseUrl.replace(/\/+$/, '')}/models`), { signal: controller.signal });
                    if (!res.ok) continue;
                    const data = await res.json();
                    const modelId = data?.data?.[0]?.id ?? data?.models?.[0]?.name;
                    if (modelId) {
                        console.info(`[LLM] 检测到本地模型端点 ${baseUrl}（${modelId}），自动启用本机模型`);
                        return { baseUrl, modelId };
                    }
                } catch {
                    // Probe the next local candidate.
                } finally {
                    window.clearTimeout(timer);
                }
            }
            return null;
        })();
    }
    return localLlmProbe;
}
