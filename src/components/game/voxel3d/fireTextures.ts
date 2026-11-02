import * as THREE from 'three';

/**
 * 程序化火焰贴图：营火（方块营地）与圣殿祭坛（CryptHall）共用。
 *
 * 原本这段画布逻辑内联在 ForestCampScene 的 Campfire 里，地牢重置成非方块石殿后
 * 祭坛也要同一套火，复制一份必然两边调参走歪，所以抽出来。
 */

/** 火焰纹理分辨率（16×16 像素块，MC 风；非方块场景里只作为面片贴图，不显方块感） */
export const FIRE_TEX_SIZE = 16;

let fireCanvas: HTMLCanvasElement | null = null;

// Node 环境（单测导入）不触 DOM，首次绘制时才创建
const getFireCanvas = (): HTMLCanvasElement => {
    if (!fireCanvas) {
        fireCanvas = document.createElement('canvas');
        fireCanvas.width = FIRE_TEX_SIZE;
        fireCanvas.height = FIRE_TEX_SIZE;
    }
    return fireCanvas;
};

/** 按"每一列火舌多高"的数组重绘一帧火焰：底部白黄、中段橙、尖端红且透明渐隐 */
export const drawFireFrame = (heights: Float32Array): void => {
    const ctx = getFireCanvas().getContext('2d')!;
    ctx.clearRect(0, 0, FIRE_TEX_SIZE, FIRE_TEX_SIZE);
    for (let x = 0; x < FIRE_TEX_SIZE; x++) {
        const h = Math.round(heights[x]);
        for (let y = 0; y < h; y++) {
            const frac = (h - y) / h;            // 0=尖端 1=根部
            ctx.fillStyle = frac > 0.8 ? '#fff3b0'
                : frac > 0.5 ? '#ffd45a'
                : frac > 0.25 ? '#f6923a'
                : '#e0401a';
            ctx.globalAlpha = frac > 0.92 ? 0.5 : Math.min(1, 0.35 + frac * 0.75);
            ctx.fillRect(x, FIRE_TEX_SIZE - 1 - y, 1, 1);
        }
    }
    ctx.globalAlpha = 1;
};

/** 新建一张指向内部画布的火焰纹理（每处火焰各自一张，避免共享 needsUpdate） */
export const createFireTexture = (): THREE.CanvasTexture => {
    // 必须经 getFireCanvas() 拿画布：模块变量此刻还是 null，空图纹理会让
    // WebGLRenderer 每帧报 "no image data found" 且火苗永远不上传 GPU
    const tex = new THREE.CanvasTexture(getFireCanvas());
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

// ── 火光光晕 / 火星 / 烟共用的径向渐变贴图 ────────────────
// 全景镜头下火焰只剩几个像素，看不出"这桌围着火"。
// 用一张径向渐变做成始终朝向相机的 sprite，比再加一盏灯便宜，却能把火"点着"。
let glowTexture: THREE.CanvasTexture | null = null;

export const getGlowTexture = (): THREE.CanvasTexture => {
    if (!glowTexture) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,214,130,0.95)');
        g.addColorStop(0.32, 'rgba(255,152,52,0.42)');
        g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        glowTexture = new THREE.CanvasTexture(canvas);
        glowTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return glowTexture;
};

/** 冷光（月光/窗光）用的径向渐变：同一张渐变换色相，省一张贴图 */
let coldGlowTexture: THREE.CanvasTexture | null = null;

export const getColdGlowTexture = (): THREE.CanvasTexture => {
    if (!coldGlowTexture) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(214,236,255,0.85)');
        g.addColorStop(0.4, 'rgba(150,196,238,0.28)');
        g.addColorStop(1, 'rgba(110,160,210,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        coldGlowTexture = new THREE.CanvasTexture(canvas);
        coldGlowTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return coldGlowTexture;
};
