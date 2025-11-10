/**
 * Console Logging Test
 *
 * Captures all browser console output to diagnose VFS/IndexedDB issues
 */

import { test, expect } from '@playwright/test';

test.describe('Browser Console Logging', () => {
  test('Capture console during database operations', async ({ page }) => {
    const consoleLogs = [];
    const consoleErrors = [];
    const consoleWarns = [];

    // Capture all console output
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();

      if (type === 'error') {
        consoleErrors.push(text);
        console.log('❌ [Browser Error]:', text);
      } else if (type === 'warning') {
        consoleWarns.push(text);
        console.log('⚠️  [Browser Warn]:', text);
      } else {
        consoleLogs.push(text);
        if (text.includes('DEBUG') || text.includes('IndexedDB') || text.includes('VFS') || text.includes('block')) {
          console.log('📝 [Browser]:', text);
        }
      }
    });

    // Navigate
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    // Create a note
    const testTitle = `Console Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${testTitle}")`, { timeout: 5000 });

    // Wait for any async operations
    await page.waitForTimeout(2000);

    // Print summary
    console.log('\n========== CONSOLE SUMMARY ==========');
    console.log(`Total logs: ${consoleLogs.length}`);
    console.log(`Errors: ${consoleErrors.length}`);
    console.log(`Warnings: ${consoleWarns.length}`);

    if (consoleErrors.length > 0) {
      console.log('\n❌ ERRORS:');
      consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

    if (consoleWarns.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      consoleWarns.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
    }

    // Look for specific keywords
    const vfsLogs = consoleLogs.filter(log =>
      log.toLowerCase().includes('vfs') ||
      log.toLowerCase().includes('indexeddb') ||
      log.toLowerCase().includes('block')
    );

    if (vfsLogs.length > 0) {
      console.log('\n📦 VFS/IndexedDB related logs:');
      vfsLogs.forEach((log, i) => console.log(`  ${i + 1}. ${log}`));
    }

    console.log('=====================================\n');

    // Now reload and check persistence
    console.log('\n🔄 Reloading page...\n');
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    // Check if note persists
    const noteExists = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT * FROM notes WHERE title = ?',
        [title]
      );
      return result.rows.length > 0;
    }, testTitle);

    console.log(`\n🔍 Note persisted: ${noteExists ? '✅ YES' : '❌ NO'}\n');

    // Print any new errors after reload
    if (consoleErrors.length > 0) {
      console.log('New errors after reload:');
      consoleErrors.forEach((err, i) => console.log('  ' + (i + 1) + '. ' + err));
    }
  });
});
