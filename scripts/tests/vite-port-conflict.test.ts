import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '../..');

const runViteWithOccupiedFrontendPort = async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'werewolf-vite-conflict-'));
    const ttsMarker = join(tempDirectory, 'tts-started');
    const roomMarker = join(tempDirectory, 'room-started');
    const blocker = createServer();
    blocker.listen(0, '0.0.0.0');
    await once(blocker, 'listening');
    const address = blocker.address();
    if (!address || typeof address === 'string') throw new Error('Unable to reserve a test port');

    const child = spawn(process.execPath, [
        resolve(projectRoot, 'node_modules/vite/bin/vite.js'),
        '--port',
        String(address.port),
        '--strictPort',
    ], {
        cwd: projectRoot,
        env: {
            ...process.env,
            TTS_BACKEND_TEST_MARKER: ttsMarker,
            ROOM_SERVER_TEST_MARKER: roomMarker,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });

    const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000);
    const [exitCode] = await once(child, 'exit') as [number | null];
    clearTimeout(timeout);
    blocker.close();
    await once(blocker, 'close');
    const result = {
        exitCode,
        output,
        ttsStarted: existsSync(ttsMarker),
        roomStarted: existsSync(roomMarker),
    };
    rmSync(tempDirectory, { recursive: true, force: true });
    return result;
};

test('occupied Vite port does not start auxiliary room or TTS services', async () => {
    const { exitCode, output, ttsStarted, roomStarted } = await runViteWithOccupiedFrontendPort();

    assert.notEqual(exitCode, 0);
    assert.match(output, /Port \d+ is already in use/);
    assert.equal(ttsStarted, false, output);
    assert.equal(roomStarted, false, output);
});
