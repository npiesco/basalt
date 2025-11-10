import { createBacklinkRecord, createTagRecord } from './models.js';

const WIKI_LINK_PATTERN = /(?<!\!)\[\[([^[\]|]+?)(?:\|[^[\]]+)?\]\]/g;
const TAG_PATTERN = /#([\w-]+)/g;

function normalizeWikiTarget(rawTarget) {
  if (!rawTarget) return '';
  return rawTarget.trim().toLowerCase().replace(/\s+/g, '-');
}

export function extractWikiLinks(markdown = '') {
  const normalizedTargets = new Set();
  let match;

  while ((match = WIKI_LINK_PATTERN.exec(markdown)) !== null) {
    const normalized = normalizeWikiTarget(match[1]);
    if (normalized) {
      normalizedTargets.add(normalized);
    }
  }

  return Array.from(normalizedTargets);
}

export function deriveBacklinkRecords({
  sourceNoteId,
  markdown = '',
  clock = () => new Date().toISOString(),
} = {}) {
  if (!sourceNoteId) {
    throw new Error('sourceNoteId is required to derive backlinks');
  }

  const createdAt = clock();
  return extractWikiLinks(markdown).map((targetNoteId) =>
    createBacklinkRecord({
      sourceNoteId,
      targetNoteId,
      contextSnippet: '',
      createdAt,
    }),
  );
}

export function extractTags(markdown = '') {
  const normalizedTags = new Set();
  let match;

  while ((match = TAG_PATTERN.exec(markdown)) !== null) {
    const normalized = match[1].toLowerCase();
    if (normalized) {
      normalizedTags.add(normalized);
    }
  }

  return Array.from(normalizedTags);
}

export function deriveTagRecords({
  markdown = '',
  clock = () => new Date().toISOString(),
} = {}) {
  const createdAt = clock();
  return extractTags(markdown).map((label) =>
    createTagRecord({
      label,
      createdAt,
    }),
  );
}
