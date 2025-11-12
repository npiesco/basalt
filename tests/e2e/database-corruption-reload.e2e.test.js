// @ts-check
const { test, expect } = require('@playwright/test');

test('Database should not corrupt after creating folder and note, then reloading', async ({ page }) => {
  console.log('[E2E] Testing database corruption on reload...');

  // Capture console
  const consoleErrors = [];
  const consoleDebug = [];
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
    if (text.includes('[PWA]') || text.includes('checkpoint') || text.includes('sync') || text.includes('backup') || text.includes('Backup') || text.includes('Step')) {
      consoleDebug.push(text);
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  console.log('[E2E] ✓ Initial load successful');

  // Create a folder
  const folderName = `TestFolder ${Date.now()}`;
  await page.locator('[data-testid="folder-name-input"]').fill(folderName);
  await page.locator('[data-testid="create-folder-button"]').click();
  await page.waitForTimeout(500);
  console.log('[E2E] ✓ Created folder:', folderName);

  // Create a note
  const noteTitle = `TestNote ${Date.now()}`;
  await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
  await page.locator('[data-testid="new-note-button"]').click();
  await page.waitForTimeout(500);
  console.log('[E2E] ✓ Created note:', noteTitle);

  // Wait for sync to complete
  await page.waitForTimeout(3000);
  console.log('[E2E] ✓ Waited for IndexedDB sync');
  console.log('[E2E] Debug logs before reload:', consoleDebug.slice(-10));

  // RELOAD
  console.log('[E2E] ===== RELOADING PAGE =====');
  consoleErrors.length = 0;
  consoleDebug.length = 0;
  await page.reload();

  // Wait for app to initialize
  try {
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] ✓ Page reloaded successfully (NO CORRUPTION!)');
  } catch (error) {
    console.log('[E2E] ✗ FAILED to reload');
    console.log('[E2E] Debug logs after reload:', consoleDebug);
    console.log('[E2E] Console errors:', consoleErrors);
    throw new Error('App failed to reload: ' + consoleErrors.join('\n'));
  }

  // Check for corruption errors
  const hasCorruptionError = consoleErrors.some(err =>
    err.includes('malformed') ||
    err.includes('corruption') ||
    err.includes('Query execution failed')
  );

  expect(hasCorruptionError).toBe(false);

  console.log('[E2E] ✓✓✓ DATABASE CORRUPTION TEST PASSED ✓✓✓');
});
