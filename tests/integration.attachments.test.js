/**
 * REAL INTEGRATION TEST - Attachments Functionality
 * Tests actual attachment storage, querying, and cascade delete with absurder-sql
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
import { createFolderRecord, createNoteRecord, createAttachmentRecord } from '../packages/domain/src/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('INTEGRATION: Attachments functionality with real absurder-sql', () => {
  test('Create attachments, query by note, and test CASCADE delete', async () => {
    console.log('[TEST] Starting attachments integration test...');

    // Initialize WASM
    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);
    console.log('[TEST] ✓ WASM initialized');

    const db = await initDb({
      absurderSql,
      storageKey: `attachments-test-${Date.now()}`,
    });
    console.log('[TEST] ✓ Database initialized');

    // PART 1: Create folder and notes
    console.log('[TEST] PART 1: Creating test data (folder and notes)...');

    const folder = createFolderRecord({
      folderId: 'folder-1',
      name: 'Documents',
    });

    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [folder.folderId, folder.name, folder.parentFolderId, folder.createdAt, folder.updatedAt]
    );

    const note1 = createNoteRecord({
      noteId: 'note-1',
      folderId: 'folder-1',
      title: 'Research Paper',
      body: 'This note has multiple attachments',
    });

    const note2 = createNoteRecord({
      noteId: 'note-2',
      folderId: 'folder-1',
      title: 'Meeting Notes',
      body: 'This note has one attachment',
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

    console.log('[TEST] ✓ Created folder and 2 notes');

    // PART 2: Create and validate attachment records
    console.log('[TEST] PART 2: Creating attachment records...');

    const attachment1 = createAttachmentRecord({
      attachmentId: 'att-1',
      noteId: 'note-1',
      filename: 'diagram.png',
      mimeType: 'image/png',
      byteLength: 524288, // 512 KB
    });

    const attachment2 = createAttachmentRecord({
      attachmentId: 'att-2',
      noteId: 'note-1',
      filename: 'research-paper.pdf',
      mimeType: 'application/pdf',
      byteLength: 2097152, // 2 MB
    });

    const attachment3 = createAttachmentRecord({
      attachmentId: 'att-3',
      noteId: 'note-2',
      filename: 'meeting-transcript.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      byteLength: 45056, // 44 KB
    });

    console.log('[TEST] Attachment 1:', attachment1);
    console.log('[TEST] Attachment 2:', attachment2);
    console.log('[TEST] Attachment 3:', attachment3);

    // Validate model factory output
    assert.ok(attachment1.attachmentId, 'Attachment should have ID');
    assert.ok(attachment1.noteId, 'Attachment should have note ID');
    assert.ok(attachment1.filename, 'Attachment should have filename');
    assert.ok(attachment1.mimeType, 'Attachment should have MIME type');
    assert.ok(attachment1.byteLength > 0, 'Attachment should have byte length');
    assert.ok(attachment1.createdAt, 'Attachment should have created timestamp');

    console.log('[TEST] ✓ Attachment records created and validated');

    // PART 3: Insert attachments into database
    console.log('[TEST] PART 3: Inserting attachments into database...');

    const attachments = [attachment1, attachment2, attachment3];

    for (const att of attachments) {
      await executeQuery(
        db,
        'INSERT INTO attachments (attachment_id, note_id, filename, mime_type, byte_length, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [att.attachmentId, att.noteId, att.filename, att.mimeType, att.byteLength, att.createdAt]
      );
    }

    console.log('[TEST] ✓ Inserted 3 attachments');

    // PART 4: Query all attachments
    console.log('[TEST] PART 4: Querying all attachments...');

    const allAttachmentsResult = await executeQuery(
      db,
      'SELECT attachment_id, note_id, filename, mime_type, byte_length FROM attachments ORDER BY filename'
    );

    console.log('[TEST] Total attachments:', allAttachmentsResult.rows.length);

    assert.equal(allAttachmentsResult.rows.length, 3, 'Should have 3 attachments');

    const allAttachments = allAttachmentsResult.rows.map(row => ({
      attachment_id: row.values[0].value,
      note_id: row.values[1].value,
      filename: row.values[2].value,
      mime_type: row.values[3].value,
      byte_length: row.values[4].value,
    }));

    console.log('[TEST] All attachments:', allAttachments);

    assert.equal(allAttachments[0].filename, 'diagram.png', 'First attachment should be diagram.png');
    assert.equal(allAttachments[1].filename, 'meeting-transcript.docx', 'Second attachment should be meeting-transcript.docx');
    assert.equal(allAttachments[2].filename, 'research-paper.pdf', 'Third attachment should be research-paper.pdf');

    console.log('[TEST] ✓ All attachments query works correctly');

    // PART 5: Query attachments by note
    console.log('[TEST] PART 5: Querying attachments by note...');

    const note1AttachmentsResult = await executeQuery(
      db,
      'SELECT filename, mime_type, byte_length FROM attachments WHERE note_id = ? ORDER BY filename',
      ['note-1']
    );

    const note1Attachments = note1AttachmentsResult.rows.map(row => ({
      filename: row.values[0].value,
      mime_type: row.values[1].value,
      byte_length: row.values[2].value,
    }));

    console.log('[TEST] Attachments for note-1:', note1Attachments);

    assert.equal(note1Attachments.length, 2, 'Note-1 should have 2 attachments');
    assert.equal(note1Attachments[0].filename, 'diagram.png', 'Should have diagram.png');
    assert.equal(note1Attachments[1].filename, 'research-paper.pdf', 'Should have research-paper.pdf');

    const note2AttachmentsResult = await executeQuery(
      db,
      'SELECT filename FROM attachments WHERE note_id = ?',
      ['note-2']
    );

    const note2Attachments = note2AttachmentsResult.rows.map(row => ({
      filename: row.values[0].value,
    }));

    console.log('[TEST] Attachments for note-2:', note2Attachments);

    assert.equal(note2Attachments.length, 1, 'Note-2 should have 1 attachment');
    assert.equal(note2Attachments[0].filename, 'meeting-transcript.docx', 'Should have meeting-transcript.docx');

    console.log('[TEST] ✓ Query attachments by note works correctly');

    // PART 6: Test JOIN query (notes with attachments)
    console.log('[TEST] PART 6: Testing JOIN query (notes with their attachments)...');

    const notesWithAttachmentsResult = await executeQuery(
      db,
      `SELECT n.note_id, n.title, a.filename, a.mime_type
       FROM notes n
       JOIN attachments a ON n.note_id = a.note_id
       ORDER BY n.note_id, a.filename`
    );

    const notesWithAttachments = notesWithAttachmentsResult.rows.map(row => ({
      note_id: row.values[0].value,
      title: row.values[1].value,
      filename: row.values[2].value,
      mime_type: row.values[3].value,
    }));

    console.log('[TEST] Notes with attachments:', notesWithAttachments);

    assert.equal(notesWithAttachments.length, 3, 'Should have 3 note-attachment relationships');
    assert.equal(notesWithAttachments[0].note_id, 'note-1', 'First should be from note-1');
    assert.equal(notesWithAttachments[1].note_id, 'note-1', 'Second should be from note-1');
    assert.equal(notesWithAttachments[2].note_id, 'note-2', 'Third should be from note-2');

    console.log('[TEST] ✓ JOIN query works correctly');

    // PART 7: Test CASCADE DELETE
    console.log('[TEST] PART 7: Testing CASCADE DELETE (deleting note should delete attachments)...');

    // Delete note-1
    await executeQuery(db, 'DELETE FROM notes WHERE note_id = ?', ['note-1']);
    console.log('[TEST] Deleted note-1');

    // Check that attachments for note-1 are also deleted
    const remainingAttachmentsResult = await executeQuery(
      db,
      'SELECT attachment_id, note_id, filename FROM attachments ORDER BY filename'
    );

    const remainingAttachments = remainingAttachmentsResult.rows.map(row => ({
      attachment_id: row.values[0].value,
      note_id: row.values[1].value,
      filename: row.values[2].value,
    }));

    console.log('[TEST] Remaining attachments after deleting note-1:', remainingAttachments);

    assert.equal(remainingAttachments.length, 1, 'Should have only 1 attachment remaining');
    assert.equal(remainingAttachments[0].note_id, 'note-2', 'Remaining attachment should belong to note-2');
    assert.equal(remainingAttachments[0].filename, 'meeting-transcript.docx', 'Should be the note-2 attachment');

    console.log('[TEST] ✓ CASCADE DELETE works correctly (orphaned attachments were deleted)');

    console.log('[TEST] 🎉 ALL ATTACHMENTS TESTS PASSED!');
  });

  test('Handle attachment edge cases and validation', async () => {
    console.log('[TEST] Testing attachment edge cases...');

    // Edge case 1: Large byte lengths
    const largeFile = createAttachmentRecord({
      noteId: 'test-note',
      filename: 'large-video.mp4',
      mimeType: 'video/mp4',
      byteLength: 1073741824, // 1 GB
    });

    console.log('[TEST] Large file:', largeFile);
    assert.equal(largeFile.byteLength, 1073741824, 'Should handle large byte lengths');

    // Edge case 2: Special characters in filename
    const specialCharsFile = createAttachmentRecord({
      noteId: 'test-note',
      filename: 'file (with) [special] {chars} & symbols!.txt',
      mimeType: 'text/plain',
      byteLength: 1024,
    });

    console.log('[TEST] Special chars filename:', specialCharsFile.filename);
    assert.ok(specialCharsFile.filename.includes('('), 'Should handle parentheses in filename');
    assert.ok(specialCharsFile.filename.includes('['), 'Should handle brackets in filename');

    // Edge case 3: Various MIME types
    const mimeTypes = [
      'image/jpeg',
      'image/gif',
      'application/json',
      'text/markdown',
      'audio/mpeg',
      'video/webm',
      'application/zip',
    ];

    for (const mimeType of mimeTypes) {
      const att = createAttachmentRecord({
        noteId: 'test-note',
        filename: `file.${mimeType.split('/')[1]}`,
        mimeType: mimeType,
        byteLength: 1000,
      });
      console.log(`[TEST] MIME type ${mimeType}:`, att.mimeType);
      assert.equal(att.mimeType, mimeType, `Should handle ${mimeType}`);
    }

    // Edge case 4: Validation should fail for invalid inputs
    console.log('[TEST] Testing validation errors...');

    assert.throws(
      () => createAttachmentRecord({ noteId: '', filename: 'test.txt', mimeType: 'text/plain', byteLength: 100 }),
      /noteId must be a non-empty string/,
      'Should throw error for empty noteId'
    );

    assert.throws(
      () => createAttachmentRecord({ noteId: 'test', filename: '', mimeType: 'text/plain', byteLength: 100 }),
      /filename must be a non-empty string/,
      'Should throw error for empty filename'
    );

    assert.throws(
      () => createAttachmentRecord({ noteId: 'test', filename: 'test.txt', mimeType: '', byteLength: 100 }),
      /mimeType must be a non-empty string/,
      'Should throw error for empty mimeType'
    );

    assert.throws(
      () => createAttachmentRecord({ noteId: 'test', filename: 'test.txt', mimeType: 'text/plain', byteLength: 0 }),
      /byteLength must be a positive integer/,
      'Should throw error for zero byte length'
    );

    assert.throws(
      () => createAttachmentRecord({ noteId: 'test', filename: 'test.txt', mimeType: 'text/plain', byteLength: -100 }),
      /byteLength must be a positive integer/,
      'Should throw error for negative byte length'
    );

    assert.throws(
      () => createAttachmentRecord({ noteId: 'test', filename: 'test.txt', mimeType: 'text/plain', byteLength: 1.5 }),
      /byteLength must be a positive integer/,
      'Should throw error for non-integer byte length'
    );

    console.log('[TEST] ✓ All edge cases and validations handled correctly');
  });
});
