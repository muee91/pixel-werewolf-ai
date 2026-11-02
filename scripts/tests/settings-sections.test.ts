import assert from 'node:assert/strict';
import test from 'node:test';
import { SECTIONS, SECTION_DETAILS, type SectionId } from '../../src/components/settings/constants';

// 设置中心的分区契约：分区表与详情表必须一一对应，
// 否则侧边栏渲染 SECTION_DETAILS[id].description 时会读到 undefined 直接白屏。
// 另外钉住「声音」这个分区存在 —— 它是这轮归位的产物（音频 + 语音合并到一处）。

test('分区表与详情表一一对应', () => {
    const ids = SECTIONS.map(section => section.id);
    assert.deepEqual([...ids].sort(), Object.keys(SECTION_DETAILS).sort());
});

test('分区 id 不重复', () => {
    const ids = SECTIONS.map(section => section.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('分区标题与详情标题一致', () => {
    for (const section of SECTIONS) {
        assert.equal(SECTION_DETAILS[section.id].title, section.label, `${section.id} 的两处标题不一致`);
    }
});

test('每个分区都有非空描述', () => {
    for (const section of SECTIONS) {
        const description = SECTION_DETAILS[section.id].description;
        assert.ok(description && description.trim().length > 0, `${section.id} 缺少描述`);
    }
});

test('声音分区存在，且排在模型之前（先视觉、后听觉、再大脑）', () => {
    const ids = SECTIONS.map(section => section.id);
    const soundIndex = ids.indexOf('sound' as SectionId);
    assert.ok(soundIndex >= 0, '缺少「声音」分区');
    assert.ok(soundIndex < ids.indexOf('model'), '「声音」应排在「模型」之前');
});

test('六个分区都在，不多不少', () => {
    assert.deepEqual(SECTIONS.map(section => section.id), ['appearance', 'sound', 'model', 'game', 'players', 'advanced']);
});
