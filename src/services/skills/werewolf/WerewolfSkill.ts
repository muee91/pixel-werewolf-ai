import { Skill, SkillContext } from '../types';
import { Player, Role, GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS, GameRules, DEFAULT_GAME_RULES, isImmuneToVote, WOLF_ROLES } from '../../../types';

/** Roles that participate in wolf night chat (excludes STONE_GHOST) */
const WOLF_CHAT_ROLES: Role[] = [Role.WEREWOLF, Role.WOLF_KING, Role.WHITE_WOLF_KING, Role.BLOOD_MOON_DISCIPLE];

const SYSTEM_PROMPT = "You are a master strategist in Werewolf. Your only goal is to WIN as a TEAM. Individual survival is secondary to the team victory.";

const INSTRUCTION_TEMPLATE = `
#### CURRENT STATE
{gameState}

#### MEMORY & VISION
{history}

#### ROLE
{roleInfo}

#### TASK
{task}

#### CONSTRAINTS
- Output strictly in JSON format.
- The JSON object MUST include a "strategySummary" field in Simplified Chinese for every response. Never omit it.
- "strategySummary" must be a short public-safe summary of your tactical intent, not hidden chain-of-thought.
- **IMPORTANT**: The "speak" field must be in Simplified Chinese.
- **NO_THINKING_LEAK**: Do not output chain-of-thought, reasoning steps, analysis, hidden strategy, or any thought/reasoning/analysis field. Only output fields required for gameplay actions and public/private speech.
- **SPEECH_ONLY**: The "speak" field must contain only what the character says aloud. Do not include internal monologue, parentheses, labels like "思考", "策略", "分析", or markdown.
- **INFORMATION_BOUNDARY**: Do not present another player's hidden role as system-known certainty unless it was publicly revealed or legitimately known to your role. Reads, accusations, pressure tests, fake claims, and bluffs are allowed as gameplay tactics.
- **PUBLIC_SPEECH_SAFETY**: In public speech, you may claim roles, fake-claim roles, bluff checks/potions/protection, or lie strategically. Do not leak private chat, teammates, or night-action facts as out-of-game/system knowledge; present them only as public claims or tactical statements.
- **TACTICAL_DECEPTION_ALLOWED**: Werewolf is a deception game. Do not avoid strong claims just because they may be false; judge whether the claim helps your team's win condition.
- **ANTI-REDUNDANCY**: Review the \`#### TRANSCRIPT\`. If your logical analysis has already been stated by previous players, DO NOT repeat it. Simply state agreement/disagreement or add new unique insights.
- **ROLE_ACCURACY**: When describing your OWN abilities, you MUST ONLY describe abilities that genuinely belong to your actual role as defined in the [ROLE] section. Do NOT claim abilities from other roles as your own. For example: Witch has potions only (no identity checking); Seer checks alignments only (no potions); Guard protects only (no checking); Hunter shoots on death only (no checking/potions). Tactical deception (fake-claiming) is allowed, but you must not genuinely confuse your own real abilities.
- **NO_FABRICATED_OBSERVATIONS**: Only reference speeches, votes, events and behaviors that ACTUALLY appear in the \`#### TRANSCRIPT\` or the \`#### FACT LEDGER\`. If they tell you nothing about a player (typical on the first night), DO NOT describe their speech patterns, habits, attitude or "looks" — say openly that you have no information yet, and reason from seat positions, player numbers, or admit it is a blind guess.
- **CHALLENGE_CONSENSUS**: When several players are pushing the same target, do not join just because of the numbers. Ask why nobody is defending them, point out what evidence is actually public, or take a contrarian position if the facts support it.
- **SUSPICION_FIELD** (public speech phases): you MAY include an optional "suspicion" field in the JSON — a short multi-line table mapping player numbers to your current read of them, each with evidence cited from \`#### TRANSCRIPT\` or \`#### FACT LEDGER\` only. The engine stores it and shows it back to you next turn as [Your Suspicion Table].
{constraints}
`.trim();

const buildGameRules = (roles: Role[] = [], rules: GameRules = DEFAULT_GAME_RULES): string => {
    const uniqueRoles = new Set(roles);
    const ruleLines = [
        '- Werewolves: Kill all Villagers OR all Gods.',
        `- Sheriff election: ${rules.sheriffElection ? `enabled; sheriff exile vote weight is ${rules.sheriffVoteWeight}.` : 'disabled.'}`,
        `- Vote details public: ${rules.voteDetailPublic ? 'yes.' : 'no; only summary should be public.'}`,
        `- Wolf self-explode: ${rules.wolfExplodeEnabled ? 'enabled.' : 'disabled.'}`,
        `- Double-explode badge loss: ${rules.doubleExplodeSwallowBadge ? 'enabled; when two wolves have exploded, the sheriff badge is destroyed.' : 'disabled.'}`,
        `- Witch self-save: ${rules.witchSelfSave === true ? 'allowed every night.' : rules.witchSelfSave === 'FIRST_NIGHT' ? 'allowed only on first night.' : 'forbidden.'}`,
        `- Witch same night heal+poison: ${rules.witchSameNight ? 'allowed.' : 'forbidden.'}`,
        `- Hunter can shoot when poisoned: ${rules.hunterCanShootWhenPoisoned ? 'yes.' : 'no.'}`,
        `- First night last words: ${rules.firstNightLastWords ? 'enabled.' : 'disabled.'}`,
        `- Voted-out last words: ${rules.votedOutLastWords ? 'enabled.' : 'disabled.'}`
    ];

    if (uniqueRoles.has(Role.WOLF_KING)) {
        ruleLines.push(`- Wolf king can shoot when poisoned: ${rules.wolfKingCanShootWhenPoisoned ? 'yes.' : 'no (standard rule: being poisoned silences the gun).'}`);
    }

    if (uniqueRoles.has(Role.IDIOT)) {
        ruleLines.push('- Idiot: if exiled, reveals and remains alive but cannot vote or be exiled again.');
    }

    if (uniqueRoles.has(Role.SEER)) {
        ruleLines.push('- Seer: Inspect 1 player per night.');
    } else {
        ruleLines.push('- This setup has no Seer. Do not discuss real Seer checks as system-known facts.');
    }

    if (uniqueRoles.has(Role.WITCH)) {
        ruleLines.push('- Witch: Use 1 Heal and 1 Poison potion per game.');
    } else {
        ruleLines.push('- This setup has no Witch. Do not discuss real Witch potions as system-known facts.');
    }

    if (uniqueRoles.has(Role.HUNTER)) {
        ruleLines.push('- Hunter: May shoot when dead unless restricted by death cause/rules.');
    } else {
        ruleLines.push('- This setup has no Hunter. Do not discuss real Hunter shots as system-known facts.');
    }

    if (uniqueRoles.has(Role.GUARD)) {
        ruleLines.push(`- Guard: Protect 1 player per night${rules.guardCannotSameTarget ? ' and cannot protect the same player on consecutive nights' : ''}.`);
        ruleLines.push(`- Guard blocks poison: ${rules.guardBlocksPoison ? 'yes.' : 'no.'}`);
        ruleLines.push(`- Guard + Heal conflict: ${rules.guardHealConflictKills ? 'kills protected target.' : 'does not kill protected target.'}`);
    } else {
        ruleLines.push('- This setup has no Guard. Do not discuss Guard actions or Guard protection.');
    }

    // --- New Role Rules ---
    if (uniqueRoles.has(Role.WOLF_KING)) {
        ruleLines.push('- Wolf King (狼王): Werewolf variant. Participates in wolf night chat. Upon death, may shoot one player.');
    }
    if (uniqueRoles.has(Role.KNIGHT)) {
        ruleLines.push('- Knight (骑士): Good god role. May challenge one player during the day. If target is a werewolf, target dies; otherwise Knight dies. One-time ability.');
    }
    if (uniqueRoles.has(Role.STONE_GHOST)) {
        ruleLines.push('- Stone Ghost (石像鬼): Werewolf faction but does NOT participate in wolf night chat. Can check one player\'s exact identity (not just good/wolf) each night.');
    }
    if (uniqueRoles.has(Role.WHITE_WOLF_KING)) {
        ruleLines.push('- White Wolf King (白狼王): Werewolf variant. Participates in wolf night chat. When self-exploding, may take one player down.');
    }
    if (uniqueRoles.has(Role.BLOOD_MOON_DISCIPLE)) {
        ruleLines.push('- Blood Moon Disciple (血月使徒): Werewolf variant. Participates in wolf night chat. When self-exploding, seals all god abilities for that night (Seer cannot check, Witch cannot use potions, Guard cannot protect).');
    }
    if (uniqueRoles.has(Role.GRAVEKEEPER)) {
        ruleLines.push('- Gravekeeper (守墓人): Good god role. Each night, can check the exact identity of the last player who was exiled by vote.');
    }
    if (uniqueRoles.has(Role.DEMON_HUNTER)) {
        ruleLines.push('- Demon Hunter (猎魔人): Good god role. May hunt one player at night. If target is a werewolf, target dies; otherwise Demon Hunter dies. Reusable but each use carries risk.');
    }
    if (uniqueRoles.has(Role.CUPID)) {
        ruleLines.push('- Cupid (丘比特): Good god role. On the first night, links two players as lovers. If one lover dies, the other dies too. If lovers are good+wolf, Cupid and the lovers form a third-party faction.');
    }
    if (uniqueRoles.has(Role.MIRACLE_MERCHANT)) {
        ruleLines.push('- Miracle Merchant (奇迹商人): Good god role. Each night, gives one skill (check/poison/guard) to one player. If given to a wolf-faction player, Merchant dies.');
    }

    return ruleLines.join('\n');
};

const isPublicSpeechPhase = (phase: GamePhase) => (
    phase === GamePhase.DAY_DISCUSSION ||
    phase === GamePhase.SHERIFF_ELECTION ||
    phase === GamePhase.LAST_WORDS ||
    phase === GamePhase.DAY_ANNOUNCE ||
    phase === GamePhase.DISCUSSION_ROUND_TWO
);

const MAX_PUBLIC_TRANSCRIPT_LOGS = 80;

/**
 * `AI_THINKING` is the legacy debug label on normal player utterances too.
 * It must remain in a player's public memory, while event traces and decision
 * payloads must never be supplied to the model as if they were spoken words.
 */
const isPublicTranscriptLog = (log: SkillContext['logs'][number]) =>
    !log.visibleTo && (
        !log.debugType || log.debugType === 'AI_THINKING'
    );

export class WerewolfSkill implements Skill {
    id = 'werewolf_core';
    name = 'Werewolf Game Core';
    description = 'Standard Werewolf game logic and role-playing engine.';

    async generatePrompts(player: Player, context: SkillContext, instruction?: string): Promise<{ role: string; content: string }[]> {
        const { phase, roleConfigStr, alivePlayers = [] } = context;

        // 1. Build Game State Section
        const gameState = this.buildGameState(context, alivePlayers, roleConfigStr);

        // 2. Build History Section
        const history = this.buildHistory(player, context);

        // 3. Build Role Info
        const roleInfo = this.buildRoleInfo(player, context);

        // 4. Determine Task & Constraints
        const { task, constraints } = this.getPhaseInstruction(player, context, instruction);

        // 5. Assemble User Prompt
        const userPrompt = INSTRUCTION_TEMPLATE
            .replace('{gameState}', gameState)
            .replace('{history}', history)
            .replace('{roleInfo}', roleInfo)
            .replace('{task}', task)
            .replace('{constraints}', constraints);

        // 6. 直播人设:玩家携带的说话风格注入 user prompt,约束输出语气但不改变推理
        const persona = (player.stylePrompt ?? '').trim();
        const personaBlock = persona ? `\n#### SPEAKING STYLE (MANDATORY)\n${persona}\n以上风格仅约束语气与措辞,不得改变你的逻辑判断与阵营策略。\n` : '';

        // 7. 事实账本(防腐化):只含引擎真实发生的事件,放在提示词最末尾——
        // 离生成位置最近,避免长上下文稀释(context rot);也是 NO_FABRICATED_OBSERVATIONS 的合法引用源
        const factLedgerBlock = this.buildFactLedger(player, context);

        return [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt + personaBlock + factLedgerBlock }
        ];
    }

    /** 引擎核验过的事实流水：死亡/出局/自爆/警徽/翻牌/用药。只收系统播报，绝不引入模型推测。
     *  必须按 visibleTo 过滤——上帝私聊(验人/用药)只对当事人可见。 */
    private buildFactLedger(player: Player, context: SkillContext): string {
        const ledger = context.logs
            .filter(log =>
                log.isSystem &&
                !log.debugType &&
                log.turn <= context.turnCount &&
                (!log.visibleTo || log.visibleTo.includes(player.id)) &&
                /死亡|出局|自爆|警徽|翻牌|平安夜|解药|毒死|开枪/.test(log.content) &&
                !log.content.startsWith('等待')
            )
            .slice(-25)
            .map(log => `- D${log.turn}: ${log.content.replace(/\n+/g, ' ')}`);
        if (ledger.length === 0) return '';
        return `\n#### FACT LEDGER (engine-verified history — cite these facts, never invent others)\n${ledger.join('\n')}\n`;
    }

    // --- Core Builders ---

    private buildGameState(context: SkillContext, alivePlayers: Player[], roleConfigStr: string): string {
        const { phase, turnCount, sheriffEnabled, sheriffId, sheriffCandidates = [], roles = [], rules = DEFAULT_GAME_RULES } = context;
        const aliveList = alivePlayers.map(p => `${p.id} 号`).join('、');
        const sheriffInfo = sheriffEnabled
            ? `- Sheriff Rule: Enabled. Sheriff exile vote weight is ${rules.sheriffVoteWeight}. Current Sheriff: ${sheriffId ? `${sheriffId} 号` : 'None'}. Sheriff Candidates: [${sheriffCandidates.join(', ') || 'None'}]`
            : `- Sheriff Rule: Disabled.`;
        const gameRules = buildGameRules(roles, rules);
        const voteImmuneList = alivePlayers.filter(isImmuneToVote).map(p => `${p.id} 号`).join('、') || 'None';

        return `
- Phase: ${PHASE_LABELS[phase]}
- Current Day: ${turnCount}
- Config: ${roleConfigStr}
- Rules:
${gameRules}
${sheriffInfo}
- Alive Players: [${aliveList}]
- Vote-Immune Revealed Idiots: [${voteImmuneList}]
`.trim();
    }

    private buildHistory(player: Player, context: SkillContext): string {
        const { logs, turnCount, currentTurnLogs = [], phase } = context;
        const publicOnly = isPublicSpeechPhase(phase);
        const transcriptLogs = publicOnly
            ? logs
                .filter(log => log.turn <= turnCount && isPublicTranscriptLog(log))
                .slice(-MAX_PUBLIC_TRANSCRIPT_LOGS)
            : currentTurnLogs.filter(log => !log.debugType || log.debugType === 'AI_THINKING');

        // 1. Current Turn Transcript (Most important)
        const currentTranscript = transcriptLogs.length > 0
            ? transcriptLogs.map(l => l.isSystem ? `[SYSTEM]: ${l.content}` : `[Player ${l.speakerId}]: ${l.content}`).join('\n')
            : "(No speeches yet)";

        // 2. Private Memory (for special roles)
        let privateMemory = "";

        // 0. 怀疑表回注：该玩家上一轮自己输出的怀疑表（引擎存储，按玩家隔离，无泄露）
        const suspicionTable = context.godState?.agentSuspicion?.[player.id];
        if (suspicionTable) {
            privateMemory += `\n[Your Suspicion Table (from your last turn; update the "suspicion" field if it changed)]:\n${suspicionTable}`;
        }

        // --- Self-Knowledge Memory (always available, even in public phases) ---
        // A player always remembers their own night action results.
        // This is NOT public info leak — it's the player's own memory.

        if (player.role === Role.SEER) {
            const checks = logs.filter(l => l.phase === GamePhase.SEER_ACTION && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (checks.length) privateMemory += "\n[Your Past Checks]:\n" + checks.map(l => l.content).join('\n');
        }

        if (player.role === Role.WITCH) {
            const history = logs.filter(l => l.phase === GamePhase.WITCH_ACTION && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[Your Past Actions]:\n" + history.map(l => l.content).join('\n');
            const potionStatus = `Cure potion: ${player.potions?.cure ? 'AVAILABLE' : 'USED'}. Poison potion: ${player.potions?.poison ? 'AVAILABLE' : 'USED'}.`;
            privateMemory += `\n[Your Potion Status]: ${potionStatus}`;
        }

        if (player.role === Role.GUARD) {
            const history = logs.filter(l => l.phase === GamePhase.GUARD_ACTION && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[Your Past Guards]:\n" + history.map(l => l.content).join('\n');
        }

        // --- Night-Only Memory (only in non-public phases) ---

        if (!publicOnly && player.role === Role.WEREWOLF) {
            const history = logs.filter(l => l.phase === GamePhase.WEREWOLF_ACTION && l.turn <= turnCount && !l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[Past Night Chats]:\n" + history.map(l => `Turn ${l.turn}: ${l.content}`).join('\n');
        }

        // Wolf-variant roles: same night chat access as regular werewolf
        if (!publicOnly && WOLF_CHAT_ROLES.includes(player.role) && player.role !== Role.WEREWOLF) {
            const history = logs.filter(l => l.phase === GamePhase.WEREWOLF_ACTION && l.turn <= turnCount && !l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[Past Night Chats]:\n" + history.map(l => `Turn ${l.turn}: ${l.content}`).join('\n');
        }

        // Stone Ghost: past check results
        if (player.role === Role.STONE_GHOST) {
            const checks = logs.filter(l => l.phase === GamePhase.STONE_GHOST_ACTION && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (checks.length) privateMemory += "\n[Your Past Identity Checks]:\n" + checks.map(l => l.content).join('\n');
        }

        // Gravekeeper: past check results
        if (player.role === Role.GRAVEKEEPER) {
            const checks = logs.filter(l => l.phase === GamePhase.GRAVEKEEPER_ACTION && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (checks.length) privateMemory += "\n[Your Past Grave Checks]:\n" + checks.map(l => l.content).join('\n');
        }

        // Demon Hunter: past hunt results
        if (player.role === Role.DEMON_HUNTER) {
            const hunts = logs.filter(l => l.phase === GamePhase.DEMON_HUNTER_ACTION && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (hunts.length) privateMemory += "\n[Your Past Hunts]:\n" + hunts.map(l => l.content).join('\n');
        }

        // Cupid: linked lovers info
        if (player.role === Role.CUPID) {
            const links = logs.filter(l => l.phase === GamePhase.CUPID_LINK && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (links.length) privateMemory += "\n[Your Lover Links]:\n" + links.map(l => l.content).join('\n');
        }

        // Miracle Merchant: past skill distributions
        if (player.role === Role.MIRACLE_MERCHANT) {
            const skills = logs.filter(l => l.phase === GamePhase.MERCHANT_ACTION && l.turn <= turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (skills.length) privateMemory += "\n[Your Past Skill Distributions]:\n" + skills.map(l => l.content).join('\n');
        }

        return `
### Current Transcript
${currentTranscript}

### Private Memory
${privateMemory || (publicOnly ? "Hidden during public speech." : "None")}
`.trim();
    }

    private buildRoleInfo(player: Player, context: SkillContext): string {
        let info = `You are Player ${player.id}. Role: ${ROLE_INFO[player.role].label} (${player.role}).`;

        // --- Wolf-faction roles: show full wolf team ---
        if (WOLF_ROLES.includes(player.role)) {
            const wolves = context.players.filter(p => WOLF_ROLES.includes(p.role));
            const wolfTeam = wolves.map(p => `Player ${p.id}(${ROLE_INFO[p.role].label})${p.id === player.id ? ' (YOU)' : ''}${p.status !== PlayerStatus.ALIVE ? ' (DEAD)' : ''}`).join(', ');
            const livingWolfTeam = wolves.filter(p => p.status === PlayerStatus.ALIVE).map(p => p.id).join(', ') || 'None';

            if (WOLF_CHAT_ROLES.includes(player.role)) {
                // Roles that participate in wolf chat
                info += `\n[SECRET WEREWOLF TEAM] You know all wolf-faction members. Wolf team: ${wolfTeam}. Living wolves: [${livingWolfTeam}]. Never claim you do not know your teammates during night chat.`;
            } else if (player.role === Role.STONE_GHOST) {
                // Stone Ghost: knows wolf team but does NOT participate in chat
                info += `\n[SECRET WEREWOLF TEAM] You belong to the wolf faction. Wolf team: ${wolfTeam}. Living wolves: [${livingWolfTeam}]. However, you do NOT participate in wolf night chat. You act independently and check identities at night.`;
            }
        }

        // --- Role-specific ability hints ---
        if (player.role === Role.WEREWOLF) {
            info += `\n[ABILITY] 你是普通狼人，夜间与狼队友讨论并选择击杀目标。你没有额外技能。`;
        }
        if (player.role === Role.VILLAGER) {
            info += `\n[ABILITY] 你是普通村民，没有特殊技能。依靠逻辑推理和投票帮助好人阵营获胜。`;
        }
        if (player.role === Role.SEER) {
            info += `\n[ABILITY] 你是预言家，每晚可以查验一名玩家的阵营（好人/狼人）。你没有药水、守护、开枪等其他技能。`;
        }
        if (player.role === Role.WITCH) {
            info += `\n[ABILITY] 你是女巫，拥有一瓶解药和一瓶毒药。解药可以救活晚上被杀的人，毒药可以毒死一个人。你没有查验身份、守护、开枪等其他技能。`;
        }
        if (player.role === Role.HUNTER) {
            info += `\n[ABILITY] 你是猎人，死亡时可以开枪带走一名玩家（被毒死时根据规则可能无法开枪）。你没有查验身份、药水、守护等其他技能。`;
        }
        if (player.role === Role.GUARD) {
            info += `\n[ABILITY] 你是守卫，每晚可以守护一名玩家免受狼刀。你没有查验身份、药水、开枪等其他技能。`;
        }
        if (player.role === Role.IDIOT) {
            info += `\n[ABILITY] 你是白痴，被投票出局时会翻牌存活，但失去投票权。你没有查验身份、药水、守护、开枪等其他技能。`;
        }
        if (player.role === Role.WOLF_KING) {
            info += `\n[ABILITY] 你是狼王，死亡时可以开枪带走一名玩家。在狼人夜间讨论中，你与普通狼人一起行动。你没有查验身份、药水、守护等非狼人技能。`;
        }
        if (player.role === Role.KNIGHT) {
            info += `\n[ABILITY] 你是骑士，白天可以发起决斗。选择一名玩家决斗：若对方是狼人则对方死亡，否则你自己死亡。这是一次性技能，请谨慎使用。你没有查验身份、药水、守护、开枪等其他技能。`;
        }
        if (player.role === Role.STONE_GHOST) {
            info += `\n[ABILITY] 你是石像鬼，属于狼人阵营但不参与狼人讨论。夜间你可以查验一名玩家的具体身份（不是好人/狼人，而是具体角色名）。你没有药水、守护、开枪等技能。`;
        }
        if (player.role === Role.WHITE_WOLF_KING) {
            info += `\n[ABILITY] 你是白狼王，与普通狼人一起参与夜间讨论。自爆时可以带走一名玩家。你没有查验身份、药水、守护等非狼人技能。`;
        }
        if (player.role === Role.BLOOD_MOON_DISCIPLE) {
            info += `\n[ABILITY] 你是血月使徒，与普通狼人一起参与夜间讨论。自爆后可以封印当晚所有神职技能（预言家无法查验、女巫无法用药、守卫无法守护）。你没有查验身份、药水、守护、开枪等非狼人技能。`;
        }
        if (player.role === Role.GRAVEKEEPER) {
            info += `\n[ABILITY] 你是守墓人，每晚可以查验上一轮被放逐玩家的具体身份。你没有药水、守护、开枪等其他技能。`;
        }
        if (player.role === Role.DEMON_HUNTER) {
            info += `\n[ABILITY] 你是猎魔人，夜间可选择一名玩家猎杀。若对方是狼人则对方死亡，若对方是好人则你自己死亡。你没有查验阵营、药水、守护等其他技能。`;
        }
        if (player.role === Role.CUPID) {
            info += `\n[ABILITY] 你是丘比特，首夜选择两名玩家成为情侣。情侣一方死亡，另一方殉情。你没有查验身份、药水、守护、开枪等其他技能。`;
        }
        if (player.role === Role.MIRACLE_MERCHANT) {
            info += `\n[ABILITY] 你是奇迹商人，夜间向一名玩家发放技能（查验/毒药/守护三选一）。你自己不能直接使用这些技能，只能发放给其他玩家。你没有查验身份、守护、开枪等其他技能。`;
        }

        return info;
    }

    private getPhaseInstruction(player: Player, context: SkillContext, instruction?: string): { task: string, constraints: string } {
        const { phase, players, alivePlayers = [], godState } = context;

        const merchantSkillTarget = godState?.merchantSkillTarget;
        const merchantSkillType = godState?.merchantSkillType;
        const hasMerchantSkill = merchantSkillTarget === player.id && !godState?.merchantSkillUsed;

        if (phase === GamePhase.SEER_ACTION && hasMerchantSkill && merchantSkillType === 'check') {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join(', ');
            return {
                task: `你获得了奇迹商人发放的一次性查验技能。请选择一名玩家查验其阵营。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "actionTarget": number, "speak": "short action confirmation" }
- actionTarget 必须为有效存活玩家 ID。`
            };
        }

        if (phase === GamePhase.WITCH_ACTION && hasMerchantSkill && merchantSkillType === 'poison') {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join(', ');
            return {
                task: `你获得了奇迹商人发放的一次性毒药技能。请选择一名玩家毒杀，或跳过。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "actionTarget": number | null, "poisonTarget": number | null, "speak": "short action confirmation" }
- actionTarget/poisonTarget 为有效存活玩家 ID 时表示使用毒药；为 null 表示跳过。`
            };
        }

        if (phase === GamePhase.GUARD_ACTION && hasMerchantSkill && merchantSkillType === 'guard') {
            const targets = alivePlayers.map(p => p.id).join(', ');
            return {
                task: `你获得了奇迹商人发放的一次性守护技能。请选择一名玩家守护，或跳过。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "actionTarget": number | null, "speak": "short action confirmation" }
- actionTarget 为有效存活玩家 ID 时表示守护；为 null 表示跳过。`
            };
        }

        // ============================================================
        // 1. Wolf Night Chat (WEREWOLF, WOLF_KING, WHITE_WOLF_KING, BLOOD_MOON_DISCIPLE)
        // ============================================================
        if (phase === GamePhase.WEREWOLF_ACTION && WOLF_CHAT_ROLES.includes(player.role)) {
            const teammates = players.filter(p => WOLF_ROLES.includes(p.role) && p.id !== player.id);
            const teammateStr = teammates.map(p => `Player ${p.id}(${ROLE_INFO[p.role].label})${p.status !== PlayerStatus.ALIVE ? ' (DEAD)' : ''}`).join(', ') || "None";
            const teammateIds = teammates.filter(p => p.status === PlayerStatus.ALIVE).map(p => p.id).join(', ') || 'None';
            const nonWolfAlive = players.filter(p => !WOLF_ROLES.includes(p.role) && p.status === PlayerStatus.ALIVE).map(p => `Player ${p.id}`).join(', ') || 'None';

            let roleHint = '';
            if (player.role === Role.WOLF_KING) {
                roleHint = ' 你是狼王，死亡时可以开枪带走一人，因此你可以更激进地发言和行动。';
            } else if (player.role === Role.WHITE_WOLF_KING) {
                roleHint = ' 你是白狼王，自爆时可以带走一名玩家。如果局势不利，可以考虑自爆带人。';
            } else if (player.role === Role.BLOOD_MOON_DISCIPLE) {
                roleHint = ' 你是血月使徒，自爆后可以封印当晚所有神职技能。如果狼队需要压制神职，可以考虑自爆。';
            }

            return {
                task: `This is a private werewolf night chat. You already know your teammates from the current game state. Coordinate with the wolf team to select a kill target and shape future public deception. **Known teammates**: ${teammateStr}. **Living wolf teammate IDs**: [${teammateIds}]. **Valid kill targets (alive non-wolves)**: [${nonWolfAlive}]. **STRATEGY**: Winning as a team is the ONLY priority. In wolf chat, speak as one of the wolf team; do not describe a living wolf teammate as a villager, good guy, god, suspicious town, or kill candidate. However, you may plan deceptive public claims for later daytime speech, including distancing, fake-claiming, framing, or misdirection against town. You MUST ONLY propose kill targets from the alive non-wolf list above.${roleHint} ${instruction || "Communicate your intent."}`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "private message to known werewolf teammates" }
- Do not ask who your wolf teammates are.
- Do not imply you are unsure which players are werewolves.
- Do not label a living wolf teammate as a villager, good guy, god, suspicious town, or kill target inside wolf chat.
- NO_FABRICATED_OBSERVATIONS: only cite speeches/behaviors that exist in the TRANSCRIPT. On the first night (empty transcript) do NOT invent reads like "player X looks confident" or "player Y is always quiet" — justify kill picks by seat position/number or openly say it is a blind first-night guess.
- Deceptive tactics are allowed and encouraged, but distinguish private wolf-team truth from future public bluffs/plans.`
            };
        }

        // --- 1b. Stone Ghost during Wolf Night (no chat, wait for own phase) ---
        if (phase === GamePhase.WEREWOLF_ACTION && player.role === Role.STONE_GHOST) {
            return {
                task: "你是石像鬼，属于狼人阵营但不参与狼人夜间讨论。你的查验行动在单独的阶段进行，请等待。",
                constraints: "- Output NO_OP."
            };
        }

        // ============================================================
        // 2. Seer
        // ============================================================
        if (phase === GamePhase.SEER_ACTION && player.role === Role.SEER) {
            return {
                task: "Choose one player to inspect.",
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "actionTarget": number, "speak": "short action confirmation" }`
            };
        }

        // ============================================================
        // 3. Witch
        // ============================================================
        if (phase === GamePhase.WITCH_ACTION && player.role === Role.WITCH) {
            const dyingId = godState?.wolfTarget;
            const info = dyingId ? `Player ${dyingId} was attacked.` : "No one was attacked.";
            // canUseCure 由引擎按同一结算公式注入（含自救限制）：被拒的自救
            // 不消耗药水，提前告知可避免女巫 AI 误判药水状态
            const cureUsable = godState?.canUseCure !== false;
            const cureHint = !player.potions?.cure
                ? "Cure already used."
                : cureUsable
                    ? "Cure AVAILABLE tonight."
                    : "Cure CANNOT be used tonight (self-save or rule restriction); attempting it saves no one and consumes nothing.";
            const potions = `Poison: ${player.potions?.poison ? 'YES' : 'NO'}. ${cureHint}`;

            return {
                task: `Decide potion usage. ${info}. ${potions}.`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "useCure": boolean, "poisonTarget": number | null, "speak": "short action confirmation" }`
            };
        }

        // ============================================================
        // 4. Guard
        // ============================================================
        if (phase === GamePhase.GUARD_ACTION && player.role === Role.GUARD) {
            const targets = alivePlayers.map(p => p.id).join(', ');
            const lastGuard = godState?.lastGuardProtect ? ` You protected Player ${godState.lastGuardProtect} last night and cannot protect the same player tonight.` : '';
            return {
                task: `Choose one player to protect tonight. Valid targets: [${targets}].${lastGuard}`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "actionTarget": number, "speak": "short action confirmation" }`
            };
        }

        // ============================================================
        // 5. Hunter Death Shoot
        // ============================================================
        if (phase === GamePhase.HUNTER_ACTION && player.role === Role.HUNTER) {
            return {
                task: "You died. Choose a player to shoot, or pass.",
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "last words", "actionTarget": number | null }`
            };
        }

        // ============================================================
        // 5b. Wolf King Death Shoot
        // ============================================================
        if (phase === GamePhase.HUNTER_ACTION && player.role === Role.WOLF_KING) {
            const targets = alivePlayers.map(p => p.id).join(', ');
            return {
                task: `你是狼王，你已经死亡，可以开枪带走一名玩家！这是你最后的机会，请慎重选择。优先带走对狼队威胁最大的神职玩家。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "last words", "actionTarget": number | null }
- actionTarget 为 null 表示不开枪（放弃技能）。`
            };
        }

        // ============================================================
        // 6. Knight Challenge
        // ============================================================
        if (phase === GamePhase.KNIGHT_CHALLENGE && player.role === Role.KNIGHT) {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join(', ');
            return {
                task: `你是骑士，现在可以发起决斗。你可以对一名玩家发起决斗：若对方是狼人则对方死亡，否则你自己死亡。这是一次性技能，请谨慎使用。基于白天发言推理谁是狼人，在有较高把握时使用。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "challenge" | "skip", "target": number | null, "speak": "决斗宣言或跳过说明" }
- action 为 "challenge" 时，target 必须为有效玩家 ID。
- action 为 "skip" 时，target 为 null。
- 如果没有较高把握，建议跳过。`
            };
        }

        // ============================================================
        // 7. Stone Ghost Check
        // ============================================================
        if (phase === GamePhase.STONE_GHOST_ACTION && player.role === Role.STONE_GHOST) {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join(', ');
            return {
                task: `你是石像鬼，夜间可以查验一名玩家的具体身份（不是好人/狼人，而是具体角色名）。优先查验可疑的神职玩家，为狼队提供情报。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "check", "target": number, "speak": "short action confirmation" }
- target 必须为存活玩家 ID。
- 查验结果将由上帝反馈给你。`
            };
        }

        // ============================================================
        // 8. Gravekeeper Check
        // ============================================================
        if (phase === GamePhase.GRAVEKEEPER_ACTION && player.role === Role.GRAVEKEEPER) {
            const lastExiled = godState?.lastExiledPlayerId;
            const exiledInfo = lastExiled ? `上一轮被放逐的玩家是 ${lastExiled} 号。` : '上一轮没有被放逐的玩家。';
            return {
                task: `你是守墓人，每晚可以查验上一轮被放逐玩家的具体身份。${exiledInfo}查验将自动进行，你只需确认。利用这些信息帮助好人阵营推理。`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "check", "speak": "short action confirmation" }
- 查验结果将由上帝反馈给你，无需选择目标。`
            };
        }

        // ============================================================
        // 9. Demon Hunter Hunt
        // ============================================================
        if (phase === GamePhase.DEMON_HUNTER_ACTION && player.role === Role.DEMON_HUNTER) {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join(', ');
            return {
                task: `你是猎魔人，夜间可选择一名玩家猎杀。若对方是狼人则对方死亡，若对方是好人则你自己死亡。可多次使用，但每次都有风险。在有较高把握时使用，避免误杀好人导致自己死亡。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "hunt" | "skip", "target": number | null, "speak": "short action confirmation" }
- action 为 "hunt" 时，target 必须为有效玩家 ID。
- action 为 "skip" 时，target 为 null。
- 如果没有较高把握，建议跳过以避免误杀好人。`
            };
        }

        // ============================================================
        // 10. Cupid Link
        // ============================================================
        if (phase === GamePhase.CUPID_LINK && player.role === Role.CUPID) {
            const targets = alivePlayers.map(p => p.id).join(', ');
            return {
                task: `你是丘比特，首夜选择两名玩家成为情侣。情侣一方死亡，另一方殉情。若情侣为好人+狼人，你们三人组成第三方阵营，胜利条件变为三方存活到最后。策略建议：可以选择连结两个好人（安全）或好人+狼人（第三方阵营，风险高但收益大）。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "link", "target1": number, "target2": number, "speak": "short action confirmation" }
- target1 和 target2 必须为不同的存活玩家 ID。
- 此技能仅在首夜可用。`
            };
        }

        // ============================================================
        // 11. Miracle Merchant Give Skill
        // ============================================================
        if (phase === GamePhase.MERCHANT_ACTION && player.role === Role.MIRACLE_MERCHANT) {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join(', ');
            return {
                task: `你是奇迹商人，夜间向一名玩家发放技能（查验/毒药/守护三选一）。若发给狼人阵营玩家，你自己会死亡。优先发给可信的好人玩家，避免发给狼人。Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "give", "target": number, "skillType": "check" | "poison" | "guard", "speak": "short action confirmation" }
- target 必须为存活玩家 ID（不能是自己）。
- skillType: "check" = 查验技能, "poison" = 毒药技能, "guard" = 守护技能。
- 若发给狼人阵营玩家，你自己会死亡！请谨慎选择。`
            };
        }

        // ============================================================
        // 12. Wolf Self-Explode Decision
        // ============================================================
        if (phase === GamePhase.WOLF_EXPLODE && WOLF_ROLES.includes(player.role)) {
            const targets = alivePlayers.filter(p => !WOLF_ROLES.includes(p.role)).map(p => p.id).join(', ');

            if (player.role === Role.WHITE_WOLF_KING) {
                return {
                    task: `你是白狼王，是否要在白天自爆？自爆后可以带走一名玩家。自爆会暴露你的身份并跳过投票，但可以带走一名关键玩家。评估当前局势，是否值得自爆。Non-wolf targets: [${targets}].`,
                    constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "explode" | "skip", "target": number | null, "shootTarget": number | null, "speak": "自爆宣言或跳过说明" }
- action 为 "explode" 时：target 为指刀目标（今晚击杀目标，可为 null），shootTarget 为白狼王自爆立即带走的玩家 ID。
- action 为 "skip" 时：所有目标字段为 null。`
                };
            }

            if (player.role === Role.BLOOD_MOON_DISCIPLE) {
                return {
                    task: `你是血月使徒，是否要在白天自爆？自爆后可以封印当晚所有神职技能（预言家无法查验、女巫无法用药、守卫无法守护）。评估当前局势，如果狼队需要压制神职，可以考虑自爆。Non-wolf targets: [${targets}].`,
                    constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "explode" | "skip", "target": number | null, "speak": "自爆宣言或跳过说明" }
- action 为 "explode" 时：target 为指刀目标（今晚击杀目标），可以为 null 表示不指刀。
- action 为 "skip" 时：target 为 null。`
                };
            }

            // Regular wolf / Wolf King self-explode
            return {
                task: `你是否要在白天自爆？自爆后可指刀（指定今晚击杀目标），但会暴露身份并跳过投票。评估当前局势，是否值得自爆。Non-wolf targets: [${targets}].`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "explode" | "skip", "target": number | null, "speak": "自爆宣言或跳过说明" }
- action 为 "explode" 时：target 为指刀目标（今晚击杀目标），可以为 null 表示不指刀。
- action 为 "skip" 时：target 为 null。`
            };
        }

        // ============================================================
        // 13. Sheriff Withdraw
        // ============================================================
        if (phase === GamePhase.SHERIFF_WITHDRAW) {
            return {
                task: `竞选发言结束，你是否要退水（放弃竞选警长）？退水后将不再参与警长竞选投票。如果你对当选没有信心或想支持其他候选人，可以选择退水。`,
                constraints: `- JSON Schema: { "strategySummary": "public-safe tactical summary", "action": "withdraw" | "stay", "speak": "退水声明或继续竞选声明" }
- action 为 "withdraw" 表示退水（放弃竞选）。
- action 为 "stay" 表示继续竞选。`
            };
        }

        // ============================================================
        // 14. Discussion Round Two
        // ============================================================
        if (phase === GamePhase.DISCUSSION_ROUND_TWO) {
            return {
                task: `这是第二轮补充发言，请针对第一轮的发言进行回应和补充。你可以反驳他人的观点、补充新的分析、或为自己之前的发言辩护。${instruction || "Speak now."}`,
                constraints: `- **GOAL**: Persuade the town to vote for your targets or trust your identity.
- **ROLE_ACCURACY**: When describing your OWN abilities, you MUST ONLY describe abilities that genuinely belong to your actual role. Do NOT claim abilities from other roles as your own. For example: Witch has potions only (no identity checking); Seer checks alignments only (no potions); Guard protects only (no checking). Review your [ROLE] section carefully before speaking.
- Use only visible context as your knowledge base, but tactical deception is allowed: you may fake-claim roles, bluff checks/potions/protection, and make strong accusations if it helps your team's win condition.
- Do not expose private chat, teammates, or actual night-action facts as system-known information; if you use them publicly, frame them as a claim, read, pressure test, or bluff.
- If you have nothing new to add, be concise (e.g., "I agree with X" or "Pass").
- This is the second round of discussion. Focus on responding to and supplementing the first round's points rather than repeating them.
- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "public message" }`
            };
        }

        // ============================================================
        // 15. Sheriff Election
        // ============================================================
        if (phase === GamePhase.SHERIFF_ELECTION) {
            return {
                task: `You are running for Sheriff. Make a short campaign speech to win trust and explain how you will guide exile votes. ${instruction || ''}`,
                constraints: `- **ROLE_ACCURACY**: You MUST ONLY describe abilities that genuinely belong to your actual role. Do NOT claim abilities from other roles as your own. For example: Witch has potions only (no identity checking); Seer checks alignments only (no potions); Guard protects only (no checking). Review your [ROLE] section carefully before speaking.
- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "public sheriff campaign speech" }`
            };
        }

        // ============================================================
        // 16. Sheriff Voting
        // ============================================================
        if (phase === GamePhase.SHERIFF_VOTING) {
            const candidates = context.sheriffCandidates?.length ? context.sheriffCandidates : alivePlayers.map(p => p.id);
            return {
                task: `Vote for one Sheriff candidate. Valid candidates: [${candidates.join(', ')}]. ${instruction || ''}`,
                constraints: `- **ROLE_ACCURACY**: When describing your OWN abilities in your vote reason, you MUST ONLY describe abilities that genuinely belong to your actual role. Do NOT claim abilities from other roles as your own.
- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "short sheriff vote reason", "actionTarget": number }`
            };
        }

        // ============================================================
        // 17. Voting
        // ============================================================
        if (phase === GamePhase.VOTING) {
            const targets = alivePlayers.filter(p => !isImmuneToVote(p)).map(p => p.id).join(', ');
            const sheriffWeight = context.sheriffId ? ` Player ${context.sheriffId} is Sheriff and their exile vote weight is 1.5.` : '';
            return {
                task: `Vote for a player to exile. Valid targets: [${targets}].${sheriffWeight}`,
                constraints: `- **ROLE_ACCURACY**: When describing your OWN abilities in your vote reason, you MUST ONLY describe abilities that genuinely belong to your actual role. Do NOT claim abilities from other roles as your own.
- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "vote reason", "actionTarget": number }`
            };
        }

        // ============================================================
        // 18. Day Discussion / Last Words / Day Announce
        // ============================================================
        if (phase === GamePhase.DAY_DISCUSSION || phase === GamePhase.LAST_WORDS || phase === GamePhase.DAY_ANNOUNCE) {
            return {
                task: `Formulate a message to **CONVINCE** others to follow your lead using only public transcript and behavior. ${instruction || "Speak now."}`,
                constraints: `- **GOAL**: Persuade the town to vote for your targets or trust your identity.
- **ROLE_ACCURACY**: When describing your OWN abilities, you MUST ONLY describe abilities that genuinely belong to your actual role. Do NOT claim abilities from other roles as your own. For example: Witch has potions only (no identity checking); Seer checks alignments only (no potions); Guard protects only (no checking). Review your [ROLE] section carefully before speaking.
- Use only visible context as your knowledge base, but tactical deception is allowed: you may fake-claim roles, bluff checks/potions/protection, and make strong accusations if it helps your team's win condition.
- Do not expose private chat, teammates, or actual night-action facts as system-known information; if you use them publicly, frame them as a claim, read, pressure test, or bluff.
- If you have nothing new to add, be concise (e.g., "I agree with X" or "Pass").
- JSON Schema: { "strategySummary": "public-safe tactical summary", "speak": "public message" }`
            };
        }

        // Fallback
        return {
            task: "Wait for instructions.",
            constraints: "- Output NO_OP."
        };
    }
}

export const werewolfSkillInstance = new WerewolfSkill();
