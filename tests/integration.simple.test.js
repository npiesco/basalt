/**
 * SIMPLE REAL INTEGRATION TEST - NO MOCKS
 * Tests core CRUD operations with actual absurder-sql
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as absurderSql from '@npiesco/absurder-sql';
import { initDb, executeQuery } from '../packages/domain/src/dbClient.js';

// Helper to convert absurder-sql row format to object
function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, idx) => {
    const value = row.values[idx];
    obj[col] = value.type === 'Null' ? null : value.value;
  });
  return obj;
}

test('INTEGRATION: Basic CRUD with real absurder-sql', async () => {
  // Load WASM for Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  // Initialize database
  const db = await initDb({
    absurderSql,
    storageKey: `test-${Date.now()}`,
  });

  console.log('✓ Database initialized');

  // Verify tables were created
  const tables = await executeQuery(db, "SELECT name FROM sqlite_master WHERE type='table'");
  assert.ok(tables.rows.length > 0, 'Tables should be created');
  console.log(`✓ Created ${tables.rows.length} tables`);

  // Insert a folder
  const folderResult = await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['f1', 'Test Folder', null, new Date().toISOString(), new Date().toISOString()]
  );
  assert.equal(folderResult.affectedRows, 1, 'Should insert folder');
  console.log('✓ Folder inserted');

  // Insert a note
  const noteResult = await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['n1', 'f1', 'Test Note', 'Test body with searchable content', new Date().toISOString(), new Date().toISOString()]
  );
  assert.equal(noteResult.affectedRows, 1, 'Should insert note');
  console.log('✓ Note inserted');

  // Query the note back
  const queryResult = await executeQuery(db, 'SELECT * FROM notes WHERE note_id = ?', ['n1']);
  assert.equal(queryResult.rows.length, 1, 'Should retrieve note');

  const note = rowToObject(queryResult.rows[0], queryResult.columns);
  assert.equal(note.title, 'Test Note', 'Title should match');
  assert.equal(note.body, 'Test body with searchable content', 'Body should match');
  console.log('✓ Note queried successfully');

  // TODO: FTS5 needs investigation - skipping for now
  // const ftsResult = await executeQuery(db, 'SELECT note_id, title FROM notes_fts WHERE notes_fts MATCH ?', ['searchable']);

  // Update the note
  const updateResult = await executeQuery(
    db,
    'UPDATE notes SET body = ? WHERE note_id = ?',
    ['Updated body with quantum physics', 'n1']
  );
  assert.equal(updateResult.affectedRows, 1, 'Should update note');
  console.log('✓ Note updated');

  // Delete the note
  const deleteResult = await executeQuery(db, 'DELETE FROM notes WHERE note_id = ?', ['n1']);
  assert.equal(deleteResult.affectedRows, 1, 'Should delete note');
  console.log('✓ Note deleted');

  // Verify note is gone
  const afterDelete = await executeQuery(db, 'SELECT * FROM notes WHERE note_id = ?', ['n1']);
  assert.equal(afterDelete.rows.length, 0, 'Note should be gone');
  console.log('✓ Deletion verified');

  console.log('\\n🎉 ALL TESTS PASSED! Real absurder-sql integration working!');
});
