import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SkillEffectEvent, SkillEffectKind } from './skillEffectModel';

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

type WorldPoint = { x: number; y: number; z: number };

interface SkillEffectsProps {
    events: SkillEffectEvent[];
    playerPositions: ReadonlyMap<number, WorldPoint>;
    effectLevel: 'subtle' | 'medium' | 'intense';
}

const BEAM_EFFECTS = new Set<SkillEffectKind>([
    'slash', 'beam', 'shot', 'sword', 'gaze', 'bow', 'arrow',
]);

const SHIELD_EFFECTS = new Set<SkillEffectKind>(['shield', 'stone', 'amulet']);

const hashString = (value: string) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const Beam: React.FC<{ from: WorldPoint; to: WorldPoint; color: string }> = ({ from, to, color }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const length = Math.max(0.1, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
    const midpoint = useMemo(() => new THREE.Vector3(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        (from.z + to.z) / 2,
    ), [from.x, from.y, from.z, to.x, to.y, to.z]);

    React.useLayoutEffect(() => {
        meshRef.current?.lookAt(to.x, to.y, to.z);
    }, [to.x, to.y, to.z]);

    return (
        <mesh ref={meshRef} geometry={boxGeometry} position={midpoint} scale={[0.09, 0.09, length]}>
            <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
    );
};

const CubeRing: React.FC<{ color: string; radius: number }> = ({ color, radius }) => (
    <group>
        {Array.from({ length: 12 }, (_, index) => {
            const angle = index / 12 * Math.PI * 2;
            return (
                <mesh
                    key={index}
                    geometry={boxGeometry}
                    position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
                    scale={[0.16, 0.08, 0.16]}
                >
                    <meshBasicMaterial color={color} transparent opacity={0.82} />
                </mesh>
            );
        })}
    </group>
);

const ShieldCage: React.FC<{ color: string }> = ({ color }) => (
    <group>
        {[
            [-0.55, 0.65, 0], [0.55, 0.65, 0], [0, 0.25, -0.55],
            [0, 0.25, 0.55], [0, 1.15, 0], [0, 0.05, 0],
        ].map((position, index) => (
            <mesh key={index} geometry={boxGeometry} position={position as [number, number, number]} scale={[0.34, 0.34, 0.12]}>
                <meshBasicMaterial color={color} transparent opacity={0.58} />
            </mesh>
        ))}
    </group>
);

const ParticleBurst: React.FC<{
    eventId: string;
    color: string;
    secondaryColor: string;
    count: number;
}> = ({ eventId, color, secondaryColor, count }) => {
    const seed = hashString(eventId);
    const particles = useMemo(() => Array.from({ length: count }, (_, index) => {
        const angle = ((seed % 360) + index * 137.5) * Math.PI / 180;
        const radius = 0.45 + ((seed >> (index % 16)) & 7) * 0.08;
        return {
            position: [Math.cos(angle) * radius, 0.35 + (index % 4) * 0.28, Math.sin(angle) * radius] as [number, number, number],
            scale: 0.1 + (index % 3) * 0.035,
        };
    }), [count, eventId, seed]);

    return <group>
        {particles.map((particle, index) => (
            <mesh key={index} geometry={boxGeometry} position={particle.position} scale={particle.scale}>
                <meshBasicMaterial color={index % 2 ? color : secondaryColor} transparent opacity={0.85} />
            </mesh>
        ))}
    </group>;
};

const SkillEffectInstance: React.FC<{
    event: SkillEffectEvent;
    playerPositions: ReadonlyMap<number, WorldPoint>;
    effectLevel: 'subtle' | 'medium' | 'intense';
}> = ({ event, playerPositions, effectLevel }) => {
    const groupRef = useRef<THREE.Group>(null);
    const elapsedRef = useRef(0);
    const caster = event.casterId ? playerPositions.get(event.casterId) : undefined;
    const target = event.targetIds?.[0] ? playerPositions.get(event.targetIds[0]) : undefined;
    const origin = caster ?? target ?? { x: 0, y: 0.35, z: 0 };
    const particleCount = effectLevel === 'intense' ? 22 : effectLevel === 'medium' ? 14 : 8;

    useFrame((_, delta) => {
        if (!groupRef.current) return;
        elapsedRef.current += delta;
        const progress = Math.min(1, elapsedRef.current / Math.max(0.1, event.durationMs / 1000));
        const pulse = 0.88 + Math.sin(progress * Math.PI) * 0.45;
        groupRef.current.scale.setScalar(pulse);
        groupRef.current.rotation.y += delta * (event.visibility === 'neutral' ? 0.25 : 1.1);
    });

    const usesBeam = BEAM_EFFECTS.has(event.effectKind) && caster && target;
    const usesShield = SHIELD_EFFECTS.has(event.effectKind);

    return (
        <group ref={groupRef} position={[origin.x, origin.y, origin.z]}>
            {usesBeam && (
                <group position={[-origin.x, -origin.y, -origin.z]}>
                    <Beam
                        from={{ x: caster.x, y: caster.y + 1.25, z: caster.z }}
                        to={{ x: target.x, y: target.y + 1.05, z: target.z }}
                        color={event.color}
                    />
                </group>
            )}
            {usesShield ? <ShieldCage color={event.color} /> : <CubeRing color={event.color} radius={event.visibility === 'neutral' ? 0.85 : 1.15} />}
            <ParticleBurst
                eventId={event.eventId}
                color={event.color}
                secondaryColor={event.secondaryColor}
                count={particleCount}
            />
            {effectLevel === 'intense' && event.visibility !== 'neutral' && (
                <pointLight color={event.color} intensity={2.2} distance={5} decay={2} position={[0, 1, 0]} />
            )}
        </group>
    );
};

export const SkillEffects: React.FC<SkillEffectsProps> = ({ events, playerPositions, effectLevel }) => (
    <group name="skill-effects">
        {events.map(event => (
            <SkillEffectInstance
                key={event.eventId}
                event={event}
                playerPositions={playerPositions}
                effectLevel={effectLevel}
            />
        ))}
    </group>
);

