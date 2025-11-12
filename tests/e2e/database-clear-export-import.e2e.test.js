// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * INTEGRATION TEST: Complete Export/Import Cycle with Database Clearing
 *
 * Tests the full end-to-end workflow:
 * 1. Create data (notes, folders)
 * 2. Export database to .db file
 * 3. Clear database (delete all data)
 * 4. Import database from .db file
 * 5. Verify all data restored correctly
 *
 * This mimics the tests in https://github.com/npiesco/absurder-sql/tree/main/tests/e2e
 * NO MOCKS - tests real export/import with database clearing
 */

test.describe('INTEGRATION: Complete Export/Import Cycle', () => {
  test('Clear database removes all data', async ({ page }) => {
    console.log('[E2E] Starting database clear test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] ✓ App loaded');

    // Create test data
    const folderName = `Test Folder ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(folderName);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);

    const noteName = `Test Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteName);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created test data');

    // Verify data exists
    const beforeClear = await page.evaluate(async () => {
      const notesResult = await window.basaltDb.executeQuery('SELECT COUNT(*) as count FROM notes', []);
      const foldersResult = await window.basaltDb.executeQuery('SELECT COUNT(*) as count FROM folders WHERE folder_id != "root"', []);
      return {
        notes: notesResult.rows[0].values[0].value,
        folders: foldersResult.rows[0].values[0].value
      };
    });

    expect(beforeClear.notes).toBeGreaterThan(0);
    expect(beforeClear.folders).toBeGreaterThan(0);
    console.log('[E2E] ✓ Data exists:', beforeClear);

    // Clear database using window API (bypassing confirmation dialog)
    await page.evaluate(async () => {
      await window.basaltDb.clearDatabase();
    });
    await page.waitForTimeout(1000);
    console.log('[E2E] ✓ Database cleared via API');

    // Reload to refresh UI
    await page.reload();
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Verify data is gone
    const afterClear = await page.evaluate(async () => {
      const notesResult = await window.basaltDb.executeQuery('SELECT COUNT(*) as count FROM notes', []);
      const foldersResult = await window.basaltDb.executeQuery('SELECT COUNT(*) as count FROM folders WHERE folder_id != "root"', []);
      return {
        notes: notesResult.rows[0].values[0].value,
        folders: foldersResult.rows[0].values[0].value
      };
    });

    expect(afterClear.notes).toBe(0);
    expect(afterClear.folders).toBe(0);
    console.log('[E2E] ✓✓✓ DATABASE CLEARED SUCCESSFULLY:', afterClear);

    // Verify UI is empty
    const noteCount = await page.locator('[data-testid="note-item"]').count();
    expect(noteCount).toBe(0);
    console.log('[E2E] ✓ UI reflects empty database');
  });

  test('Export → Clear → Import restores all data', async ({ page }) => {
    console.log('[E2E] Starting export → clear → import test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // ============================================================
    // STEP 1: CREATE TEST DATA
    // ============================================================

    console.log('[E2E] Step 1: Creating test data');

    // Create folders
    const folder1 = `Marketing ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(folder1);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);

    const folder2 = `Engineering ${Date.now()}`;
    await page.locator('[data-testid="folder-name-input"]').fill(folder2);
    await page.locator('[data-testid="create-folder-button"]').click();
    await page.waitForTimeout(500);

    // Select folder1 and create notes
    await page.locator('[data-testid="note-folder-select"]').selectOption({ label: folder1 });

    const note1 = `Q4 Strategy ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note1);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    // Select folder2 and create notes
    await page.locator('[data-testid="note-folder-select"]').selectOption({ label: folder2 });

    const note2 = `API Design ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note2);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const note3 = `Database Schema ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note3);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    console.log('[E2E] ✓ Created: 2 folders, 3 notes');

    // Verify initial data
    const initialData = await page.evaluate(async () => {
      const notesResult = await window.basaltDb.executeQuery(
        'SELECT note_id, title, folder_id FROM notes ORDER BY title',
        []
      );
      const foldersResult = await window.basaltDb.executeQuery(
        'SELECT folder_id, name FROM folders WHERE folder_id != "root" ORDER BY name',
        []
      );

      return {
        notes: notesResult.rows.map(row => ({
          id: row.values[0].value,
          title: row.values[1].value,
          folderId: row.values[2].value
        })),
        folders: foldersResult.rows.map(row => ({
          id: row.values[0].value,
          name: row.values[1].value
        }))
      };
    });

    expect(initialData.notes.length).toBe(3);
    expect(initialData.folders.length).toBe(2);
    console.log('[E2E] ✓ Initial data verified:', initialData);

    // ============================================================
    // STEP 2: EXPORT DATABASE
    // ============================================================

    console.log('[E2E] Step 2: Exporting database');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="export-button"]').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/basalt-vault-.*\.db/);
    const exportPath = `/tmp/exported-${Date.now()}.db`;
    await download.saveAs(exportPath);
    console.log('[E2E] ✓ Exported to:', exportPath);

    // Verify export file size
    const fs = require('fs');
    const exportStats = fs.statSync(exportPath);
    expect(exportStats.size).toBeGreaterThan(70000); // Should be ~77KB+
    console.log('[E2E] ✓ Export file size:', exportStats.size, 'bytes');

    // ============================================================
    // STEP 3: CLEAR DATABASE
    // ============================================================

    console.log('[E2E] Step 3: Clearing database');

    await page.evaluate(async () => {
      await window.basaltDb.clearDatabase();
    });
    await page.waitForTimeout(1000);

    // Reload and verify empty
    await page.reload();
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    const afterClear = await page.evaluate(async () => {
      const notesResult = await window.basaltDb.executeQuery('SELECT COUNT(*) as count FROM notes', []);
      const foldersResult = await window.basaltDb.executeQuery('SELECT COUNT(*) as count FROM folders WHERE folder_id != "root"', []);
      return {
        notes: notesResult.rows[0].values[0].value,
        folders: foldersResult.rows[0].values[0].value
      };
    });

    expect(afterClear.notes).toBe(0);
    expect(afterClear.folders).toBe(0);
    console.log('[E2E] ✓ Database cleared:', afterClear);

    // ============================================================
    // STEP 4: IMPORT DATABASE
    // ============================================================

    console.log('[E2E] Step 4: Importing database');

    // Set up file chooser to select the exported file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('[data-testid="import-button"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(exportPath);

    // Confirm import
    await page.waitForSelector('[data-testid="import-confirm-dialog"]', { timeout: 5000 });
    await page.locator('[data-testid="import-confirm-button"]').click();

    // Wait for import to complete
    await page.waitForTimeout(2000);
    console.log('[E2E] ✓ Import completed');

    // Reload page to reinitialize database connection after import
    await page.reload();
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('[E2E] ✓ Page reloaded after import');

    // ============================================================
    // STEP 5: VERIFY DATA RESTORED
    // ============================================================

    console.log('[E2E] Step 5: Verifying restored data');

    const restoredData = await page.evaluate(async () => {
      const notesResult = await window.basaltDb.executeQuery(
        'SELECT note_id, title, folder_id FROM notes ORDER BY title',
        []
      );
      const foldersResult = await window.basaltDb.executeQuery(
        'SELECT folder_id, name FROM folders WHERE folder_id != "root" ORDER BY name',
        []
      );

      return {
        notes: notesResult.rows.map(row => ({
          id: row.values[0].value,
          title: row.values[1].value,
          folderId: row.values[2].value
        })),
        folders: foldersResult.rows.map(row => ({
          id: row.values[0].value,
          name: row.values[1].value
        }))
      };
    });

    console.log('[E2E] Initial data counts:', {
      notes: initialData.notes.length,
      folders: initialData.folders.length
    });
    console.log('[E2E] Restored data counts:', {
      notes: restoredData.notes.length,
      folders: restoredData.folders.length
    });

    // Verify counts match
    expect(restoredData.notes.length).toBe(initialData.notes.length);
    expect(restoredData.folders.length).toBe(initialData.folders.length);

    // Verify note titles match
    const restoredTitles = restoredData.notes.map(n => n.title).sort();
    const originalTitles = initialData.notes.map(n => n.title).sort();
    expect(restoredTitles).toEqual(originalTitles);

    // Verify folder names match
    const restoredFolderNames = restoredData.folders.map(f => f.name).sort();
    const originalFolderNames = initialData.folders.map(f => f.name).sort();
    expect(restoredFolderNames).toEqual(originalFolderNames);

    console.log('[E2E] ✓✓✓ ALL DATA RESTORED CORRECTLY!');
    console.log('[E2E] Notes:', restoredTitles);
    console.log('[E2E] Folders:', restoredFolderNames);

    // Verify UI shows restored data
    const uiNoteCount = await page.locator('[data-testid="note-item"]').count();
    expect(uiNoteCount).toBe(3);
    console.log('[E2E] ✓ UI shows all restored notes');

    // Clean up export file
    fs.unlinkSync(exportPath);
    console.log('[E2E] ✓ Cleaned up test file');

    console.log('[E2E] ✓✓✓ EXPORT → CLEAR → IMPORT CYCLE COMPLETE!');
  });

  test('Clear button works from UI with confirmation', async ({ page }) => {
    console.log('[E2E] Starting UI clear button test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create test data
    await page.locator('[data-testid="note-title-input"]').fill(`Test ${Date.now()}`);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const beforeCount = await page.locator('[data-testid="note-item"]').count();
    expect(beforeCount).toBeGreaterThan(0);
    console.log('[E2E] ✓ Created test note');

    // Click clear button and confirm
    page.once('dialog', dialog => {
      expect(dialog.message()).toContain('delete ALL notes');
      dialog.accept();
    });

    await page.locator('[data-testid="clear-database-button"]').click();
    await page.waitForTimeout(1000);
    console.log('[E2E] ✓ Clear button clicked and confirmed');

    // Verify data cleared
    const afterCount = await page.locator('[data-testid="note-item"]').count();
    expect(afterCount).toBe(0);
    console.log('[E2E] ✓✓✓ UI CLEAR BUTTON WORKS!');
  });
});
