import { generateText, parseLLMResponse } from '../services/llm';
import {
    playersAtom, gameConfigAtom, godStateAtom, logsAtom, turnCountAtom,
    actorProfilesAtom, llmPresetsAtom, llmProvidersAtom, remoteServerConfigAtom, globalApiConfigAtom
} from '../atoms';
import { WerewolfSkill } from '../services/skills/werewolf/WerewolfSkill';
import { ROLE_INFO, Role, WOLF_ROLES } from '../types';
import { isSheriffElectionEnabled } from '../game/rules';
import type { Store } from 'jotai/vanilla/store';

let werewolfSkillInstance: WerewolfSkill | null = null;
const getWerewolfSkill = () => {
    if (!werewolfSkillInstance) {
        werewolfSkillInstance = new WerewolfSkill();
    }
    return werewolfSkillInstance;
};

export async function generateAdvisorResult(
    requestPayload: {
        seatNumber: number;
        phase: string;
        turnCount: number;
        gameConfig: { roles: string[]; rules: any; sheriffEnabled: boolean };
        instruction: string;
    },
    store: Store
): Promise<any> {
    try {
        const players = store.get(playersAtom);
        const gameConfig = store.get(gameConfigAtom);
        const godState = store.get(godStateAtom);
        const logs = store.get(logsAtom);
        const turnCount = store.get(turnCountAtom);
        const actorProfiles = store.get(actorProfilesAtom);
        const llmPresets = store.get(llmPresetsAtom);
        const llmProviders = store.get(llmProvidersAtom);
        const remoteConfig = store.get(remoteServerConfigAtom);
        const globalApiConfig = store.get(globalApiConfigAtom);

        const targetPlayer = players.find(p => p.seatNumber === requestPayload.seatNumber);
        if (!targetPlayer) {
            return { error: '未找到对应玩家' };
        }

        const narratorActorId = globalApiConfig?.narratorActorId;
        const narratorActor = (actorProfiles || []).find((a: any) => a.id === narratorActorId) || actorProfiles?.[0];
        const llm = (llmPresets || []).find((p: any) => p.id === narratorActor?.llmPresetId) || llmPresets?.[0];
        const provider = (llmProviders || []).find((p: any) => p.id === llm?.providerId);

        if (!llm || !provider) {
            return { error: '房主端未配置LLM' };
        }

        const skill = getWerewolfSkill();

        const maskPlayerForViewer = (viewer: any, target: any) => {
            if (target.id === viewer.id) return target;
            const isWolfMate = WOLF_ROLES.includes(viewer.role) && WOLF_ROLES.includes(target.role);
            return {
                ...target,
                role: isWolfMate ? target.role : Role.VILLAGER,
                rolePrompt: isWolfMate ? target.rolePrompt : '',
                potions: undefined,
            };
        };

        const visiblePlayers = players.map((p: any) => maskPlayerForViewer(targetPlayer, p));
        const safeLogs = logs
            .filter((l: any) => {
                if (l.debugType) return false;
                if (!l.visibleTo || l.visibleTo.length === 0) return true;
                return l.visibleTo.includes(targetPlayer.id);
            })
            .map((l: any) => {
                const { debugData, thought, promptContext, rawResponse, strategySummary, modelName, debugType, ...safeLog } = l;
                return safeLog;
            });

        const advisorInstruction = `${requestPayload.instruction}\n你是人类玩家的军师，请严格站在该玩家可见信息视角给出当前最优操作建议。只输出可直接填入输入框的发言和必要的行动目标，不要暴露推理过程，不要猜测或提及不可见身份与私密夜间信息。`;

        const messages = await skill.generatePrompts(targetPlayer, {
            phase: requestPayload.phase as any,
            turnCount: requestPayload.turnCount,
            players: visiblePlayers,
            logs: safeLogs,
            roleConfigStr: gameConfig.roles.map((r: any) => ROLE_INFO[r].label).join(' '),
            roles: gameConfig.roles,
            rules: gameConfig.rules,
            godState: {
                sheriffId: godState.sheriffId,
                sheriffCandidates: godState.sheriffCandidates,
            },
            sheriffEnabled: isSheriffElectionEnabled(gameConfig),
            currentTurnLogs: safeLogs.filter((l: any) => l.turn === turnCount),
            alivePlayers: visiblePlayers.filter((p: any) => p.status === 'ALIVE'),
        }, advisorInstruction);

        const responseText = await generateText(
            messages,
            llm,
            provider,
            undefined,
            undefined,
            remoteConfig?.llmProxyEnabled ? remoteConfig?.llmProxyUrl : undefined
        );

        const result = parseLLMResponse(responseText || '{}');
        return {
            speak: result.speak || '',
            actionTarget: result.actionTarget ?? result.target ?? null,
            strategySummary: result.strategySummary || result.summary || '',
            modelName: llm.name || llm.modelId,
        };
    } catch (e: any) {
        console.error('[HostAdvisor] Error:', e);
        return { error: e.message || 'AI建议生成失败' };
    }
}
