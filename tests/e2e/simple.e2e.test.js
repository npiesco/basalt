import { test, expect } from '@playwright/test';

test('basic page load', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser]`, msg.text()));
  page.on('pageerror', error => console.log('[Error]', error.message));

  await page.goto('http://127.0.0.1:3456/tests/e2e/simple-test.html', {
    waitUntil: 'load',
    timeout: 10000
  });

  // Verify window.testReady using page.evaluate
  const testReady = await page.evaluate(() => window.testReady);
  expect(testReady).toBe(true);

  // Verify DOM content
  const statusText = await page.textContent('#status');
  expect(statusText).toBe('Ready');
});
