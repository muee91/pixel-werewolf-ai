/**
 * 形象编辑器：2D 像素造型 + 4 个色槽 + 体型/发型，带实时预览。
 *
 * 为什么要有这个：
 * 2D 视角的人物素材曾只有两张 16×28 矩阵（knight / elf），座位号 %2 决定用哪张，
 * 12 个座位必有 6 对双胞胎；3D 的颜色又是 seed 取模派生的，改不了。
 * 这里把"长什么样"变成可改的数据：造型 13 选 1（前 12 种剪影互不相同）、
 * 4 个色槽任意配、体型 4 档（2D 与 3D 都生效）、发型 4 种（3D）。
 * 配色在 2D 通过调色板重映射生效，在 3D 直接当材质色。
 */
import { clsx } from 'clsx';
import {
    BUILD_DESCRIPTIONS, BUILD_LABELS, BUILD_ORDER, HAIR_STYLE_LABELS, LOOK_HAIR_COLORS,
    LOOK_PRESETS, LOOK_PRIMARY_COLORS, LOOK_SECONDARY_COLORS, LOOK_SKIN_COLORS,
    SPRITE_LABELS, SPRITE_ORDER, buildHeadTint, buildScale, describeLook, randomLook, spriteHeadKey,
    type AvatarBuild, type AvatarLook,
} from '../../utils/avatarLook';
import { CampSpriteCanvas } from '../game/voxel/primitives/CampSprite';
import { PixelAvatar } from '../game/voxel/primitives';

const HEX: Record<string, string> = {
    ink: '#24170e',
    paper: '#f2dfaa',
};

interface AvatarLookEditorProps {
    value: AvatarLook;
    onChange: (next: AvatarLook) => void;
    /** 名字/座位用于预览上的说明 */
    name?: string;
}

/** 色板一行：等宽色块，选中给 3px 墨色外框 + 内白描边（深色块上也看得见） */
const ColorRow = ({ label, colors, value, onPick }: {
    label: string;
    colors: string[];
    value: string;
    onPick: (color: string) => void;
}) => (
    <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 text-xs font-bold" style={{ color: 'var(--color-muted)' }}>{label}</span>
        <div className="flex flex-wrap gap-1.5">
            {colors.map(color => {
                const active = color.toLowerCase() === value.toLowerCase();
                return (
                    <button
                        key={color}
                        type="button"
                        title={color}
                        aria-label={`${label} ${color}`}
                        aria-pressed={active}
                        onClick={() => onPick(color)}
                        className="h-7 w-7 rounded-none transition-transform active:scale-95"
                        style={{
                            background: color,
                            border: `3px solid ${HEX.ink}`,
                            boxShadow: active ? `0 0 0 2px ${HEX.paper}, 0 0 0 5px var(--color-accent1)` : 'none',
                        }}
                    />
                );
            })}
        </div>
    </div>
);

/** 2D 精灵预览：直接复用游戏里的像素渲染（含调色板重映射） */
const SpritePreview = ({ look }: { look: AvatarLook }) => (
    <div data-testid="sprite-look-preview" className="flex h-[112px] w-[80px] items-center justify-center overflow-hidden border-[3px]"
        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        {/* 预览按 1.9 倍放大：游戏内是 px=2（32×56），在 80×112 的框里太小看不清配色 */}
        <div style={{ transform: 'scale(1.9)', transformOrigin: 'center' }}>
            <PixelAvatar seed={0} look={look} preview />
        </div>
    </div>
);

/**
 * 3D 示意：不引 three（设置页里开一个 Canvas 只为看颜色不划算），
 * 用三层方块按体型缩放拼一个同比例的小人，颜色、体型、发型都能看出来。
 */
const VoxelPreview = ({ look }: { look: AvatarLook }) => {
    const [sx, sy] = buildScale(look.build);
    const hair = look.hair;
    return (
        <div data-testid="voxel-look-preview" className="flex h-[112px] w-[80px] items-end justify-center overflow-hidden border-[3px] pb-2"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <div style={{ transform: `scale(${sx}, ${sy})`, transformOrigin: 'bottom center' }}>
                {/* 头 + 发型 */}
                <div style={{ position: 'relative', width: 34, height: 34, background: look.skin, border: `3px solid ${HEX.ink}`, margin: '0 auto' }}>
                    <div style={{ position: 'absolute', left: -3, right: -3, top: -3, height: 11, background: hair, border: `3px solid ${HEX.ink}`, borderBottom: 'none' }} />
                    {look.hairStyle === 1 && (
                        <div style={{ position: 'absolute', left: -3, right: -3, top: 8, height: 7, background: hair, borderTop: `2px solid ${HEX.ink}` }} />
                    )}
                    {look.hairStyle === 2 && (
                        <div style={{ position: 'absolute', left: -3, right: -3, top: 8, bottom: -3, background: hair, opacity: 0.92, zIndex: -1 }} />
                    )}
                    {look.hairStyle === 3 && (
                        <>
                            <div style={{ position: 'absolute', left: -8, top: 8, width: 7, height: 14, background: hair, border: `2px solid ${HEX.ink}` }} />
                            <div style={{ position: 'absolute', right: -8, top: 8, width: 7, height: 14, background: hair, border: `2px solid ${HEX.ink}` }} />
                        </>
                    )}
                </div>
                {/* 身体 */}
                <div style={{ width: 34, height: 40, background: look.primary, border: `3px solid ${HEX.ink}`, margin: '0 auto' }} />
                {/* 腿 */}
                <div style={{ display: 'flex', gap: 0, justifyContent: 'center' }}>
                    <div style={{ width: 16, height: 28, background: look.secondary, border: `3px solid ${HEX.ink}` }} />
                    <div style={{ width: 16, height: 28, background: look.secondary, border: `3px solid ${HEX.ink}` }} />
                </div>
            </div>
        </div>
    );
};

const Chip = ({ active, onClick, children, title }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title?: string;
}) => (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}
        className="rounded-none border-[3px] px-3 py-1.5 text-xs font-bold transition-all"
        style={{
            background: active ? 'var(--color-accent1)' : 'var(--color-bg)',
            color: active ? '#fff' : 'var(--color-fg)',
            borderColor: active ? 'var(--color-accent1)' : 'var(--color-border)',
        }}>
        {children}
    </button>
);

export const AvatarLookEditor = ({ value, onChange, name }: AvatarLookEditorProps) => {
    const patch = (part: Partial<AvatarLook>) => onChange({ ...value, ...part });
    // 造型格子里的迷你头像统一用当前配色：这样比较的是剪影，而不是"谁的颜色更醒目"
    const headTint = buildHeadTint(value);

    return (
        <div data-testid="avatar-look-editor" className="rounded-none border-[3px] p-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-accent1)' }}>形象（2D / 3D 通用）</div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                        {name ? `${name}：` : ''}{describeLook(value)}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={() => onChange(randomLook())}
                        title="随机一套形象"
                        className="shrink-0 rounded-none border-[3px] px-3 text-lg transition-all active:scale-95"
                        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>🎲</button>
                </div>
            </div>

            {/* 预览：左边是游戏里真实的 2D 像素形象，右边是同配色的 3D 体型示意 */}
            <div className="mt-3 flex items-end gap-3">
                <div className="text-center">
                    <SpritePreview look={value} />
                    <div className="mt-1 text-xs font-bold" style={{ color: 'var(--color-muted)' }}>2D 精灵</div>
                </div>
                <div className="text-center">
                    <VoxelPreview look={value} />
                    <div className="mt-1 text-xs font-bold" style={{ color: 'var(--color-muted)' }}>3D 体素</div>
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                    <div>配色与<b>体型</b>在 2D / 3D 都生效；<b>发型</b>只影响 3D 体素。</div>
                    <div>2D 共 {SPRITE_ORDER.length} 种剪影（前 12 种互不相同），12 人局按座位各取一款。</div>
                </div>
            </div>

            <div className="mt-4 space-y-3">
                {/* 造型按"真的能看出区别"来排：每格直接画这个骨架的头像（统一用当前配色，
                    这样眼睛比较的是剪影而不是颜色）。两个只差配色的造型（骑士/女骑士）排在最后。 */}
                <div>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="w-10 shrink-0 text-xs font-bold" style={{ color: 'var(--color-muted)' }}>造型</span>
                        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                            当前：<b style={{ color: 'var(--color-fg)' }}>{SPRITE_LABELS[value.sprite]}</b>
                        </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
                        {SPRITE_ORDER.map(sprite => {
                            const active = value.sprite === sprite;
                            return (
                                <button
                                    key={sprite}
                                    type="button"
                                    data-testid={`sprite-pick-${sprite}`}
                                    aria-pressed={active}
                                    title={SPRITE_LABELS[sprite]}
                                    onClick={() => patch({ sprite })}
                                    className="flex flex-col items-center gap-0.5 rounded-none border-[3px] px-1 py-1 transition-all active:scale-95"
                                    style={{
                                        background: active ? 'var(--color-accent1)' : 'var(--color-bg)',
                                        borderColor: active ? 'var(--color-accent1)' : 'var(--color-border)',
                                    }}
                                >
                                    <span className="flex h-6 items-end justify-center overflow-hidden">
                                        <CampSpriteCanvas name={spriteHeadKey(sprite)} px={3} tint={headTint} />
                                    </span>
                                    <span className="text-[10px] font-bold leading-none" style={{ color: active ? '#fff' : 'var(--color-muted)' }}>
                                        {SPRITE_LABELS[sprite]}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <ColorRow label="主色" colors={LOOK_PRIMARY_COLORS} value={value.primary} onPick={primary => patch({ primary })} />
                <ColorRow label="副色" colors={LOOK_SECONDARY_COLORS} value={value.secondary} onPick={secondary => patch({ secondary })} />
                <ColorRow label="发色" colors={LOOK_HAIR_COLORS} value={value.hair} onPick={hair => patch({ hair })} />
                <ColorRow label="肤色" colors={LOOK_SKIN_COLORS} value={value.skin} onPick={skin => patch({ skin })} />

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="w-10 shrink-0 text-xs font-bold" style={{ color: 'var(--color-muted)' }}>体型</span>
                    {BUILD_ORDER.map(build => (
                        <Chip key={build} active={value.build === build} onClick={() => patch({ build: build as AvatarBuild })}
                            title={BUILD_DESCRIPTIONS[build]}>
                            {BUILD_LABELS[build]}
                        </Chip>
                    ))}
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{BUILD_DESCRIPTIONS[value.build]}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10 shrink-0 text-xs font-bold" style={{ color: 'var(--color-muted)' }}>发型</span>
                    {HAIR_STYLE_LABELS.map((label, index) => (
                        <Chip key={label} active={value.hairStyle === index} onClick={() => patch({ hairStyle: index })}>
                            {label}
                        </Chip>
                    ))}
                </div>
            </div>

            <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="mb-1.5 text-xs font-bold" style={{ color: 'var(--color-muted)' }}>现成形象</div>
                <div className="flex flex-wrap gap-2">
                    {LOOK_PRESETS.map(preset => (
                        <button key={preset.id} type="button" data-testid={`preset-${preset.id}`} onClick={() => onChange(preset.look)} title={preset.hint}
                            className={clsx('flex items-center gap-1.5 rounded-none border-[3px] px-2 py-1 text-xs font-bold transition-all')}
                            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}>
                            <span className="inline-block h-3.5 w-3.5 border-2" style={{ background: preset.look.primary, borderColor: HEX.ink }} />
                            <span className="inline-block h-3.5 w-3.5 border-2" style={{ background: preset.look.skin, borderColor: HEX.ink }} />
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
