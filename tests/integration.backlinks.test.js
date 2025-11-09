import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as absurderSql from '@npiesco/absurder-sql';
import { initDb, executeQuery } from '../packages/domain/src/dbClient.js';
import { extractWikiLinks, deriveBacklinkRecords } from '../packages/domain/src/markdown.js';
import { buildGraphData } from '../packages/domain/src/graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Helper to convert database row to plain object
 */
function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, idx) => {
    const value = row.values[idx];
    obj[col] = value.type === 'Null' ? null : value.value;
  });
  return obj;
}

describe('INTEGRATION: Backlinks and Graph functionality with real absurder-sql', () => {
  test('Parse wikilinks, store backlinks, and build graph data', async () => {
    console.log('[TEST] Starting backlinks and graph integration test...');

    // Initialize WASM
    const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/pkg/absurder_sql_bg.wasm');
    const wasmBuffer = await readFile(wasmPath);
    await absurderSql.default(wasmBuffer);

    console.log('[TEST] ✓ WASM initialized');

    // Create database
    const db = await initDb({
      absurderSql,
      storageKey: `backlinks-test-${Date.now()}`,
    });

    console.log('[TEST] ✓ Database initialized');

    // Insert test folders
    await executeQuery(
      db,
      'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['folder-1', 'Root Folder', null, new Date().toISOString(), new Date().toISOString()]
    );

    console.log('[TEST] ✓ Folder created');

    // Create notes with wikilinks
    const note1Body = 'This note references [[note-2]] and [[note-3]] in its content.';
    const note2Body = 'This note links back to [[note-1]] and also mentions [[note-3]].';
    const note3Body = 'This is a standalone note with no links.';

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['note-1', 'folder-1', 'First Note', note1Body, new Date().toISOString(), new Date().toISOString()]
    );

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['note-2', 'folder-1', 'Second Note', note2Body, new Date().toISOString(), new Date().toISOString()]
    );

    await executeQuery(
      db,
      'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['note-3', 'folder-1', 'Third Note', note3Body, new Date().toISOString(), new Date().toISOString()]
    );

    console.log('[TEST] ✓ Created 3 notes with wikilinks');

    // PART 1: Test markdown parsing
    console.log('\n[TEST] PART 1: Testing wikilink extraction...');

    const links1 = extractWikiLinks(note1Body);
    console.log('[TEST] Extracted from note-1:', links1);
    assert.equal(links1.length, 2, 'Should extract 2 wikilinks from note-1');
    assert.deepEqual(links1.sort(), ['note-2', 'note-3'], 'Should extract note-2 and note-3');

    const links2 = extractWikiLinks(note2Body);
    console.log('[TEST] Extracted from note-2:', links2);
    assert.equal(links2.length, 2, 'Should extract 2 wikilinks from note-2');
    assert.deepEqual(links2.sort(), ['note-1', 'note-3'], 'Should extract note-1 and note-3');

    const links3 = extractWikiLinks(note3Body);
    console.log('[TEST] Extracted from note-3:', links3);
    assert.equal(links3.length, 0, 'Should extract 0 wikilinks from note-3');

    console.log('[TEST] ✓ Wikilink extraction works correctly');

    // PART 2: Test backlink record derivation
    console.log('\n[TEST] PART 2: Testing backlink record derivation...');

    const backlinks1 = deriveBacklinkRecords({
      sourceNoteId: 'note-1',
      markdown: note1Body,
    });
    console.log('[TEST] Backlinks from note-1:', backlinks1);
    assert.equal(backlinks1.length, 2, 'Should derive 2 backlink records');
    assert.equal(backlinks1[0].sourceNoteId, 'note-1', 'Source should be note-1');
    assert.ok(['note-2', 'note-3'].includes(backlinks1[0].targetNoteId), 'Target should be note-2 or note-3');

    console.log('[TEST] ✓ Backlink derivation works correctly');

    // PART 3: Insert backlinks into database
    console.log('\n[TEST] PART 3: Inserting backlinks into database...');

    // Insert backlinks for note-1
    for (const link of backlinks1) {
      await executeQuery(
        db,
        'INSERT INTO backlinks (source_note_id, target_note_id, context_snippet, created_at) VALUES (?, ?, ?, ?)',
        [link.sourceNoteId, link.targetNoteId, link.contextSnippet, link.createdAt]
      );
    }

    // Insert backlinks for note-2
    const backlinks2 = deriveBacklinkRecords({
      sourceNoteId: 'note-2',
      markdown: note2Body,
    });
    for (const link of backlinks2) {
      await executeQuery(
        db,
        'INSERT INTO backlinks (source_note_id, target_note_id, context_snippet, created_at) VALUES (?, ?, ?, ?)',
        [link.sourceNoteId, link.targetNoteId, link.contextSnippet, link.createdAt]
      );
    }

    console.log('[TEST] ✓ Inserted backlinks into database');

    // PART 4: Query backlinks from database
    console.log('\n[TEST] PART 4: Querying backlinks from database...');

    const allBacklinksResult = await executeQuery(
      db,
      'SELECT source_note_id, target_note_id FROM backlinks ORDER BY source_note_id, target_note_id'
    );

    const allBacklinks = allBacklinksResult.rows.map(row => rowToObject(row, allBacklinksResult.columns));
    console.log('[TEST] All backlinks in DB:', allBacklinks);
    assert.equal(allBacklinks.length, 4, 'Should have 4 backlink records total');

    // Query backlinks pointing to note-1
    const backlinksToNote1Result = await executeQuery(
      db,
      'SELECT source_note_id FROM backlinks WHERE target_note_id = ?',
      ['note-1']
    );

    const backlinksToNote1 = backlinksToNote1Result.rows.map(row => rowToObject(row, backlinksToNote1Result.columns));
    console.log('[TEST] Backlinks pointing to note-1:', backlinksToNote1);
    assert.equal(backlinksToNote1.length, 1, 'Should have 1 backlink pointing to note-1');
    assert.equal(backlinksToNote1[0].source_note_id, 'note-2', 'Backlink should come from note-2');

    // Query backlinks pointing to note-3
    const backlinksToNote3Result = await executeQuery(
      db,
      'SELECT source_note_id FROM backlinks WHERE target_note_id = ? ORDER BY source_note_id',
      ['note-3']
    );

    const backlinksToNote3 = backlinksToNote3Result.rows.map(row => rowToObject(row, backlinksToNote3Result.columns));
    console.log('[TEST] Backlinks pointing to note-3:', backlinksToNote3);
    assert.equal(backlinksToNote3.length, 2, 'Should have 2 backlinks pointing to note-3');
    const sourcesForNote3 = backlinksToNote3.map(b => b.source_note_id).sort();
    assert.deepEqual(sourcesForNote3, ['note-1', 'note-2'], 'Backlinks should come from note-1 and note-2');

    console.log('[TEST] ✓ Backlink queries work correctly');

    // PART 5: Build graph data
    console.log('\n[TEST] PART 5: Building graph data...');

    const notesResult = await executeQuery(
      db,
      'SELECT note_id, title FROM notes'
    );
    const notes = notesResult.rows.map(row => ({
      noteId: rowToObject(row, notesResult.columns).note_id,
      title: rowToObject(row, notesResult.columns).title,
    }));

    const backlinksForGraphResult = await executeQuery(
      db,
      'SELECT source_note_id, target_note_id FROM backlinks'
    );
    const backlinksForGraph = backlinksForGraphResult.rows.map(row => ({
      sourceNoteId: rowToObject(row, backlinksForGraphResult.columns).source_note_id,
      targetNoteId: rowToObject(row, backlinksForGraphResult.columns).target_note_id,
    }));

    const graphData = buildGraphData({ notes, backlinks: backlinksForGraph });
    console.log('[TEST] Graph data:', JSON.stringify(graphData, null, 2));

    // Verify graph structure
    assert.equal(graphData.nodes.length, 3, 'Should have 3 nodes');
    assert.equal(graphData.edges.length, 4, 'Should have 4 edges');

    // Verify node structure
    const node1 = graphData.nodes.find(n => n.id === 'note-1');
    assert.ok(node1, 'Should have node for note-1');
    assert.equal(node1.label, 'First Note', 'Node label should match note title');

    // Verify edge structure
    const edge1to2 = graphData.edges.find(e => e.source === 'note-1' && e.target === 'note-2');
    assert.ok(edge1to2, 'Should have edge from note-1 to note-2');
    assert.equal(edge1to2.weight, 1, 'Edge weight should be 1');

    const edge1to3 = graphData.edges.find(e => e.source === 'note-1' && e.target === 'note-3');
    assert.ok(edge1to3, 'Should have edge from note-1 to note-3');

    const edge2to1 = graphData.edges.find(e => e.source === 'note-2' && e.target === 'note-1');
    assert.ok(edge2to1, 'Should have edge from note-2 to note-1');

    const edge2to3 = graphData.edges.find(e => e.source === 'note-2' && e.target === 'note-3');
    assert.ok(edge2to3, 'Should have edge from note-2 to note-3');

    console.log('[TEST] ✓ Graph data structure is correct');

    // PART 6: Test bidirectional relationship query
    console.log('\n[TEST] PART 6: Testing bidirectional relationship queries...');

    // Find all notes connected to note-1 (both outgoing and incoming links)
    const connectedToNote1Result = await executeQuery(
      db,
      `SELECT DISTINCT n.note_id, n.title
       FROM notes n
       WHERE n.note_id IN (
         SELECT target_note_id FROM backlinks WHERE source_note_id = ?
         UNION
         SELECT source_note_id FROM backlinks WHERE target_note_id = ?
       )
       ORDER BY n.title`,
      ['note-1', 'note-1']
    );

    const connectedToNote1 = connectedToNote1Result.rows.map(row => rowToObject(row, connectedToNote1Result.columns));
    console.log('[TEST] Notes connected to note-1:', connectedToNote1);
    assert.equal(connectedToNote1.length, 2, 'Should have 2 connected notes');
    const connectedIds = connectedToNote1.map(n => n.note_id).sort();
    assert.deepEqual(connectedIds, ['note-2', 'note-3'], 'Should be connected to note-2 and note-3');

    console.log('[TEST] ✓ Bidirectional queries work correctly');

    console.log('\n[TEST] 🎉 ALL BACKLINKS AND GRAPH TESTS PASSED!');

    // Note: Skipping db.close() in Node.js - same IndexedDB limitation as other tests
    // In browser environment, close would work properly
  });

  test('Handle wikilinks with display text and special characters', async () => {
    console.log('\n[TEST] Testing wikilink parsing edge cases...');

    // Test wikilinks with display text: [[target|display text]]
    const markdownWithDisplayText = 'Check out [[note-2|this amazing note]] for more info.';
    const links1 = extractWikiLinks(markdownWithDisplayText);
    console.log('[TEST] Extracted from markdown with display text:', links1);
    assert.equal(links1.length, 1, 'Should extract 1 wikilink');
    assert.equal(links1[0], 'note-2', 'Should extract target, not display text');

    // Test wikilinks with spaces
    const markdownWithSpaces = 'Reference to [[My Important Note]] here.';
    const links2 = extractWikiLinks(markdownWithSpaces);
    console.log('[TEST] Extracted from markdown with spaces:', links2);
    assert.equal(links2.length, 1, 'Should extract 1 wikilink');
    assert.equal(links2[0], 'my-important-note', 'Should normalize spaces to dashes');

    // Test excluding image links (starts with !)
    const markdownWithImages = 'Here is an image: ![[image.png]] and a link: [[note-3]].';
    const links3 = extractWikiLinks(markdownWithImages);
    console.log('[TEST] Extracted from markdown with images:', links3);
    assert.equal(links3.length, 1, 'Should exclude image links');
    assert.equal(links3[0], 'note-3', 'Should only extract non-image wikilink');

    // Test duplicate links (should be deduplicated)
    const markdownWithDuplicates = 'Reference [[note-1]] multiple times: [[note-1]] and [[note-1]].';
    const links4 = extractWikiLinks(markdownWithDuplicates);
    console.log('[TEST] Extracted from markdown with duplicates:', links4);
    assert.equal(links4.length, 1, 'Should deduplicate wikilinks');
    assert.equal(links4[0], 'note-1', 'Should extract unique link');

    console.log('[TEST] ✓ Wikilink parsing handles edge cases correctly');
  });
});
