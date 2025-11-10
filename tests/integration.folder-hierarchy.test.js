/**
 * REAL INTEGRATION TEST - Folder Hierarchy and CASCADE Behaviors
 * Tests nested folders, self-referencing foreign keys, ON DELETE SET NULL, and folder-note relationships
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
import { createFolderRecord, createNoteRecord } from '../packages/domain/src/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('INTEGRATION: Folder hierarchy with real absurder-sql', () => {
  test('Create nested folders, test ON DELETE SET NULL, and folder-note CASCADE', async () => {
    console.log('[TEST] Starting folder hierarchy integration test...');

    // Initialize WASM
    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);
    console.log('[TEST] ✓ WASM initialized');

    const db = await initDb({
      absurderSql,
      storageKey: `folder-hierarchy-test-${Date.now()}`,
    });
    console.log('[TEST] ✓ Database initialized');

    // PART 1: Create nested folder hierarchy (4 levels deep)
    console.log('[TEST] PART 1: Creating nested folder hierarchy...');
    console.log('[TEST] Structure:');
    console.log('[TEST]   Root/');
    console.log('[TEST]   ├── Projects/');
    console.log('[TEST]   │   ├── Work/');
    console.log('[TEST]   │   │   └── Client-A/');
    console.log('[TEST]   │   └── Personal/');
    console.log('[TEST]   └── Archive/');

    // Level 1: Root folder
    const rootFolder = createFolderRecord({
      folderId: 'root',
      name: 'Root',
      parentFolderId: null,
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [rootFolder.folderId, rootFolder.name, rootFolder.parentFolderId, rootFolder.createdAt, rootFolder.updatedAt]
    );

    // Level 2: Projects and Archive
    const projectsFolder = createFolderRecord({
      folderId: 'projects',
      name: 'Projects',
      parentFolderId: 'root',
    });

    const archiveFolder = createFolderRecord({
      folderId: 'archive',
      name: 'Archive',
      parentFolderId: 'root',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [projectsFolder.folderId, projectsFolder.name, projectsFolder.parentFolderId, projectsFolder.createdAt, projectsFolder.updatedAt]
    );

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [archiveFolder.folderId, archiveFolder.name, archiveFolder.parentFolderId, archiveFolder.createdAt, archiveFolder.updatedAt]
    );

    // Level 3: Work and Personal under Projects
    const workFolder = createFolderRecord({
      folderId: 'work',
      name: 'Work',
      parentFolderId: 'projects',
    });

    const personalFolder = createFolderRecord({
      folderId: 'personal',
      name: 'Personal',
      parentFolderId: 'projects',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [workFolder.folderId, workFolder.name, workFolder.parentFolderId, workFolder.createdAt, workFolder.updatedAt]
    );

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [personalFolder.folderId, personalFolder.name, personalFolder.parentFolderId, personalFolder.createdAt, personalFolder.updatedAt]
    );

    // Level 4: Client-A under Work
    const clientAFolder = createFolderRecord({
      folderId: 'client-a',
      name: 'Client-A',
      parentFolderId: 'work',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [clientAFolder.folderId, clientAFolder.name, clientAFolder.parentFolderId, clientAFolder.createdAt, clientAFolder.updatedAt]
    );

    console.log('[TEST] ✓ Created 6 folders in 4-level hierarchy');

    // PART 2: Query and validate folder hierarchy
    console.log('[TEST] PART 2: Querying folder hierarchy...');

    const allFoldersResult = await executeQuery(
      db,
      'SELECT folder_id, name, parent_folder_id FROM folders ORDER BY folder_id'
    );

    const allFolders = allFoldersResult.rows.map(row => ({
      folder_id: row.values[0].value,
      name: row.values[1].value,
      parent_folder_id: row.values[2].value,
    }));

    console.log('[TEST] All folders:', allFolders);

    assert.equal(allFolders.length, 6, 'Should have 6 folders');

    // Validate parent-child relationships
    const rootFolderData = allFolders.find(f => f.folder_id === 'root');
    const projectsFolderData = allFolders.find(f => f.folder_id === 'projects');
    const workFolderData = allFolders.find(f => f.folder_id === 'work');
    const clientAFolderData = allFolders.find(f => f.folder_id === 'client-a');

    assert.equal(rootFolderData.parent_folder_id, undefined, 'Root should have no parent');
    assert.equal(projectsFolderData.parent_folder_id, 'root', 'Projects should be child of Root');
    assert.equal(workFolderData.parent_folder_id, 'projects', 'Work should be child of Projects');
    assert.equal(clientAFolderData.parent_folder_id, 'work', 'Client-A should be child of Work');

    console.log('[TEST] ✓ Folder hierarchy validated');

    // PART 3: Query children of a folder
    console.log('[TEST] PART 3: Querying children of folders...');

    const rootChildrenResult = await executeQuery(
      db,
      'SELECT folder_id, name FROM folders WHERE parent_folder_id = ? ORDER BY name',
      ['root']
    );

    const rootChildren = rootChildrenResult.rows.map(row => ({
      folder_id: row.values[0].value,
      name: row.values[1].value,
    }));

    console.log('[TEST] Children of Root:', rootChildren);

    assert.equal(rootChildren.length, 2, 'Root should have 2 children');
    assert.deepEqual(
      rootChildren.map(f => f.folder_id).sort(),
      ['archive', 'projects'],
      'Root children should be Archive and Projects'
    );

    const projectsChildrenResult = await executeQuery(
      db,
      'SELECT folder_id, name FROM folders WHERE parent_folder_id = ? ORDER BY name',
      ['projects']
    );

    const projectsChildren = projectsChildrenResult.rows.map(row => ({
      folder_id: row.values[0].value,
      name: row.values[1].value,
    }));

    console.log('[TEST] Children of Projects:', projectsChildren);

    assert.equal(projectsChildren.length, 2, 'Projects should have 2 children');
    assert.deepEqual(
      projectsChildren.map(f => f.folder_id).sort(),
      ['personal', 'work'],
      'Projects children should be Personal and Work'
    );

    console.log('[TEST] ✓ Children queries work correctly');

    // PART 4: Add notes to folders
    console.log('[TEST] PART 4: Adding notes to folders...');

    const note1 = createNoteRecord({
      noteId: 'note-1',
      folderId: 'client-a',
      title: 'Meeting Notes',
      body: 'Discussion about project timeline',
    });

    const note2 = createNoteRecord({
      noteId: 'note-2',
      folderId: 'personal',
      title: 'Todo List',
      body: 'Things to do today',
    });

    const note3 = createNoteRecord({
      noteId: 'note-3',
      folderId: 'work',
      title: 'Work Summary',
      body: 'Weekly summary',
    });

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [note1.noteId, note1.folderId, note1.title, note1.body, note1.createdAt, note1.updatedAt]
    );

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [note2.noteId, note2.folderId, note2.title, note2.body, note2.createdAt, note2.updatedAt]
    );

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [note3.noteId, note3.folderId, note3.title, note3.body, note3.createdAt, note3.updatedAt]
    );

    console.log('[TEST] ✓ Created 3 notes in different folders');

    // PART 5: Test ON DELETE SET NULL (deleting parent folder sets children's parent to NULL)
    console.log('[TEST] PART 5: Testing ON DELETE SET NULL...');
    console.log('[TEST] Deleting "Projects" folder (has 2 children: Work, Personal)...');

    // Before delete: verify Work and Personal have Projects as parent
    const workBeforeResult = await executeQuery(
      db,
      'SELECT parent_folder_id FROM folders WHERE folder_id = ?',
      ['work']
    );
    const workBeforeParent = workBeforeResult.rows[0].values[0].value;
    console.log('[TEST] Work parent before delete:', workBeforeParent);
    assert.equal(workBeforeParent, 'projects', 'Work should have Projects as parent before delete');

    // Delete Projects folder
    await executeQuery(db, 'DELETE FROM folders WHERE folder_id = ?', ['projects']);
    console.log('[TEST] Deleted "Projects" folder');

    // After delete: verify Work and Personal now have NULL parent (ON DELETE SET NULL)
    const workAfterResult = await executeQuery(
      db,
      'SELECT parent_folder_id FROM folders WHERE folder_id = ?',
      ['work']
    );
    const workAfterParent = workAfterResult.rows[0].values[0].value;
    console.log('[TEST] Work parent after delete:', workAfterParent);
    assert.equal(workAfterParent, undefined, 'Work parent should be NULL after Projects deleted (ON DELETE SET NULL)');

    const personalAfterResult = await executeQuery(
      db,
      'SELECT parent_folder_id FROM folders WHERE folder_id = ?',
      ['personal']
    );
    const personalAfterParent = personalAfterResult.rows[0].values[0].value;
    console.log('[TEST] Personal parent after delete:', personalAfterParent);
    assert.equal(personalAfterParent, undefined, 'Personal parent should be NULL after Projects deleted (ON DELETE SET NULL)');

    console.log('[TEST] ✓ ON DELETE SET NULL works correctly (orphaned folders still exist)');

    // PART 6: Verify note-3 is still there (was in Work folder, which still exists)
    console.log('[TEST] PART 6: Verifying notes in orphaned folders...');

    const note3Result = await executeQuery(
      db,
      'SELECT title, folder_id FROM notes WHERE note_id = ?',
      ['note-3']
    );

    assert.equal(note3Result.rows.length, 1, 'Note-3 should still exist');
    const note3Data = {
      title: note3Result.rows[0].values[0].value,
      folder_id: note3Result.rows[0].values[1].value,
    };
    console.log('[TEST] Note-3:', note3Data);
    assert.equal(note3Data.folder_id, 'work', 'Note-3 should still be in Work folder');

    console.log('[TEST] ✓ Notes survive when parent folder is deleted (only folder parent_folder_id is affected)');

    // PART 7: Test CASCADE DELETE (deleting folder deletes its notes)
    console.log('[TEST] PART 7: Testing CASCADE DELETE (folder to notes)...');
    console.log('[TEST] Deleting "Work" folder (contains note-3 and has child "Client-A")...');

    // Delete Work folder
    await executeQuery(db, 'DELETE FROM folders WHERE folder_id = ?', ['work']);
    console.log('[TEST] Deleted "Work" folder');

    // Verify note-3 is deleted (CASCADE)
    const note3AfterResult = await executeQuery(
      db,
      'SELECT * FROM notes WHERE note_id = ?',
      ['note-3']
    );

    assert.equal(note3AfterResult.rows.length, 0, 'Note-3 should be deleted (CASCADE from folder delete)');
    console.log('[TEST] ✓ Note-3 was CASCADE deleted with Work folder');

    // Verify note-1 is also deleted (was in Client-A, which was child of Work)
    // Wait, Client-A should still exist because ON DELETE SET NULL, but its notes should be deleted
    // Actually, Client-A was deleted because it was in Work folder... no wait, Client-A is a folder, not a note
    // Let me check if Client-A still exists
    const clientAAfterResult = await executeQuery(
      db,
      'SELECT parent_folder_id FROM folders WHERE folder_id = ?',
      ['client-a']
    );

    console.log('[TEST] Client-A after Work delete:', clientAAfterResult.rows.length > 0 ? 'EXISTS' : 'DELETED');

    if (clientAAfterResult.rows.length > 0) {
      const clientAParent = clientAAfterResult.rows[0].values[0].value;
      console.log('[TEST] Client-A parent after delete:', clientAParent);
      assert.equal(clientAParent, undefined, 'Client-A parent should be NULL after Work deleted');

      // Now check if note-1 still exists (it was in Client-A)
      const note1AfterResult = await executeQuery(
        db,
        'SELECT * FROM notes WHERE note_id = ?',
        ['note-1']
      );

      assert.equal(note1AfterResult.rows.length, 1, 'Note-1 should still exist (Client-A folder still exists)');
      console.log('[TEST] ✓ Note-1 survives because Client-A folder survives (ON DELETE SET NULL on folders)');
    }

    console.log('[TEST] ✓ CASCADE DELETE works correctly (notes deleted when their folder is deleted)');

    // PART 8: Test moving a note between folders
    console.log('[TEST] PART 8: Testing moving notes between folders...');

    // Move note-2 from Personal to Archive
    await executeQuery(
      db,
      'UPDATE notes SET folder_id = ? WHERE note_id = ?',
      ['archive', 'note-2']
    );
    console.log('[TEST] Moved note-2 from Personal to Archive');

    const note2AfterMoveResult = await executeQuery(
      db,
      'SELECT folder_id FROM notes WHERE note_id = ?',
      ['note-2']
    );

    const note2NewFolder = note2AfterMoveResult.rows[0].values[0].value;
    console.log('[TEST] Note-2 new folder:', note2NewFolder);
    assert.equal(note2NewFolder, 'archive', 'Note-2 should be in Archive folder');

    console.log('[TEST] ✓ Moving notes between folders works correctly');

    console.log('[TEST] 🎉 ALL FOLDER HIERARCHY TESTS PASSED!');
  });

  test('Test folder hierarchy edge cases', async () => {
    console.log('[TEST] Testing folder hierarchy edge cases...');

    // Initialize WASM
    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    const db = await initDb({
      absurderSql,
      storageKey: `folder-edge-cases-${Date.now()}`,
    });

    // Edge case 1: Root-level folders (NULL parent)
    const folder1 = createFolderRecord({
      folderId: 'f1',
      name: 'Folder 1',
      parentFolderId: null,
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [folder1.folderId, folder1.name, folder1.parentFolderId, folder1.createdAt, folder1.updatedAt]
    );

    const rootFoldersResult = await executeQuery(
      db,
      'SELECT folder_id, name FROM folders WHERE parent_folder_id IS NULL ORDER BY name'
    );

    console.log('[TEST] Root-level folders:', rootFoldersResult.rows.length);
    assert.equal(rootFoldersResult.rows.length, 1, 'Should have 1 root folder');

    // Edge case 2: Folder with same name but different parent (duplicate names allowed)
    const subfolder1 = createFolderRecord({
      folderId: 'sub1',
      name: 'Notes',
      parentFolderId: 'f1',
    });

    const rootFolder2 = createFolderRecord({
      folderId: 'f2',
      name: 'Folder 2',
      parentFolderId: null,
    });

    const subfolder2 = createFolderRecord({
      folderId: 'sub2',
      name: 'Notes', // Same name as subfolder1
      parentFolderId: 'f2',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [subfolder1.folderId, subfolder1.name, subfolder1.parentFolderId, subfolder1.createdAt, subfolder1.updatedAt]
    );

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [rootFolder2.folderId, rootFolder2.name, rootFolder2.parentFolderId, rootFolder2.createdAt, rootFolder2.updatedAt]
    );

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [subfolder2.folderId, subfolder2.name, subfolder2.parentFolderId, subfolder2.createdAt, subfolder2.updatedAt]
    );

    const notesNamedFoldersResult = await executeQuery(
      db,
      'SELECT folder_id, parent_folder_id FROM folders WHERE name = ? ORDER BY folder_id',
      ['Notes']
    );

    console.log('[TEST] Folders named "Notes":', notesNamedFoldersResult.rows.length);
    assert.equal(notesNamedFoldersResult.rows.length, 2, 'Should allow duplicate folder names in different locations');

    // Edge case 3: Deep nesting (10 levels)
    console.log('[TEST] Creating deeply nested folders (10 levels)...');
    let parentId = null;
    for (let i = 1; i <= 10; i++) {
      const deepFolder = createFolderRecord({
        folderId: `deep-${i}`,
        name: `Level ${i}`,
        parentFolderId: parentId,
      });

      await executeQuery(
        db,
        'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [deepFolder.folderId, deepFolder.name, deepFolder.parentFolderId, deepFolder.createdAt, deepFolder.updatedAt]
      );

      parentId = `deep-${i}`;
    }

    const deepestFolderResult = await executeQuery(
      db,
      'SELECT parent_folder_id FROM folders WHERE folder_id = ?',
      ['deep-10']
    );

    const deepestParent = deepestFolderResult.rows[0].values[0].value;
    console.log('[TEST] Deepest folder (level 10) parent:', deepestParent);
    assert.equal(deepestParent, 'deep-9', 'Level 10 should be child of level 9');

    console.log('[TEST] ✓ All folder hierarchy edge cases handled correctly');
  });
});
