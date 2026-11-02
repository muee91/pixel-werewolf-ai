import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
    ANIM_LIBRARY,
    CLIP_FOR_STATE,
    GESTURE_CLIP,
    GESTURE_INTERVAL_MAX,
    GESTURE_INTERVAL_MIN,
    GESTURE_TIME_SCALE,
    KAYKIT_MODELS,
    KAYKIT_TINT_STRENGTH,
    LOOPING_STATE,
    REDUCED_MOTION_FRACTION,
    kayKitModelUrl,
    modelForLook,
    stateFromFlags,
    tintForLook,
} from '../../src/components/game/voxel3d/kaykitModel';
import { SEAT_LOOK_SEED_OFFSET, SPRITE_ORDER, lookFromSeed, type AvatarLook } from '../../src/utils/avatarLook';

const projectRoot = resolve(import.meta.dirname, '../..');

/** 把 public/ 下的 glb 解析出来（只读 JSON chunk，不解二进制） */
const readGlbJson = (url: string) => {
    const file = join(projectRoot, 'public', url);
    const buffer = readFileSync(file);
    assert.equal(buffer.readUInt32LE(0), 0x46546c67, `${file} 不是有效 GLB`);
    const jsonLength = buffer.readUInt32LE(12);
    return { json: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')), file };
};

test('13 张 2D 骨架都能映射到一只存在的 3D 模型', () => {
    for (const sprite of SPRITE_ORDER) {
        const look = { ...lookFromSeed(1), sprite } as AvatarLook;
        const model = modelForLook(look);
        assert.ok((KAYKIT_MODELS as readonly string[]).includes(model), `${sprite} → ${model} 不在模型清单里`);
    }
    // 反过来：九只模型都要有 2D 骨架映射到它，否则就是白打包一只没人用的模型
    const used = new Set(SPRITE_ORDER.map((sprite) => modelForLook({ ...lookFromSeed(1), sprite } as AvatarLook)));
    for (const model of KAYKIT_MODELS) {
        assert.ok(used.has(model), `没有任何 2D 骨架映射到 ${model}`);
    }
});

test('九只模型都在 public/ 里，且骨架一致（动画才能共用一套）', () => {
    const jointCounts = new Set<number>();
    for (const model of KAYKIT_MODELS) {
        const { json, file } = readGlbJson(kayKitModelUrl(model));
        assert.equal(json.skins?.length, 1, `${model} 应该只有一副骨架`);
        const joints = json.skins![0].joints as number[];
        jointCounts.add(joints.length);
        // 网格节点数就是这只角色的 draw call 数，留出上限防止有人把原包塞回去。
        // 4 = 身体 + 眼睛（骷髅的 Glow 独立材质）+ 兜帽 + 披风，活人最多 3。
        const meshNodes = (json.nodes as { mesh?: number }[]).filter((node) => node.mesh != null);
        assert.ok(meshNodes.length <= 4, `${model} 有 ${meshNodes.length} 个网格节点（应 ≤ 4）`);
        assert.ok(
            (json.meshes as { name: string }[]).some((mesh) => mesh.name.endsWith('_Merged')),
            `${model} 缺少合并后的身体网格`,
        );
        assert.ok(statSync(file).size < 1024 * 1024, `${model} 体积超过 1 MB，动画可能又被复制了一遍`);
    }
    assert.equal(jointCounts.size, 1, '九只模型的骨骼数量必须相同');
    assert.equal([...jointCounts][0], 41);
});

test('动画库只打包在 Knight 上，且用到的 clip 一个不少', () => {
    for (const model of KAYKIT_MODELS) {
        const { json } = readGlbJson(kayKitModelUrl(model));
        const clips = (json.animations ?? []).map((animation: { name: string }) => animation.name);
        if (model === ANIM_LIBRARY) {
            for (const clip of Object.values(CLIP_FOR_STATE)) {
                assert.ok(clips.includes(clip), `${ANIM_LIBRARY} 缺少 clip ${clip}`);
            }
            // 76 段全留会多 1.5 MB，这里守住"只留用得上的"
            assert.ok(clips.length <= 12, `clip 数量 ${clips.length} 超出预期，检查 KEEP_CLIPS`);
        } else {
            assert.equal(clips.length, 0, `${model} 不该自带动画（九只用同一套，重复存会多 5 MB）`);
        }
    }
});

test('12 个座位用满 9 只模型，同模型的座位体型必须错开', () => {
    // seed 是 0-based 座位索引 + 偏移（和 store.ts 的 resolveLook(actor.look, i + OFFSET) 一致）
    const byModel = new Map<string, { seat: number; build: string }[]>();
    for (let seat = 0; seat < 12; seat += 1) {
        const look = lookFromSeed(seat + SEAT_LOOK_SEED_OFFSET);
        const model = modelForLook(look);
        if (!byModel.has(model)) byModel.set(model, []);
        byModel.get(model)!.push({ seat: seat + 1, build: look.build });
    }

    // 9 只模型装 12 个座位，抽屉原理：必然有 3 对重复，但必须覆盖全部 9 只
    assert.equal(byModel.size, KAYKIT_MODELS.length, `12 座只用到 ${byModel.size} 只模型，映射表有冗余`);

    for (const [model, seats] of byModel) {
        assert.ok(seats.length <= 2, `${model} 在 12 座里出现 ${seats.length} 次，太挤了`);
        if (seats.length === 2) {
            assert.notEqual(
                seats[0].build,
                seats[1].build,
                `${model} 的 ${seats[0].seat} 号与 ${seats[1].seat} 号体型相同，会看成同一个人`,
            );
        }
    }
});

test('女骑士与骑士不共存于同一局：撞脸的那张排在 12 座抽不到的槽位', () => {
    const sprites = Array.from({ length: 12 }, (_, seat) => lookFromSeed(seat + SEAT_LOOK_SEED_OFFSET).sprite);
    assert.ok(sprites.includes('knight'), '12 座应该有骑士');
    assert.ok(!sprites.includes('knightess'), '女骑士与骑士共用剪影，不该同时在 12 座里出现');
});

test('状态优先级：受惊 > 施法 > 发言 > 待机', () => {
    assert.equal(stateFromFlags({ isSpeaking: true, startle: false, isCasting: false }), 'speak');
    assert.equal(stateFromFlags({ isSpeaking: true, startle: false, isCasting: true }), 'cast');
    assert.equal(stateFromFlags({ isSpeaking: true, startle: true, isCasting: true }), 'startle');
    assert.equal(stateFromFlags({ isSpeaking: false, startle: false, isCasting: false }), 'idle');
});

test('染色强度：0 是原色（白），1 是完全主色，坏输入不炸', () => {
    const look = lookFromSeed(3);
    assert.equal(tintForLook(look, 0), '#ffffff');
    assert.equal(tintForLook(look, 1), look.primary.toLowerCase());
    const broken = { ...look, primary: 'not-a-color' } as AvatarLook;
    assert.equal(tintForLook(broken), '#ffffff');
    // 默认强度必须是"能看出色系但不把皮肤染花"的中间值
    assert.ok(KAYKIT_TINT_STRENGTH > 0 && KAYKIT_TINT_STRENGTH < 0.6);
});

test('减少动态时的定格帧在 0~1 之间，且每档状态都给了', () => {
    for (const state of ['idle', 'speak', 'startle', 'cast'] as const) {
        const fraction = REDUCED_MOTION_FRACTION[state];
        assert.ok(fraction >= 0 && fraction <= 1, `${state} 的定格比例越界：${fraction}`);
    }
});


// ── 发言动作（玩家："近景人物不停挥手，很奇怪"） ──────────────

test('发言状态不再循环挥手：基础层必须是 Idle', () => {
    // Interact 是"打招呼挥手"，一循环就是对着空气不停挥手，连着说 20 秒像鬼畜。
    assert.equal(CLIP_FOR_STATE.speak, 'Idle', '发言又接回 Interact 了，会一直挥手');
    assert.equal(CLIP_FOR_STATE.idle, 'Idle');
    // 手势只作为低频单次插播
    assert.equal(GESTURE_CLIP, 'Interact');
    assert.ok(GESTURE_INTERVAL_MIN >= 4, '手势间隔太短，会变成节拍器');
    assert.ok(GESTURE_INTERVAL_MAX > GESTURE_INTERVAL_MIN);
    assert.ok(GESTURE_TIME_SCALE < 1, '手势应该比原速慢，才不像赶时间');
});

test('受惊/施法仍然各用各的 clip，没有被发言牵连', () => {
    assert.equal(CLIP_FOR_STATE.startle, 'Hit_A');
    assert.equal(CLIP_FOR_STATE.cast, 'Spellcast_Raise');
    assert.equal(LOOPING_STATE.cast, false, '施法是一次性抬手，不能循环');
    assert.equal(LOOPING_STATE.speak, true, '呼吸循环要一直跑，否则发言中途会定格');
});
