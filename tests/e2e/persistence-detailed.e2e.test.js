/**
 * Detailed Persistence Test - Check what's actually in the database
 */

import { test, expect } from '@playwright/test';

test.describe('Detailed Persistence', () => {
  test('Check database contents before and after reload', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('=== BEFORE RELOAD ===');

    // Create a note
    const testTitle = 'Persistence Detail Test ' + Date.now();
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("' + testTitle + '")', { timeout: 5000 });

    await page.waitForTimeout(1000);

    // Check all database contents
    const beforeReload = await page.evaluate(async (title) => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      const tables = await window.basaltDb.executeQuery(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        []
      );

      return {
        noteCount: notes.rows.length,
        folderCount: folders.rows.length,
        tables: tables.rows.map(r => r.values[0].value),
        targetNote: notes.rows.find(n => {
          const titleValue = n.values[notes.columns.indexOf('title')];
          return titleValue.value === title;
        })
      };
    }, testTitle);

    console.log('Notes:', beforeReload.noteCount);
    console.log('Folders:', beforeReload.folderCount);
    console.log('Tables:', beforeReload.tables.join(', '));
    console.log('Target note found:', beforeReload.targetNote ? 'YES' : 'NO');

    expect(beforeReload.noteCount).toBeGreaterThan(0);

    console.log('\n=== RELOADING ===\n');
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    await page.waitForTimeout(1000);

    console.log('=== AFTER RELOAD ===');

    const afterReload = await page.evaluate(async (title) => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      const tables = await window.basaltDb.executeQuery(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        []
      );

      // Get all note titles for debugging
      const noteTitles = notes.rows.map(n => {
        const titleIdx = notes.columns.indexOf('title');
        return n.values[titleIdx].value;
      });

      return {
        noteCount: notes.rows.length,
        folderCount: folders.rows.length,
        tables: tables.rows.map(r => r.values[0].value),
        noteTitles: noteTitles,
        targetNote: notes.rows.find(n => {
          const titleValue = n.values[notes.columns.indexOf('title')];
          return titleValue.value === title;
        })
      };
    }, testTitle);

    console.log('Notes:', afterReload.noteCount);
    console.log('Folders:', afterReload.folderCount);
    console.log('Tables:', afterReload.tables.join(', '));
    console.log('Note titles:', afterReload.noteTitles);
    console.log('Target note found:', afterReload.targetNote ? 'YES' : 'NO');

    expect(afterReload.noteCount).toBe(beforeReload.noteCount);
    expect(afterReload.targetNote).toBeTruthy();
  });
});
