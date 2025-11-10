/**
 * E2E TEST - Delete Note Through UI
 *
 * Tests the DELETE operation for notes - completing CRUD operations.
 *
 * User flow:
 * 1. Create a note
 * 2. Click delete button on note
 * 3. Confirm deletion in dialog
 * 4. Verify note removed from UI
 * 5. Verify note deleted from database
 *
 * NO MOCKS - Uses real PWA with real absurder-sql WASM in browser
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Delete Note Through UI', () => {
  test('User can delete a note and it removes from database', async ({ page }) => {
    // Capture all browser logs for debugging
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    // Navigate to PWA
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a note to delete
    const noteTitle = `Note to Delete ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    // Click delete button on the note
    const noteItem = page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    const deleteButton = noteItem.locator('[data-testid="delete-note-button"]');
    await deleteButton.click();

    // Wait for confirmation dialog
    await page.waitForSelector('[data-testid="delete-confirm-dialog"]', { timeout: 5000 });

    // Confirm deletion
    await page.click('[data-testid="confirm-delete-button"]');

    // Wait for note to be removed from UI
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`, {
      state: 'detached',
      timeout: 5000
    });

    // Verify note is gone from UI
    const noteExists = await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).count();
    expect(noteExists).toBe(0);

    // Verify note is deleted from database
    const noteInDb = await page.evaluate(async (title) => {
      const db = window.basaltDb;
      const result = await db.executeQuery(
        'SELECT COUNT(*) as count FROM notes WHERE title = ?',
        [title]
      );
      const count = result.rows[0].values[0].value;
      return count;
    }, noteTitle);

    expect(noteInDb).toBe(0);

    console.log('[E2E] ✓ Note deleted successfully');
  });

  test('User can cancel deletion and note remains', async ({ page }) => {
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a note
    const noteTitle = `Note to Keep ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    // Click delete button
    const noteItem = page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    const deleteButton = noteItem.locator('[data-testid="delete-note-button"]');
    await deleteButton.click();

    // Wait for confirmation dialog
    await page.waitForSelector('[data-testid="delete-confirm-dialog"]');

    // Cancel deletion
    await page.click('[data-testid="cancel-delete-button"]');

    // Wait for dialog to close
    await page.waitForSelector('[data-testid="delete-confirm-dialog"]', { state: 'detached' });

    // Verify note still exists in UI
    const noteStillExists = page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    await expect(noteStillExists).toBeVisible();

    // Verify note still in database
    const noteInDb = await page.evaluate(async (title) => {
      const db = window.basaltDb;
      const result = await db.executeQuery(
        'SELECT COUNT(*) as count FROM notes WHERE title = ?',
        [title]
      );
      const count = result.rows[0].values[0].value;
      return count;
    }, noteTitle);

    expect(noteInDb).toBe(1);

    console.log('[E2E] ✓ Cancel works - note preserved');
  });

  test('Delete multiple notes and verify all removed', async ({ page }) => {
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create multiple notes
    const noteTitles = [
      `Delete Test 1 ${Date.now()}`,
      `Delete Test 2 ${Date.now()}`,
      `Delete Test 3 ${Date.now()}`
    ];

    for (const title of noteTitles) {
      await page.fill('[data-testid="note-title-input"]', title);
      await page.click('[data-testid="new-note-button"]');
      await page.waitForSelector(`[data-testid="note-item"]:has-text("${title}")`);
    }

    // Delete each note
    for (const title of noteTitles) {
      const noteItem = page.locator(`[data-testid="note-item"]:has-text("${title}")`);
      const deleteButton = noteItem.locator('[data-testid="delete-note-button"]');
      await deleteButton.click();
      await page.waitForSelector('[data-testid="delete-confirm-dialog"]');
      await page.click('[data-testid="confirm-delete-button"]');
      await page.waitForSelector(`[data-testid="note-item"]:has-text("${title}")`, {
        state: 'detached',
        timeout: 5000
      });
    }

    // Verify all notes deleted from database
    const totalCount = await page.evaluate(async (titles) => {
      const db = window.basaltDb;
      let count = 0;
      for (const title of titles) {
        const result = await db.executeQuery(
          'SELECT COUNT(*) as count FROM notes WHERE title = ?',
          [title]
        );
        count += result.rows[0].values[0].value;
      }
      return count;
    }, noteTitles);

    expect(totalCount).toBe(0);

    console.log('[E2E] ✓ All notes deleted successfully');
  });

  test('Deleting note while editing closes edit mode', async ({ page }) => {
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a note
    const noteTitle = `Edit Then Delete ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    // Start editing the note
    await page.click(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    await page.waitForSelector('[data-testid="edit-note-title-input"]');

    // Edit mode should be visible
    const editForm = page.locator('[data-testid="edit-note-title-input"]');
    await expect(editForm).toBeVisible();

    // Now delete the note (there should be a delete button in edit mode too)
    await page.click('[data-testid="delete-note-button-edit"]');
    await page.waitForSelector('[data-testid="delete-confirm-dialog"]');
    await page.click('[data-testid="confirm-delete-button"]');

    // Wait for edit mode to close
    await page.waitForSelector('[data-testid="edit-note-title-input"]', {
      state: 'detached',
      timeout: 5000
    });

    // Verify note deleted
    const noteExists = await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).count();
    expect(noteExists).toBe(0);

    console.log('[E2E] ✓ Delete from edit mode works correctly');
  });
});
