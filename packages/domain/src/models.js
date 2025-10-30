import { randomUUID } from 'node:crypto';

const nowIso = () => new Date().toISOString();

function ensureString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function coerceOptionalString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function ensurePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

export function createFolderRecord({
  folderId = randomUUID(),
  name,
  parentFolderId = null,
  createdAt = nowIso(),
  updatedAt = nowIso(),
} = {}) {
  return {
    folderId: ensureString(folderId, 'folderId'),
    name: ensureString(name, 'name'),
    parentFolderId: coerceOptionalString(parentFolderId),
    createdAt: ensureString(createdAt, 'createdAt'),
    updatedAt: ensureString(updatedAt, 'updatedAt'),
  };
}

export function createNoteRecord({
  noteId = randomUUID(),
  folderId,
  title,
  body = '',
  createdAt = nowIso(),
  updatedAt = nowIso(),
} = {}) {
  return {
    noteId: ensureString(noteId, 'noteId'),
    folderId: ensureString(folderId, 'folderId'),
    title: ensureString(title, 'title'),
    body: String(body),
    createdAt: ensureString(createdAt, 'createdAt'),
    updatedAt: ensureString(updatedAt, 'updatedAt'),
  };
}

export function createTagRecord({
  tagId = randomUUID(),
  label,
  createdAt = nowIso(),
} = {}) {
  const normalizedLabel = ensureString(label, 'label').toLowerCase();

  return {
    tagId: ensureString(tagId, 'tagId'),
    label: normalizedLabel,
    createdAt: ensureString(createdAt, 'createdAt'),
  };
}

export function createAttachmentRecord({
  attachmentId = randomUUID(),
  noteId,
  filename,
  mimeType,
  byteLength,
  createdAt = nowIso(),
} = {}) {
  return {
    attachmentId: ensureString(attachmentId, 'attachmentId'),
    noteId: ensureString(noteId, 'noteId'),
    filename: ensureString(filename, 'filename'),
    mimeType: ensureString(mimeType, 'mimeType'),
    byteLength: ensurePositiveInteger(byteLength, 'byteLength'),
    createdAt: ensureString(createdAt, 'createdAt'),
  };
}

export function createBacklinkRecord({
  sourceNoteId,
  targetNoteId,
  contextSnippet = '',
  createdAt = nowIso(),
} = {}) {
  return {
    sourceNoteId: ensureString(sourceNoteId, 'sourceNoteId'),
    targetNoteId: ensureString(targetNoteId, 'targetNoteId'),
    contextSnippet: String(contextSnippet || ''),
    createdAt: ensureString(createdAt, 'createdAt'),
  };
}

/**
 * @typedef {ReturnType<typeof createFolderRecord>} FolderRecord
 * @typedef {ReturnType<typeof createNoteRecord>} NoteRecord
 * @typedef {ReturnType<typeof createTagRecord>} TagRecord
 * @typedef {ReturnType<typeof createAttachmentRecord>} AttachmentRecord
 * @typedef {ReturnType<typeof createBacklinkRecord>} BacklinkRecord
 */
