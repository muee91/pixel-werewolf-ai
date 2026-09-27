import * as THREE from 'three';

// 方块贴图:原版 Minecraft 16×16 方块贴图逐像素转录(脚本生成数据,勿手改像素值)。
// 草顶/树叶在原版中为灰度图,这里按原版规则乘以群系色。NearestFilter 保持硬像素。
import { MC_BLOCK_SPRITES, MC_STEVE_FACE } from './mc-block-sprites';

const SIZE = 16;

type Ctx = CanvasRenderingContext2D;

const px = (ctx: Ctx, x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
};

// 原版群系着色(平原):草 ≈ #91bd59,树叶 ≈ #48b518
const TINTS: Record<string, string> = { grassTop: '#91bd59', leaves: '#48b518' };

const DRAWERS: Record<string, (ctx: Ctx) => void> = {};
for (const [name, sprite] of Object.entries(MC_BLOCK_SPRITES)) {
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

// 原版 Steve 脸 8×8:h=发 w=眼白 i=虹膜 s=肤色(肤色随角色色重映射,发际随角色发色)
const STEVE_FACE_ROWS: string[] = [
    'hhhhhhhh',
    'hhhhhhhh',
    'hssssssh',
    'ssssssss',
    'swissiws',
    'ssssssss',
    'ssssssss',
    'ssssssss',
];

const FACE_COLORS: Record<string, string> = { w: '#ffffff', i: '#523ca3' };

/** 头部正面:原版 Steve 五官;肤色随角色色,发际随角色发色(与头顶/侧面的头发一致) */
export function faceTexture(skin: string, hair: string): THREE.CanvasTexture {
    return characterTexture(`face:${skin}:${hair}`, 8, (ctx, tones) => {
        const hairTones = [shadeHex(hair, 1), shadeHex(hair, 0.85)];
        STEVE_FACE_ROWS.forEach((row, y) => {
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
