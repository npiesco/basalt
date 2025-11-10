/**
 * Test persistence by inserting directly without FTS
 */

import { test, expect } from '@playwright/test';

test.describe('Persistence Without FTS', () => {
  test('Insert note directly and check persistence', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('=== Creating note directly ===');

    const result = await page.evaluate(async () => {
      // Insert a note directly
      const noteId = 'test-note-' + Date.now();
      const title = 'Direct Insert Test';
      const now = new Date().toISOString();

      await window.basaltDb.executeQuery(
        'INSERT INTO notes (note_id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [noteId, title, 'test body', 'root', now, now]
      );

      console.log('[Test] Note inserted, checking...');

      const check1 = await window.basaltDb.executeQuery('SELECT * FROM notes WHERE note_id = ?', [noteId]);
      console.log('[Test] Immediately after insert, found:', check1.rows.length, 'notes');

      return { noteId, title, foundImmediately: check1.rows.length > 0 };
    });

    console.log('Note ID:', result.noteId);
    console.log('Found immediately:', result.foundImmediately);

    expect(result.foundImmediately).toBe(true);

    await page.waitForTimeout(1000);

    console.log('\n=== Reloading ===\n');
    await page.reload();
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    await page.waitForTimeout(1000);

    const afterReload = await page.evaluate(async (noteId) => {
      const allNotes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const targetNote = await window.basaltDb.executeQuery('SELECT * FROM notes WHERE note_id = ?', [noteId]);

      console.log('[Test] After reload, total notes:', allNotes.rows.length);
      console.log('[Test] After reload, target note found:', targetNote.rows.length);

      return {
        totalNotes: allNotes.rows.length,
        targetFound: targetNote.rows.length > 0
      };
    }, result.noteId);

    console.log('After reload - Total notes:', afterReload.totalNotes);
    console.log('After reload - Target found:', afterReload.targetFound);

    expect(afterReload.targetFound).toBe(true);
  });
});
