import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMP_TILES } from '../../src/components/game/voxel/primitives/camp-tiles';
import { itemPixelScale } from '../../src/components/game/voxel/primitives/spriteScale';
import { SPRITE_ORDER, spriteForSeat, spriteFrameKeys, spriteHeadKey } from '../../src/utils/avatarLook';

// 2D 像素素材的尺寸契约（2026-10-25 起 0x72 手持物与角色进场；2026-10-27 角色扩到 12 种）：
// 槽位高度是量出来的——剑 10×21、弓 26 行、人物 16×28，所以"竖槽"取 16×28。
// 这条测试守四件事：素材别被偷偷改小/改高、放大倍数别把卡片顶穿、
// 12 种骨架都真的产出了、所有角色踩在同一条脚底基线上。

const sprite = (name: string) => {
    const s = CAMP_TILES[name];
    assert.ok(s, `缺少精灵 ${name}`);
    return s;
};

const FIRST_FRAMES = SPRITE_ORDER.map(s => spriteFrameKeys(s)[0]);

test('tall slot: weapons and characters share 16×28, everything else stays 16×16', () => {
    for (const name of ['sword', 'bow', ...FIRST_FRAMES]) {
        const s = sprite(name);
        assert.equal(s.w, 16, `${name} 宽度应为 16`);
        assert.equal(s.h, 28, `${name} 高度应为 28（24 会裁掉弓梢与人物脚部）`);
        assert.equal(s.rows.length, 28);
    }
    for (const name of ['potion', 'torch', 'shield', 'emerald', 'map', 'heart', 'bone']) {
        assert.equal(sprite(name).h, 16, `${name} 应保持 16×16 槽位`);
    }
});

test('0x72 weapons stand on the slot baseline instead of floating', () => {
    for (const name of ['sword', 'bow']) {
        const s = sprite(name);
        const lastRow = s.rows[s.rows.length - 1];
        assert.match(lastRow, /[^.]/, `${name} 应底对齐（最后一行有像素）`);
        const firstFilled = s.rows.findIndex(row => /[^.]/.test(row));
        assert.ok(firstFilled > 0, `${name} 顶部应留空，避免顶出 16×16 的视觉重心`);
    }
});

// 0x72 的角色画布尺寸不统一（16×16 小怪 / 16×23 兽人 / 16×28 人形）。
// 曾经按"画布居中"落槽，小个子会浮在半空、脚对不齐；改成贴底之后必须逐张盯住。
test('every character stands on the same foot baseline', () => {
    for (const spriteId of SPRITE_ORDER) {
        const s = sprite(spriteFrameKeys(spriteId)[0]);
        const lastRow = s.rows[s.rows.length - 1];
        assert.match(lastRow, /[^.]/, `${spriteId} 应贴底：最后一行必须有像素，否则站在空中`);
    }
});

test('character sheets expose idle frames and a pre-cropped head', () => {
    for (const spriteId of SPRITE_ORDER) {
        const frames = spriteFrameKeys(spriteId);
        const frameSignatures = new Set(frames.map(name => sprite(name).rows.join('\n')));
        // 0x72 里 goblin/imp/tiny_zombie 是 3 帧循环（f1 与 f3 相同），人形角色才是 4 帧；
        // 这里只要求"有动画"，帧数差异属于素材本身的规格。
        assert.ok(frameSignatures.size >= 3, `${frames[0]} 至少要有 3 个不同帧，否则动画是静止的`);

        const head = sprite(spriteHeadKey(spriteId));
        assert.equal(head.w, 16, `${spriteId} 头像宽应为 16`);
        assert.equal(head.h, 8, '头像裁切固定 16×8：px=4 时正好 64×32，与头像容器同高');
        assert.match(head.rows.join(''), /[^.]/, `${spriteId} 头像不能是空白（headRows 算错会切到一片透明）`);
    }
});

// 12 人局里"人人不同轮廓"是这次改版的最终目标，所以直接按 store 的开局规则算：
// 座位 seed = 座位号 + SEAT_LOOK_SEED_OFFSET，取模落到 SPRITE_ORDER。
// 判"不一样"要连调色板一起看：knight_f 与 knight_m 的行矩阵完全相同，只有羽饰颜色不同。
test('a 12-seat table gets 12 different silhouettes', () => {
    const look = (name: string) => {
        const s = sprite(name);
        return s.rows.join('\n') + '|' + Object.values(s.palette).join(',');
    };
    const seats = Array.from({ length: 12 }, (_, seat) => spriteForSeat(seat));
    assert.equal(new Set(seats).size, 12, '12 个座位应拿到 12 种不同骨架');

    const frames = seats.map(id => spriteFrameKeys(id)[0]);
    assert.equal(new Set(frames.map(look)).size, 12, '12 个座位首帧（含配色）必须两两不同');
    assert.equal(new Set(frames.map(name => sprite(name).rows.join('\n'))).size, 12, '12 个座位的行矩阵也必须两两不同');

    // 6/8/9 人局同样不该出现重复轮廓
    for (const total of [6, 8, 9]) {
        const ids = Array.from({ length: total }, (_, seat) => spriteForSeat(seat));
        const silhouettes = ids.map(id => sprite(spriteFrameKeys(id)[0]).rows.join('\n'));
        assert.equal(new Set(silhouettes).size, total, `${total} 人局不该有两个座位共用同一张剪影`);
    }
});

test('item pixel scale never overflows the container budget', () => {
    const tile16 = { w: 16, h: 16 };
    const tall28 = { w: 16, h: 28 };

    assert.equal(itemPixelScale(tile16, false), 2, '16×16 默认 2×（32px）');
    assert.equal(itemPixelScale(tile16, true), 1, 'small 一律 1×');
    assert.equal(itemPixelScale(tall28, false), 1, '16×28 在默认 32px 预算里只能 1×');
    assert.equal(itemPixelScale(tall28, false, 56), 2, '44×60 道具框给到 56px 预算时可以 2×');
    assert.equal(itemPixelScale(tall28, false, 40), 1, '40px 高的道具栏里只能 1×（28px）');
    assert.equal(itemPixelScale(undefined, false), 2, '未知精灵退回默认倍数，不抛错');

    // 任何组合都不能超过预算（1× 保底是唯一例外：28px 的槽装不下更小的整数倍）
    for (const size of [tile16, tall28, { w: 16, h: 12 }]) {
        for (const fit of [16, 20, 28, 32, 40, 56]) {
            const px = itemPixelScale(size, false, fit);
            assert.ok(px * size.h <= Math.max(fit, 28), `${size.h}@${px}× 超出预算 ${fit}`);
        }
    }
});
