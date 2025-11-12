// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Manual debugging test - keeps browser open and logs everything
 */

test('Debug: Create data and manually inspect console before/after reload', async ({ page }) => {
  // Capture ALL console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (text.includes('[PWA]') || text.includes('[ERROR]') || text.includes('checkpoint') || text.includes('sync')) {
      console.log(`[BROWSER ${type.toUpperCase()}]`, text);
    }
  });

  await page.goto('http://localhost:3000');
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  console.log('[TEST] ✓ Initial load');

  // Create folder
  await page.locator('[data-testid="folder-name-input"]').fill('DebugFolder');
  await page.locator('[data-testid="create-folder-button"]').click();
  await page.waitForTimeout(1000);
  console.log('[TEST] ✓ Created folder');

  // Create note
  await page.locator('[data-testid="note-title-input"]').fill('DebugNote');
  await page.locator('[data-testid="new-note-button"]').click();
  await page.waitForTimeout(2000); // Wait for sync
  console.log('[TEST] ✓ Created note, waited for sync');

  console.log('[TEST] ========== NOW RELOADING ==========');
  await page.reload();
  await page.waitForTimeout(5000); // Wait to see what happens
  console.log('[TEST] ========== RELOAD COMPLETE ==========');

  // Keep browser open for manual inspection
  await page.waitForTimeout(60000); // 60 seconds
});
