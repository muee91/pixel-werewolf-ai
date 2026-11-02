import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface RpgDialogueOverlayProps {
    speakerLabel: string;
    content: string;
    concealed: boolean;
    queuedCount?: number;
    droppedCount?: number;
}

export const RpgDialogueOverlay: React.FC<RpgDialogueOverlayProps> = ({
    speakerLabel,
    content,
    concealed,
    queuedCount = 0,
    droppedCount = 0,
}) => {
    const textRef = useRef<HTMLDivElement | null>(null);
    // 长发言默认只开一屏（约 11 行），放不下的给「展开全文」按到底；
    // 这比让玩家自己去摸滚动条靠谱——没人知道那个细条里还藏着半段话
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const [atEnd, setAtEnd] = useState(true);

    // 发言整段到达：新一条从开头读、并收回到默认高度
    useEffect(() => {
        setExpanded(false);
        if (textRef.current) textRef.current.scrollTop = 0;
    }, [content]);

    // 量两件事：有没有被截断（决定是否给「展开全文」）、有没有滚到底（决定底部渐隐）
    const measure = useCallback(() => {
        const el = textRef.current;
        if (!el) return;
        setOverflowing(el.scrollHeight - el.clientHeight > 4);
        setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
    }, []);

    useLayoutEffect(() => {
        const el = textRef.current;
        if (!el) return undefined;
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [content, expanded, measure]);

    const handleToggle = () => {
        setExpanded(previous => {
            const next = !previous;
            // 展开时把视图带到结尾：玩家点它的意思就是「我要看剩下的」
            if (next) {
                window.requestAnimationFrame(() => {
                    const el = textRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                });
            }
            return next;
        });
    };

    const showExpandButton = overflowing || expanded;
    const fadeBottom = overflowing && !atEnd;

    return (
    <div
        data-testid="rpg-dialogue-overlay"
        className="pointer-events-none absolute inset-x-3 bottom-3 z-[55] mx-auto max-w-6xl sm:inset-x-8 sm:bottom-6"
        // 非模态、不可关闭的发言流：保留 status/live 语义让读屏逐条播报；
        // 若标成 aria-modal dialog 会屏蔽仍在交互的 HUD，故不加 role="dialog"/aria-modal
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="对局发言对话"
    >
        <div className="voxel-dialogue-enter relative border-[4px] border-[var(--voxel-ink)] bg-[var(--voxel-paper)] px-4 pb-4 pt-7 text-[var(--voxel-ink)] shadow-[7px_7px_0_var(--voxel-ink)] sm:px-7 sm:pb-6 sm:pt-9">
            <div
                className="absolute -top-5 left-3 flex min-h-10 items-center gap-2 border-[3px] border-[var(--voxel-ink)] px-3 py-1.5 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] sm:left-6 sm:text-sm"
                style={{ background: concealed ? 'var(--voxel-ink-soft)' : 'var(--voxel-paper-dim)', color: concealed ? 'var(--voxel-paper)' : 'var(--voxel-ink)' }}
            >
                <span aria-hidden="true" className={concealed ? 'text-[var(--voxel-paper-dim)]' : 'text-[var(--voxel-emerald-ink)]'}>
                    {concealed ? '◆' : '▶'}
                </span>
                {speakerLabel}
            </div>
            <div className="absolute right-3 top-2 text-right text-xs font-black tracking-[0.16em] text-[var(--voxel-wood)] sm:right-6 sm:top-3">
                <div>{queuedCount > 0 ? `待播 ${queuedCount} 条` : 'LIVE DIALOGUE'}</div>
                {droppedCount > 0 && (
                    <div className="mt-0.5 text-[var(--voxel-redstone-ink)]" title="积压超限被跳过的发言可在左下过程日志中查看">
                        已略过 {droppedCount} 条（见过程日志）
                    </div>
                )}
            </div>
            <div
                ref={textRef}
                onScroll={measure}
                className={`pointer-events-auto whitespace-pre-wrap break-words overflow-y-auto text-[15px] font-black leading-[1.75] sm:text-lg sm:leading-[1.8] custom-scrollbar ${expanded
                    // 展开也不能吃掉顶部两行工具栏（移动端工具栏换行占 y96–192）；桌面端顶栏只有一行，留 9rem 够
                    ? 'max-h-[calc(100dvh-17rem)] sm:max-h-[calc(100dvh-9rem)]'
                    : 'max-h-[min(34dvh,300px)]'}`}
                style={fadeBottom
                    ? {
                        maskImage: 'linear-gradient(180deg, #000 calc(100% - 32px), transparent)',
                        WebkitMaskImage: 'linear-gradient(180deg, #000 calc(100% - 32px), transparent)',
                    }
                    : undefined}
            >
                {content}
            </div>

            {showExpandButton && (
                <div className="mt-2 flex justify-center">
                    <button
                        type="button"
                        onClick={handleToggle}
                        aria-expanded={expanded}
                        className="pointer-events-auto flex min-h-10 items-center whitespace-nowrap border-[3px] border-[var(--voxel-ink)] bg-[var(--voxel-paper-dim)] px-3 text-xs font-black text-[var(--voxel-ink)] shadow-[3px_3px_0_var(--voxel-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        {expanded ? '收起 ▲' : '展开全文 ▼'}
                    </button>
                </div>
            )}
        </div>
    </div>
    );
};

RpgDialogueOverlay.displayName = 'RpgDialogueOverlay';
