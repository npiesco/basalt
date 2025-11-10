/**
 * E2E TEST - Create Note Through UI
 *
 * Tests the most basic Obsidian-style operation: creating a new note.
 *
 * User flow:
 * 1. Navigate to PWA
 * 2. Click "New Note" button
 * 3. Enter note title
 * 4. Note is saved to database
 * 5. Note appears in note list
 *
 * NO MOCKS - Uses real PWA with real absurder-sql WASM in browser
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Create Note Through UI', () => {
  test('User can create a new note and it appears in the database', async ({ page }) => {
    // Capture all browser logs for debugging
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    // Navigate to PWA
    await page.goto('http://localhost:3000');

    // Wait for app to initialize
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Enter note title
    const noteTitle = `Test Note ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', noteTitle);

    // Click "Create Note" button to save
    await page.click('[data-testid="new-note-button"]');

    // Wait for note to be saved
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`, {
      timeout: 5000
    });

    // Verify note appears in the note list
    const noteItem = page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    await expect(noteItem).toBeVisible();

    // Verify note is in the database by querying it
    const noteData = await page.evaluate(async (title) => {
      // Access the database through window object (exposed by the app)
      const db = window.basaltDb;
      if (!db) {
        throw new Error('Database not exposed on window.basaltDb');
      }

      // Query for the note
      const result = await db.executeQuery(
        'SELECT note_id, title, body, created_at, updated_at FROM notes WHERE title = ?',
        [title]
      );

      if (result.rows.length === 0) {
        return null;
      }

      // Convert row to object
      const row = result.rows[0];
      const note = {};
      result.columns.forEach((col, idx) => {
        const value = row.values[idx];
        note[col] = value.type === 'Null' ? null : value.value;
      });

      return note;
    }, noteTitle);

    // Assertions on database data
    expect(noteData).not.toBeNull();
    expect(noteData.title).toBe(noteTitle);
    expect(noteData.note_id).toBeTruthy();
    expect(noteData.created_at).toBeTruthy();
    expect(noteData.updated_at).toBeTruthy();

    console.log('[E2E] ✓ Note created successfully:', noteData);
  });

  test('Multiple notes can be created and all appear in the list', async ({ page }) => {
    // Capture all browser logs for debugging
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    const noteTitles = [
      `First Note ${Date.now()}`,
      `Second Note ${Date.now()}`,
      `Third Note ${Date.now()}`
    ];

    // Create three notes
    for (const title of noteTitles) {
      await page.fill('[data-testid="note-title-input"]', title);
      await page.click('[data-testid="new-note-button"]');

      // Wait for note to appear
      await page.waitForSelector(`[data-testid="note-item"]:has-text("${title}")`, {
        timeout: 5000
      });
    }

    // Verify all notes are visible in the list
    for (const title of noteTitles) {
      const noteItem = page.locator(`[data-testid="note-item"]:has-text("${title}")`);
      await expect(noteItem).toBeVisible();
    }

    // Verify count in database
    const noteCount = await page.evaluate(async () => {
      const db = window.basaltDb;
      const result = await db.executeQuery('SELECT COUNT(*) as count FROM notes', []);
      const count = result.rows[0].values[0].value;
      return count;
    });

    expect(noteCount).toBeGreaterThanOrEqual(3);

    console.log(`[E2E] ✓ Created ${noteTitles.length} notes, total in DB: ${noteCount}`);
  });
});
