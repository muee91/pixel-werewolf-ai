/**
 * 角色形象（AvatarLook）
 *
 * 之前"人物只有两种"：2D 视角的人物来自两张 16×28 的像素矩阵（knight_m / elf_f），
 * 座位号 `%2` 决定用哪张，12 个座位里必然有 6 对双胞胎；3D 则是另一套体素人，
 * 颜色由 `avatarSeed % 色板长度` 派生，改不了。
 *
 * 现在 2D 有 12 种骨架（同属 0x72 DungeonTileset II，CC0，16×28 槽统一贴底），
 * 每个座位按 seed 取不同骨架，12 人局一桌可以做到人人不同轮廓。
 *
 * 这里把"长什么样"抽成一份数据，2D 与 3D 共用同一份 look：
 * - `sprite`  决定 2D 用哪套像素矩阵；
 * - `build`   决定体型（成人 / 高个 / 壮硕 / 少年），2D 缩放 + 3D 缩放都吃它；
 * - `hairStyle` 3D 发型；
 * - `primary / secondary / hair / skin` 四个色槽，2D 通过调色板重映射（tint）落地，
 *   3D 直接当材质色用。所以"换色"在两个视角都看得见。
 *
 * 纯函数，无 React / three 依赖，可在 node:test 里直接跑。
 */

export type AvatarSprite =
    | 'knight' | 'elf' | 'dwarf' | 'wizard' | 'ranger' | 'orc' | 'lizard'
    | 'shaman' | 'goblin' | 'chort' | 'imp' | 'zombie' | 'knightess';
export type AvatarBuild = 'adult' | 'tall' | 'stout' | 'child';

export interface AvatarLook {
    /** 2D 像素造型（12 种骨架） */
    sprite: AvatarSprite;
    /** 体型：2D 缩放 / 3D 缩放共用 */
    build: AvatarBuild;
    /** 3D 发型 0..3 */
    hairStyle: number;
    /** 主色：3D 上衣 / 2D 衣物主色（盔甲、长袍、兽皮） */
    primary: string;
    /** 副色：3D 裤子 / 2D 腿甲、披风、护甲暗部 */
    secondary: string;
    hair: string;
    skin: string;
}

/**
 * 顺序决定座位如何分到骨架：座位 seed 递增 → 取模后逐个铺开。
 *
 * `knightess` 与 `knight` 共用同一张剪影、只差羽饰配色（0x72 原包就是这么给的），
 * 所以它被放在**索引 8**：`store.ts` 用 `i + 100` 当 seed（i 是 0-based 座位索引），
 * 座位 0..11 取到的索引正好是 `100..111 % 13` = `9,10,11,12,0,1,2,3,4,5,6,7` —— 跳过 8。
 * 于是 12 个座位一定是 12 张互不相同的剪影，女骑士只在手动指定时作为额外选项出现。
 *
 * 注意是 0-based：写成 1..12 去验算会得到"跳过 9"，从而误以为该把它挪到 9，
 * 结果反而把它推进了 12 座（`pixel-sprite-format.test.ts` 会立刻抓住这个撞脸）。
 */
export const SPRITE_ORDER: AvatarSprite[] = [
    'knight', 'elf', 'dwarf', 'wizard', 'ranger', 'orc',
    'lizard', 'shaman', 'knightess', 'goblin', 'chort', 'imp', 'zombie',
];
export const BUILD_ORDER: AvatarBuild[] = ['adult', 'tall', 'stout', 'child'];

export const SPRITE_LABELS: Record<AvatarSprite, string> = {
    knight: '骑士',
    knightess: '女骑士',
    elf: '精灵',
    ranger: '游侠',
    dwarf: '矮人',
    wizard: '法师',
    lizard: '蜥蜴人',
    orc: '兽人',
    shaman: '萨满',
    goblin: '哥布林',
    chort: '魔童',
    imp: '小恶魔',
    zombie: '小僵尸',
};

export const BUILD_LABELS: Record<AvatarBuild, string> = {
    adult: '成人',
    tall: '高个',
    stout: '壮硕',
    child: '少年',
};

export const BUILD_DESCRIPTIONS: Record<AvatarBuild, string> = {
    adult: '标准比例，和其他人齐平',
    tall: '比周围高一头，站在后排也看得见',
    stout: '更宽更矮，像个老猎人',
    child: '矮半头，大头娃娃比例',
};

/** 主色：12 色，都是营地里出现过的颜色（纸、火把、红石、绿宝石、木、铁） */
export const LOOK_PRIMARY_COLORS = [
    '#72d6ce', '#4aa3df', '#7b2f2a', '#5943a8', '#6e3f91', '#8a4f2d',
    '#315f93', '#3d9172', '#717984', '#9b4470', '#347d55', '#794820',
];

/** 副色（裤/披风）：8 色，偏深，避免和主色抢眼 */
export const LOOK_SECONDARY_COLORS = [
    '#2f4f79', '#39455f', '#355b42', '#5a4f79', '#6b3a2e', '#3f4b3a', '#4a3f5c', '#7a6a52',
];

export const LOOK_HAIR_COLORS = [
    '#2b2118', '#4a3320', '#111418', '#5a4632', '#7a5a3a', '#3a3f45', '#8c4a2f', '#c9c2b4',
];

export const LOOK_SKIN_COLORS = [
    '#b98255', '#c89462', '#8b5a42', '#d0a06f', '#e6bb95', '#6b4632',
];

export const HAIR_STYLE_LABELS = ['短发', '额头前发', '背头', '两侧辫发'];

/**
 * 座位 seed 的偏移量。开局时 `resolveLook(actor.look, 座位号 + 本偏移)`。
 * 之所以不是直接用餐号：`lookFromSeed` 的取模基数有 12/4/8/6 好几个，
 * 与 `avatarSeed`（座位号+1）错开 99 才能让"骨架 / 体型 / 配色"三者的组合不同步，
 * 否则相邻座位会像"同一套配色的连续变体"。
 */
export const SEAT_LOOK_SEED_OFFSET = 100;

/** 某个座位在"没配形象"时默认会拿到哪张骨架（与 store 开局规则一致） */
export const spriteForSeat = (seat: number): AvatarSprite => {
    const n = SPRITE_ORDER.length;
    return SPRITE_ORDER[(((seat + SEAT_LOOK_SEED_OFFSET) % n) + n) % n];
};

/** 按座位 seed 派生一份 look：同一个 seed 永远同一张脸，不同座位尽量不撞 */
export const lookFromSeed = (seed: number): AvatarLook => {
    // NaN / Infinity 会让取模整条链失效（list[NaN] === undefined），统一当 0 处理
    const s = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
    const pick = <T,>(list: T[], offset: number): T => list[(s + offset) % list.length];
    return {
        sprite: pick(SPRITE_ORDER, 0),
        build: pick(BUILD_ORDER, 0),
        hairStyle: pick([0, 1, 2, 3], 1),
        primary: pick(LOOK_PRIMARY_COLORS, 0),
        // 副色/发色/肤色错开取模基数，避免"主色一变全身跟着变"的同步感
        secondary: pick(LOOK_SECONDARY_COLORS, 3),
        hair: pick(LOOK_HAIR_COLORS, 2),
        skin: pick(LOOK_SKIN_COLORS, 1),
    };
};

/** 由分身的 id 派一个稳定 seed：设置页预览与列表头像用它，保证「没配形象时每次看到的是同一张脸」 */
export const seedFromId = (id: string): number => {
    // 用乘法散列而不是简单的字符求和：分身 id 形如 a-1712345678901，只求和的话
    // 相邻 id 差值极小，取模后会全挤在同一两个色槽上，列表看起来像"全是一样的脸"。
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return hash;
};

/** 成品形象：不想调色时一键套用 */
export interface LookPreset {
    id: string;
    label: string;
    hint: string;
    look: AvatarLook;
}

/**
 * 成品形象：不想调色时一键套用。
 * 12 个预设正好覆盖 12 种骨架，主色也用了 12 个不重复的值 ——
 * 设置页里排开看是"十二个人"，而不是"一张脸换十二次颜色"。
 */
export const LOOK_PRESETS: LookPreset[] = [
    {
        id: 'traveler', label: '旅人', hint: '青甲骑士，最常见的那种',
        look: { sprite: 'knight', build: 'adult', hairStyle: 1, primary: '#72d6ce', secondary: '#2f4f79', hair: '#2b2118', skin: '#c89462' },
    },
    {
        id: 'huntress', label: '女骑士', hint: '玫红羽饰，比男骑士高一截',
        look: { sprite: 'knightess', build: 'tall', hairStyle: 3, primary: '#9b4470', secondary: '#4a3f5c', hair: '#8c4a2f', skin: '#e6bb95' },
    },
    {
        id: 'elfmaid', label: '精灵', hint: '绿裙银发，矮个子少年感',
        look: { sprite: 'elf', build: 'child', hairStyle: 3, primary: '#347d55', secondary: '#3f4b3a', hair: '#c9c2b4', skin: '#d0a06f' },
    },
    {
        id: 'ranger', label: '游侠', hint: '深绿披风、褐发，常年跑林子',
        look: { sprite: 'ranger', build: 'tall', hairStyle: 2, primary: '#3d9172', secondary: '#39455f', hair: '#5a4632', skin: '#b98255' },
    },
    {
        id: 'smith', label: '矮人铁匠', hint: '壮硕、深衣、肤色偏深',
        look: { sprite: 'dwarf', build: 'stout', hairStyle: 0, primary: '#8a4f2d', secondary: '#6b3a2e', hair: '#111418', skin: '#8b5a42' },
    },
    {
        id: 'scholar', label: '法师', hint: '紫袍白胡子，矮身背头',
        look: { sprite: 'wizard', build: 'child', hairStyle: 2, primary: '#5943a8', secondary: '#5a4f79', hair: '#c9c2b4', skin: '#e6bb95' },
    },
    {
        id: 'guard', label: '兽人守卫', hint: '蓝甲绿皮，高个',
        look: { sprite: 'orc', build: 'tall', hairStyle: 0, primary: '#4aa3df', secondary: '#39455f', hair: '#3a3f45', skin: '#8b5a42' },
    },
    {
        id: 'shaman', label: '萨满', hint: '灰袍图腾，壮硕',
        look: { sprite: 'shaman', build: 'stout', hairStyle: 1, primary: '#717984', secondary: '#4a3f5c', hair: '#8c4a2f', skin: '#b98255' },
    },
    {
        id: 'lizard', label: '蜥蜴人', hint: '暗红鳞甲',
        look: { sprite: 'lizard', build: 'adult', hairStyle: 0, primary: '#7b2f2a', secondary: '#5a4f79', hair: '#3a3f45', skin: '#d0a06f' },
    },
    {
        id: 'goblin', label: '哥布林', hint: '蓝布衣，小巧一只',
        look: { sprite: 'goblin', build: 'child', hairStyle: 0, primary: '#315f93', secondary: '#7a6a52', hair: '#111418', skin: '#8b5a42' },
    },
    {
        id: 'chort', label: '魔童', hint: '紫皮白角',
        look: { sprite: 'chort', build: 'adult', hairStyle: 2, primary: '#6e3f91', secondary: '#6b3a2e', hair: '#c9c2b4', skin: '#b98255' },
    },
    {
        id: 'imp', label: '小恶魔', hint: '褐皮紫翼，最小的一只',
        look: { sprite: 'imp', build: 'child', hairStyle: 0, primary: '#794820', secondary: '#4a3f5c', hair: '#2b2118', skin: '#8b5a42' },
    },
    {
        id: 'zombie', label: '小僵尸', hint: '灰皮破烂衣，一摇一晃',
        look: { sprite: 'zombie', build: 'child', hairStyle: 2, primary: '#3f4b3a', secondary: '#39455f', hair: '#4a3320', skin: '#b98255' },
    },
];

/** 随机一份 look（可注入随机源，便于测试） */
export const randomLook = (rand: () => number = Math.random): AvatarLook => {
    const pick = <T,>(list: T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
    return {
        sprite: pick(SPRITE_ORDER),
        build: pick(BUILD_ORDER),
        hairStyle: pick([0, 1, 2, 3]),
        primary: pick(LOOK_PRIMARY_COLORS),
        secondary: pick(LOOK_SECONDARY_COLORS),
        hair: pick(LOOK_HAIR_COLORS),
        skin: pick(LOOK_SKIN_COLORS),
    };
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** 与 CampSprite.shadeHex 同算法；此处自带一份，避免纯数据层反向依赖 React 组件模块 */
const shade = (hex: string, factor: number): string => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
    const r = ch((n >> 16) & 255);
    const g = ch((n >> 8) & 255);
    const b = ch(n & 255);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

/**
 * 把外部塞进来的 look 收敛成合法值：非法字段回退到 seed 派生。
 * 存档/导入配置可能带着旧字段或手改的颜色，渲染层不该为此抛错。
 */
export const normalizeLook = (value: unknown, seed: number): AvatarLook => {
    const fallback = lookFromSeed(seed);
    if (!value || typeof value !== 'object') return fallback;
    const raw = value as Partial<AvatarLook>;
    const color = (input: string | undefined, backup: string) =>
        typeof input === 'string' && HEX_RE.test(input) ? input.toLowerCase() : backup;
    return {
        sprite: SPRITE_ORDER.includes(raw.sprite as AvatarSprite) ? raw.sprite as AvatarSprite : fallback.sprite,
        build: BUILD_ORDER.includes(raw.build as AvatarBuild) ? raw.build as AvatarBuild : fallback.build,
        hairStyle: Number.isInteger(raw.hairStyle) && (raw.hairStyle as number) >= 0 && (raw.hairStyle as number) <= 3
            ? raw.hairStyle as number
            : fallback.hairStyle,
        primary: color(raw.primary, fallback.primary),
        secondary: color(raw.secondary, fallback.secondary),
        hair: color(raw.hair, fallback.hair),
        skin: color(raw.skin, fallback.skin),
    };
};

/** 取最终形象：分身配置过就用它（顺手收敛非法值），没配就按座位 seed 派生 */
export const resolveLook = (look: AvatarLook | undefined | null, seed: number): AvatarLook =>
    look ? normalizeLook(look, seed) : lookFromSeed(seed);

/**
 * 2D 精灵的调色板重映射规则。
 *
 * 键必须是**颜色值**——渲染层是拿 palette 里的色值去查 tint 的，
 * 用字母键（D/F/H…）会静默失效，看起来像"换了没反应"。
 *
 * 每个角色给定若干条 `原色值 → 色槽` 的映射；`shade` 表示"这是该槽的暗部/亮部"，
 * 取 `shade(look[slot], factor)` 而不是原色。只换亮部会把旧色的暗边留在脸上（踩过）。
 * 描边 `#222222` 与高光白 `#fdf7ed` 一律不进表 —— 改了会糊成一团。
 */
interface TintRule {
    color: string;
    slot: 'primary' | 'secondary' | 'hair' | 'skin';
    shade?: number;
}

const SPRITE_TINT_RULES: Record<AvatarSprite, TintRule[]> = {
    // 盔甲 / 腿甲 / 羽饰（全身覆甲，没有裸露皮肤，肤色槽对它无效）
    knight: [
        { color: '#72d6ce', slot: 'primary' },
        { color: '#417089', slot: 'secondary' },
        { color: '#da4e38', slot: 'hair' },
        { color: '#ee8e2e', slot: 'hair', shade: 0.8 },
    ],
    // 女骑士：版式同男骑士，只是羽饰是粉红
    knightess: [
        { color: '#72d6ce', slot: 'primary' },
        { color: '#417089', slot: 'secondary' },
        { color: '#dc4a7b', slot: 'hair' },
        { color: '#f78697', slot: 'hair', shade: 0.82 },
    ],
    // 精灵：裙的亮部与暗部要一起换（只换亮部会花）、头发、皮肤、披风
    elf: [
        { color: '#4ba747', slot: 'primary' },
        { color: '#3d734f', slot: 'primary', shade: 0.72 },
        { color: '#facb3e', slot: 'hair' },
        { color: '#ee8e2e', slot: 'hair', shade: 0.78 },
        { color: '#fccba3', slot: 'skin' },
        { color: '#da4e38', slot: 'secondary' },
    ],
    // 游侠（男精灵）：肤色有亮/暗两档，披风是深蓝
    ranger: [
        { color: '#4ba747', slot: 'primary' },
        { color: '#3d734f', slot: 'primary', shade: 0.72 },
        { color: '#facb3e', slot: 'hair' },
        { color: '#ee8e2e', slot: 'hair', shade: 0.78 },
        { color: '#fccba3', slot: 'skin' },
        { color: '#e2b694', slot: 'skin', shade: 1.08 },
        { color: '#314152', slot: 'secondary' },
        { color: '#5698cc', slot: 'secondary', shade: 1.6 },
    ],
    // 矮人：大衣是主色，胡须走发色，工装裤是副色
    dwarf: [
        { color: '#da4e38', slot: 'primary' },
        { color: '#e46e33', slot: 'primary', shade: 1.12 },
        { color: '#d8a57d', slot: 'skin' },
        { color: '#c38d70', slot: 'skin', shade: 0.88 },
        { color: '#775c55', slot: 'hair' },
        { color: '#7b8994', slot: 'secondary' },
    ],
    // 法师：紫袍 + 蓝衬 + 白胡子（#fdf7ed 是胡子不是高光，所以进表）
    wizard: [
        { color: '#5956bd', slot: 'primary' },
        { color: '#5698cc', slot: 'secondary' },
        { color: '#fdf7ed', slot: 'hair' },
        { color: '#b58057', slot: 'skin' },
        { color: '#d3bfa9', slot: 'skin', shade: 1.1 },
        { color: '#8a503e', slot: 'secondary', shade: 0.8 },
    ],
    // 蜥蜴人：体表当主色，腹甲当肤色，腰布是副色
    lizard: [
        { color: '#4ba747', slot: 'primary' },
        { color: '#3d734f', slot: 'primary', shade: 0.72 },
        { color: '#d3bfa9', slot: 'skin' },
        { color: '#314152', slot: 'secondary' },
        { color: '#775c55', slot: 'hair' },
        { color: '#483b3a', slot: 'secondary', shade: 0.8 },
    ],
    // 兽人战士：绿皮当主色，锁甲副色，牙不换
    orc: [
        { color: '#3d734f', slot: 'primary' },
        { color: '#314152', slot: 'secondary' },
        { color: '#8f4029', slot: 'hair' },
        { color: '#62232f', slot: 'secondary', shade: 0.85 },
    ],
    // 萨满：同兽人基底，图腾红走发色
    shaman: [
        { color: '#3d734f', slot: 'primary' },
        { color: '#314152', slot: 'secondary' },
        { color: '#8f4029', slot: 'hair' },
        { color: '#62232f', slot: 'secondary', shade: 0.85 },
        { color: '#d44e52', slot: 'hair', shade: 1.25 },
    ],
    // 哥布林：只有四色，布衣当主色、皮当肤色
    goblin: [
        { color: '#314152', slot: 'primary' },
        { color: '#3d734f', slot: 'skin' },
    ],
    // 魔童：红皮当主色，白角走发色
    chort: [
        { color: '#da4e38', slot: 'primary' },
        { color: '#9f294e', slot: 'secondary' },
        { color: '#5f2d56', slot: 'secondary', shade: 0.8 },
        { color: '#fdf7ed', slot: 'hair' },
    ],
    // 小恶魔：红皮 + 紫翼
    imp: [
        { color: '#da4e38', slot: 'primary' },
        { color: '#5f2d56', slot: 'secondary' },
        { color: '#62232f', slot: 'secondary', shade: 0.8 },
    ],
    // 小僵尸：只有皮、暗皮、破布三色（原包 3 帧循环）
    zombie: [
        { color: '#d3bfa9', slot: 'skin' },
        { color: '#aa8d7a', slot: 'skin', shade: 0.85 },
        { color: '#3d734f', slot: 'primary' },
    ],
};

const tintOf = (rules: TintRule[], look: AvatarLook): Record<string, string> => {
    const out: Record<string, string> = {};
    rules.forEach(({ color, slot, shade: factor }) => {
        out[color] = factor === undefined ? look[slot] : shade(look[slot], factor);
    });
    return out;
};

/** 2D 全身精灵的调色板重映射 */
export const buildSpriteTint = (look: AvatarLook): Record<string, string> =>
    tintOf(SPRITE_TINT_RULES[look.sprite] ?? SPRITE_TINT_RULES.knight, look);

/**
 * 方形小头像的调色板重映射。
 *
 * 直接复用全身表：头部矩阵只会命中它自己有的那几个色值（头盔命中 primary、
 * 露脸的角色命中 skin/hair），表里多出来的键不产生副作用。这样加角色时
 * 只维护一份规则，不会出现"身体换了颜色、头像没换"。
 */
export const buildHeadTint = (look: AvatarLook): Record<string, string> => buildSpriteTint(look);

/** 3D 体型缩放：[x 宽, y 高] */
export const buildScale = (build: AvatarBuild): [number, number] => {
    switch (build) {
        case 'tall': return [0.96, 1.12];
        case 'stout': return [1.16, 0.94];
        case 'child': return [0.84, 0.8];
        default: return [1, 1];
    }
};

/**
 * 2D 精灵的体型缩放：[x 宽, y 高]。
 *
 * 幅度比 3D 小一档：像素图是 16×28 的小矩阵，非整数倍放大会让像素行列宽窄不均，
 * 1.16 那种比例在 3D 体素上看是"壮"，在 2D 上看是"腿一粗一细"。
 */
export const buildSpriteScale = (build: AvatarBuild): [number, number] => {
    switch (build) {
        case 'tall': return [0.94, 1.1];
        case 'stout': return [1.12, 0.94];
        case 'child': return [0.86, 0.82];
        default: return [1, 1];
    }
};

/** 2D 待机四帧的 camp-tiles 键：char_<sprite>_0..3 */
export const spriteFrameKeys = (sprite: AvatarSprite): string[] =>
    [0, 1, 2, 3].map(i => `char_${sprite}_${i}`);

/** 2D 方头像的 camp-tiles 键：head_<sprite> */
export const spriteHeadKey = (sprite: AvatarSprite): string => `head_${sprite}`;

/** 一句话描述，给列表与无障碍用 */
export const describeLook = (look: AvatarLook): string =>
    `${SPRITE_LABELS[look.sprite] ?? '骑士'}·${BUILD_LABELS[look.build]}·${HAIR_STYLE_LABELS[look.hairStyle] ?? '短发'}`;
