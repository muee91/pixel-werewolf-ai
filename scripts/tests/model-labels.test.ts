import assert from 'node:assert/strict';
import test from 'node:test';
import {
    HUMAN_MODEL_LABEL,
    buildModelLabelMap,
    buildModelScoreboard,
    getPlayerModelLabel,
    hasMixedModelLabels,
    pickDisplayedModelLabels,
} from '../../src/utils/modelLabels';
import type { ActorProfile, LLMPreset, Role } from '../../src/types';

// 座位上的模型标注必须是同一份口径：2D 座位卡、3D 名牌、结算表、复盘页都读这里。

const preset = (id: string, name: string): LLMPreset => ({
    id,
    name,
    providerId: 'p1',
    modelId: `model-${id}`,
});

const actor = (id: string, llmPresetId: string): ActorProfile => ({
    id,
    name: `分身-${id}`,
    llmPresetId,
    ttsPresetId: 'tts-edge',
    voiceId: 'v1',
    stylePrompt: '',
});

const presets = [preset('l1', 'v4.1-flash'), preset('l2', 'gpt-mini')];
const actors = [actor('a1', 'l1'), actor('a2', 'l2'), actor('a3', '')];

test('人类座位标"人类"，不参与模型统计', () => {
    const label = getPlayerModelLabel({ id: 1, actorId: 'a1', isHuman: true }, actors, presets);
    assert.equal(label, HUMAN_MODEL_LABEL);
});

test('分身绑定模型时取预设名，不取模型 ID', () => {
    assert.equal(getPlayerModelLabel({ id: 2, actorId: 'a1' }, actors, presets), 'v4.1-flash');
    assert.equal(getPlayerModelLabel({ id: 3, actorId: 'a2' }, actors, presets), 'gpt-mini');
});

test('未绑定模型的分身沿用首个预设（保持原有房间口径，不突然空标签）', () => {
    assert.equal(getPlayerModelLabel({ id: 4, actorId: 'a3' }, actors, presets), 'v4.1-flash');
});

test('完全不认识的 actorId 也不会崩，退到首个预设', () => {
    assert.equal(getPlayerModelLabel({ id: 5, actorId: 'nobody' }, actors, presets), 'v4.1-flash');
});

test('没有任何预设时返回空串，由调用方决定不显示', () => {
    assert.equal(getPlayerModelLabel({ id: 6, actorId: 'a1' }, actors, []), '');
});

test('标签表跳过空标签，键是玩家 id 而不是座位号', () => {
    const map = buildModelLabelMap(
        [{ id: 11, actorId: 'a1' }, { id: 12, actorId: 'a2' }, { id: 13, actorId: 'a1' }],
        actors,
        presets,
    );
    assert.deepEqual(map, { 11: 'v4.1-flash', 12: 'gpt-mini', 13: 'v4.1-flash' });
    assert.deepEqual(buildModelLabelMap([{ id: 1, actorId: 'a1' }], actors, []), {});
});

test('全员同一模型不算混搭——单一模型局不该多一行噪音', () => {
    const labels = buildModelLabelMap(
        [{ id: 1, actorId: 'a1' }, { id: 2, actorId: 'a1' }],
        actors,
        presets,
    );
    assert.equal(hasMixedModelLabels(labels), false);
    assert.deepEqual(pickDisplayedModelLabels([{ id: 1, actorId: 'a1' }], actors, presets), {});
});

test('混用模型时展示表返回全部座位（含人类，人类也是一路"选手"）', () => {
    const players = [
        { id: 1, actorId: 'a1' },
        { id: 2, actorId: 'a2' },
        { id: 3, actorId: 'a1', isHuman: true },
    ];
    const shown = pickDisplayedModelLabels(players, actors, presets);
    assert.deepEqual(shown, { 1: 'v4.1-flash', 2: 'gpt-mini', 3: HUMAN_MODEL_LABEL });
});

test('只有单一 AI 模型 + 真人座位时不算混搭，不铺模型名', () => {
    const players = [{ id: 1, actorId: 'a1' }, { id: 2, actorId: 'a1', isHuman: true }];
    assert.deepEqual(pickDisplayedModelLabels(players, actors, presets), {});
});

test('模型战绩按模型合并座位，胜率优先、同胜率比总分', () => {
    const seats = [
        { id: 1, seatNumber: 1, role: 'WEREWOLF' as Role, actorId: 'a1' },
        { id: 2, seatNumber: 2, role: 'VILLAGER' as Role, actorId: 'a1' },
        { id: 3, seatNumber: 3, role: 'VILLAGER' as Role, actorId: 'a2' },
        { id: 4, seatNumber: 4, role: 'SEER' as Role, actorId: 'a2' },
    ];
    const rows = buildModelScoreboard(
        seats,
        player => getPlayerModelLabel(player, actors, presets),
        'GOOD',
        id => id * 10,
    );
    assert.equal(rows.length, 2);
    // gpt-mini 两张好人牌全在胜方（2/2），v4.1-flash 一狼一民只对一半（1/2）→ 胜率优先
    const [first, second] = rows;
    assert.equal(first.label, 'gpt-mini');
    assert.equal(first.seats.length, 2);
    assert.deepEqual(first.seats, [3, 4]);
    assert.equal(first.wins, 2);
    assert.equal(first.scoreSum, 70);
    assert.equal(second.label, 'v4.1-flash');
    assert.equal(second.wins, 1);
});

test('全胜模型的胜率更高时排前面，哪怕座位更少', () => {
    const seats = [
        { id: 1, seatNumber: 1, role: 'SEER' as Role, actorId: 'a1' },
        { id: 2, seatNumber: 2, role: 'WEREWOLF' as Role, actorId: 'a2' },
        { id: 3, seatNumber: 3, role: 'WEREWOLF' as Role, actorId: 'a2' },
        { id: 4, seatNumber: 4, role: 'WEREWOLF' as Role, actorId: 'a2' },
    ];
    const rows = buildModelScoreboard(seats, p => getPlayerModelLabel(p, actors, presets), 'GOOD');
    assert.equal(rows[0].label, 'v4.1-flash');
    assert.equal(rows[0].wins / rows[0].total, 1);
    assert.equal(rows[1].wins, 0);
});

test('没有评分函数时也不产生 NaN', () => {
    const rows = buildModelScoreboard(
        [{ id: 1, seatNumber: 1, role: 'VILLAGER' as Role, actorId: 'a1' }],
        p => getPlayerModelLabel(p, actors, presets),
        'WOLF',
    );
    assert.equal(rows[0].scored, 0);
    assert.equal(rows[0].scoreSum, 0);
});
