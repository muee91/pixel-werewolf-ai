// 内置小模型(0.5B 级 GGUF):wllama(WASM llama.cpp)推理,免编译跨平台。
// 首次使用时从模型源下载一次(约 400~500MB,由 wllama CacheManager 持久缓存),
// 之后完全离线可用;云端 Key / 本机 Ollama / 离线大脑之外的"真思考"兜底层。
import { Wllama } from '@wllama/wllama';
import wasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';

// 主源国内可达(ModelScope),备源 HuggingFace
const MODEL_SOURCES = [
    'https://modelscope.cn/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/master/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
];

export const DOWNLOADED_FLAG = 'werewolf-builtin-model-ok';

/** 分身「基础模型」下拉中代表内置小模型的伪预设 id */
export const BUILTIN_LLM_PRESET_ID = '__builtin__';

export type BuiltinLlmStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface BuiltinLlmSnapshot {
    status: BuiltinLlmStatus;
    /** downloading 时的 0~1 进度 */
    progress: number;
    error: string;
}

let wllama: Wllama | null = null;
let status: BuiltinLlmStatus = 'idle';
let progress = 0;
let errorMsg = '';
const listeners = new Set<() => void>();
// useSyncExternalStore 的 getSnapshot 必须返回稳定引用,否则 React 判定每次都在变化 → #185 崩溃
let snapshotCache: BuiltinLlmSnapshot = { status, progress, error: errorMsg };
const emit = () => {
    snapshotCache = { status, progress, error: errorMsg };
    listeners.forEach(fn => fn());
};
const setStatus = (s: BuiltinLlmStatus, p = progress, e = '') => {
    status = s;
    progress = p;
    errorMsg = e;
    if (s === 'ready') localStorage.setItem(DOWNLOADED_FLAG, '1');
    emit();
};

export const subscribeBuiltinLlm = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

export const getBuiltinLlmSnapshot = (): BuiltinLlmSnapshot => snapshotCache;

/** 下载成功过一次即视为可用(模型缓存在 wllama CacheManager,重启后仍在) */
export const isBuiltinLlmReady = (): boolean =>
    status === 'ready' || localStorage.getItem(DOWNLOADED_FLAG) === '1';

const ensureWllama = (): Wllama => {
    if (!wllama) wllama = new Wllama({ default: wasmUrl });
    return wllama;
};

/** 重启后从 wllama 缓存重新挂载模型(已下载过的场景) */
export const restoreBuiltinModel = async (): Promise<void> => {
    if (status === 'ready' || status === 'loading') return;
    setStatus('loading');
    const wl = ensureWllama();
    await wl.loadModelFromUrl(MODEL_SOURCES[1], {});
    setStatus('ready');
};

/** 下载内置小模型并完成挂载;失败时按源顺序尝试,全部失败置 error */
export const downloadBuiltinModel = async (): Promise<void> => {
    if (status === 'downloading' || status === 'loading' || status === 'ready') return;
    let lastError = '';
    for (const url of MODEL_SOURCES) {
        try {
            setStatus('downloading', 0);
            const wl = ensureWllama();
            await wl.loadModelFromUrl(url, {
                progressCallback: ({ loaded, total }) => {
                    if (total > 0) setStatus('downloading', loaded / total);
                },
            });
            wllama = wl;
            setStatus('ready');
            return;
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
            wllama = null; // 换源重试时重建实例,清掉半载状态
        }
    }
    setStatus('error', 0, lastError || '所有模型源均不可达');
};

/** 生成一次补全(引擎兜底层用;0.5B 模型输出质量有限,调用方需自带解析兜底) */
export const builtinGenerate = async (
    messages: { role: string; content: string }[],
    opts?: { maxTokens?: number; temperature?: number },
): Promise<string> => {
    if (!isBuiltinLlmReady()) throw new Error('内置模型未就绪');
    if (status !== 'ready') await restoreBuiltinModel();
    const wl = ensureWllama();
    const res = await wl.createChatCompletion({
        messages: messages as never[],
        max_tokens: opts?.maxTokens ?? 160,
        temperature: opts?.temperature ?? 0.85,
    });
    return res.choices?.[0]?.message?.content ?? '';
};
