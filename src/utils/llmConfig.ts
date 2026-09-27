import type { LLMProviderConfig } from '../types';

export type LlmProxyConfig = {
    llmProxyEnabled?: boolean;
    llmProxyUrl?: string;
};

export const isLocalOpenAICompatibleBaseUrl = (baseUrl?: string) =>
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\b/i.test((baseUrl || '').trim());

export const isNvidiaOpenAIBaseUrl = (baseUrl?: string) =>
    (baseUrl || '').trim().replace(/\/+$/, '') === 'https://integrate.api.nvidia.com/v1';

/**
 * A provider is usable when it has its own key, points at a local OpenAI-compatible
 * endpoint, or is explicitly routed through the configured NVIDIA-compatible proxy.
 * This deliberately does not make any cloud preset usable by itself.
 */
export const isProviderConfiguredForRuntime = (
    provider: LLMProviderConfig | undefined,
    proxyConfig?: LlmProxyConfig,
) => !!provider && (
    !!provider.apiKey?.trim()
    || isLocalOpenAICompatibleBaseUrl(provider.baseUrl)
    || (
        isNvidiaOpenAIBaseUrl(provider.baseUrl)
        && !!proxyConfig?.llmProxyEnabled
        && !!proxyConfig.llmProxyUrl?.trim()
    )
);

/**
 * 环回网关：浏览器直连本地 LLM 端点(Ollama/LM Studio 等)会撞 CORS,
 * 统一走同源代理 /api/local-llm-gateway(仅允许转发到宿主机 loopback 服务)。
 */
export const isLoopbackUrl = (rawUrl: string): boolean => {
    try {
        const parsed = new URL(rawUrl);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
            && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1');
    } catch {
        return false;
    }
};

export const toLoopbackGatewayUrl = (finalUrl: string): string =>
    `/api/local-llm-gateway?target=${encodeURIComponent(finalUrl)}`;
