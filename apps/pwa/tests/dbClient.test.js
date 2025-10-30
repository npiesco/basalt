import test from 'node:test';
import assert from 'node:assert/strict';
import { initBasaltDb } from '../lib/db/client.js';
import { generateInitialMigration } from '../../../packages/domain/src/migrations.js';

test('initBasaltDb wires absurder-sql module and applies migrations', async () => {
  const executedSql = [];
  const fakeDb = {
    async execute(sql) {
      executedSql.push(sql);
    },
  };

  const absurderSqlModule = {
    async init() {
      return {
        Database: {
          async newDatabase({ name }) {
            assert.equal(name, 'vault-app');
            return fakeDb;
          },
        },
      };
    },
  };

  const dbHandle = await initBasaltDb('vault-app', {
    loadModule: async () => absurderSqlModule,
    migrations: ['CREATE TABLE foo (id TEXT);'],
  });

  assert.equal(dbHandle, fakeDb);
  assert.equal(executedSql[0], generateInitialMigration());
  assert.equal(executedSql[1], 'CREATE TABLE foo (id TEXT);');
});

test('initBasaltDb throws when storage key missing', async () => {
  await assert.rejects(() => initBasaltDb('', { loadModule: async () => ({ init() {} }) }));
});
