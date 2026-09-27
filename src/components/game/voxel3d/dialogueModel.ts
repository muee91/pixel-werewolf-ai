export interface DialoguePresentation {
  logId: string;
  speakerId: number;
  content: string;
}

export interface DialogueLogCandidate {
  isSystem: boolean;
  speakerId?: number;
  content: string;
  debugType?: string;
}

const NON_DIALOGUE_DEBUG_TYPES = new Set([
  'VOTE_STRATEGY',
  'VOTE_TALLY',
  'WOLF_EXPLODE_STRATEGY',
  'KNIGHT_CHALLENGE_STRATEGY',
  'SHERIFF_WITHDRAW_STRATEGY',
  'EVENT_TRACE',
]);

const MIN_DIALOGUE_MS = 8000;
const MAX_DIALOGUE_MS = 60000;
const MS_PER_CHARACTER = 220;

// E2E 快速模式：?e2e=1 或 werewolf-e2e 标记时,对话显示压缩到可预测的短时长,
// 让端到端测试能在测试预算内走完整局(真实节奏由 MIN/MAX 保留)。
const isE2EMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).has('e2e')) return true;
    try { return window.localStorage.getItem('werewolf-e2e') === '1'; } catch { return false; }
};

export const getDialogueDurationMs = (content: string): number => {
    const readableLength = content.replace(/\s+/g, '').length;
    const duration = Math.min(MAX_DIALOGUE_MS, Math.max(MIN_DIALOGUE_MS, 3000 + readableLength * MS_PER_CHARACTER));
    return isE2EMode() ? 20_000 : duration;
};

export const shouldConcealDialogueIdentity = (isNight: boolean, isOmniscient: boolean): boolean =>
    isNight && !isOmniscient;

// Strategy/debug logs describe a model decision, but are not an in-world line
// spoken by the character. AI_THINKING is intentionally not included: it is
// metadata attached to normal AI speech and that speech must remain visible.
export const isDialoguePresentationLog = (log: DialogueLogCandidate): log is DialogueLogCandidate & { speakerId: number } =>
    !log.isSystem &&
    !NON_DIALOGUE_DEBUG_TYPES.has(log.debugType ?? '') &&
    typeof log.speakerId === 'number' &&
    !!log.content.trim();
