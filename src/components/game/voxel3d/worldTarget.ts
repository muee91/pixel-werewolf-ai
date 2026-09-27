// Bridge between the 3D world (NPC clicks) and the HumanInputPanel.
// The world only ever PRE-SELECTS a legal target; every submission still flows
// through HumanInputPanel → resolveHumanInput / multiplayer ACK. No new submit path.

import { atom, type PrimitiveAtom } from 'jotai';

// The player id currently pre-selected by a world click, or null when cleared.
// HumanInputPanel reads this and mirrors it into its local targetId state.
export const worldTargetAtom = atom<number | null>(null) as PrimitiveAtom<number | null>;

// Pure selector: returns the clicked id only when it belongs to the current
// legal candidate set; otherwise returns null (no pre-selection / clear).
//
// This single function drives both behaviours required by the design:
//  1. A world click pre-selects the target only when it is legal right now.
//  2. When the phase or current actor changes, the candidate set changes too;
//     re-running this function against the new set returns null for a stale
//     pre-selection, which the caller uses to clear worldTargetAtom.
//
// `candidateIds` may include the witch-cure sentinel 0; it is only accepted
// when explicitly present in the set.
export const resolveWorldTargetSelection = (
    clickedId: number,
    candidateIds: ReadonlyArray<number>,
): number | null => {
    return candidateIds.includes(clickedId) ? clickedId : null;
};
