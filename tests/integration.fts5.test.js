/**
 * REAL INTEGRATION TEST - FTS5 Full-Text Search
 * NO MOCKS - Tests actual FTS5 search with absurder-sql
 *
 * Validates that FTS5 virtual tables work correctly with:
 * - Search queries returning correct results
 * - Triggers keeping FTS index in sync on INSERT/UPDATE/DELETE
 * - Multiple search terms and operators
 * - Real-world search scenarios
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

test('INTEGRATION: FTS5 search finds notes by content', async () => {
  console.log('[TEST] Starting FTS5 basic search test...');

  // Initialize WASM
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  const db = await initDb({
    absurderSql,
    storageKey: `fts5-basic-test-${Date.now()}`,
  });

  console.log('[TEST] ✓ Database initialized');

  // Create folder
  await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['folder-1', 'Test Folder', null, new Date().toISOString(), new Date().toISOString()]
  );

  // Insert notes with specific searchable content
  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-1', 'folder-1', 'JavaScript Tutorial', 'Learn JavaScript programming with examples and best practices', new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-2', 'folder-1', 'Python Guide', 'Python programming language tutorial for beginners', new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-3', 'folder-1', 'Database Design', 'Learn database design patterns and SQL optimization', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('[TEST] ✓ Inserted 3 notes with searchable content');

  // Test 1: Search for "JavaScript" - should find note-1
  console.log('[TEST] Test 1: Searching for "JavaScript"...');
  const jsResults = await executeQuery(
    db,
    'SELECT note_id, title, body FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['JavaScript']
  );

  console.log('[TEST] JavaScript search results:', jsResults);
  assert.equal(jsResults.rows.length, 1, 'Should find 1 note with "JavaScript"');

  const jsNote = rowToObject(jsResults.rows[0], jsResults.columns);
  assert.equal(jsNote.note_id, 'note-1', 'Should find the JavaScript note');
  assert.equal(jsNote.title, 'JavaScript Tutorial', 'Title should match');
  console.log('[TEST] ✓ Found JavaScript note');

  // Test 2: Search for "programming" - should find note-1 and note-2
  console.log('[TEST] Test 2: Searching for "programming"...');
  const progResults = await executeQuery(
    db,
    'SELECT note_id, title FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['programming']
  );

  console.log('[TEST] Programming search results:', progResults);
  assert.equal(progResults.rows.length, 2, 'Should find 2 notes with "programming"');

  const progNotes = progResults.rows.map(row => rowToObject(row, progResults.columns));
  const progIds = progNotes.map(n => n.note_id).sort();
  assert.deepEqual(progIds, ['note-1', 'note-2'], 'Should find both JavaScript and Python notes');
  console.log('[TEST] ✓ Found both programming notes');

  // Test 3: Search for "database" - should find note-3
  console.log('[TEST] Test 3: Searching for "database"...');
  const dbResults = await executeQuery(
    db,
    'SELECT note_id, title FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['database']
  );

  assert.equal(dbResults.rows.length, 1, 'Should find 1 note with "database"');
  const dbNote = rowToObject(dbResults.rows[0], dbResults.columns);
  assert.equal(dbNote.note_id, 'note-3', 'Should find the database note');
  console.log('[TEST] ✓ Found database note');

  // Test 4: Search for non-existent term
  console.log('[TEST] Test 4: Searching for "quantum"...');
  const quantumResults = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['quantum']
  );

  assert.equal(quantumResults.rows.length, 0, 'Should find 0 notes with "quantum"');
  console.log('[TEST] ✓ Correctly returned no results for non-existent term');

  console.log('[TEST] 🎉 FTS5 BASIC SEARCH TESTS PASSED!');
});

test('INTEGRATION: FTS5 triggers keep index in sync on UPDATE', async () => {
  console.log('[TEST] Starting FTS5 trigger test for UPDATE...');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  const db = await initDb({
    absurderSql,
    storageKey: `fts5-trigger-test-${Date.now()}`,
  });

  // Create test data
  await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['folder-1', 'Test', null, new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-1', 'folder-1', 'Original Title', 'Original content about cats', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('[TEST] ✓ Inserted note with "cats"');

  // Verify original search works
  const catsSearch = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['cats']
  );
  assert.equal(catsSearch.rows.length, 1, 'Should find note with "cats"');
  console.log('[TEST] ✓ Found note with "cats"');

  // UPDATE the note content
  console.log('[TEST] Updating note content...');
  await executeQuery(
    db,
    'UPDATE notes SET body = ?, updated_at = ? WHERE note_id = ?',
    ['Updated content about dogs and programming', new Date().toISOString(), 'note-1']
  );

  console.log('[TEST] ✓ Updated note content');

  // Test: Old content "cats" should NOT be found
  const catsAfterUpdate = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['cats']
  );
  assert.equal(catsAfterUpdate.rows.length, 0, 'Should NOT find "cats" after update');
  console.log('[TEST] ✓ Old content "cats" correctly removed from FTS index');

  // Test: New content "dogs" SHOULD be found
  const dogsAfterUpdate = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['dogs']
  );
  assert.equal(dogsAfterUpdate.rows.length, 1, 'Should find "dogs" after update');
  console.log('[TEST] ✓ New content "dogs" correctly added to FTS index');

  // Test: New content "programming" SHOULD also be found
  const progAfterUpdate = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['programming']
  );
  assert.equal(progAfterUpdate.rows.length, 1, 'Should find "programming" after update');
  console.log('[TEST] ✓ New content "programming" correctly added to FTS index');

  console.log('[TEST] 🎉 FTS5 UPDATE TRIGGER TESTS PASSED!');
});

test('INTEGRATION: FTS5 triggers keep index in sync on DELETE', async () => {
  console.log('[TEST] Starting FTS5 trigger test for DELETE...');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  const db = await initDb({
    absurderSql,
    storageKey: `fts5-delete-test-${Date.now()}`,
  });

  // Create test data
  await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['folder-1', 'Test', null, new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-1', 'folder-1', 'To Delete', 'Content with unique term elephants', new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-2', 'folder-1', 'To Keep', 'Content with term dolphins', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('[TEST] ✓ Inserted 2 notes');

  // Verify search before delete
  const elephantsSearch = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['elephants']
  );
  assert.equal(elephantsSearch.rows.length, 1, 'Should find note with "elephants"');
  console.log('[TEST] ✓ Found note with "elephants" before delete');

  // DELETE the note
  console.log('[TEST] Deleting note-1...');
  await executeQuery(db, 'DELETE FROM notes WHERE note_id = ?', ['note-1']);
  console.log('[TEST] ✓ Deleted note-1');

  // Verify "elephants" is NOT found after delete
  const elephantsAfterDelete = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['elephants']
  );
  assert.equal(elephantsAfterDelete.rows.length, 0, 'Should NOT find "elephants" after delete');
  console.log('[TEST] ✓ "elephants" correctly removed from FTS index after delete');

  // Verify other note still searchable
  const dolphinsSearch = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['dolphins']
  );
  assert.equal(dolphinsSearch.rows.length, 1, 'Should still find "dolphins"');
  console.log('[TEST] ✓ Other note still searchable');

  console.log('[TEST] 🎉 FTS5 DELETE TRIGGER TESTS PASSED!');
});

test('INTEGRATION: FTS5 search with multiple terms and operators', async () => {
  console.log('[TEST] Starting FTS5 advanced search test...');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
  const wasmBuffer = await readFile(wasmPath);
  await absurderSql.default(wasmBuffer);

  const db = await initDb({
    absurderSql,
    storageKey: `fts5-advanced-test-${Date.now()}`,
  });

  // Create test data with specific content for advanced queries
  await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['folder-1', 'Test', null, new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-1', 'folder-1', 'React Tutorial', 'Learn React and JavaScript for web development', new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-2', 'folder-1', 'Vue Guide', 'Learn Vue and JavaScript for frontend development', new Date().toISOString(), new Date().toISOString()]
  );

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['note-3', 'folder-1', 'Python Flask', 'Learn Python Flask for backend web development', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('[TEST] ✓ Inserted 3 notes with varied content');

  // Test: Search for "JavaScript AND development" - should find note-1 and note-2
  console.log('[TEST] Searching for notes with both "JavaScript" AND "development"...');
  const andResults = await executeQuery(
    db,
    'SELECT note_id, title FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['JavaScript AND development']
  );

  console.log('[TEST] AND search results:', andResults);
  assert.equal(andResults.rows.length, 2, 'Should find 2 notes with both terms');

  const andNotes = andResults.rows.map(row => rowToObject(row, andResults.columns));
  const andIds = andNotes.map(n => n.note_id).sort();
  assert.deepEqual(andIds, ['note-1', 'note-2'], 'Should find React and Vue notes');
  console.log('[TEST] ✓ AND search works correctly');

  // Test: Search for "web AND development" - should find note-1 and note-3 (note-2 has "frontend" not "web")
  console.log('[TEST] Searching for "web" AND "development"...');
  const webResults = await executeQuery(
    db,
    'SELECT note_id FROM notes WHERE rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
    ['web AND development']
  );

  assert.equal(webResults.rows.length, 2, 'Should find 2 notes with "web" and "development"');

  const webNotes = webResults.rows.map(row => rowToObject(row, webResults.columns));
  const webIds = webNotes.map(n => n.note_id).sort();
  assert.deepEqual(webIds, ['note-1', 'note-3'], 'Should find React and Python Flask notes');
  console.log('[TEST] ✓ Found correct notes with web AND development');

  console.log('[TEST] 🎉 FTS5 ADVANCED SEARCH TESTS PASSED!');
});
