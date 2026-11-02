/**
 * 流式字幕：玩家等模型的那 30 秒里，把"正在生成的话"实时贴出来。
 *
 * 为什么不直接显示原文：模型输出的是 JSON（`{"speak":"…"}`），增量原文一眼就是乱码。
 * 这里显示的是 `extractPartialSpeech` 从半截 JSON 里抠出来的 speak 字段（见 services/llmStream.ts）。
 * 90% 的输出是不可见的思考，只体现在"思考 N 字"这个计数上——它是等待期唯一的真实进度。
 *
 * 只在"玩家确实在等"时出现：发言一旦落账（真日志出现）就清空，预取与后台决策完全不经过这里。
 */
import React, { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { streamingSpeechAtom } from '../../atoms';
import { VOXEL_TOKENS as T } from '../../themes/voxel-tokens';

const TICK_MS = 250;

export const LiveSpeechCaption: React.FC = () => {
    const stream = useAtomValue(streamingSpeechAtom);
    const [, forceTick] = useState(0);

    // 秒表：只在本组件里走，不惊动房间
    useEffect(() => {
        if (!stream) return;
        const timer = setInterval(() => forceTick(n => n + 1), TICK_MS);
        return () => clearInterval(timer);
    }, [stream]);

    if (!stream) return null;
    // 上面的 tick 负责让这里每秒重算一次
    const elapsedSec = Math.max(0, Math.round((Date.now() - stream.startedAt) / 1000));
    const isDecision = stream.kind === 'decision';
    // 决策正文（策略与目标）绝不上屏：只显示进度，否则等于把票型和刀口提前广播
    const hasText = !isDecision && stream.text.trim().length > 0;

    return (
        <div
            className="pointer-events-none fixed left-1/2 z-[66] w-[min(560px,90vw)] -translate-x-1/2"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}
            data-testid="live-speech-caption"
        >
            <div
                className="border-[3px] px-3 py-2 shadow-[4px_4px_0_var(--voxel-ink)]"
                style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
            >
                <div className="flex items-center gap-2 text-xs font-black">
                    <span
                        className="flex h-5 min-w-5 items-center justify-center border-2 px-1"
                        style={{ borderColor: T.ink, background: T.woodDark, color: T.paper }}
                    >
                        {String(stream.seat).padStart(2, '0')}
                    </span>
                    <span className="tracking-[0.12em]">{isDecision ? '正在决策…' : hasText ? '正在说话…' : '正在思考…'}</span>
                    {stream.thinkingChars > 0 && (
                        <span style={{ color: T.woodDark }}>思考 {stream.thinkingChars} 字</span>
                    )}
                    <span className="ml-auto tabular-nums opacity-70">{elapsedSec}s</span>
                </div>
                {isDecision ? (
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-bold opacity-70">
                        <span className="vw-thinking-dot" />
                        <span className="vw-thinking-dot" style={{ animationDelay: '0.15s' }} />
                        <span className="vw-thinking-dot" style={{ animationDelay: '0.3s' }} />
                        <span>在权衡目标，内容不公开</span>
                    </div>
                ) : hasText ? (
                    <div
                        className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm font-bold leading-snug"
                        style={{ color: T.ink }}
                    >
                        {stream.text}
                        <span className="vw-caret" aria-hidden>▌</span>
                    </div>
                ) : (
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-bold opacity-70">
                        <span className="vw-thinking-dot" />
                        <span className="vw-thinking-dot" style={{ animationDelay: '0.15s' }} />
                        <span className="vw-thinking-dot" style={{ animationDelay: '0.3s' }} />
                        <span>模型还没开口，正在思考</span>
                    </div>
                )}
            </div>
        </div>
    );
};
