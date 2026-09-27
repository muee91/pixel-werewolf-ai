import type { GameLayout, HomeStyle, PlayerCardStyle } from '../../themes/types';

// ── 外观分区:选项卡的彩色迷你预览(纯 CSS 像素画,与 PixelIcon 同一色系) ──

export const HomeStylePreview = ({ id }: { id: HomeStyle }) => {
    if (id === 'survival-camp') {
        // 草地方砖 + 营火中轴
        return (
            <div className="relative w-full h-11 mb-2 overflow-hidden rounded-none" style={{ background: '#5b8c3e' }}>
                <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(#24170e22 1px, transparent 1px), linear-gradient(90deg, #24170e22 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="h-1.5 w-4" style={{ background: '#f9842b' }} />
                    <div className="mx-auto h-1 w-2" style={{ background: '#f6e05e' }} />
                </div>
                <div className="absolute left-1.5 top-1.5 h-2 w-2" style={{ background: '#c68863' }} />
                <div className="absolute right-1.5 top-1.5 h-2 w-2" style={{ background: '#0e8a80' }} />
            </div>
        );
    }
    if (id === 'redstone-lobby') {
        // 红石灯阵:中灯点亮
        return (
            <div className="relative w-full h-11 mb-2 overflow-hidden rounded-none" style={{ background: '#24170e' }}>
                {[0, 1, 2].map(i => (
                    <div key={i} className="absolute top-1/2 -translate-y-1/2 h-3 w-3" style={{ left: `${18 + i * 24}%`, background: i === 1 ? '#d94b3d' : '#7a2a22', boxShadow: i === 1 ? '0 0 8px #d94b3d' : undefined }} />
                ))}
                <div className="absolute bottom-1 left-2 right-2 h-1" style={{ background: '#8b5a2b' }} />
            </div>
        );
    }
    // block-harbor:木板码头 + 火把 + 告示牌
    return (
        <div className="relative w-full h-11 mb-2 overflow-hidden rounded-none" style={{ background: 'linear-gradient(180deg, #4b2d1a, #6b4423)' }}>
            <div className="absolute bottom-0 left-0 right-0 h-2.5" style={{ background: '#8b5a2b', backgroundImage: 'linear-gradient(90deg, #24170e33 1px, transparent 1px)', backgroundSize: '10px 100%' }} />
            <div className="absolute bottom-2.5 left-2 h-2 w-1" style={{ background: '#8b5a2b' }} />
            <div className="absolute bottom-[18px] left-1 h-1.5 w-2.5" style={{ background: '#f6b443', boxShadow: '0 0 6px #f6b443' }} />
            <div className="absolute top-1.5 right-2 h-3.5 w-7" style={{ background: '#a5713a', border: '1px solid #24170e' }} />
            <div className="absolute top-3 right-[13px] h-0.5 w-4" style={{ background: '#24170e' }} />
        </div>
    );
};

export const GameLayoutPreview = ({ id }: { id: GameLayout }) => {
    if (id === 'redstone-hub') {
        // 会话主屏 + 侧边红石告示牌
        return (
            <div className="relative w-full h-10 mb-2 overflow-hidden rounded-none flex gap-1 p-1" style={{ background: 'var(--color-bg)' }}>
                <div className="flex-1 flex flex-col gap-0.5 p-1" style={{ background: '#f2dfaa' }}>
                    <div className="h-1 w-3/4" style={{ background: '#24170e' }} />
                    <div className="h-1 w-1/2" style={{ background: '#24170e' }} />
                    <div className="h-1 w-2/3" style={{ background: '#7a5f35' }} />
                </div>
                <div className="w-5 flex flex-col gap-1 items-center justify-center">
                    <div className="h-2 w-2" style={{ background: '#d94b3d', boxShadow: '0 0 4px #d94b3d' }} />
                    <div className="h-2 w-2" style={{ background: '#7a2a22' }} />
                    <div className="h-2 w-2" style={{ background: '#7a2a22' }} />
                </div>
            </div>
        );
    }
    if (id === 'survival-log') {
        // 木箱日志墙 + 底部热栏
        return (
            <div className="relative w-full h-10 mb-2 overflow-hidden rounded-none p-1 pb-4" style={{ background: 'var(--color-bg)' }}>
                <div className="h-1.5 mb-0.5" style={{ background: '#8b5a2b' }} />
                <div className="h-1.5 mb-0.5" style={{ background: '#a5713a' }} />
                <div className="h-1.5" style={{ background: '#8b5a2b' }} />
                <div className="absolute bottom-1 left-1 right-1 flex gap-0.5">
                    {['#d94b3d', '#f6b443', '#48c774', '#4dd6e0'].map(c => (
                        <div key={c} className="h-2 flex-1" style={{ background: '#5a5a5a', border: '1px solid #24170e' }}>
                            <div className="h-full w-1/2" style={{ background: c }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    // block-arena:营火居中,玩家围坐
    return (
        <div className="relative w-full h-10 mb-2 overflow-hidden rounded-none" style={{ background: 'var(--color-bg)' }}>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="h-2 w-3" style={{ background: '#f9842b' }} />
                <div className="mx-auto h-1 w-1.5" style={{ background: '#f6e05e' }} />
            </div>
            {[['12%', '20%'], ['45%', '8%'], ['78%', '20%'], ['12%', '68%'], ['78%', '68%'], ['45%', '80%']].map(([l, t], i) => (
                <div key={i} className="absolute h-1.5 w-1.5" style={{ left: l, top: t, background: ['#c68863', '#0e8a80', '#3c44aa', '#d94b3d', '#48c774', '#f6b443'][i] }} />
            ))}
        </div>
    );
};

export const CardStylePreview = ({ id }: { id: PlayerCardStyle }) => {
    if (id === 'totem-badge') {
        // 徽章居中
        return (
            <div className="relative w-full h-10 mb-2 overflow-hidden rounded-none flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
                <div className="h-6 w-6 flex items-center justify-center" style={{ background: '#f6b443', border: '2px solid #24170e' }}>
                    <div className="h-3 w-3" style={{ background: '#48c774', border: '1px solid #24170e' }} />
                </div>
            </div>
        );
    }
    if (id === 'hotbar-strip') {
        // 横向槽位
        return (
            <div className="relative w-full h-10 mb-2 overflow-hidden rounded-none flex items-stretch gap-0.5 p-1.5" style={{ background: 'var(--color-bg)' }}>
                {['#d94b3d', '#48c774', '#4dd6e0', '#f6e05e', '#0e8a80'].map((c, i) => (
                    <div key={c} className="h-5 flex-1 flex items-end p-0.5" style={{ background: '#5a5a5a', border: '1px solid #24170e' }}>
                        <div className="h-2.5 w-full" style={{ background: i % 2 === 0 ? c : 'transparent' }} />
                    </div>
                ))}
            </div>
        );
    }
    // name-sign:木牌名签
    return (
        <div className="relative w-full h-10 mb-2 overflow-hidden rounded-none flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
            <div className="h-5 w-3/4 p-1" style={{ background: '#a5713a', border: '2px solid #24170e' }}>
                <div className="h-1 w-2/3 mb-0.5" style={{ background: '#24170e' }} />
                <div className="h-1 w-1/2" style={{ background: '#24170e', opacity: 0.6 }} />
            </div>
        </div>
    );
};
