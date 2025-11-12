// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * INTEGRATION TEST: Offline Behavior Validation
 *
 * Tests that the PWA works completely offline:
 * - Load app while online
 * - Go offline (disconnect network)
 * - Create notes while offline
 * - Edit notes while offline
 * - Create folders while offline
 * - Search while offline
 * - Export while offline
 * - Go back online
 * - Verify all data still intact
 *
 * NO MOCKS - tests real offline PWA behavior with IndexedDB
 */

test.describe('INTEGRATION: Offline PWA Behavior', () => {
  test('App functions completely offline - notes, folders, search, and export', async ({ page, context }) => {
    console.log('[E2E] Starting comprehensive offline behavior test');

    // ============================================================
    // PART 1: BASIC OFFLINE CRUD OPERATIONS
    // ============================================================

    // STEP 1: Load app while ONLINE
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] ✓ App loaded while online');

    // Create initial note while online
    const onlineNoteTitle = `Online Note ${Date.now()}`;
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill(onlineNoteTitle);
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note while online:', onlineNoteTitle);

    // STEP 2: Go OFFLINE
    await context.setOffline(true);
    console.log('[E2E] ✓ Network disconnected (OFFLINE mode)');

    await page.waitForTimeout(500);

    // STEP 3: Create note while OFFLINE
    const offlineNoteTitle = `Offline Note ${Date.now()}`;
    await noteInput.fill(offlineNoteTitle);
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note while OFFLINE:', offlineNoteTitle);

    // VERIFY: Note appears in UI while offline
    const offlineNoteItem = await page.locator(`[data-testid="note-item"]`, {
      hasText: offlineNoteTitle
    });
    await expect(offlineNoteItem).toBeVisible();
    console.log('[E2E] ✓ Offline note visible in UI');

    // STEP 4: Edit note while OFFLINE
    await offlineNoteItem.click();
    await page.waitForTimeout(300);

    const bodyTextarea = await page.locator('[data-testid="editor-note-body"]');
    const offlineBodyContent = 'This was written completely offline!';
    await bodyTextarea.fill(offlineBodyContent);

    const saveButton = await page.locator('[data-testid="save-note-button"]');
    await saveButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Edited note while OFFLINE');

    // STEP 5: Create another note while offline
    const closeButton = await page.locator('[data-testid="cancel-edit-button"]');
    await closeButton.click();
    await page.waitForTimeout(300);

    const offlineNote2Title = `Second Offline Note ${Date.now()}`;
    await noteInput.fill(offlineNote2Title);
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created second note while OFFLINE:', offlineNote2Title);

    // STEP 6: Verify all offline changes are visible in UI
    const noteItems = await page.locator('[data-testid="note-item"]');
    let noteCount = await noteItems.count();
    expect(noteCount).toBeGreaterThanOrEqual(3); // online note + 2 offline notes
    console.log('[E2E] ✓ Notes persisted while offline, count:', noteCount);

    // VERIFY: Specific notes exist
    const hasOnlineNote = await page.locator(`[data-testid="note-item"]`, {
      hasText: onlineNoteTitle
    }).count();
    const hasOfflineNote1 = await page.locator(`[data-testid="note-item"]`, {
      hasText: offlineNoteTitle
    }).count();
    const hasOfflineNote2 = await page.locator(`[data-testid="note-item"]`, {
      hasText: offlineNote2Title
    }).count();

    expect(hasOnlineNote).toBe(1);
    expect(hasOfflineNote1).toBe(1);
    expect(hasOfflineNote2).toBe(1);
    console.log('[E2E] ✓ All notes present');

    // VERIFY: Edited content persisted
    await page.locator(`[data-testid="note-item"]`, { hasText: offlineNoteTitle }).click();
    await page.waitForTimeout(300);

    const bodyValue = await bodyTextarea.inputValue();
    expect(bodyValue).toBe(offlineBodyContent);
    console.log('[E2E] ✓ Offline edit persisted:', bodyValue);

    await closeButton.click();
    await page.waitForTimeout(300);

    // ============================================================
    // PART 2: FOLDERS WORK OFFLINE
    // ============================================================

    console.log('[E2E] Starting offline folder operations');

    // Create folder while offline
    const folderName = `Offline Folder ${Date.now()}`;
    const folderInput = await page.locator('[data-testid="folder-name-input"]');
    const createFolderButton = await page.locator('[data-testid="create-folder-button"]');

    await folderInput.fill(folderName);
    await createFolderButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created folder while offline:', folderName);

    // Verify folder appears
    const folderItem = await page.locator(`[data-testid="folder-item"]`, {
      hasText: folderName
    });
    await expect(folderItem).toBeVisible();
    console.log('[E2E] ✓ Offline folder visible');

    // Create note in offline folder
    const folderSelect = await page.locator('[data-testid="note-folder-select"]');
    await folderSelect.selectOption({ label: folderName });

    const noteInFolderTitle = `Note in Offline Folder ${Date.now()}`;
    await noteInput.fill(noteInFolderTitle);
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note in offline folder');

    // Verify both folder and note exist
    const folderExists = await page.locator(`[data-testid="folder-item"]`, {
      hasText: folderName
    }).count();
    const noteInFolderExists = await page.locator(`[data-testid="note-item"]`, {
      hasText: noteInFolderTitle
    }).count();

    expect(folderExists).toBe(1);
    expect(noteInFolderExists).toBe(1);
    console.log('[E2E] ✓ Folder and note work offline');

    // ============================================================
    // PART 3: SEARCH WORKS OFFLINE
    // ============================================================

    console.log('[E2E] Starting offline search operations');

    // Create searchable note
    const searchableTitle = `Searchable Offline Content ${Date.now()}`;
    await folderSelect.selectOption({ index: 0 }); // Reset to default folder
    await noteInput.fill(searchableTitle);
    await createButton.click();
    await page.waitForTimeout(500);

    // Edit to add body content
    const searchableNoteItem = await page.locator('[data-testid="note-item"]').first();
    await searchableNoteItem.click();
    await page.waitForTimeout(300);

    await bodyTextarea.fill('This content should be findable offline via FTS5');
    await saveButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created searchable content while offline');

    await closeButton.click();
    await page.waitForTimeout(300);

    // Search while offline
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('findable');
    await page.waitForTimeout(800);
    console.log('[E2E] ✓ Performed search while offline');

    // Verify search results appear
    const searchResults = await page.locator('[data-testid="search-result-item"]');
    const resultCount = await searchResults.count();
    expect(resultCount).toBeGreaterThanOrEqual(1);
    console.log('[E2E] ✓ Search works offline, found', resultCount, 'results');

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(300);

    // ============================================================
    // PART 4: EXPORT WORKS OFFLINE
    // ============================================================

    console.log('[E2E] Starting offline export operations');

    // Try to export while offline
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const exportButton = await page.locator('[data-testid="export-button"]');
    await exportButton.click();
    console.log('[E2E] ✓ Clicked export while offline');

    // Verify export works offline
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.db$/);
    console.log('[E2E] ✓ Export works offline, filename:', filename);

    // ============================================================
    // PART 5: GO BACK ONLINE AND VERIFY DATA INTEGRITY
    // ============================================================

    console.log('[E2E] Going back online');

    // Go back ONLINE
    await context.setOffline(false);
    console.log('[E2E] ✓ Network reconnected (ONLINE mode)');

    await page.waitForTimeout(500);

    // VERIFY: Data still intact when back online
    noteCount = await noteItems.count();
    expect(noteCount).toBeGreaterThanOrEqual(4); // Should have at least 4 notes
    console.log('[E2E] ✓ All notes still present after going back online, count:', noteCount);

    // Create new note while back online
    const backOnlineNoteTitle = `Back Online Note ${Date.now()}`;
    await noteInput.fill(backOnlineNoteTitle);
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note after returning online:', backOnlineNoteTitle);

    // Final verification
    const finalCount = await noteItems.count();
    expect(finalCount).toBeGreaterThanOrEqual(5);
    console.log('[E2E] ✓ Final note count:', finalCount);
    console.log('[E2E] ✓ OFFLINE BEHAVIOR FULLY VALIDATED (Notes, Folders, Search, Export)');
  });
});
