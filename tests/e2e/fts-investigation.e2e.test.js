/**
 * Investigate FTS table state before and after reload
 */

import { test, expect } from '@playwright/test';

test.describe('FTS Investigation', () => {
  test('Check notes and FTS tables before and after reload', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    // Create a note
    const testTitle = 'FTS Test ' + Date.now();
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("' + testTitle + '")', { timeout: 5000 });
    await page.waitForTimeout(2000);

    console.log('\n=== BEFORE RELOAD ===');
    const before = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const fts = await window.basaltDb.executeQuery('SELECT * FROM notes_fts', []);
      const ftsData = await window.basaltDb.executeQuery('SELECT * FROM notes_fts_data', []);
      const triggers = await window.basaltDb.executeQuery(
        "SELECT name, sql FROM sqlite_master WHERE type='trigger'",
        []
      );

      return {
        noteCount: notes.rows.length,
        ftsCount: fts.rows.length,
        ftsDataCount: ftsData.rows.length,
        triggerCount: triggers.rows.length,
        triggers: triggers.rows.map(r => r.values[0].value)
      };
    });

    console.log('Notes:', before.noteCount);
    console.log('FTS rows:', before.ftsCount);
    console.log('FTS data rows:', before.ftsDataCount);
    console.log('Triggers:', before.triggers.join(', '));

    console.log('\n=== RELOADING ===\n');
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);

    console.log('=== AFTER RELOAD ===');
    const after = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const fts = await window.basaltDb.executeQuery('SELECT * FROM notes_fts', []);
      const ftsData = await window.basaltDb.executeQuery('SELECT * FROM notes_fts_data', []);
      const triggers = await window.basaltDb.executeQuery(
        "SELECT name, sql FROM sqlite_master WHERE type='trigger'",
        []
      );

      return {
        noteCount: notes.rows.length,
        ftsCount: fts.rows.length,
        ftsDataCount: ftsData.rows.length,
        triggerCount: triggers.rows.length,
        triggers: triggers.rows.map(r => r.values[0].value)
      };
    });

    console.log('Notes:', after.noteCount);
    console.log('FTS rows:', after.ftsCount);
    console.log('FTS data rows:', after.ftsDataCount);
    console.log('Triggers:', after.triggers.join(', '));

    // Check if loss happened
    console.log('\n=== COMPARISON ===');
    console.log('Notes lost:', before.noteCount - after.noteCount);
    console.log('FTS rows lost:', before.ftsCount - after.ftsCount);
    console.log('FTS data rows lost:', before.ftsDataCount - after.ftsDataCount);

    expect(after.noteCount).toBe(before.noteCount);
  });
});
