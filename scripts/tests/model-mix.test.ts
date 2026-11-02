import assert from 'node:assert/strict';
import test from 'node:test';
import { buildModelMix, summarizeMix } from '../../src/utils/modelMix';

// 混搭只做纯计算：谁拿到哪个模型、有没有引入没选中的模型、随机是否可控。

const actors = Array.from({ length: 9 }, (_, i) => `a${i + 1}`);
const presets = ['l1', 'l2', 'l3'];

test('轮流铺开：每个模型都上场，且按顺序循环', () => {
    const mix = buildModelMix({ actorIds: actors, presetIds: presets, mode: 'rotate' });
    assert.deepEqual(Object.keys(mix), actors);
    assert.deepEqual(actors.map(id => mix[id]), ['l1', 'l2', 'l3', 'l1', 'l2', 'l3', 'l1', 'l2', 'l3']);
    assert.equal(new Set(Object.values(mix)).size, 3, '三个模型都应该出现在桌上');
});

test('随机铺开：只用已选模型，且每个都出现（人数 ≥ 模型数）', () => {
    const mix = buildModelMix({ actorIds: actors, presetIds: presets, mode: 'random', random: () => 0.42 });
    const used = new Set(Object.values(mix));
    assert.ok([...used].every(id => presets.includes(id)), `混进了没选中的模型：${[...used].join(',')}`);
    assert.equal(used.size, 3);
});

test('随机源可注入：同种子结果稳定，换种子会变', () => {
    const seq = (seed: number) => {
        let x = seed;
        return () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    };
    const a = buildModelMix({ actorIds: actors, presetIds: presets, mode: 'random', random: seq(7) });
    const b = buildModelMix({ actorIds: actors, presetIds: presets, mode: 'random', random: seq(7) });
    const c = buildModelMix({ actorIds: actors, presetIds: presets, mode: 'random', random: seq(99) });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
});

test('只有一个模型时也能用：全员同一个，不算混搭但不出错', () => {
    const mix = buildModelMix({ actorIds: actors, presetIds: ['l1'], mode: 'rotate' });
    assert.deepEqual(Object.values(mix), Array(9).fill('l1'));
});

test('没选模型 / 没有分身：返回空对象，调用方据此不改任何配置', () => {
    assert.deepEqual(buildModelMix({ actorIds: actors, presetIds: [], mode: 'rotate' }), {});
    assert.deepEqual(buildModelMix({ actorIds: [], presetIds: presets, mode: 'rotate' }), {});
    // 空串是"未配置"的表示，必须在纯函数里就被过滤掉
    assert.deepEqual(buildModelMix({ actorIds: [], presetIds: ['', ''], mode: 'random' }), {});
});

test('摘要按模型计数，顺序稳定', () => {
    const mix = buildModelMix({ actorIds: actors, presetIds: ['l1', 'l2'], mode: 'rotate' });
    const labelOf = (id: string) => (id === 'l1' ? 'v4.1-flash' : 'gpt-mini');
    assert.equal(summarizeMix(mix, labelOf), 'v4.1-flash × 5 · gpt-mini × 4');
    assert.equal(summarizeMix({}, labelOf), '未混搭');
});
