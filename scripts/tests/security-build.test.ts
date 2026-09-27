import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '../..');

const readFilesRecursively = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? readFilesRecursively(path) : [path];
    });

test('production build never embeds the development NVIDIA API key', () => {
    const sentinel = 'nvapi-test-secret-must-not-be-in-client-bundle';

    execFileSync('npm', ['run', 'build'], {
        cwd: projectRoot,
        env: { ...process.env, VITE_NVIDIA_API_KEY: sentinel, NVIDIA_API_KEY: sentinel },
        stdio: 'pipe',
    });

    const leakedFiles = readFilesRecursively(join(projectRoot, 'dist'))
        .filter((path) => readFileSync(path).includes(sentinel));

    assert.deepEqual(leakedFiles, []);
});
