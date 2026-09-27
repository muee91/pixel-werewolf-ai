import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from 'jotai';
import {
    worldTargetAtom,
    resolveWorldTargetSelection,
} from '../../src/components/game/voxel3d/worldTarget';

test('resolveWorldTargetSelection pre-selects a clicked target that is in the legal candidate set', () => {
    assert.equal(resolveWorldTargetSelection(3, [1, 2, 3]), 3);
});

test('resolveWorldTargetSelection returns null when the clicked target is not a legal candidate', () => {
    assert.equal(resolveWorldTargetSelection(5, [1, 2, 3]), null);
});

test('resolveWorldTargetSelection returns null when there are no legal candidates', () => {
    // e.g. phase changed to one without targetable players.
    assert.equal(resolveWorldTargetSelection(3, []), null);
});

test('resolveWorldTargetSelection clears a stale pre-selection after the legal candidate set changes', () => {
    // Previously pre-selected 3 during a voting phase; after phase/actor change 3 is no longer legal.
    assert.equal(resolveWorldTargetSelection(3, [1, 2, 4]), null);
});

test('resolveWorldTargetSelection treats candidate 0 (witch cure sentinel) as legal only when present', () => {
    // 0 is never a real player id; it must only be accepted when explicitly in the candidate set.
    assert.equal(resolveWorldTargetSelection(0, [0]), 0);
    assert.equal(resolveWorldTargetSelection(0, [1, 2, 3]), null);
});

test('worldTargetAtom starts as null', () => {
    const store = createStore();
    assert.equal(store.get(worldTargetAtom), null);
});

test('worldTargetAtom can be set and cleared', () => {
    const store = createStore();
    store.set(worldTargetAtom, 7);
    assert.equal(store.get(worldTargetAtom), 7);
    store.set(worldTargetAtom, null);
    assert.equal(store.get(worldTargetAtom), null);
});
