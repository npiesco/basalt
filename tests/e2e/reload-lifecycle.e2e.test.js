/**
 * Test to check EXACT database state during reload sequence
 * This will tell us exactly when notes disappear
 */

import { test, expect } from '@playwright/test';

test.describe('Database State During Reload', () => {
  test('Track database contents through entire reload lifecycle', async ({ page }) => {
    // Capture all console logs with timestamps
    const logs = [];
    page.on('console', msg => {
      const timestamp = Date.now();
      const text = msg.text();
      logs.push({ timestamp, text });
      if (text.includes('PWA') || text.includes('note') || text.includes('folder') || text.includes('Loaded')) {
        console.log(`[${timestamp}] ${text}`);
      }
    });

    // Initial load
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('\n=== STEP 1: Initial state after page load ===');
    const initialState = await page.evaluate(async () => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      return {
        noteCount: notes.rows.length,
        folderCount: folders.rows.length
      };
    });
    console.log('Initial notes:', initialState.noteCount);
    console.log('Initial folders:', initialState.folderCount);

    // Create a note
    console.log('\n=== STEP 2: Creating note via UI ===');
    const testTitle = 'Lifecycle Test ' + Date.now();
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("' + testTitle + '")', { timeout: 5000 });

    // Wait for sync to complete
    await page.waitForTimeout(2000);

    console.log('\n=== STEP 3: After note creation ===');
    const afterCreate = await page.evaluate(async (title) => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      const targetNote = await window.basaltDb.executeQuery(
        'SELECT * FROM notes WHERE title = ?',
        [title]
      );
      return {
        noteCount: notes.rows.length,
        folderCount: folders.rows.length,
        targetNoteExists: targetNote.rows.length > 0
      };
    }, testTitle);
    console.log('Notes:', afterCreate.noteCount);
    console.log('Folders:', afterCreate.folderCount);
    console.log('Target note exists:', afterCreate.targetNoteExists);
    expect(afterCreate.targetNoteExists).toBe(true);

    // Check IndexedDB before reload
    console.log('\n=== STEP 4: IndexedDB state before reload ===');
    const idbBeforeReload = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.map(db => ({ name: db.name, version: db.version }));
    });
    console.log('IndexedDB databases:', JSON.stringify(idbBeforeReload));

    // RELOAD
    console.log('\n=== STEP 5: RELOADING PAGE ===\n');
    await page.reload({ waitUntil: 'networkidle' });

    // Check database IMMEDIATELY after reload, BEFORE initialization completes
    console.log('=== STEP 6: Checking DB immediately after reload (before init completes) ===');

    // Wait for database to exist but don't wait for app ready
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    // Check state RIGHT after database is initialized
    const immediatelyAfterReload = await page.evaluate(async (title) => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      const targetNote = await window.basaltDb.executeQuery(
        'SELECT * FROM notes WHERE title = ?',
        [title]
      );

      // Also check the raw sqlite_master to see what tables exist
      const tables = await window.basaltDb.executeQuery(
        "SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name",
        []
      );

      return {
        noteCount: notes.rows.length,
        folderCount: folders.rows.length,
        targetNoteExists: targetNote.rows.length > 0,
        tableCount: tables.rows.length
      };
    }, testTitle);

    console.log('Notes immediately after reload:', immediatelyAfterReload.noteCount);
    console.log('Folders immediately after reload:', immediatelyAfterReload.folderCount);
    console.log('Target note exists:', immediatelyAfterReload.targetNoteExists);
    console.log('Tables:', immediatelyAfterReload.tableCount);

    // Wait for app to be fully ready
    await page.waitForTimeout(2000);

    console.log('\n=== STEP 7: After app fully initialized ===');
    const afterInitComplete = await page.evaluate(async (title) => {
      const notes = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
      const folders = await window.basaltDb.executeQuery('SELECT * FROM folders', []);
      const targetNote = await window.basaltDb.executeQuery(
        'SELECT * FROM notes WHERE title = ?',
        [title]
      );
      return {
        noteCount: notes.rows.length,
        folderCount: folders.rows.length,
        targetNoteExists: targetNote.rows.length > 0
      };
    }, testTitle);

    console.log('Notes after init complete:', afterInitComplete.noteCount);
    console.log('Folders after init complete:', afterInitComplete.folderCount);
    console.log('Target note exists:', afterInitComplete.targetNoteExists);

    // Print relevant log timeline
    console.log('\n=== KEY LOG TIMELINE ===');
    const relevantLogs = logs.filter(log =>
      log.text.includes('Created root') ||
      log.text.includes('Loaded notes') ||
      log.text.includes('Loaded folders') ||
      log.text.includes('Note created') ||
      log.text.includes('App ready')
    );
    relevantLogs.forEach(log => console.log(log.text));

    // THE ASSERTION - notes must persist
    expect(afterInitComplete.noteCount).toBe(afterCreate.noteCount);
    expect(afterInitComplete.targetNoteExists).toBe(true);
  });
});
