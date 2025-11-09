/**
 * Playwright configuration for browser-based integration tests
 *
 * This enables testing features that require browser APIs:
 * - IndexedDB (for importFromFile tests)
 * - WASM in browser environment
 * - DOM manipulation
 */

export default {
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.test.js',
  timeout: 60000,
  expect: {
    timeout: 10000
  },

  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
    trace: 'on-first-retry',
    // Flags for containerized environments
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],

  // Start local server for test harness
  webServer: {
    command: 'npx http-server -p 3456 -c-1 --cors -a 127.0.0.1',
    url: 'http://127.0.0.1:3456',
    timeout: 30000,
    reuseExistingServer: !process.env.CI,
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
};
