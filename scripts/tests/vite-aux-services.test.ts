import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '../..');

const waitFor = async (condition: () => boolean, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() >= deadline) throw new Error('Timed out waiting for Vite auxiliary services to start');
        await new Promise(resolve => setTimeout(resolve, 50));
    }
};

test('Vite starts TTS and room services after it is listening', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'werewolf-vite-services-'));
    const ttsMarker = join(tempDirectory, 'tts-started');
    const roomMarker = join(tempDirectory, 'room-started');
    const child = spawn(process.execPath, [
        resolve(projectRoot, 'node_modules/vite/bin/vite.js'),
        '--port',
        '0',
        '--strictPort',
    ], {
        cwd: projectRoot,
        env: {
            ...process.env,
            DISABLE_AUX_SERVICES: '',
            TTS_BACKEND_TEST_MARKER: ttsMarker,
            ROOM_SERVER_TEST_MARKER: roomMarker,
        },
        stdio: 'ignore',
    });

    try {
        await waitFor(() => existsSync(ttsMarker) && existsSync(roomMarker), 20_000);
        assert.equal(existsSync(ttsMarker), true);
        assert.equal(existsSync(roomMarker), true);
    } finally {
        child.kill('SIGTERM');
        rmSync(tempDirectory, { recursive: true, force: true });
    }
});
