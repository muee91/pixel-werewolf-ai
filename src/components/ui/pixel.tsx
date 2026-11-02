// 像素风 UI 原语：设置中心与各面板共用的控件层。
// 设计语言 = 直角 + 3px 描边卡片 + 1px 输入框 + 硬偏移阴影 + 主题 --color-* 变量。
// 新增控件请先来这里找，不要在页面里手写同义按钮/输入框。
import React, { useId } from 'react';
import { clsx } from 'clsx';
import { PixelIcon } from '../game/voxel/primitives';

export const Toggle = ({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
        aria-pressed={value}
        onClick={disabled ? undefined : onChange}
        className={clsx(
            'relative inline-flex h-11 w-12 flex-shrink-0 items-center justify-center rounded-none transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent2,#d94b3d)]',
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        )}
    >
        <span
            className={clsx(
                'relative flex h-6 w-11 rounded-none border-2 border-transparent',
                value ? 'bg-[var(--color-accent1)]' : 'bg-[var(--color-border)]'
            )}
        >
        <span
            className={clsx(
                'pointer-events-none inline-block h-5 w-5 transform rounded-none bg-[var(--voxel-paper)] shadow ring-0 transition duration-200 ease-in-out',
                value ? 'translate-x-5' : 'translate-x-0'
            )}
        />
        </span>
    </button>
);


export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>
        {children}
    </div>
);

export const OptionCard = ({
    active,
    onClick,
    children,
    className = '',
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={clsx(
            'relative block w-full text-left rounded-none border-2 cursor-pointer transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent2,#d94b3d)]',
            active
                ? 'border-[var(--color-accent1)] shadow-[0_0_16px_rgba(var(--color-accent1-rgb,246,180,67),0.15)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-accent1)] hover:shadow-[3px_3px_0_var(--voxel-ink)]',
            className
        )}
    >
        {active && (
            <span className="absolute right-1.5 top-1.5" style={{ color: 'var(--color-accent1)' }}>
                <PixelIcon name="check" px={2} />
            </span>
        )}
        {children}
    </button>
);

const inputBaseClasses = 'w-full border rounded-none p-3.5 font-medium transition-all shadow-[3px_3px_0_var(--voxel-ink)] bg-[var(--color-bg)] text-[var(--color-fg)] border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--color-accent1-rgb,246,180,67),0.2)] focus:border-[var(--color-accent1)] placeholder:text-[var(--color-muted)]';

// 页面里零散单行输入框直接套这个类，保证与 SettingsInput 同一形态
export const pixelInputClass = inputBaseClasses;

const FieldLabel = ({ children, color = 'var(--color-accent1)', htmlFor }: { children: React.ReactNode; color?: string; htmlFor?: string }) => (
    <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color }}>
        {children}
    </label>
);

export const SettingsInput = ({
    label, value, onChange, placeholder, type = 'text', sub, mono, labelColor,
}: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: React.HTMLInputTypeAttribute;
    sub?: string;
    mono?: boolean;
    labelColor?: string;
}) => {
    const inputId = useId();
    return (
    <div className="mb-5">
        <FieldLabel color={labelColor} htmlFor={inputId}>{label}</FieldLabel>
        <input
            id={inputId}
            type={type}
            value={value}
            onChange={onChange}
            className={clsx(inputBaseClasses, mono && 'font-mono text-xs')}
            placeholder={placeholder}
        />
        {sub && <p className="text-xs mt-1.5 ml-1" style={{ color: 'var(--color-muted)' }}>{sub}</p>}
    </div>
    );
};

// 主题化下拉：外观与 SettingsInput 一致（1px 描边 + 硬阴影 + 方形），原生弹层保底
export const PixelSelect = ({
    label, value, onChange, children, sub, mono, labelColor, className = '',
}: {
    label?: string;
    value: string | number;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode;
    sub?: string;
    mono?: boolean;
    labelColor?: string;
    className?: string;
}) => {
    const selectId = useId();
    return (
    <div className={clsx(label ? 'mb-5' : '', className)}>
        {label && <FieldLabel color={labelColor} htmlFor={selectId}>{label}</FieldLabel>}
        <div className="relative">
            <select
                id={selectId}
                value={value}
                onChange={onChange}
                className={clsx(
                    inputBaseClasses,
                    'appearance-none pr-9 cursor-pointer',
                    mono ? 'font-mono text-xs' : 'text-sm',
                )}
            >
                {children}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-muted)' }}>▼</span>
        </div>
        {sub && <p className="text-xs mt-1.5 ml-1" style={{ color: 'var(--color-muted)' }}>{sub}</p>}
    </div>
    );
};

// 像素滑杆：方块轨道（已填充段为主题色）+ 米色方形滑块，替代浏览器默认蓝色轨道
export const PixelSlider = ({
    label, value, min, max, step = 1, onChange, badge, minLabel, maxLabel, className = '',
}: {
    label?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    badge?: string;
    minLabel?: string;
    maxLabel?: string;
    className?: string;
}) => {
    const sliderId = useId();
    const percent = max > min ? ((Number(value) - min) / (max - min)) * 100 : 0;
    return (
        <div className={className}>
            {label && (
                <div className="flex items-center justify-between text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>
                    <label htmlFor={sliderId}>{label}</label>
                    {badge && (
                        <span className="font-mono font-bold px-2 py-0.5" style={{ background: 'var(--color-bg)', color: 'var(--color-accent1)' }}>
                            {badge}
                        </span>
                    )}
                </div>
            )}
            <input
                id={sliderId}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={onChange}
                className="pixel-slider w-full cursor-pointer"
                style={{ ['--pixel-fill' as string]: `${percent}%` }}
            />
            {(minLabel || maxLabel) && (
                <div className="flex justify-between text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>
                    <span>{minLabel}</span><span>{maxLabel}</span>
                </div>
            )}
        </div>
    );
};

export const ActionButton = ({
    children, onClick, variant = 'primary', size = 'md', width, disabled, className = '', title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'ghost' | 'dashed';
    size?: 'md' | 'sm';
    /**
     * 宽度策略。默认 `md` 满宽（分区主 CTA 的既有视觉语言），`sm` 自然宽度。
     * 放在一行里的次级按钮（如"下载内置小模型"旁边还有大段说明）传 'auto'，
     * 避免在 5xl 栏宽下变成一条又高又宽的色块把下方列表推下去。
     */
    width?: 'full' | 'auto';
    disabled?: boolean;
    className?: string;
    title?: string;
}) => {
    const sizes = {
        md: 'py-3 text-sm',
        sm: 'relative px-4 py-2 text-xs before:absolute before:-inset-y-2 before:left-0 before:right-0 before:content-[""]',
    };
    const resolvedWidth = width ?? (size === 'sm' ? 'auto' : 'full');
    const widths = { full: 'w-full', auto: 'w-auto px-5' };
    const variants = {
        // 主按钮 = accent1 底:字必须走墨色(白字压火把金只有 1.8:1)
        primary: 'bg-[var(--color-accent1)] hover:brightness-110 text-[var(--voxel-ink)] shadow-[4px_4px_0_var(--voxel-ink)]',
        danger: 'border border-[rgba(var(--color-accent2-rgb,217,75,61),0.4)] bg-[rgba(var(--color-accent2-rgb,217,75,61),0.12)] text-[var(--voxel-redstone-ink)] hover:bg-[rgba(var(--color-accent2-rgb,217,75,61),0.22)]',
        ghost: 'border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent1)]',
        dashed: 'border-2 border-dashed border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent1)]',
    };
    return (
        <button onClick={onClick} disabled={disabled} title={title}
            className={clsx('rounded-none font-bold transition-all active:scale-[0.98]', sizes[size], widths[resolvedWidth], variants[variant], disabled && 'opacity-40 cursor-not-allowed', className)}>
            {children}
        </button>
    );
};

// 子页返回按钮：四个编辑子页共用同一形态
export const BackButton = ({ onClick }: { onClick: () => void; hint?: string }) => (
    <button onClick={onClick} data-testid="subpage-back" className="text-sm font-bold flex items-center gap-1 transition-colors"
        style={{ color: 'var(--color-accent1)' }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        返回
    </button>
);

// 设置页头部的总览 chip。原来四个纯只读数字里，「主题＝方块营地」和下方选择器完全重复，
// 其余三个点不动；现在只留能跳的，点了直接去对应分区/存档页，点击即导航。
export const OverviewBadge = ({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) => {
    // 单行「标签 …… 数值」：原来是标签在上、数值在下，一块 250px 宽的方框里只有左半边有字，
    // 三块并排看着像没填完的表单。
    const content = (
        <>
            <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted)' }}>{label}</span>
            <span className="text-sm font-black" style={{ color: 'var(--color-fg)' }}>{value}</span>
        </>
    );
    const shell = 'flex w-full items-center justify-between gap-2 rounded-none border-[3px] px-3 py-2';
    if (!onClick) {
        return <div className={shell} style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>{content}</div>;
    }
    return (
        <button type="button" onClick={onClick}
            className={`${shell} text-left transition-all hover:shadow-[3px_3px_0_var(--voxel-ink)]`}
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
            {content}
        </button>
    );
};
