/**
 * E2E Integration Tests for Data Persistence Across Page Reloads
 *
 * Tests that data persists to IndexedDB and survives page reloads.
 * Uses real absurder-sql WASM + IndexedDB + React UI.
 *
 * NO MOCKS - Full stack integration testing.
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Data Persistence Through Page Reloads', () => {

  test('Notes and folders persist across page reloads', async ({ page }) => {
    // Listen to browser console for debugging autosave
    page.on('console', msg => {
      if (msg.text().includes('AUTOSAVE') || msg.text().includes('ERROR')) {
        console.log(`[Browser]`, msg.text());
      }
    });

    const folderName = `Persistent Folder ${Date.now()}`;
    const note1Title = `Persistent Note 1 ${Date.now()}`;
    const note2Title = `Persistent Note 2 ${Date.now()}`;
    const noteBody = 'This content must survive reload';

    console.log('[E2E] Creating data before reload...');

    // Navigate to the PWA
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create a folder
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    // Select the folder
    await page.selectOption('[data-testid="note-folder-select"]', { label: folderName });

    // Create first note
    await page.fill('[data-testid="note-title-input"]', note1Title);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${note1Title}")`);

    // Create second note with body content
    await page.fill('[data-testid="note-title-input"]', note2Title);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${note2Title}")`);

    // Edit the note using CodeMirror + autosave
    await page.click(`[data-testid="note-item"]:has-text("${note2Title}")`);
    await page.waitForTimeout(500);
    await page.waitForSelector('.cm-content');

    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(noteBody);

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
    await page.waitForTimeout(1000);

    console.log('[E2E] Data created. Waiting for IndexedDB sync...');

    // Wait longer for IndexedDB to fully persist (absurder-sql sync is async)
    await page.waitForTimeout(2000);

    // DEBUG: Check if data is in database before reload
    const bodyBeforeReload = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT body FROM notes WHERE title = ?',
        [title]
      );
      // executeQuery returns {rows: [...], columns: [...]}
      if (result.rows && result.rows.length > 0) {
        const bodyValue = result.rows[0].values[0];
        return bodyValue.type === 'Null' ? null : bodyValue.value;
      }
      return null;
    }, note2Title);
    console.log('[E2E] Body in DB BEFORE reload:', bodyBeforeReload);

    console.log('[E2E] Reloading page...');

    // RELOAD THE PAGE - This is the critical test
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    console.log('[E2E] Page reloaded. Verifying data persistence...');

    // Verify folder still exists
    const folderExists = await page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`).count();
    console.log('[E2E] Folder exists after reload:', folderExists);
    expect(folderExists).toBe(1);

    // Verify notes still exist
    const note1Exists = await page.locator(`[data-testid="note-item"]:has-text("${note1Title}")`).count();
    const note2Exists = await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).count();
    console.log('[E2E] Note 1 exists after reload:', note1Exists);
    console.log('[E2E] Note 2 exists after reload:', note2Exists);
    expect(note1Exists).toBe(1);
    expect(note2Exists).toBe(1);

    // Verify note body content persisted (check via database)
    const note2BodyFromDb = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT body FROM notes WHERE title = ?',
        [title]
      );
      if (result.rows && result.rows.length > 0) {
        const bodyValue = result.rows[0].values[0];
        return bodyValue.type === 'Null' ? null : bodyValue.value;
      }
      return null;
    }, note2Title);

    console.log('[E2E] Note body after reload:', note2BodyFromDb);
    expect(note2BodyFromDb).toBe(noteBody);

    // Verify data in database
    const dbData = await page.evaluate(async (data) => {
      const folderResult = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM folders WHERE name = ?',
        [data.folderName]
      );
      const note1Result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM notes WHERE title = ?',
        [data.note1Title]
      );
      const note2Result = await window.basaltDb.executeQuery(
        'SELECT body FROM notes WHERE title = ?',
        [data.note2Title]
      );

      return {
        folderCount: folderResult.rows[0].values[0].value,
        note1Count: note1Result.rows[0].values[0].value,
        note2Body: note2Result.rows[0]?.values[0]?.value || ''
      };
    }, { folderName, note1Title, note2Title });

    console.log('[E2E] ✓ Data verified in database after reload:', dbData);

    expect(dbData.folderCount).toBe(1);
    expect(dbData.note1Count).toBe(1);
    expect(dbData.note2Body).toBe(noteBody);
  });

  test('Multiple page reloads preserve data integrity', async ({ page }) => {
    const folderName = `Multi Reload Folder ${Date.now()}`;
    const noteTitle = `Multi Reload Note ${Date.now()}`;

    console.log('[E2E] Creating data...');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create folder and note
    await page.fill('[data-testid="folder-name-input"]', folderName);
    await page.click('[data-testid="create-folder-button"]');
    await page.waitForSelector(`[data-testid="folder-item"]:has-text("${folderName}")`);

    await page.selectOption('[data-testid="note-folder-select"]', { label: folderName });
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    await page.waitForTimeout(500);

    console.log('[E2E] Reload #1...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    expect(await page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`).count()).toBe(1);
    expect(await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).count()).toBe(1);

    await page.waitForTimeout(500);

    console.log('[E2E] Reload #2...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    expect(await page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`).count()).toBe(1);
    expect(await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).count()).toBe(1);

    await page.waitForTimeout(500);

    console.log('[E2E] Reload #3...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    expect(await page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`).count()).toBe(1);
    expect(await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).count()).toBe(1);

    console.log('[E2E] ✓ Data survived 3 reloads');
  });

  test('Edited note content persists after reload', async ({ page }) => {
    const noteTitle = `Edit Persist ${Date.now()}`;
    const originalBody = 'Original content';
    const editedBody = 'Edited content that must persist';

    console.log('[E2E] Creating and editing note...');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Create note
    await page.fill('[data-testid="note-title-input"]', noteTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTitle}")`);

    // Edit note using CodeMirror - add initial body
    await page.click(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    await page.waitForTimeout(500);
    await page.waitForSelector('.cm-content');

    let cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type(originalBody);

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Edit again - replace with edited body
    await page.click(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    await page.waitForTimeout(500);
    await page.waitForSelector('.cm-content');

    cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(editedBody);

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
    await page.waitForTimeout(2000);

    console.log('[E2E] Reloading...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Verify edited content persisted (check via database)
    const bodyAfterReload = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT body FROM notes WHERE title = ?',
        [title]
      );
      if (result.rows && result.rows.length > 0) {
        const bodyValue = result.rows[0].values[0];
        return bodyValue.type === 'Null' ? null : bodyValue.value;
      }
      return null;
    }, noteTitle);

    console.log('[E2E] ✓ Edited content persisted:', bodyAfterReload);
    expect(bodyAfterReload).toBe(editedBody);
  });

});
