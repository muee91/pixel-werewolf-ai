// 8×8 像素图标集:点阵渲染,与方块 UI 语言一致。
// '.'=透明;'#'=主色;其余字符查该图标的 palette 调色板 → 多彩图标。
// 未显式传 color 时用内置彩色;显式传 color 则整枚单色(兼容旧调用)。
// 新图标建议:先画 '#' 草稿再收敛,保持 8×8 内可辨识;需要多彩时用调色板字符。
import React from 'react';

export type PixelIconName =
    | 'palette' | 'sword' | 'chip' | 'player' | 'wrench'
    | 'boom' | 'badge' | 'sheriff' | 'vote' | 'chat' | 'flag'
    | 'speaker' | 'sound' | 'moon' | 'sun' | 'check';

// MC 物品色板(取自 voxel tokens 附近色系,深浅底上都可读)
const C = {
    wood: '#8b5a2b',
    steel: '#c9ced6',
    gold: '#f6b443',
    red: '#d94b3d',
    green: '#48c774',
    blue: '#3c44aa',
    navy: '#3c4f76',
    cyan: '#4dd6e0',
    yellow: '#f6e05e',
    orange: '#f9842b',
    paper: '#f7f1e3',
    ink: '#24170e',
    skin: '#c68863',
    hair: '#4a2f1d',
    teal: '#0e8a80',
} as const;

type IconDef = {
    rows: string[];
    /** '#' 主色;缺省回落 currentColor */
    color?: string;
    /** 扩展字符颜色:存在时图标自动多彩 */
    palette?: Record<string, string>;
};

const ICONS: Record<PixelIconName, IconDef> = {
    // 调色板(外观):木框 + 四色颜料点
    palette: {
        rows: [
            '..####..',
            '.#....#.',
            '#.r..y.#',
            '#......#',
            '#.b..g.#',
            '#......#',
            '.#....#.',
            '..####..',
        ],
        color: C.wood,
        palette: { r: C.red, y: C.yellow, b: C.blue, g: C.green },
    },
    // 钻石剑(游戏):青金刚刃 + 金柄
    sword: {
        rows: [
            '......dd',
            '.....ddd',
            '....ddd.',
            '...ddd..',
            '..ddd...',
            '.ydd....',
            'yd......',
            'y.......',
        ],
        palette: { d: C.cyan, y: C.gold },
    },
    // 芯片(模型):金脚 + 绿身
    chip: {
        rows: [
            '.y.y.y..',
            '.ggggg..',
            '.ggggg..',
            'yggcggy.',
            '.ggggg..',
            '.ggggg..',
            '.y.y.y..',
            '........',
        ],
        palette: { y: C.gold, g: '#2f7a3d', c: '#a8e6a8' },
    },
    // Steve 小人(玩家):发肤衣裤四色
    player: {
        rows: [
            '..hhhh..',
            '..ffff..',
            '..ffff..',
            '..tttt..',
            '.tttttt.',
            '.f.tt.f.',
            '..bbbb..',
            '..b..b..',
        ],
        palette: { h: C.hair, f: C.skin, t: C.teal, b: C.blue },
    },
    // 扳手(高级):钢色
    wrench: {
        rows: [
            '..ssss..',
            '.ssssss.',
            '.ss..ss.',
            '.ss..sss',
            '...s.ss.',
            '..s..s..',
            '.s....s.',
            'n.....s.',
        ],
        color: C.steel,
        palette: { n: C.wood },
    },
    // 爆炸(狼人自爆):橙火星 + 红焰 + 黄心
    boom: {
        rows: [
            'o..o..o.',
            '.o.o.o..',
            '..ooo...',
            'orryyro.',
            '.orrro..',
            '..ooo...',
            '.o.o.o..',
            'o..o..o.',
        ],
        palette: { o: C.orange, r: C.red, y: C.yellow },
    },
    // 金徽(警徽):金身红章
    badge: {
        rows: [
            '..yyyy..',
            '.yyyyyy.',
            'yyyyyyyy',
            'yyyrryyy',
            'yyyyyyyy',
            '.yyyyyy.',
            '..yyyy..',
            '...yy...',
        ],
        color: C.gold,
        palette: { r: C.red },
    },
    // 警帽(警长):藏青帽 + 金带
    sheriff: {
        rows: [
            '..nnnn..',
            '.nnnnnn.',
            'nnnnnnnn',
            'nnnnnnnn',
            '........',
            '.yyyyyy.',
            'yyyyyyyy',
            '........',
        ],
        palette: { n: C.navy, y: C.gold },
    },
    // 投票箱(投票):纸票 + 木箱
    vote: {
        rows: [
            '.wwwwww.',
            '.wwwwww.',
            'nnnnnnnn',
            'nnkkkknn',
            'nnkkkknn',
            'nnnnnnnn',
            '.nnnnnn.',
            '........',
        ],
        palette: { w: C.paper, n: C.wood, k: C.ink },
    },
    // 对话(讨论):纸气泡 + 墨点
    chat: {
        rows: [
            '........',
            '.wwwwww.',
            'wwwwwwww',
            'ww.kk.ww',
            'wwwwwwww',
            '.wwwwww.',
            '..w.....',
            '.w......',
        ],
        palette: { w: C.paper, k: C.ink },
    },
    // 旗帜(退水):木杆红旗
    flag: {
        rows: [
            '.nrrrrr.',
            '.nrrrrr.',
            '.nrrrrr.',
            '.nrrrrr.',
            '.n......',
            '.n......',
            '.n......',
            '.n......',
        ],
        palette: { n: C.wood, r: C.red },
    },
    // 扬声器(语音):钢喇叭 + 绿声波
    speaker: {
        rows: [
            '...s....',
            '..ss....',
            '.sss.g..',
            'ssss..g.',
            'ssss..g.',
            '.sss.g..',
            '..ss....',
            '...s....',
        ],
        palette: { s: C.steel, g: C.green },
    },
    // 声波(环境声):金外弧 + 绿内弧
    sound: {
        rows: [
            '......y.',
            '.....yg.',
            '....y..g',
            '..g.y..g',
            '..g.y..g',
            '....y..g',
            '.....yg.',
            '......y.',
        ],
        palette: { y: C.gold, g: C.green },
    },
    // 月亮(入夜):冷纸色
    moon: {
        rows: [
            '...###..',
            '..##....',
            '.##.....',
            '.##.....',
            '.##.....',
            '.##.....',
            '..##....',
            '...###..',
        ],
        color: '#e8e0c0',
    },
    // 勾(选中态):翡翠绿
    check: {
        rows: [
            '.......#',
            '......##',
            '.....###',
            '#...###.',
            '##..##..',
            '.####...',
            '..##....',
            '........',
        ],
        color: C.green,
    },
    // 太阳(天亮):金盘橙芒
    sun: {
        rows: [
            '...o....',
            '.o.yyy..',
            '..yyyyy.',
            '.yyyyyy.',
            '.yyyyyy.',
            '.yyyyy..',
            '..yyy.o.',
            '...o....',
        ],
        palette: { y: C.yellow, o: C.orange },
    },
};

export interface PixelIconProps {
    name: PixelIconName;
    /** 单像素边长,默认 3(总尺寸 24px) */
    px?: number;
    /** 显式单色:传入后整枚图标用此色渲染;缺省走图标内置多彩 */
    color?: string;
    /** 强制单色(取 currentColor 或 color) */
    mono?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export const PixelIcon: React.FC<PixelIconProps> = ({ name, px = 3, color, mono, className, style }) => {
    const def = ICONS[name];
    if (!def) return null;
    const explicit = mono || (color != null && color !== 'currentColor');
    const cells: React.ReactNode[] = [];
    def.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const ch = row[x];
            if (ch === '.') continue;
            let fill: string;
            if (explicit) fill = color ?? 'currentColor';
            else if (ch === '#') fill = def.color ?? 'currentColor';
            else fill = def.palette?.[ch] ?? def.color ?? 'currentColor';
            cells.push(
                <span
                    key={`${x}-${y}`}
                    style={{
                        position: 'absolute',
                        left: x * px,
                        top: y * px,
                        width: px,
                        height: px,
                        background: fill,
                    }}
                />,
            );
        }
    });
    return (
        <span
            aria-hidden="true"
            className={className}
            style={{ position: 'relative', display: 'inline-block', width: 8 * px, height: def.rows.length * px, ...style }}
        >
            {cells}
        </span>
    );
};
