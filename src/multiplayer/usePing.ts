import { useRef, useEffect, useCallback, useState } from 'react';
import { getRoomHttpBase } from './endpoints';

interface UsePingOptions {
    enabled: boolean;
    intervalMs?: number;
}

interface UsePingReturn {
    ping: number | null;
    pingHistory: number[];
}

export function usePing({ enabled, intervalMs = 2000 }: UsePingOptions): UsePingReturn {
    const [ping, setPing] = useState<number | null>(null);
    const historyRef = useRef<number[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const measurePing = useCallback(async () => {
        if (!enabled) return;
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        const start = performance.now();
        try {
            const res = await fetch(`${getRoomHttpBase()}/ping`, {
                method: 'GET',
                signal: abortRef.current.signal,
                cache: 'no-store'
            });
            const end = performance.now();
            if (res.ok) {
                const latency = Math.round(end - start);
                setPing(latency);
                historyRef.current = [...historyRef.current.slice(-9), latency];
            }
        } catch {
            // Ignore aborted/cancelled requests
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            setPing(null);
            historyRef.current = [];
            return;
        }

        measurePing();
        intervalRef.current = setInterval(measurePing, intervalMs);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            abortRef.current?.abort();
        };
    }, [enabled, intervalMs, measurePing]);

    return { ping, pingHistory: historyRef.current };
}
