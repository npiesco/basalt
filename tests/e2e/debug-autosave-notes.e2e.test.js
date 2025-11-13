import { test, expect } from '@playwright/test';

test.describe('DEBUG: Autosave Notes State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });
  });

  test('Verify notes persist correctly after autosave', async ({ page }) => {
    console.log('[DEBUG] Test starting...');

    // Create target note
    await page.fill('[data-testid="note-title-input"]', 'Target Note');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForTimeout(1000);

    // Get target note ID from UI
    const targetNoteItem = page.locator('[data-testid="note-item"]').filter({ hasText: 'Target Note' }).first();
    const targetNoteId = await targetNoteItem.getAttribute('data-note-id');
    console.log('[DEBUG] Created Target Note:', targetNoteId);

    // Verify target note in database
    await page.waitForTimeout(500);
    const targetInDb = await page.evaluate(async (id) => {
      if (!window.basaltDb) return { error: 'DB not ready' };
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes WHERE note_id = ?',
        [id]
      );
      if (result.rows.length > 0) {
        return {
          id: result.rows[0].values[0].value,
          title: result.rows[0].values[1].value
        };
      }
      return { error: 'Not found' };
    }, targetNoteId);
    console.log('[DEBUG] Target Note in DB after creation:', targetInDb);

    // Create source note
    await page.fill('[data-testid="note-title-input"]', 'Source Note');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForTimeout(1000);

    // Verify BOTH notes in database
    const bothNotes = await page.evaluate(async () => {
      if (!window.basaltDb) return { error: 'DB not ready' };
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes ORDER BY created_at',
        []
      );
      return result.rows.map(row => ({
        id: row.values[0].value,
        title: row.values[1].value
      }));
    });
    console.log('[DEBUG] ALL notes in DB after creating Source:', JSON.stringify(bothNotes));

    // Click on source note to edit
    const sourceNoteItem = page.locator('[data-testid="note-item"]').filter({ hasText: 'Source Note' }).first();
    await sourceNoteItem.click();
    await page.waitForTimeout(500);

    // Type wikilink in CodeMirror
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type(`Link to [[${targetNoteId}]]`);

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 5000 });
    await page.waitForTimeout(2000);

    // Verify BOTH notes in database AFTER autosave
    const notesAfterAutosave = await page.evaluate(async () => {
      if (!window.basaltDb) return { error: 'DB not ready' };
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title, body FROM notes ORDER BY created_at',
        []
      );
      return result.rows.map(row => ({
        id: row.values[0].value,
        title: row.values[1].value,
        body: row.values[2].value?.substring(0, 100) || ''
      }));
    });
    console.log('[DEBUG] ALL notes AFTER autosave:', JSON.stringify(notesAfterAutosave, null, 2));

    // ASSERTIONS
    expect(notesAfterAutosave).toHaveLength(2);
    expect(notesAfterAutosave[0].title).toBe('Target Note');
    expect(notesAfterAutosave[1].title).toBe('Source Note');
    expect(notesAfterAutosave[1].body).toContain(targetNoteId);

    console.log('[DEBUG] ✓✓✓ ALL ASSERTIONS PASSED!');
  });
});
