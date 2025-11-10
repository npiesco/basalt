/**
 * Console Debug Test - Captures browser console output
 */

import { test } from '@playwright/test';

test.describe('Console Debug', () => {
  test('Capture console during database operations', async ({ page }) => {
    const consoleLogs = [];
    const consoleErrors = [];

    // Capture console output
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();

      if (type === 'error') {
        consoleErrors.push(text);
        console.log('[Browser Error]:', text);
      } else {
        consoleLogs.push(text);
        if (text.includes('DEBUG') || text.includes('IndexedDB') || text.includes('VFS') || text.includes('block') || text.includes('PWA')) {
          console.log('[Browser]:', text);
        }
      }
    });

    // Navigate and init
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('Database initialized');

    // Create a note
    const testTitle = 'Console Test ' + Date.now();
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("' + testTitle + '")', { timeout: 5000 });

    console.log('Note created:', testTitle);

    // Wait for async operations
    await page.waitForTimeout(2000);

    // Print summary
    console.log('\n=== CONSOLE SUMMARY ===');
    console.log('Total logs:', consoleLogs.length);
    console.log('Errors:', consoleErrors.length);

    if (consoleErrors.length > 0) {
      console.log('\nERRORS:');
      consoleErrors.forEach((err, i) => console.log((i + 1) + '. ' + err));
    }

    // Look for VFS/IndexedDB logs
    const vfsLogs = consoleLogs.filter(log =>
      log.toLowerCase().includes('vfs') ||
      log.toLowerCase().includes('indexeddb') ||
      log.toLowerCase().includes('block') ||
      log.toLowerCase().includes('storage')
    );

    if (vfsLogs.length > 0) {
      console.log('\nVFS/IndexedDB logs:');
      vfsLogs.forEach((log, i) => console.log((i + 1) + '. ' + log));
    } else {
      console.log('\nNo VFS/IndexedDB logs found - this might be the problem!');
    }

    // Reload and check persistence
    console.log('\nReloading page...');
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    const noteExists = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT * FROM notes WHERE title = ?',
        [title]
      );
      return result.rows.length > 0;
    }, testTitle);

    console.log('\nNote persisted after reload:', noteExists);
  });
});
