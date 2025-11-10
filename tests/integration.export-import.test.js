/**
 * REAL INTEGRATION TEST - Database Export/Import
 * NO MOCKS - Tests actual .db file export and import with absurder-sql
 *
 * This validates that users can backup and restore their vaults.
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

test('INTEGRATION: Export database to .db file format', async () => {
  // Load WASM for Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  // Create database with test data
  const db = await initDb({
    absurderSql,
    storageKey: `export-test-${Date.now()}`,
  });

  console.log('✓ Database initialized for export test');

  // Insert test data
  await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['f-export-1', 'Export Test Folder', null, new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['n-export-1', 'f-export-1', 'Export Test Note', 'This note should be exported successfully', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('✓ Test data inserted');

  // Export database to file
  const exportedBytes = await exportToFile(db);

  console.log('Export result:', exportedBytes);

  // Validate export
  assert.ok(exportedBytes, 'Export should return data');
  assert.ok(exportedBytes instanceof Uint8Array, 'Export should return Uint8Array');
  assert.ok(exportedBytes.length > 0, 'Export should not be empty');

  // SQLite file signature: first 16 bytes should be "SQLite format 3\0"
  const header = new TextDecoder().decode(exportedBytes.slice(0, 15));
  assert.equal(header, 'SQLite format 3', 'Export should produce valid SQLite file');

  console.log(`✓ Exported ${exportedBytes.length} bytes with valid SQLite header`);
  console.log('🎉 EXPORT TEST PASSED!');
});

test('INTEGRATION: Import database from .db file format', async () => {
  // Load WASM for Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  // Create first database with test data
  const db1 = await initDb({
    absurderSql,
    storageKey: `import-test-source-${Date.now()}`,
  });

  console.log('✓ Source database initialized');

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

  console.log('✓ Source data inserted');

  // Export from source database
  const exportedBytes = await exportToFile(db1);
  console.log(`✓ Exported ${exportedBytes.length} bytes from source`);

  // Create second database (empty initially)
  const db2 = await initDb({
    absurderSql,
    storageKey: `import-test-target-${Date.now()}`,
  });

  console.log('✓ Target database initialized (empty)');

  // Import into target database
  await importFromFile(db2, exportedBytes);
  console.log('✓ Import completed');

  // Verify imported data
  const notesResult = await executeQuery(db2, 'SELECT * FROM notes WHERE note_id = ?', ['n-import-1']);

  assert.equal(notesResult.rows.length, 1, 'Imported database should contain the note');

  const note = rowToObject(notesResult.rows[0], notesResult.columns);
  assert.equal(note.title, 'Import Test Note', 'Note title should match');
  assert.equal(note.body, 'This note should survive export and import', 'Note body should match');

  console.log('✓ Imported data verified');

  const foldersResult = await executeQuery(db2, 'SELECT * FROM folders WHERE folder_id = ?', ['f-import-1']);
  assert.equal(foldersResult.rows.length, 1, 'Imported database should contain the folder');

  const folder = rowToObject(foldersResult.rows[0], foldersResult.columns);
  assert.equal(folder.name, 'Import Test Folder', 'Folder name should match');

  console.log('✓ All imported data intact');
  console.log('🎉 IMPORT TEST PASSED!');
});

test('INTEGRATION: Export-Import round-trip preserves all data', async () => {
  // Load WASM for Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  // Create database with comprehensive test data
  const db1 = await initDb({
    absurderSql,
    storageKey: `roundtrip-test-${Date.now()}`,
  });

  console.log('✓ Database initialized for round-trip test');

  // Insert multiple folders
  await executeQuery(
    db1,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['f-rt-1', 'Root Folder', null, new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db1,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['f-rt-2', 'Subfolder', 'f-rt-1', new Date().toISOString(), new Date().toISOString()]
  );

  // Insert multiple notes
  await executeQuery(
    db1,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['n-rt-1', 'f-rt-1', 'Note 1', 'Content 1', new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db1,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['n-rt-2', 'f-rt-2', 'Note 2', 'Content 2', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('✓ Comprehensive test data inserted');

  // Count records before export
  const foldersCountBefore = await executeQuery(db1, 'SELECT COUNT(*) as count FROM folders');
  const notesCountBefore = await executeQuery(db1, 'SELECT COUNT(*) as count FROM notes');

  const folderCountValue = rowToObject(foldersCountBefore.rows[0], foldersCountBefore.columns);
  const noteCountValue = rowToObject(notesCountBefore.rows[0], notesCountBefore.columns);

  console.log(`✓ Before export: ${folderCountValue.count} folders, ${noteCountValue.count} notes`);

  // Export
  const exportedBytes = await exportToFile(db1);
  console.log(`✓ Exported ${exportedBytes.length} bytes`);

  // Create new database and import
  const db2 = await initDb({
    absurderSql,
    storageKey: `roundtrip-test-target-${Date.now()}`,
  });

  await importFromFile(db2, exportedBytes);
  console.log('✓ Import completed');

  // Count records after import
  const foldersCountAfter = await executeQuery(db2, 'SELECT COUNT(*) as count FROM folders');
  const notesCountAfter = await executeQuery(db2, 'SELECT COUNT(*) as count FROM notes');

  const folderCountAfterValue = rowToObject(foldersCountAfter.rows[0], foldersCountAfter.columns);
  const noteCountAfterValue = rowToObject(notesCountAfter.rows[0], notesCountAfter.columns);

  console.log(`✓ After import: ${folderCountAfterValue.count} folders, ${noteCountAfterValue.count} notes`);

  // Verify counts match
  assert.equal(folderCountAfterValue.count, folderCountValue.count, 'Folder count should match after round-trip');
  assert.equal(noteCountAfterValue.count, noteCountValue.count, 'Note count should match after round-trip');

  // Verify hierarchical relationship preserved
  const subfolder = await executeQuery(db2, 'SELECT * FROM folders WHERE folder_id = ?', ['f-rt-2']);
  const subfolderData = rowToObject(subfolder.rows[0], subfolder.columns);
  assert.equal(subfolderData.parent_folder_id, 'f-rt-1', 'Parent-child relationship should be preserved');

  console.log('✓ All relationships preserved');
  console.log('🎉 ROUND-TRIP TEST PASSED!');
});
