// 游戏演出音效接入点:阶段切换触发音效,昼夜驱动双轨 BGM,TTS 播报时自动压低。
// 在 GameRoomView 挂载一次,2D/3D 共用。
import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { gamePhaseAtom, isPlayingAudioAtom, uiConfigAtom } from '../atoms';
import { GamePhase } from '../types';
import { gameSfx } from '../services/sfx';

const NIGHT_PHASES = new Set<GamePhase>([
    GamePhase.NIGHT_START,
    GamePhase.WEREWOLF_ACTION,
    GamePhase.SEER_ACTION,
    GamePhase.WITCH_ACTION,
    GamePhase.GUARD_ACTION,
    GamePhase.GRAVEKEEPER_ACTION,
    GamePhase.DEMON_HUNTER_ACTION,
    GamePhase.STONE_GHOST_ACTION,
    GamePhase.MERCHANT_ACTION,
    GamePhase.CUPID_LINK,
]);

const PHASE_SFX: Partial<Record<GamePhase, Parameters<typeof gameSfx.play>[0]>> = {
    [GamePhase.NIGHT_START]: 'night-wolf',
    [GamePhase.DAY_ANNOUNCE]: 'day-rooster',
    [GamePhase.VOTING]: 'vote-drum',
    [GamePhase.SEER_ACTION]: 'skill-seer',
    [GamePhase.WITCH_ACTION]: 'skill-witch',
    [GamePhase.GUARD_ACTION]: 'skill-guard',
    [GamePhase.HUNTER_ACTION]: 'skill-hunter',
    [GamePhase.GAME_REVIEW]: 'fanfare',
};

export const useGameSfx = (): void => {
    const phase = useAtomValue(gamePhaseAtom);
    const uiConfig = useAtomValue(uiConfigAtom);
    const ttsPlaying = useAtomValue(isPlayingAudioAtom);
    const prevPhaseRef = useRef<GamePhase | null>(null);

    useEffect(() => {
        gameSfx.setEnabled(uiConfig.gameSfxEnabled);
        gameSfx.setVolume(uiConfig.gameSfxVolume);
    }, [uiConfig.gameSfxEnabled, uiConfig.gameSfxVolume]);

    useEffect(() => {
        gameSfx.setBgmEnabled(uiConfig.bgmEnabled);
    }, [uiConfig.bgmEnabled]);

    useEffect(() => {
        if (prevPhaseRef.current === phase) return;
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = phase;
        if (prev === null) return; // 首帧(进入/刷新页面)不触发
        const sfx = PHASE_SFX[phase];
        if (sfx) gameSfx.play(sfx);
        // 放逐后进入遗言:敲钟
        if (phase === GamePhase.LAST_WORDS && prev === GamePhase.VOTING) gameSfx.play('exile-bell');
    }, [phase]);

    // 双轨 BGM 昼夜切换
    const isNightPhase = NIGHT_PHASES.has(phase);
    useEffect(() => {
        if (!uiConfig.gameSfxEnabled) return;
        gameSfx.startBgm(isNightPhase ? 'night' : 'day');
    }, [isNightPhase, uiConfig.gameSfxEnabled]);

    useEffect(() => () => gameSfx.stopBgm(), []);
};
