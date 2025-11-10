/**
 * Test persistence with FTS disabled
 */

import { test, expect } from '@playwright/test';

test.describe('Persistence Without FTS', () => {
  test('Notes persist when FTS is disabled', async ({ page, context }) => {
    // Clear all storage first to get clean migrations
    await context.clearCookies();
    await page.goto('http://localhost:3000');

    // Clear IndexedDB
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        indexedDB.deleteDatabase(db.name);
      }
    });

    // Reload to get fresh database with new migrations
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('\n=== Creating note with NO FTS ===');

    const testTitle = 'No FTS Test ' + Date.now();
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("' + testTitle + '")', { timeout: 5000 });
    await page.waitForTimeout(2000);

    const before = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      return { noteCount: notes.rows.length, folderCount: folders.rows.length };
    });

    console.log('Before reload - Notes:', before.noteCount, 'Folders:', before.folderCount);

    console.log('\n=== RELOADING ===\n');
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);

    const after = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      return { noteCount: notes.rows.length, folderCount: folders.rows.length };
    });

    console.log('After reload - Notes:', after.noteCount, 'Folders:', after.folderCount);

    console.log('\n✨ PERSISTENCE TEST ✨');
    console.log('Notes persisted:', after.noteCount === before.noteCount ? '✅ YES' : '❌ NO');
    console.log('Folders persisted:', after.folderCount === before.folderCount ? '✅ YES' : '❌ NO');

    expect(after.noteCount).toBe(before.noteCount);
    expect(after.folderCount).toBe(before.folderCount);
  });
});
