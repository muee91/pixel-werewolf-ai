/**
 * 3D 角色模型（KayKit Adventurers + Skeletons，均 CC0）——纯映射层，不依赖 three / React
 *
 * 之前的 3D 角色是 `VoxelCharacter` 里现搭的 7 个盒子 + 正弦波抖动手臂：
 * 骨架只有一套，12 个座位只能靠换色区分，"施法"也只是整体上下浮动。
 * 现在换成有骨骼、有真动画的 CC0 模型，但**形象仍然由 `AvatarLook` 决定** ——
 * 2D 精灵、3D 模型、设置页预览读的是同一份 look，换衣服在两个视角都看得见。
 *
 * 两个包共用同一副 41 骨骨架（关节名与顺序逐一相同，`build-kaykit-assets.mjs`
 * 每次生成时都会断言），所以亡灵不需要自己的动画库。
 *
 * 模型本身由 `scripts/build-kaykit-assets.mjs` 从原包裁剪而来（见该脚本注释）。
 */

import type { AvatarLook, AvatarSprite } from '../../../utils/avatarLook';

export const KAYKIT_MODELS = [
    'Knight',
    'Mage',
    'Rogue',
    'Rogue_Hooded',
    'Barbarian',
    'Skeleton_Warrior',
    'Skeleton_Rogue',
    'Skeleton_Mage',
    'Skeleton_Minion',
] as const;
export type KayKitModel = (typeof KAYKIT_MODELS)[number];

/**
 * 动画只打包在 Knight 上（五只角色的骨架与 clip 完全一致，重复存 5 份白占 5 MB）。
 * 所以任何角色播动画都要读这个文件；它同时也是"骑士"这个模型本身。
 */
export const ANIM_LIBRARY: KayKitModel = 'Knight';

/** 资源是 public/ 下的静态文件，随包分发，不走网络 */
export const kayKitModelUrl = (model: KayKitModel): string => `models/kaykit/${model}.glb`;

/**
 * 2D 骨架 → 3D 模型：两套视角里的"同一个人"要长得是同一类。
 *
 * 13 张 2D 骨架分到 9 只模型上，按 store 的开局规则（0-based 座位 i + 100，取模 13）
 * 逐位核对过 12 座的结果（座位号从 1 数）：
 *
 *   1 号 goblin/adult  → Skeleton_Rogue
 *   2 号 chort/tall    → Mage             ┐ 同模型，8 号是 child
 *   3 号 imp/stout     → Skeleton_Minion
 *   4 号 zombie/child  → Skeleton_Warrior
 *   5 号 knight/adult  → Knight
 *   6 号 elf/tall      → Rogue_Hooded     ┐ 同模型，9 号是 adult
 *   7 号 dwarf/stout   → Barbarian        ┐ 同模型，10 号是 tall
 *   8 号 wizard/child  → Mage
 *   9 号 ranger/adult  → Rogue_Hooded
 *  10 号 orc/tall      → Barbarian
 *  11 号 lizard/stout  → Rogue
 *  12 号 shaman/child  → Skeleton_Mage
 *
 * 12 个座位正好用满 9 只模型，重复的三对（Mage / Rogue_Hooded / Barbarian）
 * 体型两两相反 —— 抽屉原理摆在那：9 只模型装 12 个座位必然有 3 对重复，
 * 靠的是体型错开，不是运气。改这张表就必须重跑上面这段核对，
 * `scripts/tests/kaykit-model.test.ts` 会把"同模型同体型"直接判失败。
 */
const SPRITE_TO_MODEL: Record<AvatarSprite, KayKitModel> = {
    knight: 'Knight',
    knightess: 'Knight', // 只差羽饰色的同一张剪影，已被排到 12 座抽不到的槽位
    wizard: 'Mage',
    chort: 'Mage',
    ranger: 'Rogue_Hooded',
    elf: 'Rogue_Hooded',
    dwarf: 'Barbarian',
    orc: 'Barbarian',
    lizard: 'Rogue',
    shaman: 'Skeleton_Mage',
    goblin: 'Skeleton_Rogue',
    imp: 'Skeleton_Minion',
    zombie: 'Skeleton_Warrior',
};

export const modelForLook = (look: AvatarLook): KayKitModel => SPRITE_TO_MODEL[look.sprite] ?? 'Knight';

// ── 状态 → 动画 ───────────────────────────────────────────

export type KayKitState = 'idle' | 'speak' | 'startle' | 'cast';

/** 五种模型统一用到这几段 clip，改这里要同步 scripts/build-kaykit-assets.mjs 的 KEEP_CLIPS */
export const CLIP_FOR_STATE: Record<KayKitState, string> = {
    idle: 'Idle',
    // 发言**不是**循环 Interact。Interact 是"打招呼挥手"，一循环就变成一个人对着空气不停挥手，
    // 一局里连着说 20 秒就是一整套鬼畜动作。发言的基础层用 Idle（呼吸），
    // 手势交给 GESTURE_CLIP 低频插播（见 KayKitActor）。
    speak: 'Idle',
    startle: 'Hit_A',
    cast: 'Spellcast_Raise',
};

/** 施法是一次性抬手，播完停在最后；其余循环 */
export const LOOPING_STATE: Record<KayKitState, boolean> = {
    idle: true,
    speak: true,
    startle: true,
    cast: false,
};

/**
 * 发言时的"手势"：每隔 GESTURE_INTERVAL 秒插播一次 Interact 的**单次**片段，
 * 播完自动淡回 Idle。
 *
 * 为什么不做成循环：真人讲话时手势是偶尔出现的一个动作，不是节拍器。
 * 5~9 秒一次（带随机抖动）听感上才像"讲到某处比划一下"；
 * 一旦循环，无论多慢都看得出是同一个动作在重复。
 */
export const GESTURE_CLIP = 'Interact';
export const GESTURE_INTERVAL_MIN = 5;
export const GESTURE_INTERVAL_MAX = 9;
/** 手势播放速度：0.8 比原速慢一档，抬手的动作才不像"赶时间" */
export const GESTURE_TIME_SCALE = 0.8;

/**
 * 优先级：受惊 > 施法 > 发言 > 待机。
 * 同一时刻只播一段——交叉淡入淡出会让"受惊"被发言手势盖掉。
 */
export const stateFromFlags = (flags: {
    isSpeaking: boolean;
    startle: boolean;
    isCasting: boolean;
}): KayKitState => {
    if (flags.startle) return 'startle';
    if (flags.isCasting) return 'cast';
    if (flags.isSpeaking) return 'speak';
    return 'idle';
};

/**
 * 减少动态（prefers-reduced-motion）时停在这一帧：
 * 循环动画不做，但"他在发言 / 他举起了手 / 他被吓到"这些**状态信息**必须留着。
 * 值是"取这段 clip 的第几成"，乘 duration 得到秒数（各段长度不同，不能写死秒）。
 */
export const REDUCED_MOTION_FRACTION: Record<KayKitState, number> = {
    idle: 0,
    // 发言现在播的是 Idle，取中间帧（胸腔吸满的那一下），比第 0 帧更像"正在说话"
    speak: 0.5,
    startle: 0.3,
    cast: 0.55,
};

// ── 体型 / 配色 ──────────────────────────────────────────

/**
 * 模型原始身高 2.19~2.32（脚底正好在 y=0），体素角色头顶约 1.98。
 * 统一乘 0.88 落到同一量级，再叠 `buildScale` 的四档体型。
 */
export const KAYKIT_SCALE = 0.88;

/** 名牌高度：模型头顶（含帽子）= 2.32 * 0.88 ≈ 2.04，留一点缝 */
export const KAYKIT_LABEL_Y = 2.25;

/**
 * 主色落地成材质色。
 *
 * 模型贴图是手绘的（盔甲、袍子、皮肤各有色相），直接把主色乘上去会把皮肤也染成
 * 青绿色。所以先往白色混一半，只留一层"这个人是这个色系"的染色。
 * 强度是 0 到 1 的混合比，0 = 原色不染，1 = 完全主色（会变脏）。
 */
export const KAYKIT_TINT_STRENGTH = 0.35;

/**
 * 材质提亮倍数（乘在 color 上，可以大于 1）。
 *
 * 夜景里整片营地只剩环境光，而 KayKit 的皮革/铁甲比周围草方块暗一档，
 * 9 个人在营火外圈会变成 9 团黑影 —— 分不清谁是谁，"换个形象"就白做了。
 *
 * 试过白色自发光（emissive 0.16）：因为 emissive 不乘贴图，等于盖一层灰纱，
 * 人物直接变成白色剪影，颜色全丢了。乘在 color 上则是按比例提亮，色相留着。
 * 1.0 = 原贴图亮度，1.8 ≈ 把角色从"夜里的黑影"提到跟草地一个档。
 */
export const KAYKIT_BRIGHTNESS = 3;

/**
 * 亡灵的提亮倍数要单独压一档。
 *
 * 上面那个 3 倍是按"活人的皮革/铁甲比草地暗一档"定的。骷髅的贴图本身就是浅色骨头，
 * 再乘 3 直接烧成白块，夜里站在营火边比火还亮 —— 而且骨头上的裂缝细节全丢了。
 * 1.75 能让它和活人落在同一个亮度区间里，又保留骨头的层次。
 */
export const KAYKIT_BRIGHTNESS_UNDEAD = 1.75;

export const brightnessForModel = (model: KayKitModel): number =>
    model.startsWith('Skeleton') ? KAYKIT_BRIGHTNESS_UNDEAD : KAYKIT_BRIGHTNESS;

/** look.primary → 材质乘色（#rrggbb）。纯函数，便于 node 测试。 */
export const tintForLook = (look: AvatarLook, strength = KAYKIT_TINT_STRENGTH): string => {
    const hex = /^#[0-9a-f]{6}$/i.test(look.primary) ? look.primary : '#ffffff';
    const s = Math.min(1, Math.max(0, strength));
    const channel = (offset: number) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return Math.round((1 * (1 - s) + value * s) * 255);
    };
    return `#${[1, 3, 5].map((o) => channel(o).toString(16).padStart(2, '0')).join('')}`;
};
