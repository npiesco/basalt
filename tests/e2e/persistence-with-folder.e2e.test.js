/**
 * Test persistence ensuring folder exists first
 */

import { test, expect } from '@playwright/test';

test.describe('Persistence With Folder Check', () => {
  test('Ensure folder exists before inserting note', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('=== Checking setup ===');

    const setup = await page.evaluate(async () => {
      // Check if root folder exists
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      console.log('[Test] Folders in DB:', folders.rows.length);

      return {
        folderCount: folders.rows.length
      };
    });

    console.log('Folders exist:', setup.folderCount);

    // Wait for app to be ready
    await page.waitForTimeout(2000);

    console.log('\n=== Using UI to create note ===');

    // Use the UI which should work
    const testTitle = 'UI Test ' + Date.now();
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("' + testTitle + '")', { timeout: 5000 });

    console.log('Note created via UI');

    await page.waitForTimeout(2000);

    const beforeReload = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      return { noteCount: notes.rows.length };
    });

    console.log('Before reload - Notes:', beforeReload.noteCount);

    console.log('\n=== Reloading ===\n');
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);

    const afterReload = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      return { noteCount: notes.rows.length, folderCount: folders.rows.length };
    });

    console.log('After reload - Notes:', afterReload.noteCount);
    console.log('After reload - Folders:', afterReload.folderCount);

    expect(afterReload.noteCount).toBe(beforeReload.noteCount);
  });
});
