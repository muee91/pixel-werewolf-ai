#!/usr/bin/env node
/**
 * KayKit 角色包（CC0）→ 本项目运行时模型
 *
 * 覆盖两个包：Adventurers（活人 5 只）+ Skeletons（亡灵 4 只）。
 * 两个包共用同一副 41 骨骨架（关节名与顺序逐一相同，脚本运行时会断言），
 * 所以骷髅不需要自己的动画——直接用 Knight 上的那一份。
 *
 * 原包每只角色 3.5~4.6 MB，其中 1.27 MB 是**同一套 76 段动画被复制了 5 遍**，
 * 另有 1.9 MB 是这些动画的 accessor JSON。九只直接塞进 public/ 要 33 MB。
 *
 * 这个脚本做三件事：
 *  1. 合并蒙皮网格：原包把身体拆成 6 段（两只手臂/身体/头/两条腿）各自一个
 *     SkinnedMesh，一个角色就是 6 次 draw call；它们同骨架同材质同父节点，
 *     直接拼成一个 —— 12 个座位从 180 draw 降到 60 左右。
 *  2. 挑选装备：原包把同一角色的所有武器/盾牌/披风**同时挂在手上**
 *     （骑士一次挂 1 把副手剑 + 3 面盾 + 单手剑 + 双手剑），全渲染就是叠罗汉。
 *     每人只留一套，顺便让九个角色的剪影彻底分开。
 *  3. 只留一份动画库：九个角色的骨架（41 骨，顺序与名字完全一致）和 clip
 *     也完全一致，所以动画只留在 Knight 上，其余八只剔除 animations。
 *
 * 用法：
 *   node scripts/build-kaykit-assets.mjs <Adventurers/gltf> [Skeletons/gltf]
 *   （第二个参数省略时只生成活人五只，便于只换了原包重跑）
 * 产物：public/models/kaykit/*.glb（约 9 MB，需入库 —— 运行时直接读）
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ADV_SRC = process.argv[2] ?? process.env.KAYKIT_SRC ?? join(root, 'vendor/kaykit/Characters/gltf');
const SKEL_SRC = process.argv[3] ?? process.env.KAYKIT_SKELETONS_SRC ?? join(root, 'vendor/kaykit-skeletons/Characters/gltf');
const OUT_DIR = join(root, 'public/models/kaykit');

/** 动画库宿主：五只共用同一套 clip，只在它身上保留 */
const ANIM_HOST = 'Knight';

/**
 * 只留游戏里用得上的 clip。
 * 原包 76 段里有跳跃/游泳/坐椅子/开门，站桩的狼人杀场景一辈子用不到，
 * 全留会让动画库从 0.4 MB 涨到 1.9 MB。多加一行就能扩。
 */
const KEEP_CLIPS = [
    'Idle',            // 待机
    'Unarmed_Idle',    // 待机（无武器变体，给没有装备的角色兜底）
    'Interact',        // 发言
    'Hit_A',           // 受惊
    'Hit_B',           // 受惊变体
    'Cheer',           // 欢呼（胜利用）
    'Spellcast_Raise', // 施法抬手
    'Spellcast_Long',  // 持续施法
    'Death_A',         // 出局
    'T-Pose',          // 调参基准姿态，正式运行时不用
];

/**
 * 每个角色留哪些附件。
 *
 * 只留**穿戴件**（头盔/帽子/兜帽/披风），不留手持武器。两个原因：
 *  1. 原包的武器是按"握持/瞄准"姿态调的，挂在 handslot 骨骼上播 Idle 时
 *     方向是错的 —— 实测弩头朝地、法杖正对镜头缩成一坨、书悬在手臂外侧。
 *     要修就得逐把武器手调旋转，而动画里手还会转，越调越碎。
 *  2. 场景是围营火讨论的狼人杀，村民不该人人提着家伙。剪影靠头型和披风就够分开。
 *
 * 九只的头部造型刻意两两不同（头盔 / 尖帽 / 兜帽 / 熊皮帽 / 光头骷髅 / …），
 * 远处只看剪影就能分出是谁 —— 这是"12 个座位不撞脸"的唯一依据，不能随手删。
 */
const LOADOUT = {
    Knight: ['Knight_Helmet', 'Knight_Cape'],
    Mage: ['Mage_Hat', 'Mage_Cape'],
    Rogue: ['Rogue_Cape'],
    Rogue_Hooded: ['Rogue_Cape'],
    Barbarian: ['Barbarian_Hat', 'Barbarian_Cape'],
    // ── Skeletons ──
    Skeleton_Warrior: ['Skeleton_Warrior_Helmet'],
    Skeleton_Rogue: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'],
    Skeleton_Mage: ['Skeleton_Mage_Hat'],
    Skeleton_Minion: [], // 原包就光着脑袋，这颗秃头本身就是最好的剪影
};

/** 处理哪些角色、从哪个包取。第二组目录不存在时只做活人五只。 */
const MODELS = [
    ...['Knight', 'Mage', 'Rogue', 'Rogue_Hooded', 'Barbarian'].map((name) => ({ name, src: ADV_SRC })),
    ...(existsSync(SKEL_SRC)
        ? ['Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage', 'Skeleton_Minion'].map((name) => ({
              name,
              src: SKEL_SRC,
          }))
        : []),
];

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

const readGlb = (file) => {
    const buf = readFileSync(file);
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`不是 GLB：${file}`);
    const jsonLength = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
    const bin = buf.subarray(20 + jsonLength + 8);
    return { json, bin };
};

const writeGlb = (file, json, bin) => {
    const jsonRaw = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);
    const binPad = (4 - (bin.length % 4)) % 4;
    const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);

    const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
    const out = Buffer.alloc(total);
    out.writeUInt32LE(0x46546c67, 0); // 'glTF'
    out.writeUInt32LE(2, 4);
    out.writeUInt32LE(total, 8);
    out.writeUInt32LE(jsonChunk.length, 12);
    out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
    jsonChunk.copy(out, 20);
    const binHead = 20 + jsonChunk.length;
    out.writeUInt32LE(binChunk.length, binHead);
    out.writeUInt32LE(0x004e4942, binHead + 4); // 'BIN\0'
    binChunk.copy(out, binHead + 8);
    writeFileSync(file, out);
    return total;
};

/** 把 accessor 读成"紧凑无 stride"的裸字节，后面所有操作都基于它 */
const readAccessor = (json, bin, index) => {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const elementBytes = COMPONENT_SIZE[acc.componentType] * COMPONENT_COUNT[acc.type];
    const stride = view.byteStride ?? elementBytes;
    const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const data = Buffer.alloc(acc.count * elementBytes);
    for (let i = 0; i < acc.count; i += 1) {
        bin.copy(data, i * elementBytes, base + i * stride, base + i * stride + elementBytes);
    }
    return { data, componentType: acc.componentType, type: acc.type, count: acc.count };
};

const minMaxOf = (positions) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.count; i += 1) {
        for (let c = 0; c < 3; c += 1) {
            const v = positions.data.readFloatLE((i * 3 + c) * 4);
            if (v < min[c]) min[c] = v;
            if (v > max[c]) max[c] = v;
        }
    }
    return { min: min.map((v) => Number(v.toFixed(5))), max: max.map((v) => Number(v.toFixed(5))) };
};

/** 删节点并重映射所有引用（children / joints / skeleton / 动画通道） */
const removeNodes = (json, dropIds) => {
    const drop = new Set(dropIds);
    const map = new Map();
    let next = 0;
    json.nodes.forEach((_, i) => {
        if (!drop.has(i)) map.set(i, next);
        if (!drop.has(i)) next += 1;
    });
    const remap = (i) => (map.has(i) ? map.get(i) : -1);
    json.nodes = json.nodes.filter((_, i) => !drop.has(i));
    for (const node of json.nodes) {
        if (node.children) node.children = node.children.map(remap).filter((i) => i >= 0);
    }
    for (const skin of json.skins ?? []) {
        skin.joints = skin.joints.map(remap);
        if (skin.skeleton != null) skin.skeleton = remap(skin.skeleton);
    }
    json.scenes = json.scenes.map((scene) => ({
        ...scene,
        nodes: scene.nodes.map(remap).filter((i) => i >= 0),
    }));
    for (const anim of json.animations ?? []) {
        anim.channels = anim.channels.filter((c) => map.has(c.target.node));
        for (const c of anim.channels) c.target.node = remap(c.target.node);
    }
};

/**
 * 把同一副骨架下、同材质的身体段拼成 1 段。
 * 前提（脚本里会断言）：属性集合一致、材质一致、父节点一致且无本地缩放。
 *
 * 为什么按材质分组而不是全拼一起：骷髅的眼睛是单独的 `Glow` 材质（无贴图、靠自发光），
 * 混进身体段会被统一成骨头的贴图，要么眼睛消失、要么整具骨头发光。
 * 结果就是每组各出一段 —— 活人 1 段，骷髅 2 段（身体 + 眼睛）。
 */
const mergeSkinnedMeshes = (json, bin, genData, name) => {
    const parentOf = new Map();
    json.nodes.forEach((node, i) => (node.children ?? []).forEach((c) => parentOf.set(c, i)));

    const hosts = json.nodes
        .map((node, i) => ({ node, i }))
        .filter(({ node }) => node.mesh != null && node.skin != null);

    const groups = new Map();
    for (const host of hosts) {
        const { material } = json.meshes[host.node.mesh].primitives[0];
        if (!groups.has(material)) groups.set(material, []);
        groups.get(material).push(host);
    }

    const vertexBase = [];
    let vertexTotal = 0;
    let indexCount = 0;
    const dropNodes = [];

    const addAccessor = (payload) => {
        const index = json.accessors.length;
        json.accessors.push({});
        genData.set(index, payload);
        return index;
    };

    const mergeGroup = (group, material) => {
        const attrNames = Object.keys(json.meshes[group[0].node.mesh].primitives[0].attributes).sort();
        const parent = parentOf.get(group[0].i);
        for (const { node, i } of group) {
            const prim = json.meshes[node.mesh].primitives[0];
            if (prim.material !== material) throw new Error(`${name}: 材质不一致，无法合并`);
            if (parentOf.get(i) !== parent) throw new Error(`${name}: 父节点不一致，无法合并`);
            if (Object.keys(prim.attributes).sort().join() !== attrNames.join()) {
                throw new Error(`${name}: 属性集合不一致，无法合并`);
            }
            if (group.length > 1 && (node.translation || node.rotation || node.scale)) {
                throw new Error(`${name}: 身体各段带本地变换，合并会错位`);
            }
        }

        const parts = group.map(({ node }) => {
            const prim = json.meshes[node.mesh].primitives[0];
            const attrs = {};
            for (const key of attrNames) attrs[key] = readAccessor(json, bin, prim.attributes[key]);
            return { attrs, indices: readAccessor(json, bin, prim.indices) };
        });

        const bases = [];
        let count = 0;
        for (const part of parts) {
            bases.push(count);
            count += part.attrs.POSITION.count;
        }
        const indicesCount = parts.reduce((sum, p) => sum + p.indices.count, 0);

        const attributes = {};
        for (const key of attrNames) {
            const src = parts[0].attrs[key];
            const elementBytes = COMPONENT_SIZE[src.componentType] * COMPONENT_COUNT[src.type];
            const merged = Buffer.alloc(count * elementBytes);
            parts.forEach((part, i) => part.attrs[key].data.copy(merged, bases[i] * elementBytes));
            const payload = {
                data: merged,
                componentType: src.componentType,
                type: src.type,
                count,
                target: 34962, // ARRAY_BUFFER
            };
            if (key === 'POSITION') {
                const { min, max } = minMaxOf({ data: merged, count });
                payload.min = min;
                payload.max = max;
            }
            attributes[key] = addAccessor(payload);
        }

        // 顶点数 < 65536，索引一律 uint16（原包也是 uint16）
        const indexBytes = new Uint16Array(indicesCount);
        let cursor = 0;
        parts.forEach((part, i) => {
            for (let k = 0; k < part.indices.count; k += 1) {
                indexBytes[cursor + k] = part.indices.data.readUInt16LE(k * 2) + bases[i];
            }
            cursor += part.indices.count;
        });
        const indices = addAccessor({
            data: Buffer.from(indexBytes.buffer),
            componentType: 5123,
            type: 'SCALAR',
            count: indicesCount,
            target: 34963, // ELEMENT_ARRAY_BUFFER
        });

        const suffix = material === 0 ? '' : `_m${material}`;
        json.meshes.push({ name: `${name}_Merged${suffix}`, primitives: [{ attributes, indices, material }] });
        const mergedMesh = json.meshes.length - 1;

        // 第一段当成宿主，其余身体段连节点一起删掉
        const host = group[0];
        host.node.mesh = mergedMesh;
        host.node.name = `${name}_Skinned${suffix}`;
        dropNodes.push(...group.slice(1).map(({ i }) => i));

        vertexBase.push({ group: suffix, count });
        vertexTotal += count;
        indexCount += indicesCount;
    };

    for (const [material, group] of groups) mergeGroup(group, material);

    removeNodes(json, dropNodes);

    return { vertexTotal, indexCount, merged: hosts.length, groups: groups.size };
};

/** 站桩角色不需要根位移：KayKit 的 clip 自带 root 平移，留着会让 12 个人往前滑 */
const stripRootMotion = (json) => {
    for (const anim of json.animations ?? []) {
        const dropped = new Set();
        anim.channels = anim.channels.filter((channel) => {
            const node = json.nodes[channel.target.node];
            if (node?.name === 'root' && channel.target.path === 'translation') {
                dropped.add(channel.sampler);
                return false;
            }
            return true;
        });
        if (!dropped.size) continue;
        const map = new Map();
        let next = 0;
        anim.samplers.forEach((_, i) => {
            if (!dropped.has(i)) map.set(i, next);
            if (!dropped.has(i)) next += 1;
        });
        anim.samplers = anim.samplers.filter((_, i) => !dropped.has(i));
        for (const channel of anim.channels) channel.sampler = map.get(channel.sampler);
    }
};

/** 丢掉没人引用的 mesh，并重映射 node.mesh */
const pruneMeshes = (json) => {
    const used = new Set();
    for (const node of json.nodes) if (node.mesh != null) used.add(node.mesh);
    const ids = [...used].sort((a, b) => a - b);
    const map = new Map(ids.map((old, i) => [old, i]));
    json.meshes = ids.map((id) => json.meshes[id]);
    for (const node of json.nodes) if (node.mesh != null) node.mesh = map.get(node.mesh);
};

/** 重建 accessors / bufferViews / BIN，把没用的字节全部扔掉 */
const repack = (json, bin, genData) => {
    const usedAcc = new Set();
    const addAcc = (i) => {
        if (i != null) usedAcc.add(i);
    };
    for (const mesh of json.meshes ?? []) {
        for (const prim of mesh.primitives ?? []) {
            Object.values(prim.attributes).forEach(addAcc);
            addAcc(prim.indices);
        }
    }
    for (const skin of json.skins ?? []) addAcc(skin.inverseBindMatrices);
    for (const anim of json.animations ?? []) {
        for (const sampler of anim.samplers) {
            addAcc(sampler.input);
            addAcc(sampler.output);
        }
    }

    const accIds = [...usedAcc].sort((a, b) => a - b);
    const accMap = new Map(accIds.map((old, i) => [old, i]));
    const accessors = [];
    const bufferViews = [];
    const chunks = [];
    let offset = 0;

    const push = (data, target) => {
        const pad = (4 - (offset % 4)) % 4;
        if (pad) {
            chunks.push(Buffer.alloc(pad));
            offset += pad;
        }
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? { target } : {}) });
        chunks.push(data);
        offset += data.length;
        return bufferViews.length - 1;
    };

    for (const old of accIds) {
        const generated = genData.get(old);
        const src = generated ?? readAccessor(json, bin, old);
        const orig = json.accessors[old];
        const target = generated?.target ?? (orig.bufferView != null ? json.bufferViews[orig.bufferView].target : undefined);
        const accessor = {
            componentType: src.componentType,
            count: src.count,
            type: src.type,
        };
        if (orig?.normalized) accessor.normalized = true;
        if (generated?.min) accessor.min = generated.min;
        else if (orig?.min) accessor.min = orig.min;
        if (generated?.max) accessor.max = generated.max;
        else if (orig?.max) accessor.max = orig.max;
        accessor.bufferView = push(src.data, target);
        accessors.push(accessor);
    }

    const images = (json.images ?? []).map((image) => {
        const view = json.bufferViews[image.bufferView];
        const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
        return { ...image, bufferView: push(Buffer.from(bytes), undefined) };
    });

    const remapAcc = (i) => (i == null ? i : accMap.get(i));
    for (const mesh of json.meshes ?? []) {
        for (const prim of mesh.primitives ?? []) {
            for (const key of Object.keys(prim.attributes)) prim.attributes[key] = remapAcc(prim.attributes[key]);
            if (prim.indices != null) prim.indices = remapAcc(prim.indices);
        }
    }
    for (const skin of json.skins ?? []) {
        if (skin.inverseBindMatrices != null) skin.inverseBindMatrices = remapAcc(skin.inverseBindMatrices);
    }
    for (const anim of json.animations ?? []) {
        for (const sampler of anim.samplers) {
            sampler.input = remapAcc(sampler.input);
            sampler.output = remapAcc(sampler.output);
        }
    }

    const next = { ...json, accessors };
    next.bufferViews = bufferViews;
    next.buffers = [{ byteLength: offset }];
    if (images.length) next.images = images;
    return { json: next, bin: Buffer.concat(chunks) };
};

const main = () => {
    mkdirSync(OUT_DIR, { recursive: true });
    let totalIn = 0;
    let totalOut = 0;
    let refJoints = null;
    const rows = [];

    for (const { name, src } of MODELS) {
        const loadout = LOADOUT[name] ?? [];
        const file = join(src, `${name}.glb`);
        let { json, bin } = readGlb(file);
        totalIn += statSync(file).size;

        // 0) 骨架必须与宿主一致 —— 骷髅包和冒险者包共用一副骨架是这套方案的前提，
        //    一旦上游改版悄悄换了关节顺序，动画会把九个人一起拧成麻花，且在运行时极难定位。
        const joints = json.skins[0].joints.map((i) => json.nodes[i].name);
        if (!refJoints) refJoints = joints;
        else if (joints.length !== refJoints.length || joints.some((n, i) => n !== refJoints[i])) {
            throw new Error(`${name}: 骨架与 ${ANIM_HOST} 不一致，不能复用动画库`);
        }

        const genData = new Map();

        // 1) 合并 6 段身体
        const mergeInfo = mergeSkinnedMeshes(json, bin, genData, name);

        // 2) 只留一套装备
        const drop = [];
        json.nodes.forEach((node, i) => {
            if (node.mesh != null && node.skin == null && !loadout.includes(node.name)) drop.push(i);
        });
        if (drop.length) removeNodes(json, drop);

        // 3) 动画只留在宿主身上，且只留用得上的几段
        if (name !== ANIM_HOST) {
            json.animations = [];
        } else {
            const before = json.animations.length;
            json.animations = json.animations.filter((a) => KEEP_CLIPS.includes(a.name));
            const kept = new Set(json.animations.map((a) => a.name));
            const missing = KEEP_CLIPS.filter((c) => !kept.has(c));
            if (missing.length) throw new Error(`缺少动画：${missing.join(', ')}`);
            stripRootMotion(json);
            console.log(`[${name}] clip ${before} → ${json.animations.length}`);
        }

        pruneMeshes(json);
        const repacked = repack(json, bin, genData);
        repacked.json.asset = { version: '2.0', generator: 'ai-werewolf build-kaykit-assets' };

        const bytes = writeGlb(join(OUT_DIR, `${name}.glb`), repacked.json, repacked.bin);
        totalOut += bytes;
        rows.push({
            name,
            inMB: (statSync(file).size / 1048576).toFixed(2),
            outMB: (bytes / 1048576).toFixed(2),
            draws: (json.nodes.filter((n) => n.mesh != null).length),
            verts: mergeInfo.vertexTotal,
            clips: (repacked.json.animations ?? []).length,
            joints: repacked.json.skins[0].joints.length,
        });
    }

    console.table(rows);
    console.log(`合计 ${(totalIn / 1048576).toFixed(1)} MB → ${(totalOut / 1048576).toFixed(1)} MB`);
};

main();
