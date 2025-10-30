import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, executeQuery, exportToFile, importFromFile } from '../src/dbClient.js';
import { generateInitialMigration } from '../src/migrations.js';

test('initDb initializes absurder-sql and runs migrations', async () => {
  const executedSql = [];
  const fakeDb = {
    execute: async (sql, params) => {
      executedSql.push({ sql, params });
      return { rows: [] };
    },
  };

  const Database = {
    newDatabase: async ({ name }) => {
      return { ...fakeDb, name };
    },
  };

  const absurderSql = {
    initCalled: 0,
    async init() {
      this.initCalled += 1;
      return { Database };
    },
  };

  const dbHandle = await initDb({
    absurderSql,
    storageKey: 'vault-001',
  });

  assert.equal(absurderSql.initCalled, 1, 'absurder-sql init should be invoked once');
  assert.equal(dbHandle.name, 'vault-001', 'Database.newDatabase should receive storage key');
  assert.deepEqual(
    executedSql,
    [{ sql: generateInitialMigration(), params: undefined }],
    'Initial migration should be executed once without params'
  );
});

test('initDb applies additional migrations in order', async () => {
  const executedSql = [];
  const fakeDb = {
    execute: async (sql) => executedSql.push(sql),
  };
  const Database = {
    newDatabase: async () => fakeDb,
  };
  const absurderSql = {
    async init() {
      return { Database };
    },
  };

  const extraMigrations = ['CREATE TABLE foo;', 'CREATE TABLE bar;'];
  await initDb({
    absurderSql,
    storageKey: 'vault-002',
    migrations: extraMigrations,
  });

  assert.equal(executedSql.length, 1 + extraMigrations.length);
  assert.equal(executedSql[0], generateInitialMigration());
  assert.equal(executedSql[1], extraMigrations[0]);
  assert.equal(executedSql[2], extraMigrations[1]);
});

test('executeQuery delegates to db.execute with params', async () => {
  const calls = [];
  const fakeDb = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 1 }] };
    },
  };

  const result = await executeQuery(fakeDb, 'SELECT * FROM notes WHERE note_id = ?', ['note-1']);

  assert.deepEqual(calls, [{ sql: 'SELECT * FROM notes WHERE note_id = ?', params: ['note-1'] }]);
  assert.deepEqual(result, { rows: [{ id: 1 }] });
});

test('exportToFile delegates to db.exportToFile', async () => {
  let called = false;
  const fakeDb = {
    async exportToFile() {
      called = true;
      return new Uint8Array([1, 2, 3]);
    },
  };

  const bytes = await exportToFile(fakeDb);

  assert.equal(called, true);
  assert.deepEqual(bytes, new Uint8Array([1, 2, 3]));
});

test('importFromFile delegates to db.importFromFile', async () => {
  const events = [];
  const fakeDb = {
    async importFromFile(file) {
      events.push(file);
    },
  };

  const payload = new Uint8Array([9, 9, 9]);
  await importFromFile(fakeDb, payload);

  assert.deepEqual(events, [payload]);
});
