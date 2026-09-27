import { useRef, useEffect, useCallback, useState } from 'react';
import { getRoomHttpBase } from './endpoints';

const EMA_ALPHA = 0.3;

export interface PlayerPingMap {
    [playerId: string]: number | null;
}

interface UsePingTrackerOptions {
    enabled: boolean;
    roomId: string | null;
    myPlayerId: string | null;
    intervalMs?: number;
}

export function usePingTracker({ enabled, roomId, myPlayerId, intervalMs = 5000 }: UsePingTrackerOptions): {
    playerPings: PlayerPingMap;
    myPing: number | null;
} {
    const [playerPings, setPlayerPings] = useState<PlayerPingMap>({});
    const [myPing, setMyPing] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const smoothedPingRef = useRef<number | null>(null);

    const measureAndReport = useCallback(async () => {
        if (!enabled || !roomId || !myPlayerId) return;
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        try {
            const start = performance.now();
            const res = await fetch(`${getRoomHttpBase()}/ping`, {
                method: 'GET',
                signal: abortRef.current.signal,
                cache: 'no-store',
            });
            const end = performance.now();

            if (res.ok) {
                const rawPing = Math.round(end - start);
                const smoothed = smoothedPingRef.current !== null
                    ? Math.round(smoothedPingRef.current * (1 - EMA_ALPHA) + rawPing * EMA_ALPHA)
                    : rawPing;
                smoothedPingRef.current = smoothed;

                console.log(`[PingTracker] myId=${myPlayerId}, raw=${rawPing}ms, smoothed=${smoothed}ms`);

                setMyPing(smoothed);
                setPlayerPings(prev => ({ ...prev, [myPlayerId]: smoothed }));

            }
        } catch (e) {
            if ((e as Error).name !== 'AbortError') {
                console.error('[PingTracker] Error measuring ping:', e);
            }
        }
    }, [enabled, roomId, myPlayerId]);

    useEffect(() => {
        if (!enabled || !roomId || !myPlayerId) {
            setPlayerPings({});
            setMyPing(null);
            smoothedPingRef.current = null;
            return;
        }

        measureAndReport();
        intervalRef.current = setInterval(measureAndReport, intervalMs);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            abortRef.current?.abort();
        };
    }, [enabled, roomId, myPlayerId, intervalMs, measureAndReport]);

    return { playerPings, myPing };
}
