import { test, expect } from '@playwright/test';

/**
 * 复盘页只读：seed 一份存档进 IndexedDB，从历史进去应该直接看到
 * 「阵容与模型 / 逐日发言 / 关键票型」，不需要真打一局。
 */

const archive = {
    schemaVersion: 2,
    id: 'review-fixture-1',
    timestamp: Date.UTC(2026, 9, 26, 6, 30),
    duration: 600,
    playerCount: 4,
    winner: 'GOOD',
    roles: ['WEREWOLF', 'SEER', 'VILLAGER', 'VILLAGER'],
    turnCount: 2,
    result: {
        winner: 'GOOD',
        reason: 'ALL_WOLVES_DEAD',
        reasonText: '所有狼人已出局，好人阵营胜利。',
        turn: 2,
        endedAt: Date.UTC(2026, 9, 26, 6, 40),
        alivePlayerIds: [2, 3],
        deadPlayerIds: [1, 4],
        evaluation: { scores: [], metrics: {} },
        thirdParty: null,
        lovers: null,
    },
    timeline: [],
    players: [
        { id: 1, seatNumber: 1, role: 'WEREWOLF', status: 'DEAD_VOTE', avatarSeed: 1, rolePrompt: '', isSpeaking: false, actorId: 'a1', displayName: '狼一号' },
        { id: 2, seatNumber: 2, role: 'SEER', status: 'ALIVE', avatarSeed: 2, rolePrompt: '', isSpeaking: false, actorId: 'a2', displayName: '预言家' },
        { id: 3, seatNumber: 3, role: 'VILLAGER', status: 'ALIVE', avatarSeed: 3, rolePrompt: '', isSpeaking: false, actorId: 'a3', displayName: '村民甲' },
        { id: 4, seatNumber: 4, role: 'VILLAGER', status: 'DEAD_NIGHT', avatarSeed: 4, rolePrompt: '', isSpeaking: false, actorId: 'a1', displayName: '村民乙' },
    ],
    logs: [
        { id: 'l-sys', turn: 1, phase: 'DAY_ANNOUNCE', content: '天亮了，昨夜 4 号出局。', timestamp: 1, isSystem: true },
        { id: 'l-sp1', turn: 1, phase: 'DAY_DISCUSSION', content: '4 号夜里被刀，我怀疑 1 号。', timestamp: 2, isSystem: false, speakerId: 2, modelName: 'gpt-mini', durationMs: 6400 },
        { id: 'l-sp2', turn: 1, phase: 'DAY_DISCUSSION', content: '我发言短一点，先把票压给 1 号。', timestamp: 3, isSystem: false, speakerId: 3, modelName: 'v4.1-flash', durationMs: 3200 },
        { id: 'l-v1', turn: 1, phase: 'VOTING', content: '投票目标：1号\n投票理由：直觉。', timestamp: 4, isSystem: false, speakerId: 2, debugType: 'VOTE_STRATEGY', modelName: 'gpt-mini', debugData: { voter: 2, target: 1, voteWeight: 1, speak: '直觉。' } },
        { id: 'l-v2', turn: 1, phase: 'VOTING', content: '投票目标：1号', timestamp: 5, isSystem: false, speakerId: 3, debugType: 'VOTE_STRATEGY', modelName: 'v4.1-flash', debugData: { voter: 3, target: 1, voteWeight: 1 } },
        {
            id: 'l-tally', turn: 1, phase: 'VOTING', content: '逐票明细…', timestamp: 6, isSystem: true, debugType: 'VOTE_TALLY',
            debugData: {
                votes: { 1: 2 }, abstainCount: 0, final: 1, tiedCandidates: [],
                voteRows: [{ voter: 2, target: 1, voteWeight: 1, speak: '直觉。' }, { voter: 3, target: 1, voteWeight: 1 }],
            },
        },
        { id: 'l-sp3', turn: 2, phase: 'DAY_DISCUSSION', content: '1 号走了，剩下的站边我给 3 号。', timestamp: 7, isSystem: false, speakerId: 2, modelName: 'gpt-mini', durationMs: 5000 },
    ],
};

test('复盘页把一局摊开成阵容/模型/逐日发言/关键票型', async ({ page }) => {
    await page.addInitScript(({ seed }) => {
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
        localStorage.setItem('werewolf-llmPresets', JSON.stringify([
            { id: 'l1', name: 'v4.1-flash', providerId: 'p', modelId: 'm1' },
            { id: 'l2', name: 'gpt-mini', providerId: 'p', modelId: 'm2' },
        ]));
        localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify([
            { id: 'a1', name: '分身1', llmPresetId: 'l1', ttsPresetId: 'tts-edge', voiceId: 'v1', stylePrompt: '' },
            { id: 'a2', name: '分身2', llmPresetId: 'l2', ttsPresetId: 'tts-edge', voiceId: 'v2', stylePrompt: '' },
            { id: 'a3', name: '分身3', llmPresetId: 'l1', ttsPresetId: 'tts-edge', voiceId: 'v3', stylePrompt: '' },
        ]));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign',
            effectLevel: 'subtle', gameViewMode: '2d', worldAmbientAudioEnabled: false, worldSkillAudioEnabled: false,
            worldAudioVolume: 0, gameSfxEnabled: false, gameSfxVolume: 0, bgmEnabled: false,
            personaTagsEnabled: false, randomPersonaEachGame: false,
        }));
        // idb-keyval 默认库/表；历史对局就存在这里
        const request = indexedDB.open('keyval-store', 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('keyval')) request.result.createObjectStore('keyval');
        };
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('keyval', 'readwrite');
            tx.objectStore('keyval').put([seed], 'werewolf-gameArchives');
        };
    }, { seed: archive });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '历史' }).click();

    const reviewButton = page.getByRole('button', { name: /复盘/ }).first();
    await expect(reviewButton).toBeVisible({ timeout: 20_000 });
    await reviewButton.click();

    await expect(page.getByText('赛后复盘')).toBeVisible();
    await expect(page.getByText('好人阵营胜利', { exact: true })).toBeVisible();
    await expect(page.getByText('阵容与模型')).toBeVisible();
    await expect(page.getByText('模型战绩')).toBeVisible();
    // 逐日：两天都渲染出来，默认展开最新一天
    await expect(page.getByRole('button', { name: /DAY 2/ })).toBeVisible();
    const day1 = page.getByRole('button', { name: /DAY 1/ });
    await expect(day1).toBeVisible();
    await day1.click();

    // 关键票型：逐票 + 放逐结论（DAY 1 展开后才可见）
    await expect(page.getByText('本轮放逐 1 号')).toBeVisible();
    await expect(page.getByText('4 号夜里被刀，我怀疑 1 号。')).toBeVisible();
    // 模型名出现在发言与战绩里
    await expect(page.getByText(/gpt-mini/).first()).toBeVisible();

    // 战绩数字要能对账：gpt-mini 2 条发言、1 票；v4.1-flash 1 条发言、1 票
    const gptRow = page.getByTestId('model-stat').filter({ hasText: 'gpt-mini' });
    await expect(gptRow).toContainText('2 次');
    await expect(gptRow).toContainText('1 票');
    const flashRow = page.getByTestId('model-stat').filter({ hasText: 'v4.1-flash' });
    await expect(flashRow).toContainText('1 次');
    await expect(flashRow).toContainText('1 票');

    await page.screenshot({ path: '/tmp/review-page.png', fullPage: false });
});

test('开局前可改人数/神职/上警，摘要与阵容同步', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
        localStorage.setItem('werewolf-uiConfig', JSON.stringify({
            themeId: 'voxel-camp', homeStyle: 'block-harbor', gameLayout: 'block-arena', playerCardStyle: 'name-sign',
            effectLevel: 'subtle', gameViewMode: '2d', bgmEnabled: false, personaTagsEnabled: false,
        }));
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');

    const summary = page.getByTestId('pregame-setup-summary');
    await expect(summary).toContainText('上警');

    await page.getByTestId('open-pregame-setup').click();
    const dialog = page.getByRole('dialog', { name: '对局配置' });
    await expect(dialog).toBeVisible();

    // 不上警
    await dialog.getByRole('button', { name: '不上警' }).click();
    await expect(summary).toContainText('不上警');

    // 关掉一个神职 → 村民 +1（关的是第一个神职，即预言家）。
    // 台账现在是三行「狼/神/民」，右侧大字是各阵营张数：断言直接读这三行，
    // 比读一行拼接文案更贴近玩家实际看到的东西。
    const wolves = page.getByTestId('lineup-count-wolf');
    const gods = page.getByTestId('lineup-count-god');
    const villagers = page.getByTestId('lineup-count-villager');
    await expect(wolves).toHaveText('3');
    await expect(gods).toHaveText('3');
    await expect(villagers).toHaveText('3');
    await dialog.getByRole('button', { name: /预言家/ }).click();
    await expect(gods).toHaveText('2');
    await expect(villagers).toHaveText('4');

    // 还原板子默认：上警回来
    await dialog.getByRole('button', { name: '还原板子默认' }).click();
    await expect(summary).toContainText('上警');

    await page.screenshot({ path: '/tmp/pregame-setup.png' });
    await dialog.getByRole('button', { name: '完成' }).click();
    await expect(dialog).toBeHidden();
});
