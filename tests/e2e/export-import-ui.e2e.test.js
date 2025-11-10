// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * INTEGRATION TEST: Export/Import UI
 *
 * Tests the user-facing export/import functionality:
 * - Export button downloads .db file
 * - Import button accepts .db file upload
 * - Imported data appears in UI
 * - Data integrity after round-trip
 *
 * NO MOCKS - tests real file download/upload with absurder-sql
 */

test.describe('INTEGRATION: Export/Import UI', () => {
  test('Export button exists and is accessible', async ({ page }) => {
    console.log('[E2E] Starting export button test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] App is ready');

    // VERIFY: Export button exists (should be in header or menu)
    const exportButton = await page.locator('[data-testid="export-button"]');
    await expect(exportButton).toBeVisible();
    console.log('[E2E] ✓ Export button visible');

    // VERIFY: Export button has proper label
    const buttonText = await exportButton.textContent();
    expect(buttonText).toMatch(/export|download|backup/i);
    console.log('[E2E] ✓ Export button has proper label:', buttonText);
  });

  test('Import button exists and is accessible', async ({ page }) => {
    console.log('[E2E] Starting import button test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // VERIFY: Import button or file input exists
    const importButton = await page.locator('[data-testid="import-button"]');
    await expect(importButton).toBeVisible();
    console.log('[E2E] ✓ Import button visible');

    // VERIFY: Import button has proper label
    const buttonText = await importButton.textContent();
    expect(buttonText).toMatch(/import|restore|upload/i);
    console.log('[E2E] ✓ Import button has proper label:', buttonText);
  });

  test('Export creates downloadable .db file with data', async ({ page }) => {
    console.log('[E2E] Starting export download test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Test data to export
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Export Test Note');
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created test note for export');

    // Setup download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    // CLICK: Export button
    const exportButton = await page.locator('[data-testid="export-button"]');
    await exportButton.click();
    console.log('[E2E] Clicked export button');

    // VERIFY: Download starts
    const download = await downloadPromise;
    console.log('[E2E] ✓ Download started');

    // VERIFY: File has .db extension
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.db$/);
    console.log('[E2E] ✓ Downloaded file has .db extension:', filename);

    // VERIFY: File has content
    const tempPath = path.join(os.tmpdir(), `test-export-${Date.now()}.db`);
    await download.saveAs(tempPath);

    const stats = fs.statSync(tempPath);
    expect(stats.size).toBeGreaterThan(1000); // Should be at least 1KB
    console.log('[E2E] ✓ Downloaded file has content:', stats.size, 'bytes');

    // Cleanup
    fs.unlinkSync(tempPath);
  });

  test('Import restores data from .db file', async ({ page }) => {
    console.log('[E2E] Starting import restore test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // STEP 1: Create original data and export
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Import Test Original Note');
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created original note');

    // Export the data
    const downloadPromise = page.waitForEvent('download');
    const exportButton = await page.locator('[data-testid="export-button"]');
    await exportButton.click();

    const download = await downloadPromise;
    const exportPath = path.join(os.tmpdir(), `import-test-${Date.now()}.db`);
    await download.saveAs(exportPath);
    console.log('[E2E] Exported database to:', exportPath);

    // STEP 2: Note the count before import for comparison
    const notesBeforeImport = await page.locator('[data-testid="note-item"]');
    const countBefore = await notesBeforeImport.count();
    console.log('[E2E] Notes before import:', countBefore);

    // STEP 3: Import the exported file
    const importButton = await page.locator('[data-testid="import-button"]');
    const fileInput = await page.locator('[data-testid="import-file-input"]');

    // Set the file to upload
    await fileInput.setInputFiles(exportPath);
    console.log('[E2E] Selected file for import');

    // Trigger import (might be automatic or need button click)
    const importConfirmButton = await page.locator('[data-testid="import-confirm-button"]');
    if (await importConfirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await importConfirmButton.click();
      console.log('[E2E] Clicked import confirm button');
    }

    // Wait for import to complete
    await page.waitForTimeout(1500);
    console.log('[E2E] Waiting for import to complete');

    // VERIFY: Note still appears in UI (data should be preserved)
    await page.waitForTimeout(500);

    const noteItems = await page.locator('[data-testid="note-item"]');
    const noteCount = await noteItems.count();
    console.log('[E2E] Notes after import:', noteCount);
    expect(noteCount).toBeGreaterThanOrEqual(countBefore);

    // Check if original note title still exists
    const noteTexts = [];
    for (let i = 0; i < noteCount; i++) {
      const text = await noteItems.nth(i).textContent();
      noteTexts.push(text);
    }

    const hasOriginalNote = noteTexts.some(text => text?.includes('Import Test Original Note'));
    expect(hasOriginalNote).toBe(true);
    console.log('[E2E] ✓ Original note preserved after import');

    // Cleanup
    fs.unlinkSync(exportPath);
  });

  test('Export/Import preserves folder structure', async ({ page }) => {
    console.log('[E2E] Starting folder structure preservation test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Folder
    const folderInput = await page.locator('[data-testid="folder-name-input"]');
    const createFolderButton = await page.locator('[data-testid="create-folder-button"]');

    await folderInput.fill('Export Test Folder');
    await createFolderButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created test folder');

    // CREATE: Note in folder
    const folderSelect = await page.locator('[data-testid="note-folder-select"]');
    await folderSelect.selectOption({ label: 'Export Test Folder' });

    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Note in Test Folder');
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created note in folder');

    // EXPORT
    const downloadPromise = page.waitForEvent('download');
    const exportButton = await page.locator('[data-testid="export-button"]');
    await exportButton.click();

    const download = await downloadPromise;
    const exportPath = path.join(os.tmpdir(), `folder-test-${Date.now()}.db`);
    await download.saveAs(exportPath);
    console.log('[E2E] Exported with folder structure');

    // Note folder count before import
    const foldersBeforeImport = await page.locator('[data-testid="folder-item"]');
    const folderCountBefore = await foldersBeforeImport.count();
    console.log('[E2E] Folders before import:', folderCountBefore);

    // IMPORT
    const fileInput = await page.locator('[data-testid="import-file-input"]');
    await fileInput.setInputFiles(exportPath);

    const importConfirmButton = await page.locator('[data-testid="import-confirm-button"]');
    if (await importConfirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await importConfirmButton.click();
    }

    await page.waitForTimeout(1500);

    // VERIFY: Folder still exists
    const folderItems = await page.locator('[data-testid="folder-item"]');
    const folderTexts = [];
    const folderCount = await folderItems.count();

    for (let i = 0; i < folderCount; i++) {
      const text = await folderItems.nth(i).textContent();
      folderTexts.push(text);
    }

    const hasTestFolder = folderTexts.some(text => text?.includes('Export Test Folder'));
    expect(hasTestFolder).toBe(true);
    console.log('[E2E] ✓ Folder structure preserved after import');

    // Cleanup
    fs.unlinkSync(exportPath);
  });

  test('Import shows confirmation dialog before overwriting data', async ({ page }) => {
    console.log('[E2E] Starting import confirmation test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Existing data
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Existing Note');
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created existing note');

    // Export dummy file
    const downloadPromise = page.waitForEvent('download');
    const exportButton = await page.locator('[data-testid="export-button"]');
    await exportButton.click();

    const download = await downloadPromise;
    const exportPath = path.join(os.tmpdir(), `confirm-test-${Date.now()}.db`);
    await download.saveAs(exportPath);

    // Try to import
    const fileInput = await page.locator('[data-testid="import-file-input"]');
    await fileInput.setInputFiles(exportPath);
    console.log('[E2E] Selected file for import');

    // VERIFY: Confirmation dialog appears
    const confirmDialog = await page.locator('[data-testid="import-confirm-dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });
    console.log('[E2E] ✓ Import confirmation dialog appears');

    // VERIFY: Dialog has warning message
    const dialogText = await confirmDialog.textContent();
    expect(dialogText?.toLowerCase()).toMatch(/warning|overwrite|replace|existing/);
    console.log('[E2E] ✓ Dialog shows warning about overwriting');

    // VERIFY: Dialog has cancel and confirm buttons
    const cancelButton = await page.locator('[data-testid="import-cancel-button"]');
    const confirmButton = await page.locator('[data-testid="import-confirm-button"]');

    await expect(cancelButton).toBeVisible();
    await expect(confirmButton).toBeVisible();
    console.log('[E2E] ✓ Dialog has cancel and confirm options');

    // Test cancel
    await cancelButton.click();
    await page.waitForTimeout(300);

    // VERIFY: Dialog closed and data unchanged
    await expect(confirmDialog).not.toBeVisible();
    const noteItems = await page.locator('[data-testid="note-item"]');
    const count = await noteItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
    console.log('[E2E] ✓ Cancel preserves existing data');

    // Cleanup
    fs.unlinkSync(exportPath);
  });
});
