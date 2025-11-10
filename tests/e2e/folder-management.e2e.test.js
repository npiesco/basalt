/**
 * E2E Integration Tests for Folder Management
 *
 * Tests folder creation, listing, and note organization.
 * Uses real absurder-sql WASM + IndexedDB + React UI.
 *
 * NO MOCKS - Full stack integration testing.
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Folder Management Through UI', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the PWA
    await page.goto('http://localhost:3000');

    // Wait for app to be ready
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  });

  test('User can create a new folder and it appears in the database', async ({ page }) => {
    const folderName = `My Folder ${Date.now()}`;

    console.log('[E2E] Creating folder:', folderName);

    // Fill in folder name
    await page.fill('[data-testid="folder-name-input"]', folderName);

    // Click create folder button
    await page.click('[data-testid="create-folder-button"]');

    // Wait for folder to appear in folder list
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    console.log('[E2E] Folder appears in UI');

    // Verify folder was created in database
    const folderData = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id, name, parent_folder_id FROM folders WHERE name = ?',
        [name]
      );

      if (result.rows.length === 0) return null;

      const folder = {};
      result.columns.forEach((col, idx) => {
        const value = result.rows[0].values[idx];
        folder[col] = value?.value ?? value;
      });

      return folder;
    }, folderName);

    console.log('[E2E] ✓ Folder created in database:', folderData);

    expect(folderData).not.toBeNull();
    expect(folderData.name).toBe(folderName);
    expect(folderData.folder_id).toBeTruthy();
    expect(folderData.parent_folder_id).toBe('root'); // Should be under root by default
  });

  test('User can create a note in a specific folder', async ({ page }) => {
    const folderName = `Project ${Date.now()}`;
    const noteTitle = `Note in Folder ${Date.now()}`;

    console.log('[E2E] Creating folder:', folderName);

    // Create a folder first
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    console.log('[E2E] Creating note in folder');

    // Select the folder from dropdown
    await page.selectOption('[data-testid="note-folder-select"]', { label: folderName });

    // Create a note
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');

    // Wait for note to appear
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    console.log('[E2E] Note created');

    // Verify note is in the correct folder in database
    const noteData = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title, folder_id FROM notes WHERE title = ?',
        [title]
      );

      if (result.rows.length === 0) return null;

      const note = {};
      result.columns.forEach((col, idx) => {
        const value = result.rows[0].values[idx];
        note[col] = value?.value ?? value;
      });

      return note;
    }, noteTitle);

    console.log('[E2E] Note data from database:', noteData);

    // Get the folder_id for the folder we created
    const folderData = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id FROM folders WHERE name = ?',
        [name]
      );
      return result.rows[0]?.values[0]?.value;
    }, folderName);

    console.log('[E2E] ✓ Note created in correct folder');

    expect(noteData).not.toBeNull();
    expect(noteData.folder_id).toBe(folderData);
  });

  test('Folder list shows all folders including root', async ({ page }) => {
    const folder1 = `Folder A ${Date.now()}`;
    const folder2 = `Folder B ${Date.now()}`;

    console.log('[E2E] Creating two folders');

    // Create first folder
    await page.fill('[data-testid="folder-name-input"]', folder1);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folder1}")`);

    // Create second folder
    await page.fill('[data-testid="folder-name-input"]', folder2);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folder2}")`);

    console.log('[E2E] Checking folder list');

    // Check that both folders appear in the folder list
    const folder1Exists = await page.locator(`[data-testid="folder-item"]:has-text("${folder1}")`).count();
    const folder2Exists = await page.locator(`[data-testid="folder-item"]:has-text("${folder2}")`).count();
    const rootExists = await page.locator('[data-testid="folder-item"]:has-text("/")').count();

    console.log('[E2E] ✓ All folders displayed');

    expect(folder1Exists).toBe(1);
    expect(folder2Exists).toBe(1);
    expect(rootExists).toBe(1); // Root folder should always be visible
  });

  test('Note displays its folder name', async ({ page }) => {
    const folderName = `Documents ${Date.now()}`;
    const noteTitle = `Important Note ${Date.now()}`;

    console.log('[E2E] Creating folder and note');

    // Create folder
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    // Select folder and create note
    await page.selectOption('[data-testid="note-folder-select"]', { label: folderName });
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    console.log('[E2E] Checking note displays folder');

    // Find the note item and check if it displays the folder name
    const noteItem = page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    const noteItemText = await noteItem.textContent();

    console.log('[E2E] ✓ Note shows folder name');

    expect(noteItemText).toContain(folderName);
  });

});
