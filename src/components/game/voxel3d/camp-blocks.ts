// 由 scripts/gen-pixel-art.ts 程序化生成，请勿手改；改动请改生成器后运行 npm run gen:art
// 原为 Minecraft 逐像素转录数据，已替换为项目原创的程序化像素（无第三方位素材、无 EULA 负担）。
// 草/树叶已按群系色着色，渲染端不再需要乘 tint。
export interface CampBlock { palette: Record<string, string>; rows: string[] }
export const CAMP_BLOCKS: Record<string, CampBlock> = {
  "grassTop": {
    "palette": {
      "A": "#649b41",
      "B": "#59883b",
      "C": "#76af49",
      "D": "#89c057"
    },
    "rows": [
      "AABAABACABBBABBA",
      "BDBBBAABAABAACBA",
      "ACAAAABABBBBACBB",
      "BCADAABBCBBBABCA",
      "ACBBBAAABBABCBBB",
      "ACBBBBBBBBAACACA",
      "ADBBBBABABBBABBB",
      "CABBBABBBABBBCCA",
      "BABBBBAABBBABBAB",
      "AABBAABACCBCBBBA",
      "BABCABBBBBBBBABB",
      "BBBBACBABCBBBBBB",
      "BBBACBACCBBBBABB",
      "BCBBBBABBAABBAAB",
      "BBBCBABBABBBBAAB",
      "BBBBBBABABBBBBAB"
    ]
  },
  "dirt": {
    "palette": {
      "A": "#5c4023",
      "B": "#97714a",
      "C": "#7a5730",
      "D": "#3b2a17"
    },
    "rows": [
      "AABCACCBDCAADADD",
      "DBBCABADDCADDDAC",
      "BCBCACAAADDCDDAD",
      "CCBBACADDADDDDDD",
      "AAABDADDDDDADDDD",
      "BCDCDDAADDADCDDC",
      "AADDDAAADCDADADD",
      "DDCCCDDDCAAACDDD",
      "ADDDDACAACDDDADD",
      "DDCCDDDDDCADDDDD",
      "AADCDDDDADDDADDD",
      "AACDACCDDDDDDDDD",
      "DDDADDDDAADDDDDD",
      "CAACCACCADDDDDDD",
      "DDDCADAAADDDDDDD",
      "DADDADCCDDDADDDD"
    ]
  },
  "stone": {
    "palette": {
      "A": "#5b6570",
      "B": "#3a4048",
      "C": "#818b96",
      "D": "#aab2bb"
    },
    "rows": [
      "ABCAACCABCBBBBCC",
      "ABDADDCBCBCCBABB",
      "DDDBBDBBACBAABBA",
      "AADCDCBBABAABCCB",
      "DCACBCABBCCAABBB",
      "AADABBBBBBABBBAB",
      "CDBABAABBBBABBCA",
      "AAAABABCBBBCBBBA",
      "CBAABCABBBBABBBA",
      "BAABAABCBBCBBBBB",
      "AACBCABABABBBBBB",
      "BABBBABBABABBBBB",
      "ABBABBABBCCBABBB",
      "ABBBBABBBBBBABAA",
      "BBABBBCBBAABAAAB",
      "AABBBABBABABBBAB"
    ]
  },
  "cobble": {
    "palette": {
      "A": "#140e0a",
      "B": "#3a4048",
      "C": "#aab2bb",
      "D": "#818b96",
      "E": "#5b6570"
    },
    "rows": [
      "ABCABADCADABEABA",
      "ABEADADEABABBABA",
      "ADBACAEBABABBABA",
      "ABEAEABBABABBABA",
      "ACDEEADBDBAEEEDA",
      "ACCBEABBDBABBBEA",
      "ADDBEAEBBBADBBBA",
      "ABBEEABBEBABBBEA",
      "ADDADAEBABAEBABA",
      "ABBABABBABABDAEA",
      "AEBAEABBADABDABA",
      "ABBABABBADABBABA",
      "ABBBBABBEDABBBBA",
      "AEBBBAEBDBABBBBA",
      "ABDBBABEBEABBBBA",
      "ADEBBABEBBABBBBA"
    ]
  },
  "logSide": {
    "palette": {
      "A": "#4c3018",
      "B": "#2f1d10",
      "C": "#6b4522"
    },
    "rows": [
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB",
      "ABACAAABAAACCAAB"
    ]
  },
  "logTop": {
    "palette": {
      "A": "#3d2412",
      "B": "#a9714a",
      "C": "#8b5a2b",
      "D": "#6b4020",
      "E": "#4c3018"
    },
    "rows": [
      "AABBBBBBBBBBBBAA",
      "ABBBBCCCCCCBBBBA",
      "BBBCCCCCCCCCCBBB",
      "BBCCCCDDDDCCCCBB",
      "BBCCCDDDDDDCCCBB",
      "BCCCDDDDDDDDCCCB",
      "BCCDDDAAAADDDCCB",
      "BCCDDDAEAADDDCCB",
      "BCCDDDAAAADDDCCB",
      "BCCDDDAAAADDDCCB",
      "BCCCDDDDDDDDCCCB",
      "BBCCCDDDDDDCCCBB",
      "BBCCCCDDDDCCCCBB",
      "BBBCCCCCCCCCCBBB",
      "ABBBBCCCCCCBBBBA",
      "AABBBBBBBBBBBBAA"
    ]
  },
  "leaves": {
    "palette": {
      "A": "#48a227",
      "B": "#3a8c21",
      "C": "#5bb734",
      "D": "#317a1a"
    },
    "rows": [
      "AABACBCCDBBBDDDB",
      "CBCBBDC.BBBDDDBB",
      "DAB.BDBBDBADDBDB",
      "AD.DAABDDDAD.DDA",
      "BBB.DDBDBBABDBDB",
      "DBBDBDB.DADDBDDB",
      "CADBBBABDAAADBB.",
      "DDDBADADDABDABBB",
      "ABDDBDB.DAABDBDD",
      "DDDDBADD.ABDDDDD",
      "DBBABDDADDABBDDD",
      "DADDDADDBDADDDDD",
      "DBBDBDDDDDBDDDBD",
      "BADDDDADDDDBBDDD",
      "DD.DBDDDDDDDDDDD",
      "DBBDDDDDDDBBDDDD"
    ]
  },
  "sand": {
    "palette": {
      "A": "#c0ad6a",
      "B": "#ddca8f",
      "C": "#8a7a4a",
      "D": "#f2e6b8"
    },
    "rows": [
      "AABBBCABAACAACCC",
      "BBABBAACAABAACCA",
      "AAADBDCACACCACCC",
      "BBABACCCACACACCA",
      "AACDCCCCCACCACBC",
      "ABBBCCCAACCCACCB",
      "AAAACCCCCABCCCBB",
      "CCCAACCCCCCCBCCC",
      "CACCCCCCCABCACCC",
      "ACCCACACCCCCCCCC",
      "CAABCACCCCCCCCAC",
      "AABBCACCCBACCCCC",
      "CCAACACAAACCCCCC",
      "ACCAACCACAACCCCC",
      "ACAABACACCCCCCCC",
      "ABCCAACCCCCCCCCC"
    ]
  },
  "birchSide": {
    "palette": {
      "A": "#8d8574",
      "B": "#fffcf5",
      "C": "#f2ecdf",
      "D": "#c9c2b0",
      "E": "#140e0a"
    },
    "rows": [
      "ABCDABCDABCDABCD",
      "BCEEEEDABCDABCDA",
      "CDABCDABCDABCDAB",
      "DABCDABCDABCDABC",
      "ABCDABEEEEEDABCD",
      "BEEEECDABCDABCDA",
      "CDABCDEEEDABCDAB",
      "DABCDABCDABCDABC",
      "ABCDABCDABCDABCD",
      "BCDABCDABCDABCDA",
      "CDABCDABCDABCDAB",
      "DABCDABCDAEEEEEC",
      "ABCDABCDABCDABCD",
      "BCDABCDABCDABCDA",
      "CDABCDABCDABCDAB",
      "DABCDABCDABCDABC"
    ]
  },
  "hay": {
    "palette": {
      "A": "#b08a1e",
      "B": "#d9b23c",
      "C": "#f2d774",
      "D": "#7a5a10"
    },
    "rows": [
      "ABBCAABABDADDDAB",
      "DABCDDAAABDBBDDD",
      "DDDDDDDDDDDAADDD",
      "BBBBADDDDDDDDDDD",
      "BBCCDDDAADDADDDD",
      "BDDAADDDADAADDDD",
      "DDDDDDDDADDDDDAD",
      "CDDDDDADDDDDDDDD",
      "DADDDAABAADADDDD",
      "BDBAADDDADBDDADD",
      "DDDDDDDDBAADDDDD",
      "ABADADDADDDDDDDD",
      "DBDDDDAADDADDDDD",
      "AADDBDDADADDDDDD",
      "DDDDDDDDADDDDDDD",
      "DDBABDDADDDDDDDD"
    ]
  },
  "planks": {
    "palette": {
      "A": "#2f1d10",
      "B": "#6b4020",
      "C": "#8b5a2b",
      "D": "#aab2bb",
      "E": "#a9714a"
    },
    "rows": [
      "AAAAAAAAAAAAAAAA",
      "BCCBDCECBCCCBBEB",
      "BCCBACECBCCCBBEB",
      "BCCBACECBCCCBBEB",
      "AAAAAAAAAAAAAAAA",
      "CCCECECBBECDCCCC",
      "CCCECECBBECACCCC",
      "CCCECECBBECACCCC",
      "AAAAAAAAAAAAAAAA",
      "CCCCDCBCECCCCCCC",
      "CCCCACBCECCCCCCC",
      "CCCCACBCECCCCCCC",
      "AAAAAAAAAAAAAAAA",
      "CBCBBBBBCBCDBBCC",
      "CBCBBBBBCBCABBCC",
      "CBCBBBBBCBCABBCC"
    ]
  },
  "grassSide": {
    "palette": {
      "A": "#5fa33c",
      "B": "#3f7f2e",
      "C": "#3b2a17",
      "D": "#5c4023",
      "E": "#7a5730"
    },
    "rows": [
      "AAAAAAAAAAAAAAAA",
      "AAAAAAAAAAAAAAAA",
      "AAAAAABABAAAAAAA",
      "AAAAAACADAAAAABA",
      "BBBBBBEBDBAAAADA",
      "DEEDCDDCDCBBBBDB",
      "CCCECDDDCECDCDCC",
      "DCCCDEDCDCCCCCDE",
      "CCCCCDECEDCDCDDC",
      "CCCECCDCCECCCCCC",
      "DCCCDDCCECCDDCDC",
      "ECCCCCDECDCCDCDC",
      "EDCCDEECCCCCCCCC",
      "DECDCECDCEDCCCDC",
      "CCCCCEECCCCCCCCC",
      "CECDCDDCCCCCCCCC"
    ]
  }
}

// ── 群系变体（手写，不跑生成器） ──────────────────────────
// 同一套像素噪点换调色就等于换群系：雪地/枯草/枫叶/松针/砂岩/地牢砖。
// 只换调色板不换 rows，纹理形状一致，视线上还是同一套美术语言。
const recolor = (base: CampBlock, palette: Record<string, string>): CampBlock => ({
  palette,
  rows: base.rows,
});

const GRASS_TOP = CAMP_BLOCKS.grassTop;
const GRASS_SIDE = CAMP_BLOCKS.grassSide;
const LEAVES = CAMP_BLOCKS.leaves;
const STONE = CAMP_BLOCKS.stone;
const COBBLE = CAMP_BLOCKS.cobble;

// 雪：顶面近白偏蓝，侧面只把草皮那两行换成雪，土还是土
CAMP_BLOCKS.snowTop = recolor(GRASS_TOP, { A: '#dfe7f0', B: '#cbd8e6', C: '#f2f7fd', D: '#ffffff' });
CAMP_BLOCKS.packedSnow = recolor(GRASS_TOP, { A: '#c3ccd8', B: '#aab6c6', C: '#d8e0ea', D: '#eef3f9' });
CAMP_BLOCKS.snowSide = recolor(GRASS_SIDE, {
  A: '#e4ebf3', B: '#ccd9e8', C: '#3b2a17', D: '#5c4023', E: '#7a5730',
});

// 枯草（秋/荒漠过渡）：整体偏黄绿，顶面更干
CAMP_BLOCKS.dryTop = recolor(GRASS_TOP, { A: '#8a6a33', B: '#79592b', C: '#a8843f', D: '#c6a457' });
CAMP_BLOCKS.drySide = recolor(GRASS_SIDE, {
  A: '#8a6a33', B: '#6a4c26', C: '#3b2a17', D: '#5c4023', E: '#7a5730',
});

// 树叶三兄弟：枫（秋）、松（雪线常绿）、雪压枝
CAMP_BLOCKS.mapleLeaves = recolor(LEAVES, { A: '#d2621f', B: '#a8431a', C: '#ef8f2c', D: '#8f3413' });
CAMP_BLOCKS.pineLeaves = recolor(LEAVES, { A: '#2f6b49', B: '#245840', C: '#3d7f57', D: '#1c4733' });
CAMP_BLOCKS.snowLeaves = recolor(LEAVES, { A: '#c9d8c6', B: '#a9bdaa', C: '#e6efe2', D: '#8fa590' });

// 砂岩 / 地牢：一个暖一个冷
CAMP_BLOCKS.sandstone = recolor(STONE, { A: '#a8794a', B: '#7d5733', C: '#c79a63', D: '#e0bb85' });
CAMP_BLOCKS.dungeonWall = recolor(STONE, { A: '#5d646e', B: '#3a4048', C: '#828b96', D: '#a3abb5' });
CAMP_BLOCKS.dungeonFloor = recolor(COBBLE, { A: '#15171b', B: '#3a4048', C: '#6b737d', D: '#525a64', E: '#2b3037' });

export const CAMP_FACE: CampBlock = {
  "palette": {
    "A": "#87592f",
    "B": "#6b4522",
    "C": "#4c3018",
    "D": "#c68863",
    "E": "#a9714a",
    "F": "#f2ecdf",
    "G": "#24170e",
    "H": "#7a4a2c",
    "I": "#9a1f1f"
  },
  "rows": [
    "AAAABBBB",
    "CDDEEEEC",
    "DDEEEEEE",
    "DFGEEFGE",
    "EEEEEEEH",
    "EEEEEEHH",
    "EEIIIIHH",
    "EEEEHHHH"
  ]
};
