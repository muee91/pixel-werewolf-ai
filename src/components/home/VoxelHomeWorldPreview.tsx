import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useAtomValue } from 'jotai';
import { uiConfigAtom } from '../../atoms';
import { ForestCampScene } from '../game/voxel3d/ForestCampScene';
import type { VisiblePlayer } from '../game/voxel3d/sceneModel';
import { lookFromSeed } from '../../utils/avatarLook';
import { resolveSceneId, SCENES } from '../game/voxel3d/biomes';

interface VoxelHomeWorldPreviewProps {
    isNight: boolean;
}

export const createHomePreviewPlayers = (): VisiblePlayer[] => Array.from({ length: 9 }, (_, index) => ({
    id: index + 1,
    seatNumber: index + 1,
    displayName: `旅人${index + 1}`,
    status: 'ALIVE',
    avatarSeed: index + 1,
    isSpeaking: false,
    // The home world is decorative only.  Labels belong exclusively to a
    // running match and must never bleed through the home UI card layer.
    hideLabel: true,
    // 首页预览也要一眼看出"人是长得不一样的"，否则第一印象仍是复制粘贴的九胞胎
    look: lookFromSeed(index + 1),
}));

// A real, deliberately low-cost slice of the game world.  This keeps the
// selected 3D RPG mode tangible before the user commits to starting a match.
export const VoxelHomeWorldPreview: React.FC<VoxelHomeWorldPreviewProps> = ({ isNight }) => {
    const campPlayers = useMemo(createHomePreviewPlayers, []);
    const uiConfig = useAtomValue(uiConfigAtom);
    const scenePreset = SCENES[resolveSceneId(uiConfig.sceneId)];

    return (
        <div data-testid="voxel-home-world-preview" className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <Canvas
                className="absolute inset-0"
                camera={{ position: [15.5, 9.2, 17.5], fov: 52, near: 0.1, far: 150 }}
                dpr={[1, 1]}
                shadows={false}
                gl={{ alpha: false, antialias: false, powerPreference: 'default' }}
            >
                <color attach="background" args={[isNight ? '#29466e' : '#87ceeb']} />
                <ForestCampScene
                    scene={scenePreset}
                    players={campPlayers}
                    currentSpeakerId={null}
                    isNight={isNight}
                    effectLevel="subtle"
                    skillEvents={[]}
                />
            </Canvas>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,15,12,0.08),rgba(7,15,12,0.56))]" />
        </div>
    );
};

VoxelHomeWorldPreview.displayName = 'VoxelHomeWorldPreview';
