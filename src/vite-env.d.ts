/// <reference types="vite/client" />

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Canvas 检查器（threejs-game-skills inspect-threejs-canvas.mjs）读取的渲染诊断。
// renderer.* 由 ForestCampScene 的 RenderDiagnostics 每帧从 renderer.info 发布，
// perf/note 由检查器的测试钩子在采样后合并写入。
interface THREEGameRendererDiagnostics {
    calls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
}

interface THREEGameDiagnostics {
    renderer?: THREEGameRendererDiagnostics;
    perf?: {
        fps?: number | null;
        frames?: number;
        windowMs?: number;
        drawCallsSampled?: number;
        trianglesSampled?: number;
    };
    note?: string;
}

interface Window {
    __THREE_GAME_DIAGNOSTICS__?: THREEGameDiagnostics;
}
