/**
 * REAL INTEGRATION TEST - NO MOCKS
 *
 * This test actually initializes absurder-sql and performs real database operations.
 * It validates the full stack: WASM initialization, database creation, migrations,
 * CRUD operations, and FTS5 full-text search.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as absurderSql from '@npiesco/absurder-sql';
import { initDb, executeQuery } from '../packages/domain/src/dbClient.js';
import { createNoteRecord, createFolderRecord } from '../packages/domain/src/models.js';

test('INTEGRATION: Initialize absurder-sql, create database, run migrations, and perform CRUD', async () => {
  // Step 1: Load WASM file for Node.js environment
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);

  // Initialize WASM with the buffer (Node.js doesn't support fetch)
  await absurderSql.default(wasmBuffer);

  // Step 2: Initialize absurder-sql database with migrations
  const db = await initDb({
    absurderSql,
    storageKey: `test-vault-${Date.now()}`,
  });

  // Step 2: Verify database handle is real
  assert.ok(db, 'Database handle should exist');
  assert.equal(typeof db.execute, 'function', 'db.execute should be a function');

  // Step 2.5: Verify migrations created tables
  const tablesResult = await executeQuery(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log('Tables in database:', tablesResult);

  // Step 3: Create a folder
  const folder = createFolderRecord({
    folderId: 'folder-1',
    name: 'Test Folder',
    parentFolderId: null,
  });

  const insertFolderResult = await executeQuery(
    db,
    `INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [folder.folderId, folder.name, folder.parentFolderId, folder.createdAt, folder.updatedAt]
  );

  console.log('Insert folder result:', insertFolderResult);

  // Step 4: Create a note
  const note = createNoteRecord({
    noteId: 'note-1',
    folderId: 'folder-1',
    title: 'My First Note',
    body: 'This is the body of my first note. It contains searchable content.',
  });

  const insertNoteResult = await executeQuery(
    db,
    `INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [note.noteId, note.folderId, note.title, note.body, note.createdAt, note.updatedAt]
  );

  console.log('Insert note result:', insertNoteResult);

  // Step 5: Query the note back
  const queryResult = await executeQuery(
    db,
    'SELECT * FROM notes WHERE note_id = ?',
    ['note-1']
  );

  console.log('Query result:', queryResult);

  assert.ok(queryResult.rows, 'Query should return rows');
  assert.equal(queryResult.rows.length, 1, 'Should retrieve exactly one note');

  // absurder-sql returns rows as { values: [...] } arrays, need to map to objects
  const row = queryResult.rows[0];
  const rowObj = {};
  queryResult.columns.forEach((col, idx) => {
    const value = row.values[idx];
    // ColumnValue format: { type: "Text", value: "..." } or { type: "Null" }
    rowObj[col] = value.type === 'Null' ? null : value.value;
  });

  console.log('Row object:', rowObj);

  assert.equal(rowObj.title, 'My First Note', 'Note title should match');
  assert.equal(rowObj.body, note.body, 'Note body should match');

  // Step 6: Test FTS5 full-text search
  const ftsResult = await executeQuery(
    db,
    `SELECT note_id, title FROM notes_fts WHERE notes_fts MATCH ?`,
    ['searchable']
  );

  console.log('FTS result:', ftsResult);

  assert.ok(ftsResult.rows, 'FTS query should return rows');
  assert.equal(ftsResult.rows.length, 1, 'Should find note via full-text search');
  assert.equal(ftsResult.rows[0].title, 'My First Note', 'FTS should find the correct note');

  // Step 7: Update the note
  const updateResult = await executeQuery(
    db,
    'UPDATE notes SET body = ? WHERE note_id = ?',
    ['Updated body with new searchable content including quantum physics.', 'note-1']
  );

  console.log('Update result:', updateResult);

  // Step 8: Verify FTS trigger updated the index
  const ftsAfterUpdate = await executeQuery(
    db,
    `SELECT note_id, title FROM notes_fts WHERE notes_fts MATCH ?`,
    ['quantum']
  );

  console.log('FTS after update:', ftsAfterUpdate);

  assert.ok(ftsAfterUpdate.rows, 'FTS should work after update');
  assert.equal(ftsAfterUpdate.rows.length, 1, 'Should find updated note via FTS');

  // Step 9: Delete the note
  const deleteResult = await executeQuery(
    db,
    'DELETE FROM notes WHERE note_id = ?',
    ['note-1']
  );

  console.log('Delete result:', deleteResult);

  // Step 10: Verify note is gone
  const afterDelete = await executeQuery(
    db,
    'SELECT * FROM notes WHERE note_id = ?',
    ['note-1']
  );

  console.log('After delete:', afterDelete);

  assert.equal(afterDelete.rows.length, 0, 'Note should be deleted');

  // Step 11: Verify FTS entry is also gone (via trigger)
  const ftsAfterDelete = await executeQuery(
    db,
    `SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?`,
    ['quantum']
  );

  console.log('FTS after delete:', ftsAfterDelete);

  assert.equal(ftsAfterDelete.rows.length, 0, 'FTS entry should be deleted via trigger');
});
