import React, { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

/**
 * 营地道具（KayKit Dungeon Remastered，CC0，可商用免署名）。
 *
 * 为什么引这套：营地里原有的木屋/水井/瞭望塔都是自己用盒子搭的，方方正正没问题，
 * 但"有人在这儿生活"的痕迹（酒桶、木箱、柴堆、桌子）靠盒子堆不出体积感。
 * 这套模型和角色模型出自同一位作者（Kay Lousberg）、同一张渐变贴图，
 * 放进同一个场景里不会有"两种画风拼在一起"的感觉。
 *
 * 实现要点：模型原始尺寸不一致（有的按 1 格、有的半格），所以不写死 scale，
 * 而是按目标高度换算 —— 每个道具只声明"我想要它多高"，其余交给包围盒。
 */

export const KAYKIT_PROP_NAMES = [
    'barrel_large',
    'barrel_small_stack',
    'crates_stacked',
    'trunk_medium_A',
    'keg',
    'table_small',
    'stool',
    'torch_lit',
    'banner_red',
    'chest',
] as const;

export type KayKitPropName = (typeof KAYKIT_PROP_NAMES)[number];

export const kayKitPropUrl = (name: KayKitPropName): string => `models/kaykit-props/${name}.glb`;

/** 进 3D 场景时把道具也预取（约 630 KB，本地文件） */
export const preloadKayKitProps = (): void => {
    for (const name of KAYKIT_PROP_NAMES) useGLTF.preload(kayKitPropUrl(name));
};

export interface KayKitPropSpec {
    name: KayKitPropName;
    x: number;
    z: number;
    /** 想要的高度（米）：从地面算起 */
    height: number;
    rotationY?: number;
}

const KayKitProp: React.FC<KayKitPropSpec & { y: number }> = ({ name, x, y, z, height, rotationY = 0 }) => {
    const { scene } = useGLTF(kayKitPropUrl(name));
    const prepared = useMemo(() => {
        const clone = scene.clone(true);
        clone.traverse((node) => {
            if (node instanceof THREE.Mesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        return clone;
    }, [scene]);

    // 原始包围盒 → 换算成"高 height、底面贴地、水平居中"
    const fit = useMemo(() => {
        const box = new THREE.Box3().setFromObject(prepared);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = height / Math.max(0.001, size.y);
        return {
            scale,
            offsetX: -((box.min.x + box.max.x) / 2) * scale,
            offsetY: -box.min.y * scale,
            offsetZ: -((box.min.z + box.max.z) / 2) * scale,
        };
    }, [prepared, height]);

    return (
        <group position={[x, y, z]} rotation={[0, rotationY, 0]}>
            <primitive
                object={prepared}
                scale={fit.scale}
                position={[fit.offsetX, fit.offsetY, fit.offsetZ]}
            />
        </group>
    );
};

/** 一组道具：外层统一挂 Suspense，某一只还没下完不会让整场景闪 */
export const KayKitPropGroup: React.FC<{
    specs: KayKitPropSpec[];
    heightAt: (x: number, z: number) => number;
}> = ({ specs, heightAt }) => (
    <Suspense fallback={null}>
        {specs.map((spec, i) => (
            <KayKitProp key={`${spec.name}-${i}`} {...spec} y={heightAt(spec.x, spec.z)} />
        ))}
    </Suspense>
);
