#!/usr/bin/env node
/**
 * 生成"公开仓库"快照：把工作树里该发布的文件导出成一个**单提交、无历史**的新 git 仓库。
 *
 * 为什么需要它：私有仓库的历史里留着已经删掉的 Minecraft 逐像素素材（不可再分发），
 * 直接 `git push` 到公开地址等于把它们一起发出去。这里只导出**当前工作树**，
 * 因此历史留在私有档，公开仓从第一个提交就是干净的。
 *
 * 用法：
 *   node scripts/export-public-repo.mjs <目标目录> [--force]
 *   npm run publish:export -- ../AI-Werewolf-Simulator-public
 *
 * 默认剔除：
 *   - docs/audit/：审计报告里有"当前仍然成立"的安全取舍与攻击路线，不随公开仓发布
 *   - .git / node_modules / dist / release / output / test-results / artifacts / .workbuddy 等
 *     （由 .gitignore 决定，脚本只从 `git ls-files --cached --others --exclude-standard` 取文件）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const targetArg = args.find(arg => !arg.startsWith('--'));

if (!targetArg) {
    console.error('用法：node scripts/export-public-repo.mjs <目标目录> [--force]');
    process.exit(1);
}
const target = path.resolve(ROOT, targetArg);

if (target === ROOT || ROOT.startsWith(target + path.sep)) {
    console.error(`拒绝导出到 ${target}：目标不能是仓库本身或它的上级目录`);
    process.exit(1);
}
if (fs.existsSync(target)) {
    const entries = fs.readdirSync(target);
    if (entries.length > 0) {
        if (!force) {
            console.error(`目标目录非空：${target}\n确认要覆盖请加 --force（只会删除该目录里的内容）`);
            process.exit(1);
        }
        fs.rmSync(target, { recursive: true, force: true });
    }
}

// 只排除"公开仓不该有"的东西；其余一律跟随 .gitignore
const EXCLUDE_DIRS = ['docs/audit', '.workbuddy'];
const EXCLUDE_FILES = ['after-9.yaml'];
const isExcluded = (rel) => {
    if (EXCLUDE_FILES.includes(rel)) return true;
    return EXCLUDE_DIRS.some(dir => rel === dir || rel.startsWith(dir + '/'));
};

const listFiles = () => {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 });
    const files = out.toString('utf8').split('\0').filter(Boolean);
    return [...new Set(files)].filter(rel => !isExcluded(rel)).sort();
};

const files = listFiles();
if (files.length === 0) {
    console.error('没有可导出的文件（git ls-files 返回空）');
    process.exit(1);
}

let bytes = 0;
const missing = [];
for (const rel of files) {
    const src = path.join(ROOT, rel);
    const dest = path.join(target, rel);
    if (!fs.existsSync(src)) { missing.push(rel); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    bytes += fs.statSync(src).size;
}
if (missing.length) {
    console.warn(`跳过 ${missing.length} 个已从工作树删除的跟踪文件：\n  ${missing.slice(0, 5).join('\n  ')}`);
}

// 单提交、无历史
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: target });
execFileSync('git', ['add', '-A'], { cwd: target });
const message = [
    '初始提交：方块狼人杀（AI 狼人杀模拟器）',
    '',
    '- 单机旁观 / 人类下场 / 局域网联机；Web、macOS(Electron)、Android(Capacitor)',
    '- 2D 与 3D 两套演出（3D 为旗舰视角）',
    '- 素材：程序化生成 + 0x72 DungeonTileset II v1.7（CC0），见 THIRD_PARTY_NOTICES.md',
    '',
    '公开仓从本提交开始，不含此前私有开发历史。',
].join('\n');
execFileSync('git', ['commit', '-q', '-m', message], { cwd: target, env: { ...process.env } });

// ---- 交付前自检：把这些"发出去就麻烦"的东西挡在本地 ----
const tracked = execFileSync('git', ['ls-files'], { cwd: target, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\n').filter(Boolean);
const problems = [];
const mustBeAbsent = [
    [/^docs\/audit\//, '审计报告（含仍成立的攻击路线）'],
    [/^\.workbuddy\//, 'AI 助手记忆目录'],
    // 2026-10-26 踩过：artifacts/ 已进 .gitignore，但 index 里还留着 5MB 的旧截图，
    // 导出时被一起带走。这条自检就是防止"以为忽略了、其实还在跟踪"。
    [/(^|\/)artifacts\//, '评测证据截图（应只在本地）'],
    [/(^|\/)\.impeccable\//, 'AI 工具会话产物'],
    [/mc-sprites|mc-block-sprites/, '已删除的 Minecraft 逐像素素材'],
    [/(^|\/)node_modules\//, 'node_modules'],
    // .env.example / .env.sample / .env.template 是示例文件，只有真正的 .env / .env.local 才算泄漏
    [/(^|\/)\.env(\.local|\.development|\.production)?$/, '环境变量文件'],
    [/(^|\/)\.git\//, '.git 内部文件'],
    [/\.dmg$|\.apk$|\.asar$/, '构建产物'],
];
for (const [pattern, label] of mustBeAbsent) {
    const hit = tracked.filter(file => pattern.test(file));
    if (hit.length) problems.push(`${label}：${hit.slice(0, 3).join(', ')}${hit.length > 3 ? ` 等 ${hit.length} 个` : ''}`);
}
const mustExist = [
    'package.json', 'LICENSE', 'README.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md',
    'assets-src/0x72_DungeonTilesetII_v1.7/README.md',
    'src/components/game/voxel/primitives/camp-tiles.ts',
];
for (const rel of mustExist) {
    if (!tracked.includes(rel)) problems.push(`缺少必需文件：${rel}`);
}
const characterFrames = tracked.filter(file => file.startsWith('assets-src/0x72_DungeonTilesetII_v1.7/characters/'));
// 角色帧按「每角色 4 帧 idle 动画」成组（0x72 素材的固定结构）。
// 角色数量随玩法增长（2026-11 已到 13 角色 52 帧），硬编码总数只会反复误报；
// 这里只守结构不变量：目录非空且按 4 帧对齐——整目录丢失或混入残缺下载都会被拦下。
if (characterFrames.length === 0 || characterFrames.length % 4 !== 0) {
    problems.push(`角色帧应为按 4 帧对齐的非零数量，实际 ${characterFrames.length} 张`);
}

// 轻量密钥扫描：只扫文本类文件，命中典型 Key 形态即报
const SECRET = /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})\b/;
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.css', '.html', '.sh', '.py', '.txt']);
for (const rel of tracked) {
    if (!TEXT_EXT.has(path.extname(rel))) continue;
    if (rel.includes('package-lock')) continue;
    const content = fs.readFileSync(path.join(target, rel), 'utf8');
    if (SECRET.test(content)) problems.push(`疑似密钥：${rel}`);
}

const log = execFileSync('git', ['log', '--oneline'], { cwd: target }).toString('utf8').trim();
console.log(`\n导出完成：${target}`);
console.log(`  文件 ${tracked.length} 个 · ${(bytes / 1024 / 1024).toFixed(1)} MB · ${log.split('\n').length} 个提交`);
console.log(`  提交：${log}`);
console.log(`  已排除：${EXCLUDE_DIRS.join('、')}`);
if (problems.length) {
    console.error('\n自检未通过：');
    problems.forEach(p => console.error(`  ✗ ${p}`));
    process.exit(2);
}
console.log('\n自检通过：无审计报告 / 无 MC 素材 / 无 node_modules / 无密钥命中 / 必需文件齐全');
console.log('下一步（不自动执行）：git remote add origin <公开仓库地址> && git push -u origin main');
