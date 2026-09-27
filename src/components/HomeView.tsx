import React, { Suspense, lazy } from 'react';
import { useAtomValue } from 'jotai';
import { uiConfigAtom } from '../atoms';

const VoxelCampHome = lazy(() => import('./home/VoxelCampHome').then((module) => ({ default: module.VoxelCampHome })));

const HomeView: React.FC = () => {
    const uiConfig = useAtomValue(uiConfigAtom);
    let content: React.ReactNode = <VoxelCampHome />;
    switch (uiConfig.homeStyle) {
        case 'block-harbor':
        case 'survival-camp':
        case 'redstone-lobby':
            content = <VoxelCampHome />;
            break;
    }
    return <Suspense fallback={null}>{content}</Suspense>;
};

export default HomeView;
