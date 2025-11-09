/**
 * E2E TEST - Edit Note Through UI
 *
 * Tests the UPDATE operation for notes - core Obsidian functionality.
 *
 * User flow:
 * 1. Create a note
 * 2. Click on the note to open editor
 * 3. Edit title and body
 * 4. Save changes
 * 5. Verify changes persist in database and UI
 *
 * NO MOCKS - Uses real PWA with real absurder-sql WASM in browser
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Edit Note Through UI', () => {
  test('User can edit note title and it persists to database', async ({ page }) => {
    // Capture all browser logs for debugging
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    // Navigate to PWA
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a note first
    const originalTitle = `Original Note ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', originalTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${originalTitle}")`);

    // Click on the note to edit it
    await page.click(`[data-testid="note-item"]:has-text("${originalTitle}")`);

    // Wait for edit mode to activate
    await page.waitForSelector('[data-testid="edit-note-title-input"]', { timeout: 5000 });

    // Edit the title
    const newTitle = `Edited Note ${Date.now()}`;
    await page.fill('[data-testid="edit-note-title-input"]', newTitle);

    // Save the changes
    await page.click('[data-testid="save-note-button"]');

    // Wait for the note to appear with new title in the list
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${newTitle}")`, {
      timeout: 5000
    });

    // Verify old title is gone
    const oldNoteExists = await page.locator(`[data-testid="note-item"]:has-text("${originalTitle}")`).count();
    expect(oldNoteExists).toBe(0);

    // Verify new title exists
    const newNote = page.locator(`[data-testid="note-item"]:has-text("${newTitle}")`);
    await expect(newNote).toBeVisible();

    // Verify in database
    const noteData = await page.evaluate(async (title) => {
      const db = window.basaltDb;
      const result = await db.executeQuery(
        'SELECT note_id, title, body, updated_at FROM notes WHERE title = ?',
        [title]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const note = {};
      result.columns.forEach((col, idx) => {
        const value = row.values[idx];
        note[col] = value.type === 'Null' ? null : value.value;
      });
      return note;
    }, newTitle);

    expect(noteData).not.toBeNull();
    expect(noteData.title).toBe(newTitle);

    console.log('[E2E] ✓ Note edited successfully:', noteData);
  });

  test('User can edit note body and changes persist', async ({ page }) => {
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a note
    const noteTitle = `Note with Body ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    // Click to edit
    await page.click(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    await page.waitForSelector('[data-testid="edit-note-body-textarea"]', { timeout: 5000 });

    // Edit the body
    const noteBody = 'This is the edited content of the note.\n\nWith multiple paragraphs!';
    await page.fill('[data-testid="edit-note-body-textarea"]', noteBody);

    // Save
    await page.click('[data-testid="save-note-button"]');

    // Wait for save to complete (note list should refresh)
    await page.waitForTimeout(500);

    // Verify in database
    const noteData = await page.evaluate(async (title) => {
      const db = window.basaltDb;
      const result = await db.executeQuery(
        'SELECT note_id, title, body, updated_at FROM notes WHERE title = ?',
        [title]
      );

      const row = result.rows[0];
      const note = {};
      result.columns.forEach((col, idx) => {
        const value = row.values[idx];
        note[col] = value.type === 'Null' ? null : value.value;
      });
      return note;
    }, noteTitle);

    expect(noteData.body).toBe(noteBody);

    console.log('[E2E] ✓ Note body edited successfully');
  });

  test('User can cancel editing without saving changes', async ({ page }) => {
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a note
    const originalTitle = `Cancel Edit Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', originalTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${originalTitle}")`);

    // Click to edit
    await page.click(`[data-testid="note-item"]:has-text("${originalTitle}")`);
    await page.waitForSelector('[data-testid="edit-note-title-input"]', { timeout: 5000 });

    // Change the title
    await page.fill('[data-testid="edit-note-title-input"]', 'This should not be saved');

    // Cancel instead of save
    await page.click('[data-testid="cancel-edit-button"]');

    // Wait for edit mode to close
    await page.waitForSelector('[data-testid="note-item"]', { timeout: 5000 });

    // Verify original title still exists
    const originalNote = page.locator(`[data-testid="note-item"]:has-text("${originalTitle}")`);
    await expect(originalNote).toBeVisible();

    // Verify edited title does NOT exist
    const editedExists = await page.locator(`[data-testid="note-item"]:has-text("This should not be saved")`).count();
    expect(editedExists).toBe(0);

    console.log('[E2E] ✓ Cancel works - no changes saved');
  });

  test('Multiple edits to same note accumulate correctly', async ({ page }) => {
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a note
    let currentTitle = `Multi Edit ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', currentTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${currentTitle}")`);

    // Edit 1: Change title
    await page.click(`[data-testid="note-item"]:has-text("${currentTitle}")`);
    await page.waitForSelector('[data-testid="edit-note-title-input"]');
    currentTitle = `Multi Edit v2 ${Date.now()}`;
    await page.fill('[data-testid="edit-note-title-input"]', currentTitle);
    await page.click('[data-testid="save-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${currentTitle}")`);

    // Edit 2: Add body
    await page.click(`[data-testid="note-item"]:has-text("${currentTitle}")`);
    await page.waitForSelector('[data-testid="edit-note-body-textarea"]');
    await page.fill('[data-testid="edit-note-body-textarea"]', 'First body content');
    await page.click('[data-testid="save-note-button"]');
    await page.waitForTimeout(500);

    // Edit 3: Update body again
    await page.click(`[data-testid="note-item"]:has-text("${currentTitle}")`);
    await page.waitForSelector('[data-testid="edit-note-body-textarea"]');
    await page.fill('[data-testid="edit-note-body-textarea"]', 'Second body content - final');
    await page.click('[data-testid="save-note-button"]');
    await page.waitForTimeout(500);

    // Verify final state in database
    const finalNote = await page.evaluate(async (title) => {
      const db = window.basaltDb;
      const result = await db.executeQuery(
        'SELECT note_id, title, body, updated_at FROM notes WHERE title = ?',
        [title]
      );

      const row = result.rows[0];
      const note = {};
      result.columns.forEach((col, idx) => {
        const value = row.values[idx];
        note[col] = value.type === 'Null' ? null : value.value;
      });
      return note;
    }, currentTitle);

    expect(finalNote.title).toBe(currentTitle);
    expect(finalNote.body).toBe('Second body content - final');

    console.log('[E2E] ✓ Multiple edits work correctly:', finalNote);
  });
});
