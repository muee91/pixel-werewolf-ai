/**
 * 模型调用失败的分类。
 *
 * 为什么单独一个模块：`TypeError: Failed to fetch` 是浏览器"请求根本没发出去"的通用说法，
 * 它既可能是网络断了，也可能是跨域预检没过（CORS）。两者在界面上都会被念成"模型不可用"，
 * 于是玩家一直去改 key 和模型名——改一百次也不会好。这里把它单独标出来。
 *
 * 判定故意宽松（宁可多标一次，也不要让 CORS 混进"模型坏了"）：
 * Chrome/Safari/Firefox/Capacitor 的原文案都不同，全部收进来。
 */

const CORS_LIKE_PATTERN = /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed/i;

export const isCorsLikelyError = (error: unknown): boolean => {
    if (!error) return false;
    if ((error as { corsLikely?: boolean }).corsLikely) return true;
    const message = error instanceof Error ? error.message : String(error);
    return CORS_LIKE_PATTERN.test(message);
};

/**
 * 给"请求没发出去"的失败包一层人话，并打上标记供 UI 分类。
 *
 * 措辞要留余地：同一个 `Failed to fetch` 既可能是跨域预检没过，也可能是域名解析不了/断网。
 * 但两种情况都不是 key 或模型名的问题 —— 那两种会回 401 / 404，有状态码。
 */
export const corsHintError = (rawMessage: string): Error & { corsLikely: true } => {
    const error = new Error(
        `请求没能发到模型服务（${rawMessage}）：要么网络不可达，要么被浏览器/桌面端的跨域策略（CORS）拦下。`
        + `这两种都与 key、模型名无关（key 错会回 401，模型名错会回 404，都会带状态码）。`
        + `若网关无 Access-Control-Allow-Origin、OPTIONS 不是 2xx，就是 CORS；`
        + `也可改用"经本机转发"绕开同源限制。`,
    ) as Error & { corsLikely: true };
    error.corsLikely = true;
    return error;
};
