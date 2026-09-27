import { useEffect, useRef } from 'react';
import type { SkillEffectEvent } from './skillEffectModel';
import { VoxelAudioEngine } from './voxelAudio';

export const useVoxelAudio = ({
    events,
    ambientEnabled,
    skillEnabled,
    volume,
    isNight,
}: {
    events: SkillEffectEvent[];
    ambientEnabled: boolean;
    skillEnabled: boolean;
    volume: number;
    isNight: boolean;
}) => {
    const engineRef = useRef<VoxelAudioEngine | null>(null);
    const playedEventIdsRef = useRef(new Set<string>());

    useEffect(() => {
        const engine = new VoxelAudioEngine();
        engineRef.current = engine;
        const unlock = () => void engine.unlock();
        window.addEventListener('pointerdown', unlock, { passive: true });
        window.addEventListener('keydown', unlock);
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            engine.destroy();
            engineRef.current = null;
        };
    }, []);

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.setVolume(volume);
        engine.setAmbientEnabled(ambientEnabled, isNight);
    }, [ambientEnabled, isNight, volume]);

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !skillEnabled) return;
        for (const event of events) {
            if (playedEventIdsRef.current.has(event.eventId)) continue;
            playedEventIdsRef.current.add(event.eventId);
            if (playedEventIdsRef.current.size > 256) {
                const oldestEventId = playedEventIdsRef.current.values().next().value;
                if (oldestEventId) playedEventIdsRef.current.delete(oldestEventId);
            }
            engine.playSkill(event);
        }
    }, [events, skillEnabled]);
};
