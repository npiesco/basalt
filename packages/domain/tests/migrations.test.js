import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialMigration } from '../src/migrations.js';

test('generateInitialMigration creates core vault tables', () => {
  const sql = generateInitialMigration();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS folders/i, 'folders table missing');
  assert.match(sql, /folder_id\s+TEXT\s+PRIMARY KEY/i, 'folders primary key missing');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notes/i, 'notes table missing');
  assert.match(sql, /note_id\s+TEXT\s+PRIMARY KEY/i, 'notes primary key missing');
  assert.match(sql, /folder_id\s+TEXT\s+NOT NULL/i, 'note folder reference missing');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS tags/i, 'tags table missing');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS note_tags/i, 'note_tags join missing');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS backlinks/i, 'backlinks table missing');
  assert.match(sql, /CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts/i, 'FTS table missing');
  assert.match(sql, /CREATE TRIGGER IF NOT EXISTS notes_fts_ai/i, 'FTS trigger missing');
});
