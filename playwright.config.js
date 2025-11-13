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
  workers: 1, // Run tests sequentially to avoid IndexedDB corruption

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
        '--disable-gpu'
      ]
    }
  },
  // Force each test to use its own browser context with isolated storage
  fullyParallel: false,

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        hasTouch: true,
        isMobile: true,
      },
    },
  ],

  // Start Next.js dev server for E2E tests
  // Temporarily disabled - using manual dev server
  // webServer: {
  //   command: 'cd apps/pwa && npm run dev',
  //   url: 'http://localhost:3000',
  //   timeout: 120000,
  //   reuseExistingServer: !process.env.CI,
  // },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
};
