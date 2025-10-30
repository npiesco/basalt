import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphData } from '../src/graph.js';

test('buildGraphData outputs unique nodes and edges', () => {
  const notes = [
    { noteId: 'note-a', title: 'Alpha' },
    { noteId: 'note-b', title: 'Beta' },
    { noteId: 'note-c', title: 'Gamma' },
  ];

  const backlinks = [
    { sourceNoteId: 'note-a', targetNoteId: 'note-b' },
    { sourceNoteId: 'note-a', targetNoteId: 'note-b' },
    { sourceNoteId: 'note-b', targetNoteId: 'note-c' },
  ];

  const graph = buildGraphData({ notes, backlinks });

  assert.deepEqual(graph.nodes, [
    { id: 'note-a', label: 'Alpha' },
    { id: 'note-b', label: 'Beta' },
    { id: 'note-c', label: 'Gamma' },
  ]);

  assert.deepEqual(graph.edges, [
    { id: 'note-a->note-b', source: 'note-a', target: 'note-b', weight: 1 },
    { id: 'note-b->note-c', source: 'note-b', target: 'note-c', weight: 1 },
  ]);
});

test('buildGraphData filters edges when notes missing', () => {
  const notes = [{ noteId: 'note-a', title: 'Alpha' }];
  const backlinks = [
    { sourceNoteId: 'note-a', targetNoteId: 'note-x' },
    { sourceNoteId: 'note-x', targetNoteId: 'note-a' },
  ];

  const graph = buildGraphData({ notes, backlinks });

  assert.deepEqual(graph.nodes, [{ id: 'note-a', label: 'Alpha' }]);
  assert.deepEqual(graph.edges, []);
});
