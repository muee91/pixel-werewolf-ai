import * as THREE from 'three';

// 方块贴图：程序化生成的原创 16×16 贴图（scripts/gen-pixel-art.ts），草/树叶已在生成时按群系色着色。
// NearestFilter 保持硬像素。
import { CAMP_BLOCKS } from './camp-blocks';

const SIZE = 16;

type Ctx = CanvasRenderingContext2D;

const px = (ctx: Ctx, x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
};

// 群系着色已前移到生成器
const TINTS: Record<string, string> = {}; // 群系色已在生成器内烘焙，渲染端不再二次乘色

const DRAWERS: Record<string, (ctx: Ctx) => void> = {};
for (const [name, sprite] of Object.entries(CAMP_BLOCKS)) {
    DRAWERS[name] = (ctx: Ctx) => {
        sprite.rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const color = sprite.palette[row[x]];
                if (color) px(ctx, x, y, color);
            }
        });
        const tint = TINTS[name];
        if (tint) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = tint;
            ctx.fillRect(0, 0, SIZE, SIZE);
            ctx.globalCompositeOperation = 'source-over';
        }
    };
}

export type TexName = keyof typeof DRAWERS;

const texCache = new Map<string, THREE.CanvasTexture>();

export function pixelTexture(name: TexName): THREE.CanvasTexture {
    let tex = texCache.get(name);
    if (!tex) {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d')!;
        DRAWERS[name](ctx);
        tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestMipmapLinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.generateMipmaps = true;
        texCache.set(name, tex);
    }
    return tex;
}

// ── 角色皮肤纹理 ─────────────────────────────────────────

const shadeHex = (hex: string, f: number): string => {
    const c = new THREE.Color(hex);
    if (f >= 1) c.lerp(new THREE.Color('#ffffff'), Math.min(1, f - 1));
    else c.multiplyScalar(f);
    return `#${c.getHexString()}`;
};

const charCache = new Map<string, THREE.CanvasTexture>();

function characterTexture(key: string, size: number, draw: (ctx: Ctx, tones: string[]) => void, base: string): THREE.CanvasTexture {
    let tex = charCache.get(key);
    if (!tex) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        draw(ctx, [base, shadeHex(base, 0.88), shadeHex(base, 1.08), shadeHex(base, 0.78)]);
        tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        charCache.set(key, tex);
    }
    return tex;
}

/** 皮肤噪点纹理（身体/手臂/腿部布料与皮肤通用） */
export function skinNoiseTexture(base: string): THREE.CanvasTexture {
    return characterTexture(`skin:${base}`, 8, (ctx, tones) => {
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const h = ((x * 73 + y * 151) % 97) / 97;
                px(ctx, x, y, tones[Math.floor(h * tones.length)]);
            }
        }
    }, base);
}

// ── 角色服饰细节（烘进贴图，零新增 draw call） ─────────────

const noiseBand = (ctx: Ctx, color: string, fromY: number, toY: number) => {
    const tones = [color, shadeHex(color, 0.88), shadeHex(color, 1.08), shadeHex(color, 0.78)];
    for (let y = fromY; y < toY; y++) {
        for (let x = 0; x < 8; x++) {
            const h = ((x * 73 + y * 151) % 97) / 97;
            px(ctx, x, y, tones[Math.floor(h * tones.length)]);
        }
    }
};

/**
 * 肢体分段贴图：画布上半 = 上段（袖子/裤腿），下半 = 下段（皮肤/靴子）。
 * 盒体 UV 画布顶边对应几何上缘，splitRatio 为上段占比。
 * 例：armTexture = limb(shirt, skin)，legTexture = limb(pants, boot)。
 */
export function limbTexture(upper: string, lower: string, splitRatio: number): THREE.CanvasTexture {
    const key = `limb:${upper}:${lower}:${splitRatio}`;
    let tex = charCache.get(key);
    if (!tex) {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d')!;
        const splitY = Math.max(1, Math.min(7, Math.round(8 * splitRatio)));
        noiseBand(ctx, upper, 0, splitY);
        noiseBand(ctx, lower, splitY, 8);
        tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        charCache.set(key, tex);
    }
    return tex;
}

/**
 * 躯干贴图：底噪为上衣，下缘两行织深色腰带，顶部中央两像素领口镶边——
 * 以贴图线条替代额外网格，保持角色 draw call 不变。
 */
export function torsoTexture(shirt: string, belt: string, accent: string): THREE.CanvasTexture {
    const key = `torso:${shirt}:${belt}:${accent}`;
    let tex = charCache.get(key);
    if (!tex) {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d')!;
        noiseBand(ctx, shirt, 0, 6);
        noiseBand(ctx, belt, 6, 8);
        // 领口镶边（顶行中央），俯仰视角可见的层次线索
        noiseBand(ctx, accent, 0, 1);
        px(ctx, 3, 0, belt);
        px(ctx, 4, 0, belt);
        tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        charCache.set(key, tex);
    }
    return tex;
}

// 营地村民正脸 8×8（scripts/gen-pixel-art.ts 生成）:肤色随角色色重映射,发际随角色发色
const FACE_ROWS: string[] = [
    'hhhhhhhh',
    'hssssssh',
    'ssssssss',
    'swisswis',
    'ssssssss',
    'sssnnsss',
    'ssrrrrss',
    'ssssssss',
];

const FACE_COLORS: Record<string, string> = { w: '#ffffff', i: '#523ca3', n: '#a9714a', r: '#9a1f1f' };

/** 头部正面:营地村民五官;肤色随角色色,发际随角色发色(与头顶/侧面的头发一致) */
export function faceTexture(skin: string, hair: string): THREE.CanvasTexture {
    return characterTexture(`face:${skin}:${hair}`, 8, (ctx, tones) => {
        const hairTones = [shadeHex(hair, 1), shadeHex(hair, 0.85)];
        FACE_ROWS.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const kind = row[x];
                if (kind === '.') continue;
                if (kind === 'h') px(ctx, x, y, hairTones[(x + y) % 2]);
                else if (kind === 's') px(ctx, x, y, tones[(x + y) % 2]);
                else px(ctx, x, y, FACE_COLORS[kind]);
            }
        });
    }, skin);
}
