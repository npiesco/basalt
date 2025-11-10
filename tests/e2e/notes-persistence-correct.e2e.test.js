/**
 * Test notes persistence using the CORRECT close/reopen pattern
 * (not full page reload)
 */

import { test, expect } from '@playwright/test';

test.describe('Notes Persistence - Correct Pattern', () => {
  test('Notes persist with close and reopen (not page reload)', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.Database !== undefined, { timeout: 10000 });

    console.log('\n=== STEP 1: Create database with migrations ===');

    const setupResult = await page.evaluate(async () => {
      const logs = [];
      try {
        const { Database } = window;

        logs.push('Creating database basalt-test-notes...');
        const db = await Database.newDatabase('basalt-test-notes');

        logs.push('Running migrations...');
        await db.execute('PRAGMA foreign_keys = ON');

        // Create tables (simplified from migrations.js)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS folders (
            folder_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_folder_id TEXT REFERENCES folders(folder_id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await db.execute(`
          CREATE TABLE IF NOT EXISTS notes (
            note_id TEXT PRIMARY KEY,
            folder_id TEXT NOT NULL REFERENCES folders(folder_id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create FTS table (our NEW self-contained version)
        await db.execute(`
          CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            note_id UNINDEXED,
            title,
            body
          )
        `);

        // FTS triggers
        await db.execute(`
          CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(note_id, title, body) VALUES (new.note_id, new.title, new.body);
          END
        `);

        logs.push('Creating root folder...');
        const now = new Date().toISOString();
        await db.execute(
          `INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES ('root', '/', NULL, '${now}', '${now}')`
        );

        logs.push('Creating test note...');
        await db.execute(
          `INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES ('note_test_1', 'root', 'Test Note Title', 'Test note body', '${now}', '${now}')`
        );

        logs.push('Verifying data before sync...');
        const beforeSync = await db.execute('SELECT * FROM notes');
        const ftsBeforeSync = await db.execute('SELECT * FROM notes_fts');
        logs.push(`Before sync - Notes: ${beforeSync.rows.length}, FTS: ${ftsBeforeSync.rows.length}`);

        logs.push('Calling sync()...');
        await db.sync();

        logs.push('Verifying data after sync...');
        const afterSync = await db.execute('SELECT * FROM notes');
        const ftsAfterSync = await db.execute('SELECT * FROM notes_fts');
        logs.push(`After sync - Notes: ${afterSync.rows.length}, FTS: ${ftsAfterSync.rows.length}`);

        logs.push('Closing database...');
        await db.close();

        return {
          success: true,
          logs,
          beforeSync: { notes: beforeSync.rows.length, fts: ftsBeforeSync.rows.length },
          afterSync: { notes: afterSync.rows.length, fts: ftsAfterSync.rows.length }
        };
      } catch (err) {
        logs.push(`ERROR: ${err.message}`);
        return { success: false, logs, error: err.message };
      }
    });

    console.log('Setup logs:', setupResult.logs.join('\n'));
    expect(setupResult.success, `Setup failed: ${setupResult.error}`).toBe(true);
    expect(setupResult.afterSync.notes).toBe(1);
    expect(setupResult.afterSync.fts).toBe(1);

    console.log('\n=== STEP 2: Reopen database (simulating reload) ===');

    await page.waitForTimeout(500);

    const reopenResult = await page.evaluate(async () => {
      const logs = [];
      try {
        const { Database } = window;

        logs.push('Opening SAME database (basalt-test-notes)...');
        const db2 = await Database.newDatabase('basalt-test-notes');

        logs.push('Querying notes...');
        const notesResult = await db2.execute('SELECT * FROM notes');
        logs.push(`Found ${notesResult.rows.length} notes`);

        logs.push('Querying FTS...');
        const ftsResult = await db2.execute('SELECT * FROM notes_fts');
        logs.push(`Found ${ftsResult.rows.length} FTS rows`);

        logs.push('Querying folders...');
        const foldersResult = await db2.execute('SELECT * FROM folders');
        logs.push(`Found ${foldersResult.rows.length} folders`);

        // Get actual note data
        const note = notesResult.rows.length > 0 ? {
          note_id: notesResult.rows[0].values[0].value,
          folder_id: notesResult.rows[0].values[1].value,
          title: notesResult.rows[0].values[2].value,
          body: notesResult.rows[0].values[3].value
        } : null;

        await db2.close();

        return {
          success: true,
          logs,
          noteCount: notesResult.rows.length,
          ftsCount: ftsResult.rows.length,
          folderCount: foldersResult.rows.length,
          note
        };
      } catch (err) {
        logs.push(`ERROR: ${err.message}`);
        return { success: false, logs, error: err.message, noteCount: 0, ftsCount: 0, folderCount: 0 };
      }
    });

    console.log('Reopen logs:', reopenResult.logs.join('\n'));

    console.log('\n=== RESULTS ===');
    console.log('Notes persisted:', reopenResult.noteCount === 1 ? '✅ YES' : '❌ NO');
    console.log('FTS persisted:', reopenResult.ftsCount === 1 ? '✅ YES' : '❌ NO');
    console.log('Folders persisted:', reopenResult.folderCount === 1 ? '✅ YES' : '❌ NO');
    if (reopenResult.note) {
      console.log('Note data:', reopenResult.note);
    }

    expect(reopenResult.success, `Reopen failed: ${reopenResult.error}`).toBe(true);
    expect(reopenResult.noteCount, 'NOTES DISAPPEARED!').toBe(1);
    expect(reopenResult.ftsCount, 'FTS DISAPPEARED!').toBe(1);
    expect(reopenResult.folderCount, 'FOLDERS DISAPPEARED!').toBe(1);
    expect(reopenResult.note.title).toBe('Test Note Title');
  });
});
