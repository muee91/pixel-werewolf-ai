import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

// 应用内确认弹窗（ConfirmDialogHost）的端到端验证。
// 原生 window.confirm 在 Electron / WebView 里样式不可控、Esc 与焦点行为不一致，
// 已整体替换成这套 DOM 弹窗；这里钉住三件事：
//   1. 遮罩真的把画面压暗了（曾是 bg-black/72 —— Tailwind 不认这个值，遮罩全透明）
//   2. Esc 关掉 = 取消，业务动作不执行
//   3. 确认键真的执行动作（踢人成功后座位空出来）
const projectRoot = resolve(import.meta.dirname, '../..');
const roomServerBase = 'http://127.0.0.1:39013';
let roomServer: ChildProcess;

const waitForRoomServer = async () => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${roomServerBase}/api/ping`);
            if (response.ok) return;
        } catch { /* 还没起来 */ }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Room server did not start');
};

test.beforeAll(async () => {
    roomServer = spawn(process.execPath, [
        resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
        'server/room-server.ts',
    ], {
        cwd: projectRoot,
        env: { ...process.env, ROOM_SERVER_PORT: '39013', CORS_ORIGINS: 'http://127.0.0.1:39011' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForRoomServer();
});

test.afterAll(async () => {
    if (!roomServer || roomServer.exitCode !== null) return;
    roomServer.kill('SIGTERM');
    await Promise.race([once(roomServer, 'exit'), new Promise(r => setTimeout(r, 2_000))]);
    if (roomServer.exitCode === null) roomServer.kill('SIGKILL');
});

const preparePage = async (page: import('@playwright/test').Page) => {
    await page.addInitScript((serverBase) => {
        localStorage.setItem('ai-werewolf.roomServerBaseUrl', serverBase);
        localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({ enabled: false, narratorActorId: 'n1' }));
    }, roomServerBase);
    await page.goto('/');
    await page.getByRole('button', { name: '联机', exact: true }).click();
    await expect(page.getByText('联机大厅', { exact: true })).toBeVisible();
};

test('确认弹窗：遮罩可见、Esc 取消、确认执行', async ({ browser }) => {
    test.setTimeout(90_000);
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    await preparePage(hostPage);
    await preparePage(guestPage);

    await hostPage.getByPlaceholder('输入昵称（最多5个字）').fill('房主');
    await hostPage.getByRole('button', { name: '+ 创建房间' }).click();
    await hostPage.getByLabel('房间名称').fill('确认弹窗房');
    await hostPage.getByRole('button', { name: '创建并进入房间' }).click();
    await expect(hostPage.getByText('确认弹窗房')).toBeVisible();

    const rooms = await (await fetch(`${roomServerBase}/api/rooms`)).json() as { rooms: Array<{ roomId: string; roomName: string }> };
    const roomId = rooms.rooms.find(room => room.roomName === '确认弹窗房')?.roomId;
    expect(roomId).toBeTruthy();

    await guestPage.getByPlaceholder('输入昵称（最多5个字）').fill('客人');
    await guestPage.getByRole('button', { name: '加入房间' }).click();
    await guestPage.getByPlaceholder('输入房间ID或选择上方房间').fill(roomId!);
    await guestPage.getByRole('button', { name: '快速加入（自动分配座位）' }).click();
    await expect(guestPage.getByRole('button', { name: '取消准备' })).toBeVisible();

    // 房主踢人 → 弹窗
    await hostPage.screenshot({ path: '/tmp/room-waiting.png' });
    const kickButton = hostPage.getByRole('button', { name: '踢出 客人' });
    await kickButton.click();
    const dialog = hostPage.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('踢出玩家');
    await expect(dialog).toContainText('确定将 客人 踢出房间吗？');

    // 遮罩必须真的不透明：bg-black/72 这类不存在的类名会让它在画面上完全隐形
    const overlay = await dialog.evaluate(el => {
        const parent = el.parentElement as HTMLElement | null;
        const veil = parent?.firstElementChild as HTMLElement | null;
        return veil ? getComputedStyle(veil).backgroundColor : '';
    });
    const alpha = Number((overlay.match(/rgba?\([^)]*?([\d.]+)\)$/) || [])[1] ?? '1');
    expect(overlay, `遮罩颜色 ${overlay}`).not.toBe('rgba(0, 0, 0, 0)');
    expect(alpha).toBeGreaterThan(0.5);

    // 两个按钮都要够点
    for (const name of ['取消', '踢出']) {
        const box = await dialog.getByRole('button', { name }).boundingBox();
        expect(box?.height ?? 0, `${name} 高度`).toBeGreaterThanOrEqual(40);
    }

    await hostPage.screenshot({ path: '/tmp/confirm-dialog.png' });

    // Esc = 取消：弹窗消失，客人还在房里
    await hostPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(hostPage.getByText('客人')).toBeVisible();

    // 再来一次并确认：客人被踢出
    await kickButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '踢出' }).click();
    await expect(dialog).toBeHidden();
    await expect(hostPage.getByText('客人')).toBeHidden({ timeout: 8_000 });

    await hostContext.close();
    await guestContext.close();
});
