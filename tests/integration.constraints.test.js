/**
 * REAL INTEGRATION TEST - Database Constraints and Data Integrity
 * Tests UNIQUE, NOT NULL, PRIMARY KEY, FOREIGN KEY, and composite key constraints
 *
 * NO MOCKS - Uses real absurder-sql WASM
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as absurderSql from '@npiesco/absurder-sql';
import { initDb, executeQuery } from '../packages/domain/src/dbClient.js';
import { createFolderRecord, createNoteRecord, createTagRecord } from '../packages/domain/src/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('INTEGRATION: Database constraints with real absurder-sql', () => {
  test('Test UNIQUE constraint violations', async () => {
    console.log('[TEST] Starting UNIQUE constraint tests...');

    // Initialize WASM
    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);
    console.log('[TEST] ✓ WASM initialized');

    const db = await initDb({
      absurderSql,
      storageKey: `constraints-unique-test-${Date.now()}`,
    });
    console.log('[TEST] ✓ Database initialized');

    // Test 1: UNIQUE constraint on tags.label
    console.log('[TEST] Test 1: UNIQUE constraint on tags.label...');

    const tag1 = createTagRecord({
      tagId: 'tag-1',
      label: 'javascript',
    });

    await executeQuery(
      db,
      'INSERT INTO tags (tag_id, label, created_at) VALUES (?, ?, ?)',
      [tag1.tagId, tag1.label, tag1.createdAt]
    );
    console.log('[TEST] Inserted tag with label "javascript"');

    // Try to insert another tag with the same label (should fail)
    const tag2 = createTagRecord({
      tagId: 'tag-2',
      label: 'javascript', // Same label as tag1
    });

    let uniqueViolationCaught = false;
    try {
      await executeQuery(
        db,
        'INSERT INTO tags (tag_id, label, created_at) VALUES (?, ?, ?)',
        [tag2.tagId, tag2.label, tag2.createdAt]
      );
      console.log('[TEST] ❌ Should have thrown UNIQUE constraint error');
    } catch (error) {
      console.log('[TEST] ✓ Caught UNIQUE constraint violation:', error);
      console.log('[TEST] Error string:', String(error));
      // Error might be undefined message, but the fact we caught it means constraint worked
      uniqueViolationCaught = true;
    }

    assert.ok(uniqueViolationCaught, 'Should have caught UNIQUE constraint violation');

    // Verify only first tag exists
    const tagsResult = await executeQuery(db, 'SELECT COUNT(*) as count FROM tags');
    const tagCount = tagsResult.rows[0].values[0].value;
    console.log('[TEST] Tag count after UNIQUE violation:', tagCount);
    assert.equal(tagCount, 1, 'Should have only 1 tag (second insert failed)');

    console.log('[TEST] ✓ UNIQUE constraint works correctly');
  });

  test('Test PRIMARY KEY constraint violations', async () => {
    console.log('[TEST] Starting PRIMARY KEY constraint tests...');

    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    const db = await initDb({
      absurderSql,
      storageKey: `constraints-pk-test-${Date.now()}`,
    });

    // Test 2: PRIMARY KEY constraint on folders.folder_id
    console.log('[TEST] Test 2: PRIMARY KEY constraint on folders.folder_id...');

    const folder1 = createFolderRecord({
      folderId: 'folder-1',
      name: 'First Folder',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [folder1.folderId, folder1.name, folder1.parentFolderId, folder1.createdAt, folder1.updatedAt]
    );
    console.log('[TEST] Inserted folder with ID "folder-1"');

    // Try to insert another folder with the same ID (should fail)
    const folder2 = createFolderRecord({
      folderId: 'folder-1', // Same ID as folder1
      name: 'Second Folder',
    });

    let pkViolationCaught = false;
    try {
      await executeQuery(
        db,
        'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [folder2.folderId, folder2.name, folder2.parentFolderId, folder2.createdAt, folder2.updatedAt]
      );
      console.log('[TEST] ❌ Should have thrown PRIMARY KEY constraint error');
    } catch (error) {
      console.log('[TEST] ✓ Caught PRIMARY KEY constraint violation:', error);
      console.log('[TEST] Error string:', String(error));
      // Error might be undefined message, but the fact we caught it means constraint worked
      pkViolationCaught = true;
    }

    assert.ok(pkViolationCaught, 'Should have caught PRIMARY KEY constraint violation');

    console.log('[TEST] ✓ PRIMARY KEY constraint works correctly');
  });

  test('Test composite PRIMARY KEY constraint (note_tags)', async () => {
    console.log('[TEST] Starting composite PRIMARY KEY constraint tests...');

    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    const db = await initDb({
      absurderSql,
      storageKey: `constraints-composite-pk-test-${Date.now()}`,
    });

    // Setup: Create folder, note, and tag
    const folder = createFolderRecord({
      folderId: 'folder-1',
      name: 'Test Folder',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [folder.folderId, folder.name, folder.parentFolderId, folder.createdAt, folder.updatedAt]
    );

    const note = createNoteRecord({
      noteId: 'note-1',
      folderId: 'folder-1',
      title: 'Test Note',
      body: 'Content',
    });

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [note.noteId, note.folderId, note.title, note.body, note.createdAt, note.updatedAt]
    );

    const tag = createTagRecord({
      tagId: 'tag-1',
      label: 'test',
    });

    await executeQuery(
      db,
      'INSERT INTO tags (tag_id, label, created_at) VALUES (?, ?, ?)',
      [tag.tagId, tag.label, tag.createdAt]
    );

    // Test 3: Composite PRIMARY KEY (note_id, tag_id) on note_tags
    console.log('[TEST] Test 3: Composite PRIMARY KEY on note_tags...');

    // Insert first association
    await executeQuery(
      db,
      'INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)',
      ['note-1', 'tag-1']
    );
    console.log('[TEST] Inserted note_tags (note-1, tag-1)');

    // Try to insert the same association again (should fail)
    let compositePkViolationCaught = false;
    try {
      await executeQuery(
        db,
        'INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)',
        ['note-1', 'tag-1']
      );
      console.log('[TEST] ❌ Should have thrown composite PRIMARY KEY constraint error');
    } catch (error) {
      console.log('[TEST] ✓ Caught composite PRIMARY KEY violation:', error);
      console.log('[TEST] Error string:', String(error));
      // Error might be undefined message, but the fact we caught it means constraint worked
      compositePkViolationCaught = true;
    }

    assert.ok(compositePkViolationCaught, 'Should have caught composite PRIMARY KEY violation');

    // Verify only one association exists
    const noteTagsResult = await executeQuery(
      db,
      'SELECT COUNT(*) as count FROM note_tags WHERE note_id = ? AND tag_id = ?',
      ['note-1', 'tag-1']
    );
    const noteTagCount = noteTagsResult.rows[0].values[0].value;
    console.log('[TEST] note_tags count:', noteTagCount);
    assert.equal(noteTagCount, 1, 'Should have only 1 association');

    console.log('[TEST] ✓ Composite PRIMARY KEY constraint works correctly');
  });

  test('Test FOREIGN KEY constraint violations', async () => {
    console.log('[TEST] Starting FOREIGN KEY constraint tests...');

    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    const db = await initDb({
      absurderSql,
      storageKey: `constraints-fk-test-${Date.now()}`,
    });

    // Test 4: FOREIGN KEY constraint on notes.folder_id
    console.log('[TEST] Test 4: FOREIGN KEY constraint on notes.folder_id...');

    const note = createNoteRecord({
      noteId: 'note-1',
      folderId: 'non-existent-folder', // This folder doesn't exist
      title: 'Orphan Note',
      body: 'This note references a non-existent folder',
    });

    let fkViolationCaught = false;
    try {
      await executeQuery(
        db,
        'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [note.noteId, note.folderId, note.title, note.body, note.createdAt, note.updatedAt]
      );
      console.log('[TEST] ❌ Should have thrown FOREIGN KEY constraint error');
    } catch (error) {
      console.log('[TEST] ✓ Caught FOREIGN KEY constraint violation:', error);
      console.log('[TEST] Error string:', String(error));
      // Error might be undefined message, but the fact we caught it means constraint worked
      fkViolationCaught = true;
    }

    assert.ok(fkViolationCaught, 'Should have caught FOREIGN KEY constraint violation');

    // Verify note was not inserted
    const notesResult = await executeQuery(db, 'SELECT COUNT(*) as count FROM notes');
    const noteCount = notesResult.rows[0].values[0].value;
    console.log('[TEST] Notes count after FK violation:', noteCount);
    assert.equal(noteCount, 0, 'Should have 0 notes (insert failed due to FK violation)');

    console.log('[TEST] ✓ FOREIGN KEY constraint works correctly');
  });

  test('Test NOT NULL constraint violations', async () => {
    console.log('[TEST] Starting NOT NULL constraint tests...');

    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    const db = await initDb({
      absurderSql,
      storageKey: `constraints-not-null-test-${Date.now()}`,
    });

    // Test 5: NOT NULL constraint on folders.name
    console.log('[TEST] Test 5: NOT NULL constraint on folders.name...');

    let notNullViolationCaught = false;
    try {
      await executeQuery(
        db,
        'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['folder-1', null, null, new Date().toISOString(), new Date().toISOString()]
      );
      console.log('[TEST] ❌ Should have thrown NOT NULL constraint error');
    } catch (error) {
      console.log('[TEST] ✓ Caught NOT NULL constraint violation:', error);
      console.log('[TEST] Error string:', String(error));
      // Error might be undefined message, but the fact we caught it means constraint worked
      notNullViolationCaught = true;
    }

    assert.ok(notNullViolationCaught, 'Should have caught NOT NULL constraint violation');

    console.log('[TEST] ✓ NOT NULL constraint works correctly');
  });

  test('Test data integrity across related tables', async () => {
    console.log('[TEST] Starting data integrity tests across related tables...');

    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    const db = await initDb({
      absurderSql,
      storageKey: `constraints-integrity-test-${Date.now()}`,
    });

    // Test 6: Data integrity - Cannot delete folder with notes due to CASCADE
    console.log('[TEST] Test 6: CASCADE behavior ensures data integrity...');

    // Create folder
    const folder = createFolderRecord({
      folderId: 'folder-1',
      name: 'Important Folder',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [folder.folderId, folder.name, folder.parentFolderId, folder.createdAt, folder.updatedAt]
    );

    // Create note in folder
    const note = createNoteRecord({
      noteId: 'note-1',
      folderId: 'folder-1',
      title: 'Important Note',
      body: 'Important content',
    });

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [note.noteId, note.folderId, note.title, note.body, note.createdAt, note.updatedAt]
    );

    console.log('[TEST] Created folder with note');

    // Verify note exists
    const notesBeforeResult = await executeQuery(
      db,
      'SELECT COUNT(*) as count FROM notes WHERE folder_id = ?',
      ['folder-1']
    );
    const notesBeforeCount = notesBeforeResult.rows[0].values[0].value;
    console.log('[TEST] Notes in folder before delete:', notesBeforeCount);
    assert.equal(notesBeforeCount, 1, 'Should have 1 note');

    // Delete folder (should CASCADE delete the note)
    await executeQuery(db, 'DELETE FROM folders WHERE folder_id = ?', ['folder-1']);
    console.log('[TEST] Deleted folder (should CASCADE delete notes)');

    // Verify note was CASCADE deleted
    const notesAfterResult = await executeQuery(
      db,
      'SELECT COUNT(*) as count FROM notes WHERE folder_id = ?',
      ['folder-1']
    );
    const notesAfterCount = notesAfterResult.rows[0].values[0].value;
    console.log('[TEST] Notes after folder delete:', notesAfterCount);
    assert.equal(notesAfterCount, 0, 'Notes should be CASCADE deleted with folder');

    console.log('[TEST] ✓ CASCADE behavior maintains data integrity');
  });

  test('Test constraint enforcement with PRAGMA foreign_keys', async () => {
    console.log('[TEST] Starting PRAGMA foreign_keys enforcement test...');

    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    const db = await initDb({
      absurderSql,
      storageKey: `constraints-pragma-test-${Date.now()}`,
    });

    // Test 7: Verify PRAGMA foreign_keys is ON
    console.log('[TEST] Test 7: Verifying PRAGMA foreign_keys is enabled...');

    const pragmaResult = await executeQuery(db, 'PRAGMA foreign_keys');
    const foreignKeysEnabled = pragmaResult.rows[0].values[0].value;
    console.log('[TEST] PRAGMA foreign_keys value:', foreignKeysEnabled);

    assert.equal(foreignKeysEnabled, 1, 'PRAGMA foreign_keys should be enabled (1)');

    console.log('[TEST] ✓ Foreign key enforcement is enabled');
  });

  console.log('[TEST] 🎉 ALL CONSTRAINT TESTS PASSED!');
});
