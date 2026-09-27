import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './scripts/e2e',
    timeout: 45_000,
    fullyParallel: false,
    workers: 1,
    retries: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:39011',
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'cross-env DISABLE_AUX_SERVICES=1 vite --host 127.0.0.1 --port 39011 --strictPort',
        url: 'http://127.0.0.1:39011',
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
