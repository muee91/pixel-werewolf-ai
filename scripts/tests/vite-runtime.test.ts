import assert from 'node:assert/strict';
import test from 'node:test';
import viteConfig from '../../vite.config';

test('development server refuses to drift onto the room server port', async () => {
    const config = await viteConfig({ command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false });

    assert.equal(config.server?.port, 3001);
    assert.equal(config.server?.strictPort, true);
});
