import React, { Suspense, lazy } from 'react';
import { useAtom } from 'jotai';
import { uiConfigAtom } from '../atoms';
import { ThreeSceneErrorBoundary } from './game/voxel3d/ThreeSceneErrorBoundary';
import { useGameSfx } from '../hooks/useGameSfx';
import { LiveSpeechCaption } from './game/LiveSpeechCaption';

const VoxelSurvivalRoom = lazy(() => import('./game/voxel/VoxelSurvivalRoom').then((module) => ({ default: module.VoxelSurvivalRoom })));
const VoxelRpgRoom = lazy(() => import('./game/voxel3d/VoxelRpgRoom'));

const LAYOUT_MAP: Record<string, React.LazyExoticComponent<React.FC>> = {
    'block-arena': VoxelSurvivalRoom,
    'redstone-hub': VoxelSurvivalRoom,
    'survival-log': VoxelSurvivalRoom,
};

const GameRoomView: React.FC = () => {
    const [uiConfig, setUiConfig] = useAtom(uiConfigAtom);
    // 演出音效 + 双轨 BGM:挂在 2D/3D 外层,两套视图共用
    useGameSfx();
    const LayoutComponent = LAYOUT_MAP[uiConfig.gameLayout] || VoxelSurvivalRoom;
    // 流式字幕挂在 2D/3D 之外:两套渲染器共用一份，避免各写一遍（也避免 3D 里再放一份 React 状态）
    const caption = <LiveSpeechCaption />;

    if (uiConfig.gameViewMode === '3d') {
        return (
            <>
                {caption}
                <ThreeSceneErrorBoundary onReturnTo2D={() => setUiConfig(prev => ({ ...prev, gameViewMode: '2d' }))}>
                    <Suspense fallback={(
                        <div className="flex h-[100dvh] items-center justify-center bg-[#11180f] text-sm font-black tracking-[0.18em] text-[#f6b443]">
                            正在生成 3D 世界...
                        </div>
                    )}>
                        <VoxelRpgRoom />
                    </Suspense>
                </ThreeSceneErrorBoundary>
            </>
        );
    }

    return (
        <>
            {caption}
            <Suspense fallback={null}>
                <LayoutComponent />
            </Suspense>
        </>
    );
};

export default GameRoomView;
