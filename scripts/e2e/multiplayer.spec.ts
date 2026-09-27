import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../..');
const roomServerBase = 'http://127.0.0.1:39012';
let roomServer: ChildProcess;

const waitForRoomServer = async () => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${roomServerBase}/api/ping`);
            if (response.ok) return;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Room server did not start');
};

test.beforeAll(async () => {
    roomServer = spawn(process.execPath, [
        resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
        'server/room-server.ts',
    ], {
        cwd: projectRoot,
        env: {
            ...process.env,
            ROOM_SERVER_PORT: '39012',
            CORS_ORIGINS: 'http://127.0.0.1:39011',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForRoomServer();
});

test.afterAll(async () => {
    if (!roomServer || roomServer.exitCode !== null) return;
    roomServer.kill('SIGTERM');
    await Promise.race([
        once(roomServer, 'exit'),
        new Promise(resolve => setTimeout(resolve, 2_000)),
    ]);
    if (roomServer.exitCode === null) roomServer.kill('SIGKILL');
});

test('two browser sessions can create, join, ready, start and reconnect', async ({ browser }) => {
    test.setTimeout(120_000); // 双浏览器全流程在重负载下可能超过 45s 默认预算
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const deterministicLlmResponse = {
        choices: [{
            message: {
                content: JSON.stringify({
                    speak: '固定建议',
                    actionTarget: 3,
                    action: 'skip',
                }),
            },
        }],
    };
    for (const context of [hostContext, guestContext]) {
        await context.route(/\/(?:api\/nvidia-chat|api\/local-llm|chat\/completions)(?:\?|$)/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(deterministicLlmResponse),
            });
        });
    }
    const hostPage = await hostContext.newPage();
    let guestPage = await guestContext.newPage();

    for (const page of [hostPage, guestPage]) {
        await page.addInitScript((serverBase) => {
            localStorage.setItem('ai-werewolf.roomServerBaseUrl', serverBase);
            localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({
                enabled: false,
                narratorActorId: 'n1',
            }));
            localStorage.setItem('werewolf-llmProviders', JSON.stringify([{
                id: 'provider-test', name: '测试供应商', type: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'test-api-key',
            }]));
            localStorage.setItem('werewolf-llmPresets', JSON.stringify([{
                id: 'llm-test', name: '测试模型', providerId: 'provider-test', modelId: 'test-model',
            }]));
        }, roomServerBase);
        await page.goto('/');
        await page.getByRole('button', { name: /联机服务器/ }).click();
        await expect(page.getByText('联机大厅', { exact: true })).toBeVisible();
    }

    await hostPage.getByPlaceholder('输入昵称（最多5个字）').fill('房主');
    await hostPage.getByRole('button', { name: '+ 创建房间' }).click();
    await hostPage.getByLabel('房间名称').fill('联机测试房');
    await hostPage.getByRole('button', { name: '创建并进入房间' }).click();
    await expect(hostPage.getByText('联机测试房')).toBeVisible();

    const roomsResponse = await fetch(`${roomServerBase}/api/rooms`);
    const roomsJson = await roomsResponse.json() as { rooms: Array<{ roomId: string; roomName: string }> };
    const roomId = roomsJson.rooms.find(room => room.roomName === '联机测试房')?.roomId;
    expect(roomId).toBeTruthy();

    await guestPage.getByPlaceholder('输入昵称（最多5个字）').fill('客人');
    await guestPage.getByRole('button', { name: '加入房间' }).click();
    await guestPage.getByPlaceholder('输入房间ID或选择上方房间').fill(roomId!);
    await guestPage.getByRole('button', { name: '快速加入（自动分配座位）' }).click();

    await expect(guestPage.getByRole('button', { name: '取消准备' })).toBeVisible();
    await expect(hostPage.getByRole('button', { name: '开始游戏' })).toBeEnabled();
    await hostPage.getByRole('button', { name: '开始游戏' }).click();

    await expect(hostPage.getByRole('button', { name: /暂停世界/ })).toBeVisible();
    await expect(guestPage.getByText('未知职业').first()).toBeVisible();
    await hostPage.getByRole('button', { name: /暂停世界/ }).click();
    await expect(hostPage.getByRole('button', { name: /继续世界/ })).toBeVisible();
    await expect(guestPage.getByTestId('game-paused-banner')).toBeVisible();

    for (const page of [hostPage, guestPage]) {
        await expect(page.getByRole('heading', { name: '游戏遇到了意外错误' })).toHaveCount(0);
    }

    for (const page of [hostPage, guestPage]) {
        const inventory = page.locator('aside');
        const hiddenRoleCount = await inventory.getByText('未知职业', { exact: true }).count();
        expect(hiddenRoleCount).toBeGreaterThanOrEqual(5);

        let visibleRoleCount = 0;
        for (const roleLabel of ['狼人', '村民', '预言家', '女巫']) {
            visibleRoleCount += await inventory.getByText(roleLabel, { exact: true }).count();
        }
        expect(visibleRoleCount).toBeGreaterThanOrEqual(1);
        expect(visibleRoleCount).toBeLessThanOrEqual(3);
    }

    await guestPage.reload();
    await expect(guestPage.getByText('未知职业').first()).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.getByTestId('game-paused-banner')).toBeVisible();

    await hostPage.getByRole('button', { name: /继续世界/ }).click();
    await expect(guestPage.getByTestId('game-paused-banner')).toBeHidden();

    await hostPage.getByRole('button', { name: /暂停世界/ }).click();
    await expect(guestPage.getByTestId('game-paused-banner')).toBeVisible();

    await guestPage.close();
    await expect(hostPage.getByText(/客人 断线/)).toBeVisible({ timeout: 8_000 });
    // 断线座位自动转 AI 托管,弹窗直接显示托管中,无需手动开启
    await expect(hostPage.getByText('AI 托管中').first()).toBeVisible({ timeout: 8_000 });
    await expect(hostPage.getByRole('button', { name: /关闭托管/ })).toBeVisible();

    guestPage = await guestContext.newPage();
    await guestPage.goto('/');
    await expect(hostPage.getByText(/客人 断线/)).toBeHidden({ timeout: 12_000 });
    await expect(hostPage.getByRole('button', { name: /AI 托管管理/ })).toHaveCount(0);
    await expect(guestPage.getByTestId('game-paused-banner')).toBeVisible();

    await hostPage.getByRole('button', { name: '布局' }).click();
    await hostPage.getByRole('button', { name: '3D RPG' }).click();
    await expect(hostPage.getByTestId('voxel-rpg-canvas')).toBeVisible({ timeout: 15_000 });
    await expect(hostPage.getByTestId('rpg-hud')).toBeVisible();
    await expect(hostPage.getByTestId('rpg-hud').getByText('未知职业').first()).toBeVisible();

    await hostPage.getByRole('button', { name: '布局' }).click();
    await hostPage.getByRole('button', { name: '经典 2D' }).click();
    await expect(hostPage.getByTestId('voxel-rpg-canvas')).toHaveCount(0);

    await hostContext.close();
    await guestContext.close();
});
