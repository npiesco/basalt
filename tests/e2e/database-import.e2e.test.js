/**
 * E2E TEST - Database Import with Real IndexedDB
 *
 * Tests database import functionality in actual browser environment.
 * This test REQUIRES a real browser because:
 * - importFromFile() needs IndexedDB for persistence
 * - IndexedDB is not available in Node.js
 *
 * NO MOCKS - Uses real absurder-sql WASM in Chromium browser
 */

import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Database Import with IndexedDB', () => {
  test('Import .db file and validate all data', async ({ page }) => {
    // Capture console messages and errors
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[Browser Error]', error.message));

    // Navigate to test harness page
    console.log('[E2E] Navigating to test harness...');
    await page.goto('http://127.0.0.1:3456/tests/e2e/test-harness.html', { waitUntil: 'domcontentloaded' });

    console.log('[E2E] Page loaded, waiting for WASM initialization...');

    // Wait for WASM to initialize
    await page.waitForFunction(() => window.testHarnessReady === true, { timeout: 30000 });

    console.log('[E2E] Test harness ready');

    // Step 1: Create and export a database with test data
    const exportedDb = await page.evaluate(async () => {
      const { initDb, executeQuery, exportToFile } = window.dbClient;
      const absurderSql = window.absurderSql;

      // Create database
      const db = await initDb({
        absurderSql,
        storageKey: `export-source-${Date.now()}`,
      });

      console.log('[E2E] Database initialized for export');

      // Insert test data
      await executeQuery(db,
        'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['f1', 'Test Folder', null, '2025-11-09T00:00:00.000Z', '2025-11-09T00:00:00.000Z']
      );

      await executeQuery(db,
        'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['n1', 'f1', 'Test Note', 'Test content for import validation', '2025-11-09T00:00:00.000Z', '2025-11-09T00:00:00.000Z']
      );

      await executeQuery(db,
        'INSERT INTO tags (tag_id, label, created_at) VALUES (?, ?, ?)',
        ['t1', 'test-tag', '2025-11-09T00:00:00.000Z']
      );

      await executeQuery(db,
        'INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)',
        ['n1', 't1']
      );

      console.log('[E2E] Test data inserted');

      // Export database
      const exported = await exportToFile(db);
      console.log(`[E2E] Exported database: ${exported.byteLength} bytes`);

      // Convert to base64 for passing back to Node.js
      const base64 = btoa(String.fromCharCode(...exported));
      return { bytes: exported.byteLength, data: base64 };
    });

    console.log(`[E2E] Exported ${exportedDb.bytes} bytes`);
    expect(exportedDb.bytes).toBeGreaterThan(0);

    // Step 2: Import the database file
    await page.evaluate(async (base64Data) => {
      const { initDb, importFromFile } = window.dbClient;
      const absurderSql = window.absurderSql;
      const Database = absurderSql.Database;

      // Convert base64 back to Uint8Array
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log(`[E2E] Importing ${bytes.byteLength} bytes`);

      // Create new database for import
      const storageKey = `import-target-${Date.now()}`;
      const db = await initDb({
        absurderSql,
        storageKey,
      });

      console.log('[E2E] Target database initialized');

      // Import the file (this closes the database connection)
      await importFromFile(db, bytes);
      console.log('[E2E] Import completed');

      // IMPORTANT: importFromFile() closes the database connection!
      // We must reopen it to query the imported data
      console.log('[E2E] Reopening database after import...');
      const reopenedDb = await Database.newDatabase(storageKey);

      // Allow non-leader writes for testing
      if (typeof reopenedDb.allowNonLeaderWrites === 'function') {
        await reopenedDb.allowNonLeaderWrites(true);
      }

      console.log('[E2E] Database reopened successfully');

      // Store reopened db reference for validation
      window.importedDb = reopenedDb;
    }, exportedDb.data);

    console.log('[E2E] Import operation completed');

    // Step 3: Validate imported data
    const validation = await page.evaluate(async () => {
      const { executeQuery } = window.dbClient;
      const db = window.importedDb;

      // Query all data
      const folderResult = await executeQuery(db, 'SELECT * FROM folders WHERE folder_id = ?', ['f1']);
      const noteResult = await executeQuery(db, 'SELECT * FROM notes WHERE note_id = ?', ['n1']);
      const tagResult = await executeQuery(db, 'SELECT * FROM tags WHERE tag_id = ?', ['t1']);
      const noteTagResult = await executeQuery(db, 'SELECT * FROM note_tags WHERE note_id = ?', ['n1']);

      // Convert rows to objects
      function rowToObject(row, columns) {
        const obj = {};
        columns.forEach((col, idx) => {
          const value = row.values[idx];
          obj[col] = value.type === 'Null' ? null : value.value;
        });
        return obj;
      }

      const folder = folderResult.rows.length > 0 ? rowToObject(folderResult.rows[0], folderResult.columns) : null;
      const note = noteResult.rows.length > 0 ? rowToObject(noteResult.rows[0], noteResult.columns) : null;
      const tag = tagResult.rows.length > 0 ? rowToObject(tagResult.rows[0], tagResult.columns) : null;
      const noteTag = noteTagResult.rows.length > 0 ? rowToObject(noteTagResult.rows[0], noteTagResult.columns) : null;

      return {
        folder,
        note,
        tag,
        noteTag,
        counts: {
          folders: folderResult.rows.length,
          notes: noteResult.rows.length,
          tags: tagResult.rows.length,
          noteTags: noteTagResult.rows.length,
        }
      };
    });

    console.log('[E2E] Validation results:', validation);

    // Assertions
    expect(validation.counts.folders).toBe(1);
    expect(validation.counts.notes).toBe(1);
    expect(validation.counts.tags).toBe(1);
    expect(validation.counts.noteTags).toBe(1);

    expect(validation.folder.name).toBe('Test Folder');
    expect(validation.note.title).toBe('Test Note');
    expect(validation.note.body).toBe('Test content for import validation');
    expect(validation.tag.label).toBe('test-tag');
    expect(validation.noteTag.tag_id).toBe('t1');

    console.log('[E2E] ✓ All imported data validated successfully');
  });
});
