/**
 * REAL INTEGRATION TEST - SQLite CLI Compatibility
 * NO MOCKS - Validates exported .db files work with actual sqlite3 CLI
 *
 * This test proves our exports are truly compatible with standard SQLite tools.
 * We export from absurder-sql and query with sqlite3 CLI - two completely
 * different implementations proving real compatibility.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as absurderSql from '@npiesco/absurder-sql';
import { initDb, executeQuery, exportToFile } from '../packages/domain/src/dbClient.js';

const execAsync = promisify(exec);

// Helper to convert absurder-sql row format to object
function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, idx) => {
    const value = row.values[idx];
    obj[col] = value.type === 'Null' ? null : value.value;
  });
  return obj;
}

test('INTEGRATION: Exported .db file works with sqlite3 CLI', async () => {
  console.log('[TEST] Starting SQLite CLI compatibility test...');

  // Load WASM for Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  console.log('[TEST] ✓ WASM initialized');

  // Create database with test data
  const db = await initDb({
    absurderSql,
    storageKey: `sqlite-cli-test-${Date.now()}`,
  });

  console.log('[TEST] ✓ Database initialized');

  // Insert test data with known values
  await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['folder-cli-1', 'CLI Test Folder', null, '2025-11-08T10:00:00Z', '2025-11-08T10:00:00Z']
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-cli-1', 'folder-cli-1', 'CLI Test Note', 'This note will be queried by sqlite3 CLI', '2025-11-08T10:01:00Z', '2025-11-08T10:01:00Z']
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-cli-2', 'folder-cli-1', 'Second CLI Note', 'Another note for testing', '2025-11-08T10:02:00Z', '2025-11-08T10:02:00Z']
  );

  console.log('[TEST] ✓ Test data inserted (1 folder, 2 notes)');

  // Verify data via absurder-sql before export
  const notesCount = await executeQuery(db, 'SELECT COUNT(*) as count FROM notes');
  const count = rowToObject(notesCount.rows[0], notesCount.columns);
  assert.equal(count.count, 2, 'Should have 2 notes before export');

  console.log('[TEST] ✓ Data verified in absurder-sql');

  // Export database
  const exportedBytes = await exportToFile(db);
  console.log(`[TEST] ✓ Exported ${exportedBytes.length} bytes`);

  // Write to temporary file
  const tempDbPath = join(__dirname, `test-export-${Date.now()}.db`);
  await writeFile(tempDbPath, exportedBytes);
  console.log(`[TEST] ✓ Written to file: ${tempDbPath}`);

  try {
    // Test 1: Verify file opens with sqlite3
    console.log('[TEST] Running sqlite3 CLI tests...');
    const { stdout: version } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT sqlite_version();"`);
    console.log(`[TEST] ✓ sqlite3 version: ${version.trim()}`);

    // Test 2: Count tables
    const { stdout: tables } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"`);
    const tableCount = parseInt(tables.trim());
    assert.ok(tableCount >= 6, `Should have at least 6 tables (folders, notes, tags, etc), got ${tableCount}`);
    console.log(`[TEST] ✓ Found ${tableCount} tables via sqlite3 CLI`);

    // Test 3: List table names
    const { stdout: tableNames } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"`);
    console.log(`[TEST] ✓ Tables: ${tableNames.trim().split('\n').join(', ')}`);
    assert.ok(tableNames.includes('notes'), 'Should have notes table');
    assert.ok(tableNames.includes('folders'), 'Should have folders table');

    // Test 4: Query folder data
    const { stdout: folderData } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT folder_id, name FROM folders WHERE folder_id='folder-cli-1';"`);
    console.log(`[TEST] Folder query result: ${folderData.trim()}`);
    assert.ok(folderData.includes('folder-cli-1'), 'Should find folder via sqlite3');
    assert.ok(folderData.includes('CLI Test Folder'), 'Should have correct folder name');

    // Test 5: Count notes
    const { stdout: notesCountCli } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT COUNT(*) FROM notes;"`);
    const notesCountValue = parseInt(notesCountCli.trim());
    assert.equal(notesCountValue, 2, 'Should have 2 notes via sqlite3 CLI');
    console.log(`[TEST] ✓ Found ${notesCountValue} notes via sqlite3 CLI`);

    // Test 6: Query specific note
    const { stdout: noteData } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT note_id, title, body FROM notes WHERE note_id='note-cli-1';"`);
    console.log(`[TEST] Note query result: ${noteData.trim()}`);
    assert.ok(noteData.includes('note-cli-1'), 'Should find note via sqlite3');
    assert.ok(noteData.includes('CLI Test Note'), 'Should have correct note title');
    assert.ok(noteData.includes('This note will be queried by sqlite3 CLI'), 'Should have correct note body');

    // Test 7: Verify foreign key relationship
    const { stdout: joinData } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT n.note_id, n.title, f.name as folder_name FROM notes n JOIN folders f ON n.folder_id = f.folder_id WHERE n.note_id='note-cli-1';"`);
    console.log(`[TEST] JOIN query result: ${joinData.trim()}`);
    assert.ok(joinData.includes('CLI Test Folder'), 'Should preserve folder relationship');

    // Test 8: Verify schema integrity
    const { stdout: schema } = await execAsync(`sqlite3 "${tempDbPath}" "PRAGMA foreign_keys;"`);
    console.log(`[TEST] Foreign keys enabled: ${schema.trim()}`);

    // Test 9: Insert new data via sqlite3 CLI and verify
    await execAsync(`sqlite3 "${tempDbPath}" "INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES ('note-cli-3', 'folder-cli-1', 'Added by CLI', 'Inserted via sqlite3', '2025-11-08T10:03:00Z', '2025-11-08T10:03:00Z');"`);

    const { stdout: newCount } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT COUNT(*) FROM notes;"`);
    const newCountValue = parseInt(newCount.trim());
    assert.equal(newCountValue, 3, 'Should have 3 notes after sqlite3 CLI insert');
    console.log(`[TEST] ✓ Successfully inserted via sqlite3 CLI, now have ${newCountValue} notes`);

    // Test 10: Verify all data types
    const { stdout: allNotes } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT note_id, title FROM notes ORDER BY note_id;"`);
    console.log(`[TEST] All notes:\n${allNotes}`);

    console.log('[TEST] ✓ All sqlite3 CLI compatibility tests passed!');
    console.log('[TEST] 🎉 EXPORTED .DB FILES ARE FULLY COMPATIBLE WITH SQLITE3 CLI!');

  } finally {
    // Cleanup
    try {
      await unlink(tempDbPath);
      console.log(`[TEST] ✓ Cleaned up temporary file: ${tempDbPath}`);
    } catch (err) {
      console.log(`[TEST] Warning: Could not delete ${tempDbPath}: ${err.message}`);
    }
  }
});

test('INTEGRATION: sqlite3 CLI can read complex schema from exported .db', async () => {
  console.log('[TEST] Starting complex schema test...');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  const db = await initDb({
    absurderSql,
    storageKey: `schema-test-${Date.now()}`,
  });

  console.log('[TEST] ✓ Database with full schema created');

  // Export immediately (validates empty database export)
  const exportedBytes = await exportToFile(db);
  const tempDbPath = join(__dirname, `schema-test-${Date.now()}.db`);
  await writeFile(tempDbPath, exportedBytes);

  try {
    // Verify all expected tables exist
    const { stdout: tables } = await execAsync(`sqlite3 "${tempDbPath}" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"`);
    const tableList = tables.trim().split('\n');

    console.log(`[TEST] Tables found: ${tableList.join(', ')}`);

    // Verify core tables
    assert.ok(tableList.includes('folders'), 'Should have folders table');
    assert.ok(tableList.includes('notes'), 'Should have notes table');
    assert.ok(tableList.includes('tags'), 'Should have tags table');
    assert.ok(tableList.includes('note_tags'), 'Should have note_tags table');
    assert.ok(tableList.includes('attachments'), 'Should have attachments table');
    assert.ok(tableList.includes('backlinks'), 'Should have backlinks table');

    // Verify FTS table
    const hasFts = tableList.some(t => t.includes('fts'));
    assert.ok(hasFts, 'Should have FTS virtual table');

    // Check schema for a table
    const { stdout: notesSchema } = await execAsync(`sqlite3 "${tempDbPath}" "PRAGMA table_info(notes);"`);
    console.log(`[TEST] Notes table schema:\n${notesSchema}`);

    assert.ok(notesSchema.includes('note_id'), 'Should have note_id column');
    assert.ok(notesSchema.includes('folder_id'), 'Should have folder_id column');
    assert.ok(notesSchema.includes('title'), 'Should have title column');
    assert.ok(notesSchema.includes('body'), 'Should have body column');

    console.log('[TEST] ✓ Schema validation complete');
    console.log('[TEST] 🎉 COMPLEX SCHEMA FULLY COMPATIBLE WITH SQLITE3 CLI!');

  } finally {
    await unlink(tempDbPath).catch(() => {});
  }
});
