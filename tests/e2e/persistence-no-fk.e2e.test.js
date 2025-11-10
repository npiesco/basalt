/**
 * Test persistence with foreign keys DISABLED
 */

import { test, expect } from '@playwright/test';

test.describe('Persistence Without FK', () => {
  test('Notes persist when foreign keys disabled', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://localhost:3000');

    // Clear IndexedDB
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        indexedDB.deleteDatabase(db.name);
      }
    });

    // Reload
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    // Disable foreign keys
    await page.evaluate(async () => {
      await window.basaltDb.executeQuery('PRAGMA foreign_keys = OFF', []);
    });

    console.log('Foreign keys DISABLED');

    const testTitle = 'No FK Test ' + Date.now();
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("' + testTitle + '")', { timeout: 5000 });
    await page.waitForTimeout(2000);

    const before = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      return { noteCount: notes.rows.length };
    });

    console.log('Before reload - Notes:', before.noteCount);

    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Disable FK again after reload
    await page.evaluate(async () => {
      await window.basaltDb.executeQuery('PRAGMA foreign_keys = OFF', []);
    });

    const after = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      return { noteCount: notes.rows.length };
    });

    console.log('After reload - Notes:', after.noteCount);
    console.log('Persisted:', after.noteCount === before.noteCount ? '✅ YES' : '❌ NO');

    expect(after.noteCount).toBe(before.noteCount);
  });
});
