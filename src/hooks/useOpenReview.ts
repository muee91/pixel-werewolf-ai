import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { appScreenAtom, reviewArchiveAtom } from '../store';
import type { GameArchive } from '../types';

/**
 * 打开复盘页的唯一入口（结算面板 / 历史对局 / 3D 房间共用）。
 *
 * 传 null = 看当前这局；传存档 = 看历史对局（只读，不动正在进行的对局）。
 */
export const useOpenReview = () => {
    const setReviewArchive = useSetAtom(reviewArchiveAtom);
    const setScreen = useSetAtom(appScreenAtom);
    return useCallback((archive: GameArchive | null = null) => {
        setReviewArchive(archive);
        setScreen('REVIEW');
    }, [setReviewArchive, setScreen]);
};
