import { test, expect } from '@playwright/test';

test('basic page load', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser]`, msg.text()));
  page.on('pageerror', error => console.log('[Error]', error.message));

  // Use the actual PWA instead of static test file
  await page.goto('http://localhost:3000', {
    waitUntil: 'load',
    timeout: 10000
  });

  // Verify app is ready
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  const appReady = await page.isVisible('[data-testid="app-ready"]');
  expect(appReady).toBe(true);
});
