import React, { useEffect, useRef } from 'react';

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
    // 发言整段到达:新内容从头阅读;长文由用户滚动(见下方 pointer-events-auto)
    useEffect(() => {
        if (textRef.current) textRef.current.scrollTop = 0;
    }, [content]);

    return (
    <div
        data-testid="rpg-dialogue-overlay"
        className="pointer-events-none absolute inset-x-3 bottom-3 z-[55] mx-auto max-w-5xl sm:inset-x-8 sm:bottom-6"
        role="status"
        aria-live="polite"
        aria-atomic="true"
    >
        <div className="voxel-dialogue-enter relative border-[4px] border-[#21150d] bg-[#f2dfaa]/[0.98] px-4 pb-4 pt-7 text-[#24170e] shadow-[7px_7px_0_#21150d] sm:px-7 sm:pb-6 sm:pt-9">
            <div
                className="absolute -top-5 left-3 flex min-h-10 items-center gap-2 border-[3px] border-[#21150d] px-3 py-1.5 text-xs font-black shadow-[3px_3px_0_#21150d] sm:left-6 sm:text-sm"
                style={{ background: concealed ? '#151515' : '#d8b36d', color: concealed ? '#f2dfaa' : '#24170e' }}
            >
                <span aria-hidden="true" className={concealed ? 'text-[#9aa0a6]' : 'text-[#2f6b2b]'}>
                    {concealed ? '◆' : '▶'}
                </span>
                {speakerLabel}
            </div>
            <div className="absolute right-3 top-2 text-right text-[9px] font-black tracking-[0.16em] text-[#8b5a2b] sm:right-6 sm:top-3">
                <div>{queuedCount > 0 ? `待播 ${queuedCount} 条` : 'LIVE DIALOGUE'}</div>
                {droppedCount > 0 && (
                    <div className="mt-0.5 text-[#a33b2e]" title="积压超限被跳过的发言可在左下过程日志中查看">
                        已略过 {droppedCount} 条（见过程日志）
                    </div>
                )}
            </div>
            <div ref={textRef} className="pointer-events-auto max-h-[30dvh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] font-black leading-[1.75] sm:max-h-[24dvh] sm:text-lg sm:leading-[1.8] custom-scrollbar">
                {content}
            </div>
        </div>
    </div>
    );
};

RpgDialogueOverlay.displayName = 'RpgDialogueOverlay';
