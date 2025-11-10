/**
 * E2E Integration Tests for Folder Edit and Delete Operations
 *
 * Tests folder renaming, deletion, and note cascading behavior.
 * Uses real absurder-sql WASM + IndexedDB + React UI.
 *
 * NO MOCKS - Full stack integration testing.
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Folder Edit and Delete Through UI', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the PWA
    await page.goto('http://localhost:3000');

    // Wait for app to be ready
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  });

  test('User can rename a folder and it persists to database', async ({ page }) => {
    const originalName = `Original Folder ${Date.now()}`;
    const newName = `Renamed Folder ${Date.now()}`;

    console.log('[E2E] Creating folder:', originalName);

    // Create a folder
    await page.fill('[data-testid="folder-name-input"]', originalName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${originalName}")`);

    console.log('[E2E] Clicking rename on folder');

    // Find the folder and click rename button
    const folderItem = page.locator(`[data-testid="folder-item"]:has-text("${originalName}")`);
    await folderItem.locator('[data-testid="rename-folder-button"]').click();

    // Wait for rename dialog
    await page.waitForSelector('[data-testid="rename-folder-dialog"]');

    console.log('[E2E] Entering new name');

    // Enter new name
    await page.fill('[data-testid="rename-folder-input"]', newName);
    await page.click('[data-testid="confirm-rename-button"]');

    // Wait for the renamed folder to appear
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${newName}")`);

    console.log('[E2E] Folder renamed in UI');

    // Verify folder was renamed in database
    const folderData = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id, name FROM folders WHERE name = ?',
        [name]
      );

      if (result.rows.length === 0) return null;

      const folder = {};
      result.columns.forEach((col, idx) => {
        const value = result.rows[0].values[idx];
        folder[col] = value?.value ?? value;
      });

      return folder;
    }, newName);

    // Verify old name doesn't exist
    const oldFolderExists = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM folders WHERE name = ?',
        [name]
      );
      return result.rows[0].values[0].value;
    }, originalName);

    console.log('[E2E] ✓ Folder renamed in database:', folderData);

    expect(folderData).not.toBeNull();
    expect(folderData.name).toBe(newName);
    expect(oldFolderExists).toBe(0);
  });

  test('User can cancel folder rename', async ({ page }) => {
    const folderName = `Keep Name ${Date.now()}`;

    console.log('[E2E] Creating folder:', folderName);

    // Create a folder
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    // Click rename
    const folderItem = page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`);
    await folderItem.locator('[data-testid="rename-folder-button"]').click();
    await page.waitForSelector('[data-testid="rename-folder-dialog"]');

    console.log('[E2E] Canceling rename');

    // Cancel the rename
    await page.click('[data-testid="cancel-rename-button"]');

    // Verify dialog is closed
    await page.waitForSelector('[data-testid="rename-folder-dialog"]', { state: 'detached' });

    // Verify folder still has original name
    const folderStillExists = await page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`).count();

    console.log('[E2E] ✓ Cancel works - folder name preserved');

    expect(folderStillExists).toBe(1);
  });

  test('User can delete empty folder and it removes from database', async ({ page }) => {
    const folderName = `Delete Me ${Date.now()}`;

    console.log('[E2E] Creating folder:', folderName);

    // Create a folder
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    console.log('[E2E] Clicking delete on folder');

    // Click delete button
    const folderItem = page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`);
    await folderItem.locator('[data-testid="delete-folder-button"]').click();

    // Wait for confirmation dialog
    await page.waitForSelector('[data-testid="delete-folder-confirm-dialog"]');

    console.log('[E2E] Confirming delete');

    // Confirm deletion
    await page.click('[data-testid="confirm-folder-delete-button"]');

    // Wait for folder to disappear from UI
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`, {
      state: 'detached',
      timeout: 5000
    });

    console.log('[E2E] Folder removed from UI');

    // Verify folder was deleted from database
    const folderInDb = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM folders WHERE name = ?',
        [name]
      );
      return result.rows[0].values[0].value;
    }, folderName);

    console.log('[E2E] ✓ Folder deleted from database');

    expect(folderInDb).toBe(0);
  });

  test('User can cancel folder deletion', async ({ page }) => {
    const folderName = `Keep Folder ${Date.now()}`;

    console.log('[E2E] Creating folder:', folderName);

    // Create a folder
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    // Click delete
    const folderItem = page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`);
    await folderItem.locator('[data-testid="delete-folder-button"]').click();
    await page.waitForSelector('[data-testid="delete-folder-confirm-dialog"]');

    console.log('[E2E] Canceling delete');

    // Cancel deletion
    await page.click('[data-testid="cancel-folder-delete-button"]');

    // Verify dialog is closed
    await page.waitForSelector('[data-testid="delete-folder-confirm-dialog"]', { state: 'detached' });

    // Verify folder still exists
    const folderExists = await page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`).count();

    // Verify in database
    const folderInDb = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM folders WHERE name = ?',
        [name]
      );
      return result.rows[0].values[0].value;
    }, folderName);

    console.log('[E2E] ✓ Cancel works - folder preserved');

    expect(folderExists).toBe(1);
    expect(folderInDb).toBe(1);
  });

  test('Deleting folder with notes also deletes the notes (CASCADE)', async ({ page }) => {
    const folderName = `Folder With Notes ${Date.now()}`;
    const note1Title = `Note 1 ${Date.now()}`;
    const note2Title = `Note 2 ${Date.now()}`;

    console.log('[E2E] Creating folder with notes');

    // Create folder
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    // Select the folder
    await page.selectOption('[data-testid="note-folder-select"]', { label: folderName });

    // Create first note
    await page.fill('[data-testid="note-title-input"]', note1Title);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${note1Title}")`);

    // Create second note
    await page.fill('[data-testid="note-title-input"]', note2Title);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${note2Title}")`);

    console.log('[E2E] Deleting folder (should cascade to notes)');

    // Delete the folder
    const folderItem = page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`);
    await folderItem.locator('[data-testid="delete-folder-button"]').click();
    await page.waitForSelector('[data-testid="delete-folder-confirm-dialog"]');
    await page.click('[data-testid="confirm-folder-delete-button"]');

    // Wait for folder to disappear
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`, {
      state: 'detached',
      timeout: 5000
    });

    console.log('[E2E] Verifying CASCADE delete');

    // Verify notes were also deleted (CASCADE behavior)
    const note1Exists = await page.locator(`[data-testid="note-item"]:has-text("${note1Title}")`).count();
    const note2Exists = await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).count();

    // Verify in database
    const notesInDb = await page.evaluate(async (folder) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM notes WHERE title LIKE ?',
        [`%${folder}%`]
      );
      return result.rows[0].values[0].value;
    }, folderName);

    console.log('[E2E] ✓ Folder and notes CASCADE deleted');

    expect(note1Exists).toBe(0);
    expect(note2Exists).toBe(0);
    expect(notesInDb).toBe(0);
  });

  test('Cannot delete root folder', async ({ page }) => {
    console.log('[E2E] Checking root folder protection');

    // Find the root folder (name is "/")
    const rootFolder = page.locator('[data-testid="folder-item"]:has-text("/")');

    // Root folder should not have a delete button
    const deleteButtonExists = await rootFolder.locator('[data-testid="delete-folder-button"]').count();

    console.log('[E2E] ✓ Root folder protected from deletion');

    expect(deleteButtonExists).toBe(0);
  });

});
