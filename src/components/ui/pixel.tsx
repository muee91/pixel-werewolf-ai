// 像素风 UI 原语：设置中心与各面板共用的控件层。
// 设计语言 = 直角 + 3px 描边卡片 + 1px 输入框 + 硬偏移阴影 + 主题 --color-* 变量。
// 新增控件请先来这里找，不要在页面里手写同义按钮/输入框。
import React from 'react';
import { clsx } from 'clsx';
import { PixelIcon } from '../game/voxel/primitives';

export const Toggle = ({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
        onClick={disabled ? undefined : onChange}
        className={clsx(
            'relative inline-flex h-6 w-11 flex-shrink-0 rounded-none border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            value ? 'bg-[var(--color-accent1)]' : 'bg-[var(--color-border)]'
        )}
    >
        <span
            className={clsx(
                'pointer-events-none inline-block h-5 w-5 transform rounded-none bg-white shadow ring-0 transition duration-200 ease-in-out',
                value ? 'translate-x-5' : 'translate-x-0'
            )}
        />
    </button>
);

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>
        {children}
    </div>
);

export const OptionCard = <T extends string>({
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
    <div
        onClick={onClick}
        className={clsx(
            'relative rounded-none border-2 cursor-pointer transition-all duration-200',
            active
                ? 'border-[var(--color-accent1)] shadow-[0_0_16px_rgba(var(--color-accent1-rgb,99,102,241),0.15)]'
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
    </div>
);

const inputBaseClasses = 'w-full border rounded-none p-3.5 font-medium transition-all shadow-[3px_3px_0_var(--voxel-ink)] bg-[var(--color-bg)] text-[var(--color-fg)] border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent1)]/20 focus:border-[var(--color-accent1)] placeholder:text-[var(--color-muted)]';

// 页面里零散单行输入框直接套这个类，保证与 SettingsInput 同一形态
export const pixelInputClass = inputBaseClasses;

const FieldLabel = ({ children, color = 'var(--color-accent1)' }: { children: React.ReactNode; color?: string }) => (
    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 ml-1" style={{ color }}>
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
}) => (
    <div className="mb-5">
        <FieldLabel color={labelColor}>{label}</FieldLabel>
        <input
            type={type}
            value={value}
            onChange={onChange}
            className={clsx(inputBaseClasses, mono && 'font-mono text-xs')}
            placeholder={placeholder}
        />
        {sub && <p className="text-[10px] mt-1.5 ml-1" style={{ color: 'var(--color-muted)' }}>{sub}</p>}
    </div>
);

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
}) => (
    <div className={clsx(label ? 'mb-5' : '', className)}>
        {label && <FieldLabel color={labelColor}>{label}</FieldLabel>}
        <div className="relative">
            <select
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
        {sub && <p className="text-[10px] mt-1.5 ml-1" style={{ color: 'var(--color-muted)' }}>{sub}</p>}
    </div>
);

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
    const percent = max > min ? ((Number(value) - min) / (max - min)) * 100 : 0;
    return (
        <div className={className}>
            {label && (
                <div className="flex items-center justify-between text-[11px] font-bold mb-2" style={{ color: 'var(--color-muted)' }}>
                    <span>{label}</span>
                    {badge && (
                        <span className="font-mono font-bold px-2 py-0.5" style={{ background: 'var(--color-bg)', color: 'var(--color-accent1)' }}>
                            {badge}
                        </span>
                    )}
                </div>
            )}
            <input
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
                <div className="flex justify-between text-[10px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
                    <span>{minLabel}</span><span>{maxLabel}</span>
                </div>
            )}
        </div>
    );
};

export const ActionButton = ({
    children, onClick, variant = 'primary', size = 'md', disabled, className = '', title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'ghost' | 'dashed';
    size?: 'md' | 'sm';
    disabled?: boolean;
    className?: string;
    title?: string;
}) => {
    const sizes = {
        md: 'w-full py-3 text-sm',
        sm: 'px-4 py-2 text-xs',
    };
    const variants = {
        primary: 'bg-[var(--color-accent1)] hover:brightness-110 text-white shadow-[4px_4px_0_var(--voxel-ink)]',
        danger: 'border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
        ghost: 'border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent1)]',
        dashed: 'border-2 border-dashed border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent1)]',
    };
    return (
        <button onClick={onClick} disabled={disabled} title={title}
            className={clsx('rounded-none font-bold transition-all active:scale-[0.98]', sizes[size], variants[variant], disabled && 'opacity-40 cursor-not-allowed', className)}>
            {children}
        </button>
    );
};

// 子页返回按钮：四个编辑子页共用同一形态
export const BackButton = ({ onClick, hint }: { onClick: () => void; hint?: string }) => (
    <button onClick={onClick} className="text-sm font-bold flex items-center gap-1 transition-colors"
        style={{ color: 'var(--color-accent1)' }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        返回
    </button>
);

export const SectionStat = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-none border-[3px] px-3 py-2" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>{label}</div>
        <div className="mt-1 text-sm font-bold break-words" style={{ color: 'var(--color-fg)' }}>{value}</div>
    </div>
);

export const OverviewBadge = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-none border-[3px] px-4 py-3" style={{ background: 'var(--voxel-wood)', borderColor: 'var(--color-border)' }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--color-muted)' }}>{label}</div>
        <div className="mt-2 text-base font-black break-words" style={{ color: 'var(--color-fg)' }}>{value}</div>
    </div>
);
