import { GodState } from "../../types";
import { Player, GamePhase, Role, GameLog, GameRules } from '../../types';

export interface SkillContext {
    phase: GamePhase;
    turnCount: number;
    players: Player[];
    logs: GameLog[];
    // Simplified Global Config (only what's needed for prompts)
    roleConfigStr: string;
    roles?: Role[];
    rules?: GameRules;

    // Dynamic God State (optional, for specific phases)
    godState?: GodState | Partial<GodState>;
    sheriffEnabled?: boolean;
    sheriffId?: number | null;
    sheriffCandidates?: number[];

    // Derived Data (Engine helper results)
    currentTurnLogs?: GameLog[];
    alivePlayers?: Player[];
}

export interface Skill {
    id: string;
    name: string;
    description: string;

    /**
     * Generates the prompt messages (System + User) for the LLM.
     */
    generatePrompts(player: Player, context: SkillContext, instruction?: string): Promise<{ role: string; content: string }[]>;
}
