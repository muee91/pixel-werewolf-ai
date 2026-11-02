import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BUILD_ORDER,
    BUILD_LABELS,
    BUILD_DESCRIPTIONS,
    HAIR_STYLE_LABELS,
    LOOK_HAIR_COLORS,
    LOOK_PRESETS,
    LOOK_PRIMARY_COLORS,
    LOOK_SECONDARY_COLORS,
    LOOK_SKIN_COLORS,
    SPRITE_ORDER,
    buildHeadTint,
    buildScale,
    buildSpriteTint,
    describeLook,
    lookFromSeed,
    normalizeLook,
    randomLook,
    resolveLook,
    seedFromId,
    type AvatarLook,
} from '../../src/utils/avatarLook';

// 角色形象：2D 像素造型 + 3D 体型/发型 + 四色槽。
// 这组测试盯的是「可自定义」这件事本身：派生要稳定、随机要可控、脏数据不许把渲染搞崩。

const HEX_RE = /^#[0-9a-f]{6}$/;

const sample: AvatarLook = {
    sprite: 'elf',
    build: 'tall',
    hairStyle: 3,
    primary: '#3d9172',
    secondary: '#3f4b3a',
    hair: '#c9c2b4',
    skin: '#d0a06f',
};

// ── 派生 ────────────────────────────────────────────────

test('同 seed 派生同一张脸', () => {
    assert.deepEqual(lookFromSeed(107), lookFromSeed(107));
});

test('12 个座位不会撞成同一张脸（原先是 %2 只有两种）', () => {
    const looks = Array.from({ length: 12 }, (_, i) => lookFromSeed(i + 100));
    const fingerprint = (look: AvatarLook) => [
        look.sprite, look.build, look.hairStyle, look.primary, look.secondary, look.hair, look.skin,
    ].join('|');
    const unique = new Set(looks.map(fingerprint));
    assert.equal(unique.size, 12, `12 个座位应产生 12 种形象，实际 ${unique.size} 种`);
});

test('派生值都落在白名单/色板里', () => {
    for (let seed = 0; seed < 40; seed += 1) {
        const look = lookFromSeed(seed);
        assert.ok(SPRITE_ORDER.includes(look.sprite));
        assert.ok(BUILD_ORDER.includes(look.build));
        assert.ok(look.hairStyle >= 0 && look.hairStyle <= 3);
        assert.ok(LOOK_PRIMARY_COLORS.includes(look.primary));
        assert.ok(LOOK_SECONDARY_COLORS.includes(look.secondary));
        assert.ok(LOOK_HAIR_COLORS.includes(look.hair));
        assert.ok(LOOK_SKIN_COLORS.includes(look.skin));
    }
});

test('负 seed 与小数 seed 不会派生越界值', () => {
    for (const seed of [-3, -100, 3.7, NaN]) {
        const look = lookFromSeed(seed);
        assert.ok(SPRITE_ORDER.includes(look.sprite), `seed=${seed}`);
        assert.equal(HEX_RE.test(look.primary), true);
    }
});

test('seedFromId 稳定且对同前缀敏感', () => {
    assert.equal(seedFromId('a-1'), seedFromId('a-1'));
    assert.notEqual(seedFromId('a-1'), seedFromId('a-2'));
});

// ── 随机 ────────────────────────────────────────────────

test('随机形象可由外部随机源完全控制', () => {
    const allFirst = randomLook(() => 0);
    assert.equal(allFirst.sprite, SPRITE_ORDER[0]);
    assert.equal(allFirst.build, BUILD_ORDER[0]);
    assert.equal(allFirst.primary, LOOK_PRIMARY_COLORS[0]);

    const allLast = randomLook(() => 0.999999);
    assert.equal(allLast.sprite, SPRITE_ORDER[SPRITE_ORDER.length - 1]);
    assert.equal(allLast.primary, LOOK_PRIMARY_COLORS[LOOK_PRIMARY_COLORS.length - 1]);
});

test('随机形象永远是合法值（含 rand 返回 1 的边界）', () => {
    const look = randomLook(() => 1);
    assert.ok(SPRITE_ORDER.includes(look.sprite));
    assert.ok(LOOK_SKIN_COLORS.includes(look.skin));
});

// ── 校验 ────────────────────────────────────────────────

test('非法字段回退到 seed 派生，合法字段保留', () => {
    const fallback = lookFromSeed(7);
    const look = normalizeLook({
        sprite: 'dragon',
        build: 'tall',
        hairStyle: 9,
        primary: 'red',
        secondary: '#39455f',
        hair: '#2b2118',
        skin: 'not-a-color',
    }, 7);

    assert.equal(look.sprite, fallback.sprite, '未知造型应回退');
    assert.equal(look.build, 'tall', '合法体型应保留');
    assert.equal(look.hairStyle, fallback.hairStyle, '越界发型应回退');
    assert.equal(look.primary, fallback.primary, '非法颜色应回退');
    assert.equal(look.secondary, '#39455f');
    assert.equal(look.skin, fallback.skin);
});

test('空值与错误类型不会抛错，直接给派生形象', () => {
    for (const input of [null, undefined, 42, 'x', []]) {
        assert.deepEqual(normalizeLook(input, 3), lookFromSeed(3));
    }
});

test('颜色统一小写，避免同一个色两个字符串', () => {
    const look = normalizeLook({ ...sample, primary: '#3D9172' }, 0);
    assert.equal(look.primary, '#3d9172');
});

test('resolveLook：没配置就用 seed，配置了就收敛后使用', () => {
    assert.deepEqual(resolveLook(undefined, 5), lookFromSeed(5));
    assert.deepEqual(resolveLook(null, 5), lookFromSeed(5));
    assert.equal(resolveLook(sample, 5).primary, sample.primary);
    // 脏配置不会原样透传
    assert.equal(resolveLook({ ...sample, primary: 'oops' } as AvatarLook, 5).primary, lookFromSeed(5).primary);
});

// ── 2D 调色板重映射 ──────────────────────────────────────

// 重映射表的键必须是颜色值：渲染层是拿 palette 的色值去查 tint 的，
// 用字母键会静默失效（这就是第一版"换了颜色但画面没动"的原因）。
test('骑士：盔甲/腿甲/羽饰按颜色值重映射，描边与白色细节不动', () => {
    const tint = buildSpriteTint({ ...sample, sprite: 'knight' });
    assert.equal(tint['#72d6ce'], sample.primary, '盔甲色');
    assert.equal(tint['#417089'], sample.secondary, '腿甲色');
    assert.equal(tint['#da4e38'], sample.hair, '羽饰色');
    assert.ok(tint['#ee8e2e'], '羽饰高光应有派生色');
    assert.equal('#222222' in tint, false, '描边黑不能改');
    assert.equal('#fdf7ed' in tint, false, '白色细节不能改');
});

test('精灵：裙/披风/头发/皮肤都按颜色值重映射', () => {
    const tint = buildSpriteTint({ ...sample, sprite: 'elf' });
    assert.equal(tint['#4ba747'], sample.primary, '裙亮部');
    assert.equal(tint['#da4e38'], sample.secondary, '披风');
    assert.equal(tint['#facb3e'], sample.hair, '头发');
    assert.equal(tint['#fccba3'], sample.skin, '皮肤');
    assert.ok(tint['#3d734f'] && tint['#3d734f'] !== sample.primary, '裙摆暗部应是主色的暗调而非同色');
    assert.equal('#222222' in tint, false);
});

test('头部小头像只映射看得见的槽', () => {
    const knightHead = buildHeadTint({ ...sample, sprite: 'knight' });
    assert.equal(knightHead['#72d6ce'], sample.primary);
    assert.equal('#fccba3' in knightHead, false, '骑士没有露皮肤，不该映射肤色');

    const elfHead = buildHeadTint({ ...sample, sprite: 'elf' });
    assert.equal(elfHead['#fccba3'], sample.skin);
    assert.equal(elfHead['#facb3e'], sample.hair);
});

// ── 3D 体型 ──────────────────────────────────────────────

test('四种体型的缩放差异方向正确', () => {
    const [ax, ay] = buildScale('adult');
    assert.deepEqual([ax, ay], [1, 1], '成人是基准');

    const [tx, ty] = buildScale('tall');
    assert.ok(ty > ay, '高个更高');
    assert.ok(tx < ax, '高个更瘦');

    const [sx, sy] = buildScale('stout');
    assert.ok(sx > ax, '壮硕更宽');
    assert.ok(sy < ay, '壮硕更矮');

    const [cx, cy] = buildScale('child');
    assert.ok(cx < ax && cy < ay, '少年整体更小');
});

test('每个体型都有中文标签与说明（UI 不许出现空标签）', () => {
    for (const build of BUILD_ORDER) {
        assert.ok(BUILD_LABELS[build]?.trim(), `${build} 缺标签`);
        assert.ok(BUILD_DESCRIPTIONS[build]?.trim(), `${build} 缺说明`);
    }
});

test('四种发型都有标签', () => {
    assert.equal(HAIR_STYLE_LABELS.length, 4);
    for (const label of HAIR_STYLE_LABELS) assert.ok(label.trim());
});

// ── 预设与文案 ───────────────────────────────────────────

test('现成形象都是合法值', () => {
    for (const preset of LOOK_PRESETS) {
        assert.ok(preset.id && preset.label && preset.hint, `${preset.id} 缺文案`);
        const look = preset.look;
        assert.ok(SPRITE_ORDER.includes(look.sprite), `${preset.id} 造型非法`);
        assert.ok(BUILD_ORDER.includes(look.build), `${preset.id} 体型非法`);
        for (const color of [look.primary, look.secondary, look.hair, look.skin]) {
            assert.equal(HEX_RE.test(color), true, `${preset.id} 颜色非法：${color}`);
        }
    }
});

test('现成形象 id 不重复', () => {
    const ids = LOOK_PRESETS.map(preset => preset.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('一句话描述带上造型与体型', () => {
    const text = describeLook(sample);
    assert.ok(text.includes('精灵'), text);
    assert.ok(text.includes('高个'), text);
    assert.ok(text.includes('两侧辫发'), text);
});
