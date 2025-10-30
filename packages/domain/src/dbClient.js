import { generateInitialMigration } from './migrations.js';

function resolveDatabase(absurderSqlModule, absurderSql) {
  if (absurderSqlModule?.Database) return absurderSqlModule.Database;
  if (absurderSql?.Database) return absurderSql.Database;
  throw new Error('absurder-sql Database constructor not available');
}

export async function initDb({ absurderSql, storageKey, migrations = [] }) {
  if (!absurderSql || typeof absurderSql.init !== 'function') {
    throw new Error('absurderSql.init must be provided');
  }
  if (!storageKey) {
    throw new Error('storageKey is required to initialize the database');
  }

  const moduleInstance = await absurderSql.init();
  const Database = resolveDatabase(moduleInstance, absurderSql);

  if (!Database || typeof Database.newDatabase !== 'function') {
    throw new Error('absurder-sql Database.newDatabase must be available');
  }

  const db = await Database.newDatabase({ name: storageKey });
  if (!db || typeof db.execute !== 'function') {
    throw new Error('absurder-sql database handle must expose execute');
  }

  const allMigrations = [generateInitialMigration(), ...migrations];
  for (const migration of allMigrations) {
    await db.execute(migration);
  }

  return db;
}

export async function executeQuery(db, sql, params) {
  if (!db || typeof db.execute !== 'function') {
    throw new Error('Database instance provided to executeQuery is invalid');
  }
  return db.execute(sql, params);
}

export async function exportToFile(db) {
  if (!db || typeof db.exportToFile !== 'function') {
    throw new Error('Database instance provided to exportToFile is invalid');
  }
  return db.exportToFile();
}

export async function importFromFile(db, payload) {
  if (!db || typeof db.importFromFile !== 'function') {
    throw new Error('Database instance provided to importFromFile is invalid');
  }
  return db.importFromFile(payload);
}
