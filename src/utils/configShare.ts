// 局域网配置同步:房主把配置快照发布到房间服务,成员一键拉取合并。
// 快照含 API Key 与否由房主发布时选择;不含 Key 的快照只覆盖结构,不覆盖密钥。
import { getDefaultStore, type WritableAtom } from 'jotai';
import {
  llmProvidersAtom, llmPresetsAtom, ttsPresetsAtom, actorProfilesAtom,
  globalApiConfigAtom, gameConfigAtom, uiConfigAtom,
} from '../atoms';

export interface ConfigShareSnapshot {
  config: Record<string, unknown>;
  includesApiKeys: boolean;
  publishedAt: number;
  publishedBy: string;
}

// 参与同步的原子清单:顺序即合并顺序
interface SyncEntry {
  key: string;
  atom: WritableAtom<unknown, [unknown], void>;
  /** 不含 Key 的快照是否也覆盖此项 */
  safe: boolean;
  /** 覆盖前对快照值做净化(剔除 API Key) */
  scrub?: (value: any) => any;
}

type SyncAtom = WritableAtom<unknown, [unknown], void>;
// strict 下各 StoredAtom<T> 与擦除占位因 write 参数逆变互不可赋值；
// key↔atom 的一一对应由本表人工保证，applySharedConfig 统一只写 unknown 值，
// 因此在这里做一次集中擦除，而不是在每个字段上散落断言。
const asSyncAtom = (atom: unknown): SyncAtom => atom as SyncAtom;

const scrubProviders = (providers: any[]): any[] =>
  (Array.isArray(providers) ? providers : []).map(p => ({ ...p, apiKey: '' }));

export function buildSnapshot(includeApiKeys: boolean): Record<string, unknown> {
  const store = getDefaultStore();
  const ui = store.get(uiConfigAtom);
  return {
    uiConfig: ui,
    gameConfig: store.get(gameConfigAtom),
    llmProviders: includeApiKeys
      ? store.get(llmProvidersAtom)
      : scrubProviders(store.get(llmProvidersAtom)),
    llmPresets: store.get(llmPresetsAtom),
    ttsPresets: store.get(ttsPresetsAtom),
    actors: store.get(actorProfilesAtom),
    globalApiConfig: store.get(globalApiConfigAtom),
  };
}

const SYNC_ENTRIES: SyncEntry[] = [
  { key: 'llmProviders', atom: asSyncAtom(llmProvidersAtom), safe: false, scrub: scrubProviders },
  { key: 'llmPresets', atom: asSyncAtom(llmPresetsAtom), safe: true },
  { key: 'ttsPresets', atom: asSyncAtom(ttsPresetsAtom), safe: true },
  { key: 'actors', atom: asSyncAtom(actorProfilesAtom), safe: true },
  { key: 'uiConfig', atom: asSyncAtom(uiConfigAtom), safe: true },
  { key: 'gameConfig', atom: asSyncAtom(gameConfigAtom), safe: true },
  { key: 'globalApiConfig', atom: asSyncAtom(globalApiConfigAtom), safe: true },
];

export async function publishConfig(
  includeApiKeys: boolean,
  publishedBy: string,
  previousCode?: string,
): Promise<{ ok: boolean; shareCode?: string; error?: string }> {
  try {
    const res = await fetch('/api/room/config/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // previousCode：覆盖已有快照时服务端要求出示当前口令（防同网段设备投毒），
      // 发布方从上一次发布响应里拿到并在本会话内保存。
      body: JSON.stringify({
        config: buildSnapshot(includeApiKeys),
        includesApiKeys: includeApiKeys,
        publishedBy: publishedBy,
        previousCode: previousCode || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, shareCode: typeof body?.shareCode === 'string' ? body.shareCode : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 拉取必须带房主给出的口令；口令错误/缺失由服务端 401 拒绝（快照可能含明文 Key）。 */
export async function fetchSharedConfig(shareCode: string): Promise<{ ok: boolean; snapshot?: ConfigShareSnapshot; error?: string }> {
  const code = (shareCode || '').trim();
  if (!/^[0-9a-f]{10}$/i.test(code)) return { ok: false, error: '请先向房主索取 10 位分享口令' };
  try {
    const res = await fetch(`/api/room/config/share?code=${encodeURIComponent(code)}`);
    if (res.status === 404) return { ok: false, error: '房间服务上暂无共享配置' };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const snapshot = await res.json();
    if (!snapshot?.config || typeof snapshot.config !== 'object') {
      return { ok: false, error: '快照格式无效' };
    }
    return { ok: true, snapshot };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function applySharedConfig(snapshot: ConfigShareSnapshot): { applied: string[]; skipped: string[] } {
  const store = getDefaultStore();
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const entry of SYNC_ENTRIES) {
    const value = snapshot.config[entry.key];
    if (value === undefined) { skipped.push(entry.key); continue; }
    if (!snapshot.includesApiKeys && !entry.safe) {
      // 不含 Key 的快照:结构性配置仍可拉,但剔除 Key 后再覆盖
      store.set(entry.atom, entry.scrub ? entry.scrub(value) : value);
      applied.push(`${entry.key}(不含密钥)`);
      continue;
    }
    store.set(entry.atom, value);
    applied.push(entry.key);
  }
  return { applied, skipped };
}
