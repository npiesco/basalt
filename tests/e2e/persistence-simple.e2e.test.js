/**
 * Simple Persistence Test
 *
 * Tests that database operations persist to IndexedDB by:
 * 1. Creating a note
 * 2. Reloading the page (forces database reconnect)
 * 3. Verifying the note still exists
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Basic Persistence', () => {
  test('Data persists across page reloads', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Wait for the database to initialize
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('✓ Database initialized');

    // Create a unique note
    const testTitle = `Persistence Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');

    // Wait for the note to appear
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${testTitle}")`, { timeout: 5000 });
    console.log('✓ Note created:', testTitle);

    // Get the note ID before reload
    const noteId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0]?.values[0]?.value;
    }, testTitle);

    console.log('✓ Note ID:', noteId);

    // CRITICAL: Reload the page (this forces database disconnect/reconnect)
    console.log('🔄 Reloading page...');
    await page.reload({ waitUntil: 'networkidle' });

    // Wait for database to reinitialize
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    console.log('✓ Database reinitialized');

    // Check IndexedDB state before querying
    const indexedDBState = await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      return databases.map(db => ({ name: db.name, version: db.version }));
    });
    console.log('📦 IndexedDB databases:', indexedDBState);

    // Check if the note persisted using direct database query
    const noteExists = await page.evaluate(async (title) => {
      // First, check if any notes exist
      const allNotesResult = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes',
        []
      );
      console.log('[Browser] All notes count:', allNotesResult.rows.length);

      // Then check for our specific note
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes WHERE title = ?',
        [title]
      );
      console.log('[Browser] Query result for our note:', result);
      return result.rows.length > 0;
    }, testTitle);

    expect(noteExists).toBe(true);

    // Verify note appears in UI
    const noteVisible = await page.locator(`[data-testid="note-item"]:has-text("${testTitle}")`).count();
    expect(noteVisible).toBeGreaterThan(0);

    console.log('✅ PASS: Note persisted across page reload');
  });
});
