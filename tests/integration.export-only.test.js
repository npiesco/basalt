/**
 * REAL INTEGRATION TEST - Database Export ONLY
 * Simplified test to debug export functionality
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as absurderSql from '@npiesco/absurder-sql';
import { initDb, executeQuery, exportToFile } from '../packages/domain/src/dbClient.js';

test('INTEGRATION: Export database to .db file format', async () => {
  console.log('[TEST] Starting export test...');

  // Load WASM for Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, '../node_modules/@npiesco/absurder-sql/absurder_sql_bg.wasm');

  console.log('[TEST] Loading WASM from:', wasmPath);
  const wasmBuffer = await readFile(wasmPath);
  console.log('[TEST] WASM buffer size:', wasmBuffer.length);

  await absurderSql.default(wasmBuffer);
  console.log('[TEST] WASM initialized');

  // Create database with test data
  const db = await initDb({
    absurderSql,
    storageKey: `export-test-${Date.now()}`,
  });

  console.log('[TEST] Database initialized for export test');

  // Insert test data
  await executeQuery(
    db,
    'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['f-export-1', 'Export Test Folder', null, new Date().toISOString(), new Date().toISOString()]
  );

  console.log('[TEST] Folder inserted');

  await executeQuery(
    db,
    'INSERT INTO notes (note_id, folder_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['n-export-1', 'f-export-1', 'Export Test Note', 'This note should be exported successfully', new Date().toISOString(), new Date().toISOString()]
  );

  console.log('[TEST] Note inserted');
  console.log('[TEST] About to call exportToFile...');

  // Export database to file
  const exportedBytes = await exportToFile(db);

  console.log('[TEST] Export returned:', typeof exportedBytes, exportedBytes?.length || 'no length');

  // Validate export
  assert.ok(exportedBytes, 'Export should return data');
  assert.ok(exportedBytes instanceof Uint8Array, 'Export should return Uint8Array');
  assert.ok(exportedBytes.length > 0, 'Export should not be empty');

  // SQLite file signature: first 16 bytes should be "SQLite format 3\0"
  const header = new TextDecoder().decode(exportedBytes.slice(0, 15));
  assert.equal(header, 'SQLite format 3', 'Export should produce valid SQLite file');

  console.log(`[TEST] ✓ Exported ${exportedBytes.length} bytes with valid SQLite header`);
  console.log('[TEST] 🎉 EXPORT TEST PASSED!');
});
