// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * INTEGRATION TEST: Drag-and-Drop Folder Organization
 *
 * Tests that folders and notes can be reorganized via drag-and-drop:
 * - Drag folder into another folder (nest)
 * - Drag folder to root level (un-nest)
 * - Drag note to different folder
 * - Database parent_folder_id updates correctly
 * - UI reflects new hierarchy immediately
 * - Multi-tab sync propagates drag-drop changes
 *
 * NO MOCKS - tests real drag-and-drop with database persistence
 */

test.describe('INTEGRATION: Drag-and-Drop Folder Organization', () => {
  test('Drag folder into another folder to create nested hierarchy', async ({ page }) => {
    console.log('[E2E] Starting drag-drop folder nesting test');

    // ============================================================
    // SETUP: Initialize database and create folders
    // ============================================================

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] ✓ App loaded');

    // Create parent folder
    const parentFolderName = `Parent ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(parentFolderName);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created parent folder:', parentFolderName);

    // Create child folder (initially at root)
    const childFolderName = `Child ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(childFolderName);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created child folder:', childFolderName);

    // ============================================================
    // PART 1: VERIFY BOTH FOLDERS START AT ROOT LEVEL
    // ============================================================

    const initialChildFolder = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id, name, parent_folder_id FROM folders WHERE name = ?',
        [name]
      );
      if (result.rows.length === 0) return null;
      const folder = {};
      result.columns.forEach((col, idx) => {
        const value = result.rows[0].values[idx];
        folder[col] = value.type === 'Null' ? null : value.value;
      });
      return folder;
    }, childFolderName);

    console.log('[E2E] Initial child folder:', initialChildFolder);
    expect(initialChildFolder).not.toBeNull();
    expect(initialChildFolder.parent_folder_id).toBe('root');
    console.log('[E2E] ✓ Child folder starts at root level');

    // ============================================================
    // PART 2: DRAG CHILD FOLDER ONTO PARENT FOLDER
    // ============================================================

    // Find the folder elements by their data-testid and text content
    const parentFolderElement = page.locator('[data-testid="folder-item"]').filter({ hasText: parentFolderName });
    const childFolderElement = page.locator('[data-testid="folder-item"]').filter({ hasText: childFolderName });

    // Verify both elements exist
    await expect(parentFolderElement).toBeVisible();
    await expect(childFolderElement).toBeVisible();
    console.log('[E2E] ✓ Both folder elements visible');

    // Perform drag and drop: drag child onto parent
    await childFolderElement.dragTo(parentFolderElement);
    console.log('[E2E] ✓ Executed drag-and-drop');

    // Wait for database update
    await page.waitForTimeout(1000);

    // ============================================================
    // PART 3: VERIFY DATABASE WAS UPDATED
    // ============================================================

    const parentFolderId = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id FROM folders WHERE name = ?',
        [name]
      );
      if (result.rows.length === 0) return null;
      const value = result.rows[0].values[0];
      return value.type === 'Null' ? null : value.value;
    }, parentFolderName);

    const updatedChildFolder = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id, name, parent_folder_id FROM folders WHERE name = ?',
        [name]
      );
      if (result.rows.length === 0) return null;
      const folder = {};
      result.columns.forEach((col, idx) => {
        const value = result.rows[0].values[idx];
        folder[col] = value.type === 'Null' ? null : value.value;
      });
      return folder;
    }, childFolderName);

    console.log('[E2E] Updated child folder:', updatedChildFolder);
    console.log('[E2E] Parent folder ID:', parentFolderId);

    // CRITICAL ASSERTION: child's parent_folder_id should now point to parent
    expect(updatedChildFolder.parent_folder_id).toBe(parentFolderId);
    console.log('[E2E] ✓✓✓ DATABASE UPDATED: Child folder now nested under parent!');

    // ============================================================
    // PART 4: VERIFY UI REFLECTS THE NESTING
    // ============================================================

    // Child folder should now have visual indicator of nesting (indentation or icon)
    const childFolderAfterDrag = page.locator('[data-testid="folder-item"]').filter({ hasText: childFolderName });
    await expect(childFolderAfterDrag).toBeVisible();

    // Check for nesting indicator (could be indentation class, icon, etc.)
    const hasNestingIndicator = await childFolderAfterDrag.evaluate((el) => {
      // Check for indentation or nested class
      const style = window.getComputedStyle(el);
      const paddingLeft = parseInt(style.paddingLeft);
      const marginLeft = parseInt(style.marginLeft);
      return paddingLeft > 10 || marginLeft > 10 || el.classList.contains('nested') || el.getAttribute('data-nested') === 'true';
    });

    expect(hasNestingIndicator).toBe(true);
    console.log('[E2E] ✓ UI shows nesting indicator');

    console.log('[E2E] ✓✓✓ DRAG-DROP FOLDER NESTING TEST PASSED ✓✓✓');
  });

  test('Drag nested folder back to root level (un-nest)', async ({ page }) => {
    console.log('[E2E] Starting drag-drop folder un-nesting test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create parent and child folders, then nest child under parent
    const parentFolderName = `Parent ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(parentFolderName);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);

    const childFolderName = `Child ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(childFolderName);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);

    // Manually nest child under parent via database (setup)
    await page.evaluate(async (names) => {
      const parentResult = await window.basaltDb.executeQuery(
        'SELECT folder_id FROM folders WHERE name = ?',
        [names.parent]
      );
      const parentId = parentResult.rows[0].values[0].value;

      await window.basaltDb.executeQuery(
        'UPDATE folders SET parent_folder_id = ?, updated_at = ? WHERE name = ?',
        [parentId, new Date().toISOString(), names.child]
      );
    }, { parent: parentFolderName, child: childFolderName });

    await page.reload();
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] ✓ Setup complete: child nested under parent');

    // Verify child is nested
    const nestedChildFolder = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT parent_folder_id FROM folders WHERE name = ?',
        [name]
      );
      const value = result.rows[0].values[0];
      return value.type === 'Null' ? null : value.value;
    }, childFolderName);

    expect(nestedChildFolder).not.toBe('root');
    console.log('[E2E] ✓ Child folder is nested (parent_folder_id != root)');

    // Drag child folder to root drop zone
    const childFolderElement = page.locator('[data-testid="folder-item"]').filter({ hasText: childFolderName });
    const rootDropZone = page.locator('[data-testid="root-drop-zone"]');

    await expect(childFolderElement).toBeVisible();
    await expect(rootDropZone).toBeVisible();

    await childFolderElement.dragTo(rootDropZone);
    console.log('[E2E] ✓ Dragged child to root drop zone');

    await page.waitForTimeout(1000);

    // Verify database updated to root
    const unnestedChildFolder = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT parent_folder_id FROM folders WHERE name = ?',
        [name]
      );
      const value = result.rows[0].values[0];
      return value.type === 'Null' ? null : value.value;
    }, childFolderName);

    expect(unnestedChildFolder).toBe('root');
    console.log('[E2E] ✓✓✓ DATABASE UPDATED: Child folder back at root level!');

    console.log('[E2E] ✓✓✓ DRAG-DROP UN-NESTING TEST PASSED ✓✓✓');
  });

  test('Drag note to different folder', async ({ page }) => {
    console.log('[E2E] Starting drag note to folder test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create two folders
    const folder1Name = `Folder1 ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(folder1Name);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);

    const folder2Name = `Folder2 ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(folder2Name);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);

    // Select folder1 and create a note in it
    await page.locator('[data-testid="note-folder-select"]').selectOption({ label: folder1Name });

    const noteName = `Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteName);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note in folder1');

    // Verify note is in folder1
    const folder1Id = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id FROM folders WHERE name = ?',
        [name]
      );
      return result.rows[0].values[0].value;
    }, folder1Name);

    const initialNote = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, folder_id FROM notes WHERE title = ?',
        [name]
      );
      const note = {};
      result.columns.forEach((col, idx) => {
        const value = result.rows[0].values[idx];
        note[col] = value.type === 'Null' ? null : value.value;
      });
      return note;
    }, noteName);

    expect(initialNote.folder_id).toBe(folder1Id);
    console.log('[E2E] ✓ Note initially in folder1');

    // Drag note to folder2
    const noteElement = page.locator('[data-testid="note-item"]').filter({ hasText: noteName });
    const folder2Element = page.locator('[data-testid="folder-item"]').filter({ hasText: folder2Name });

    await expect(noteElement).toBeVisible();
    await expect(folder2Element).toBeVisible();

    await noteElement.dragTo(folder2Element);
    console.log('[E2E] ✓ Dragged note to folder2');

    await page.waitForTimeout(1000);

    // Verify note moved to folder2
    const folder2Id = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id FROM folders WHERE name = ?',
        [name]
      );
      return result.rows[0].values[0].value;
    }, folder2Name);

    const updatedNote = await page.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id FROM notes WHERE title = ?',
        [name]
      );
      const value = result.rows[0].values[0];
      return value.type === 'Null' ? null : value.value;
    }, noteName);

    expect(updatedNote).toBe(folder2Id);
    console.log('[E2E] ✓✓✓ DATABASE UPDATED: Note moved to folder2!');

    console.log('[E2E] ✓✓✓ DRAG NOTE TO FOLDER TEST PASSED ✓✓✓');
  });

  test('Drag-drop changes sync to other tabs', async ({ browser }) => {
    console.log('[E2E] Starting multi-tab drag-drop sync test');

    const context = await browser.newContext();
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();

    // Initialize both tabs
    await tab1.goto('http://localhost:3000');
    await tab1.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    await tab2.goto('http://localhost:3000');
    await tab2.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    console.log('[E2E] ✓ Both tabs loaded');

    // Create folders in tab1
    const parentName = `Parent ${Date.now()}`;
    await tab1.locator('[data-testid="folder-name-input"]').fill(parentName);
    await tab1.locator('[data-testid="create-folder-button"]').click();
    await tab1.waitForTimeout(500);

    const childName = `Child ${Date.now()}`;
    await tab1.locator('[data-testid="folder-name-input"]').fill(childName);
    await tab1.locator('[data-testid="create-folder-button"]').click();
    await tab1.waitForTimeout(500);

    // Wait for sync to tab2
    await tab2.waitForTimeout(1500);

    // Verify folders visible in tab2
    await expect(tab2.locator('[data-testid="folder-item"]').filter({ hasText: parentName })).toBeVisible();
    await expect(tab2.locator('[data-testid="folder-item"]').filter({ hasText: childName })).toBeVisible();
    console.log('[E2E] ✓ Folders synced to tab2');

    // Perform drag-drop in tab1
    const parentElement = tab1.locator('[data-testid="folder-item"]').filter({ hasText: parentName });
    const childElement = tab1.locator('[data-testid="folder-item"]').filter({ hasText: childName });

    await childElement.dragTo(parentElement);
    console.log('[E2E] ✓ Drag-drop executed in tab1');

    // Wait for sync
    await tab2.waitForTimeout(2000);

    // Verify change synced to tab2
    const childParentId = await tab2.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT parent_folder_id FROM folders WHERE name = ?',
        [name]
      );
      const value = result.rows[0].values[0];
      return value.type === 'Null' ? null : value.value;
    }, childName);

    const parentId = await tab2.evaluate(async (name) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT folder_id FROM folders WHERE name = ?',
        [name]
      );
      return result.rows[0].values[0].value;
    }, parentName);

    expect(childParentId).toBe(parentId);
    console.log('[E2E] ✓✓✓ DRAG-DROP SYNCED TO TAB2!');

    await context.close();
    console.log('[E2E] ✓✓✓ MULTI-TAB DRAG-DROP SYNC TEST PASSED ✓✓✓');
  });
});
