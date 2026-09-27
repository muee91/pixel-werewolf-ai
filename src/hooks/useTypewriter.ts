// 打字机效果:文本变化时逐字上屏,用于直播感的发言展示。
import { useEffect, useState } from 'react';

export const useTypewriter = (text: string, intervalMs = 26): string => {
    const [shown, setShown] = useState(text);
    useEffect(() => {
        setShown(text.slice(0, 1));
        if (!text) return;
        let i = 1;
        const timer = window.setInterval(() => {
            i += 1;
            setShown(text.slice(0, i));
            if (i >= text.length) window.clearInterval(timer);
        }, intervalMs);
        return () => window.clearInterval(timer);
    }, [text, intervalMs]);
    return shown;
};
