import React, { useEffect, useSyncExternalStore, useState } from 'react';
import { useAtomValue } from 'jotai';
import { cyclePace, getPace, subscribePace } from '../../hooks/engine/pacing';
import { llmUsageAtom } from '../../atoms';
import { LLM_RETRY_EVENT, type LlmRetryDetail } from '../../services/llm';
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';
import { FastForwardIcon } from './toolbarIcons';

const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/**
 * 观战节奏 + 模型开销读数。
 *
 * 存在的理由（实测）：云模型单次发言中位 22.5 秒、输出 token 的 90% 是玩家看不见的思考，
 * 一整局可以到 45-70 分钟；此前既没有倍速/跳过，也没有任何 token 与耗时读数，
 * 玩家只能"要么等要么退出"。这里给一个总倍速（1×/2×/4×）和一条成本读数。
 * 倍速只压缩演出与阶段推进的等待，不压缩模型重试退避、人类操作超时与安全兜底。
 */
export const PaceControl: React.FC<{ variant?: 'camp' | 'rpg' }> = ({ variant = 'camp' }) => {
    const pace = useSyncExternalStore(subscribePace, getPace, getPace);
    const usage = useAtomValue(llmUsageAtom);
    const [retry, setRetry] = useState<LlmRetryDetail | null>(null);

    // 退避提示：收到重试事件就显示，下一次成功调用或超时后自动消失
    useEffect(() => {
        if (typeof window === 'undefined') return;
        let timer = 0;
        const onRetry = (event: Event) => {
            const detail = (event as CustomEvent).detail as LlmRetryDetail;
            setRetry(detail);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setRetry(null), detail.waitMs + 45_000);
        };
        const onUsage = () => { setRetry(null); window.clearTimeout(timer); };
        window.addEventListener(LLM_RETRY_EVENT, onRetry);
        window.addEventListener('werewolf:llm-usage', onUsage);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener(LLM_RETRY_EVENT, onRetry);
            window.removeEventListener('werewolf:llm-usage', onUsage);
        };
    }, []);
    const tokens = usage.promptTokens + usage.completionTokens;
    const avgSeconds = usage.calls > 0 ? Math.round(usage.totalMs / usage.calls / 100) / 10 : 0;
    const isRpg = variant === 'rpg';

    return (
        <div
            data-testid="pace-control-group"
            className="mr-2 flex items-center gap-2"
        >
            <button
                type="button"
                data-testid="pace-control"
                onClick={() => cyclePace()}
                aria-label={`观战节奏 ${pace} 倍`}
                title="倍速只压缩演出与推进等待；模型请求、人类操作超时不受影响"
                className={
                    isRpg
                        ? 'flex min-h-11 items-center gap-1 border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-wood-dark)] px-3 max-sm:px-2 text-xs font-black text-[var(--voxel-paper)] shadow-[3px_3px_0_var(--voxel-ink)]'
                        : 'flex min-h-11 items-center gap-1 border-[3px] px-3 max-sm:px-2 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)]'
                }
                style={isRpg ? undefined : { background: pace > 1 ? T.torch : T.paper, borderColor: T.ink, color: T.ink }}
            >
                <FastForwardIcon />
                节奏 {pace}×
            </button>
            {retry && (
                <span
                    data-testid="llm-retry-notice"
                    role="status"
                    className="border-[3px] px-2 py-1 text-[11px] font-black"
                    style={{ background: 'var(--voxel-redstone-deep)', color: 'var(--voxel-solid-white)' }}
                    title="模型被限流或返回异常，正在自动退避重试；不是卡死"
                >
                    模型忙 · 第 {retry.attempt}/{retry.total} 次重试 · 等 {Math.max(1, Math.round(retry.waitMs / 1000))}s
                </span>
            )}
            {usage.calls > 0 && (
                <span
                    data-testid="llm-usage-readout"
                    /* 裸字压在场景上：天空、云、树轮流从背后过，同一行字有时深有时看不见。
                       给一块纸色托底，读数就始终在同一种对比度上。 */
                    className="flex min-h-11 items-center border-[3px] border-[var(--voxel-ink)] px-2.5 text-[11px] font-bold tabular-nums shadow-[3px_3px_0_var(--voxel-ink)]"
                    style={isRpg
                        ? { background: 'var(--voxel-wood-dark)', color: 'var(--voxel-paper)' }
                        : { background: T.paper, color: T.ink }}
                    title={`本局 ${usage.calls} 次模型调用：输入 ${formatTokens(usage.promptTokens)}、输出 ${formatTokens(usage.completionTokens)}（其中 ${formatTokens(usage.reasoningTokens)} 为不可见思考），平均 ${avgSeconds}s/次`}
                >
                    {formatTokens(tokens)} tok{usage.reasoningTokens > 0 ? ` · 思考 ${formatTokens(usage.reasoningTokens)}` : ''}
                </span>
            )}
        </div>
    );
};
