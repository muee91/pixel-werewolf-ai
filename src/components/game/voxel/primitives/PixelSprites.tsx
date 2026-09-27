// 体素场景精灵:像素道具、墓碑、营火、火炬、地形、怪物等。
// 道具/营火/火炬为原版 Minecraft 贴图逐像素转录(mc-sprites.ts),其余从 VOXEL_TOKENS 取色。
import React from 'react';
import { clsx } from 'clsx';
import { VOXEL_TOKENS as T } from '../../../../themes/voxel-tokens';
import { McSpriteCanvas, shadeHex } from './McSprite';

const pixel = { imageRendering: 'pixelated' as const };

/** 像素方块(装饰用,带内阴影高光) */
export const PixelBlock: React.FC<{ style?: React.CSSProperties; className?: string }> = ({ style, className }) => (
  <span
    className={clsx('block h-5 w-5 shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.2),inset_3px_3px_0_rgba(255,255,255,0.16)]', className)}
    style={style}
  />
);

// 道具类型 → 原版贴图(claw 无对应物,用骨头;crossbow 用弓)
const ITEM_SPRITE: Record<string, string> = {
  sword: 'sword',
  bow: 'bow',
  crossbow: 'bow',
  potion: 'potion',
  shield: 'shield',
  gem: 'spyglass',
  emerald: 'emerald',
  claw: 'bone',
  heart: 'heart',
  shovel: 'shovel',
  bread: 'bread',
  map: 'map',
};

/** 像素道具:原版 16×16 贴图转录。药水按角色色重着色瓶内液体。 */
export const PixelItem: React.FC<{ type: string; color?: string; small?: boolean }> = ({ type, color, small }) => {
  const name = ITEM_SPRITE[type] ?? 'torch';
  const tint = type === 'potion' && color
    ? { '#d46d49': color, '#a94725': shadeHex(color, 0.72), '#973716': shadeHex(color, 0.5) }
    : undefined;
  return <McSpriteCanvas name={name} px={small ? 1 : 2} tint={tint} />;
};

/** DEAD 戳 */
export const DeadStamp: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <span
    className={clsx(
      'relative -rotate-6 border-[3px] font-black text-white',
      compact ? 'px-1 py-0 text-[8px]' : 'px-2 py-0.5 text-[10px]'
    )}
    style={{
      background: T.deadStamp,
      borderColor: T.ink,
      textShadow: `1px 1px 0 ${T.ink}`,
      boxShadow: `2px 2px 0 ${T.ink}, 0 0 10px rgba(179,25,35,0.75)`,
    }}
  >
    DEAD
    <span className="absolute -bottom-1 left-2 h-2 w-1" style={{ background: T.deadStamp }} />
    <span className="absolute -bottom-2 right-3 h-3 w-1.5" style={{ background: T.deadStamp }} />
  </span>
);

/** 墓碑(死亡玩家占位) */
export const PixelGrave: React.FC<{ seed: number; speaking?: boolean }> = ({ seed, speaking }) => (
  <div className="relative h-[50px] w-[38px] shrink-0" style={pixel}>
    <div
      className="absolute bottom-0 left-[5px] h-[36px] w-[28px] border-[3px]"
      style={{
        background: T.stone,
        borderColor: T.ink,
        boxShadow: speaking ? `0 0 0 3px ${T.torch}, 0 0 18px ${T.torch}` : 'inset -4px -4px 0 rgba(0,0,0,0.24)',
        clipPath: 'polygon(0 28%, 18% 0, 82% 0, 100% 28%, 100% 100%, 0 100%)',
      }}
    />
    <div className="absolute bottom-[19px] left-[14px] h-2 w-10 rotate-90 bg-[#343a40]" />
    <div className="absolute bottom-[24px] left-[12px] h-2 w-14 bg-[#343a40]" />
    <div className="absolute bottom-0 left-0 h-2 w-full bg-[#343a40]" />
    <div className="absolute bottom-[4px] left-[8px] text-[8px] font-black text-[#1d2430]">{String(seed).padStart(2, '0')}</div>
  </div>
);

/** 营火:原版贴图 + 呼吸光晕 */
export const PixelCampfire: React.FC = () => (
  <div className="relative h-20 w-24" style={pixel}>
    <div className="absolute inset-0" style={{ background: 'radial-gradient(closest-side, rgba(246,180,67,0.35), transparent)', animation: 'vw-glow 1.6s steps(2) infinite' }} />
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><McSpriteCanvas name="campfire" px={5} /></div>
  </div>
);

/** 火炬:原版贴图 */
export const PixelTorch: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <div className="absolute h-10 w-8" style={{ left: `${x}%`, bottom: y, ...pixel }}>
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><McSpriteCanvas name="torch" px={2} /></div>
  </div>
);

/** 怪物(狼/村民):按原版配色风格化的侧视像 */
export const PixelMob: React.FC<{ type: 'wolf' | 'villager' }> = ({ type }) => (
  <div className="relative h-14 w-20 opacity-90" style={pixel}>
    {type === 'wolf' ? (
      <>
        <div className="absolute bottom-3 left-4 h-7 w-11 bg-[#a5a5a5]" />
        <div className="absolute bottom-7 left-1 h-6 w-7 bg-[#b8b8b8]" />
        <div className="absolute bottom-11 left-1 h-3 w-3 bg-[#b8b8b8]" />
        <div className="absolute bottom-8 left-5 h-2 w-2" style={{ background: T.redstone }} />
        {[10, 24, 42, 54].map(x => <span key={x} className="absolute bottom-0 h-4 w-2 bg-[#7d7d7d]" style={{ left: x }} />)}
      </>
    ) : (
      <>
        <div className="absolute bottom-3 left-6 h-8 w-8 bg-[#7a5c3f]" />
        <div className="absolute bottom-11 left-5 h-5 w-10 bg-[#bd8e63]" />
        <div className="absolute bottom-13 left-10 h-5 w-5 bg-[#9c7146]" />
        <span className="absolute bottom-13 left-7 h-1.5 w-1.5 bg-black" />
        <span className="absolute bottom-13 right-7 h-1.5 w-1.5 bg-black" />
      </>
    )}
  </div>
);

/** 矿车(方形车轮,贴合像素语言) */
export const PixelMineCart: React.FC = () => (
  <div className="relative h-20 w-44" style={pixel}>
    <div className="absolute bottom-2 left-0 right-0 h-2 bg-[#15191e]" />
    <div className="absolute bottom-6 left-12 h-10 w-20 border-[4px]" style={{ background: T.stone, borderColor: T.ink, boxShadow: 'inset -6px -6px 0 rgba(0,0,0,0.26)' }} />
    <div className="absolute bottom-1 left-14 h-5 w-5 border-[4px] bg-[#22272d]" style={{ borderColor: T.ink }} />
    <div className="absolute bottom-1 right-14 h-5 w-5 border-[4px] bg-[#22272d]" style={{ borderColor: T.ink }} />
    <div className="absolute left-4 top-0 h-8 w-8" style={{ background: T.emerald, boxShadow: `0 0 16px ${T.emerald}` }} />
    <div className="absolute right-6 top-2 h-7 w-7" style={{ background: '#7f5bd6', boxShadow: '0 0 16px #7f5bd6' }} />
  </div>
);

/** 红石机械 */
export const PixelRedstoneRig: React.FC = () => (
  <div className="relative h-20 w-44" style={pixel}>
    <div className="absolute left-0 right-0 top-9 h-3" style={{ background: T.redstone, boxShadow: `0 0 16px ${T.redstone}` }} />
    {[0, 1, 2, 3].map(i => (
      <div key={i} className="absolute top-3 h-12 w-12 border-[3px] bg-[#5f6770]" style={{ left: `${i * 44}px`, borderColor: T.ink, boxShadow: 'inset -5px -5px 0 rgba(0,0,0,0.22)' }}>
        <span className="absolute left-3 top-3 h-5 w-5" style={{ background: T.redstone, boxShadow: `0 0 14px ${T.redstone}` }} />
      </div>
    ))}
  </div>
);

/** 地形条(底部方块带,带原版风格的噪点纹理) */
export const TerrainStrip: React.FC<{ mine?: boolean; redstone?: boolean }> = ({ mine, redstone }) => {
  const blocks = mine
    ? ['#42484f', '#343a40', T.stone, '#22272d', '#42484f', '#59616a']
    : redstone
      ? ['#5a3528', '#3f241d', T.redstone, '#5a3528', '#3f241d', T.dirt]
      : [T.grass, T.grassDark, T.dirt, T.grass, T.wood, T.grassDark];
  return (
    <div className="absolute bottom-0 left-0 right-0 grid h-16 grid-cols-12">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className="border-r border-t border-black/20"
          style={{
            background: blocks[i % blocks.length],
            backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.1) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.1) 75%), linear-gradient(45deg, rgba(255,255,255,0.07) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.07) 75%)',
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 4px 4px',
            boxShadow: 'inset -5px -5px 0 rgba(0,0,0,0.18), inset 3px 3px 0 rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  );
};
