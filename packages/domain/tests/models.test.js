import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFolderRecord,
  createNoteRecord,
  createTagRecord,
  createAttachmentRecord,
  createBacklinkRecord,
} from '../src/models.js';

test('createFolderRecord normalizes folder input', () => {
  const folder = createFolderRecord({
    folderId: 'folder-1',
    name: 'Root',
  });

  assert.equal(folder.folderId, 'folder-1');
  assert.equal(folder.name, 'Root');
  assert.equal(folder.parentFolderId, null);
  assert.ok(folder.createdAt);
  assert.ok(folder.updatedAt);
});

test('createNoteRecord enforces required fields and defaults', () => {
  const note = createNoteRecord({
    noteId: 'note-1',
    folderId: 'folder-1',
    title: 'Hello',
  });

  assert.equal(note.noteId, 'note-1');
  assert.equal(note.folderId, 'folder-1');
  assert.equal(note.title, 'Hello');
  assert.equal(note.body, '');
  assert.ok(note.createdAt);
  assert.ok(note.updatedAt);
});

test('createNoteRecord rejects missing required fields while auto-generating ids', () => {
  const generated = createNoteRecord({ folderId: 'folder-1', title: 'Generated ID' });
  assert.match(generated.noteId, /^[0-9a-f-]{36}$/i);

  assert.throws(() => createNoteRecord({ title: 'Missing folder' }), /folderId/);
  assert.throws(() => createNoteRecord({ folderId: 'folder-1' }), /title/);
});

test('createAttachmentRecord enforces positive byte length', () => {
  assert.throws(() =>
    createAttachmentRecord({
      attachmentId: 'att-1',
      noteId: 'note-1',
      filename: 'file.png',
      mimeType: 'image/png',
      byteLength: -10,
    }),
  );
});

test('createBacklinkRecord defaults context snippet to empty string', () => {
  const backlink = createBacklinkRecord({
    sourceNoteId: 'note-a',
    targetNoteId: 'note-b',
  });

  assert.equal(backlink.contextSnippet, '');
});

test('createTagRecord lowercases labels', () => {
  const tag = createTagRecord({ tagId: 'tag-1', label: 'Daily' });
  assert.equal(tag.label, 'daily');
});
