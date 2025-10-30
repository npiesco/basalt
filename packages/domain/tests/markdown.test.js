import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBacklinkRecords, extractWikiLinks } from '../src/markdown.js';

test('extractWikiLinks captures unique wiki targets ignoring embeds', () => {
  const markdown = `
  # Note
  See [[Target Note]], [[target note]], and [[Second Note|View]].
  Embedded image ![[Asset.png]] should be ignored.
  `;

  const links = extractWikiLinks(markdown);

  assert.deepEqual(links, ['target-note', 'second-note']);
});

test('deriveBacklinkRecords builds normalized backlink records', () => {
  const markdown = `
  [[Second Note]]
  Content between links.
  [[Target Note|Alias]]
  `;

  const backlinks = deriveBacklinkRecords({
    sourceNoteId: 'note-a',
    markdown,
    clock: () => '2025-01-01T00:00:00.000Z',
  });

  assert.equal(backlinks.length, 2);

  const [first, second] = backlinks;
  assert.equal(first.sourceNoteId, 'note-a');
  assert.equal(first.targetNoteId, 'second-note');
  assert.equal(first.contextSnippet, '');
  assert.equal(first.createdAt, '2025-01-01T00:00:00.000Z');

  assert.equal(second.targetNoteId, 'target-note');
});
