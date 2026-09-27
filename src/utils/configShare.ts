// 局域网配置同步:房主把配置快照发布到房间服务,成员一键拉取合并。
// 快照含 API Key 与否由房主发布时选择;不含 Key 的快照只覆盖结构,不覆盖密钥。
import { getDefaultStore, type WritableAtom } from 'jotai';
import {
  llmProvidersAtom, llmPresetsAtom, ttsPresetsAtom, actorProfilesAtom,
  globalApiConfigAtom, gameConfigAtom, uiConfigAtom,
} from '../atoms';
import type { UIConfig } from '../themes/types';

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
  { key: 'llmProviders', atom: llmProvidersAtom, safe: false, scrub: scrubProviders },
  { key: 'llmPresets', atom: llmPresetsAtom, safe: true },
  { key: 'ttsPresets', atom: ttsPresetsAtom, safe: true },
  { key: 'actors', atom: actorProfilesAtom, safe: true },
  { key: 'uiConfig', atom: uiConfigAtom, safe: true },
  { key: 'gameConfig', atom: gameConfigAtom, safe: true },
  { key: 'globalApiConfig', atom: globalApiConfigAtom, safe: true },
];

export async function publishConfig(includeApiKeys: boolean, publishedBy: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/room/config/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: buildSnapshot(includeApiKeys), includesApiKeys: includeApiKeys, publishedBy: publishedBy }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchSharedConfig(): Promise<{ ok: boolean; snapshot?: ConfigShareSnapshot; error?: string }> {
  try {
    const res = await fetch('/api/room/config/share');
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
