/**
 * REAL INTEGRATION TEST - Database Import ONLY
 * Tests actual import of .db file with absurder-sql
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as absurderSql from '@npiesco/absurder-sql';
import { initDb, executeQuery, exportToFile, importFromFile } from '../packages/domain/src/dbClient.js';

// Helper to convert absurder-sql row format to object
function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, idx) => {
    const value = row.values[idx];
    obj[col] = value.type === 'Null' ? null : value.value;
  });
  return obj;
}

test('INTEGRATION: Import database from .db file format', async () => {
  console.log('[TEST] Starting import test...');

  // Load WASM for Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');

  console.log('[TEST] Loading WASM...');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);
  console.log('[TEST] WASM initialized');

  // Create first database with test data
  const db1 = await initDb({
    absurderSql,
    storageKey: `import-test-source-${Date.now()}`,
  });

  console.log('[TEST] Source database initialized');

  // Insert test data into source database
  await executeQuery(
    db1,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['f-import-1', 'Import Test Folder', null, new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db1,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['n-import-1', 'f-import-1', 'Import Test Note', 'This note should survive export and import', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('[TEST] Source data inserted');

  // Export from source database
  console.log('[TEST] Exporting from source database...');
  const exportedBytes = await exportToFile(db1);
  console.log(`[TEST] Exported ${exportedBytes.length} bytes from source`);

  // Create second database (empty initially) - SAVE the storage key!
  const targetStorageKey = `import-test-target-${Date.now()}`;
  console.log('[TEST] Creating target database with key:', targetStorageKey);
  const db2 = await initDb({
    absurderSql,
    storageKey: targetStorageKey,
  });

  console.log('[TEST] Target database initialized (empty)');

  // Import into target database
  console.log('[TEST] About to call importFromFile...');
  await importFromFile(db2, exportedBytes);
  console.log('[TEST] Import completed');

  // IMPORTANT: importFromFile() closes the database connection!
  // We need to create a NEW database instance with THE SAME storage key
  console.log('[TEST] Reopening database after import with SAME key:', targetStorageKey);
  const db3 = await absurderSql.Database.newDatabase(targetStorageKey);
  console.log('[TEST] Database reopened');

  // Verify imported data (use db3, not db2 which is closed!)
  console.log('[TEST] Querying imported data...');
  const notesResult = await executeQuery(db3, 'SELECT * FROM notes WHERE note_id = ?', ['n-import-1']);

  console.log('[TEST] Notes query result:', notesResult);

  assert.equal(notesResult.rows.length, 1, 'Imported database should contain the note');

  const note = rowToObject(notesResult.rows[0], notesResult.columns);
  console.log('[TEST] Note data:', note);

  assert.equal(note.title, 'Import Test Note', 'Note title should match');
  assert.equal(note.body, 'This note should survive export and import', 'Note body should match');

  console.log('[TEST] ✓ Imported note verified');

  const foldersResult = await executeQuery(db3, 'SELECT * FROM folders WHERE folder_id = ?', ['f-import-1']);
  assert.equal(foldersResult.rows.length, 1, 'Imported database should contain the folder');

  const folder = rowToObject(foldersResult.rows[0], foldersResult.columns);
  console.log('[TEST] Folder data:', folder);

  assert.equal(folder.name, 'Import Test Folder', 'Folder name should match');

  console.log('[TEST] ✓ All imported data intact');
  console.log('[TEST] 🎉 IMPORT TEST PASSED!');
});
