import { generateInitialMigration } from './migrations.js';

/**
 * Initialize absurder-sql database with migrations.
 *
 * @param {Object} config
 * @param {Object} config.absurderSql - The absurder-sql module
 * @param {string} config.storageKey - Database name/storage key
 * @param {string[]} config.migrations - Additional migrations to run after initial migration
 * @returns {Promise<Database>} - Initialized database handle
 */
export async function initDb({ absurderSql, storageKey, migrations = [] }) {
  if (!absurderSql) {
    throw new Error('absurderSql module must be provided');
  }
  if (!storageKey) {
    throw new Error('storageKey is required to initialize the database');
  }

  // Get the init function (default export) and Database class (named export)
  const initWasm = absurderSql.default || absurderSql;
  const Database = absurderSql.Database;

  if (!Database || typeof Database.newDatabase !== 'function') {
    throw new Error('absurder-sql Database class with newDatabase method must be available as named export');
  }

  // Initialize WASM if init function is available
  if (typeof initWasm === 'function') {
    await initWasm();
  }

  // Multi-tab coordination: Use localStorage to ensure only ONE tab calls newDatabase() for fresh databases
  // This prevents "database disk image is malformed" errors from concurrent IndexedDB initialization
  const initLockKey = `${storageKey}-init-lock`;
  const myId = `${Date.now()}-${Math.random()}`;

  // Try to acquire initialization lock
  const existingLock = localStorage.getItem(initLockKey);
  if (!existingLock) {
    // No one is initializing, claim the lock
    localStorage.setItem(initLockKey, JSON.stringify({ id: myId, timestamp: Date.now() }));

    // Double-check we got it (race condition safety)
    await new Promise(resolve => setTimeout(resolve, 50));
    const verifyLock = localStorage.getItem(initLockKey);
    const lockData = verifyLock ? JSON.parse(verifyLock) : null;

    if (!lockData || lockData.id !== myId) {
      // Someone else got the lock, wait for them
      console.log('[DEBUG] Another tab claimed init lock, waiting...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for first tab to initialize
    }
  } else {
    // Another tab is initializing, wait
    console.log('[DEBUG] Init lock exists, waiting for first tab to initialize...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Create database - now coordinated so first tab initializes, others connect to existing
  const db = await Database.newDatabase(storageKey);

  if (!db || typeof db.execute !== 'function') {
    throw new Error('absurder-sql database handle must expose execute method');
  }

  // Release lock after successful database creation
  const currentLock = localStorage.getItem(initLockKey);
  if (currentLock) {
    const lockData = JSON.parse(currentLock);
    if (lockData.id === myId) {
      localStorage.removeItem(initLockKey);
      console.log('[DEBUG] Released init lock');
    }
  }

  // Allow all tabs to run migrations (schema operations are idempotent)
  if (typeof db.allowNonLeaderWrites === 'function') {
    await db.allowNonLeaderWrites(true);
  }

  // Run all migrations (idempotent - safe to run on all tabs)
  const allMigrations = [generateInitialMigration(), ...migrations];
  console.log(`[DEBUG] Running ${allMigrations.length} migration(s)...`);

  for (let i = 0; i < allMigrations.length; i++) {
    const migration = allMigrations[i];

    // Smart SQL statement splitter that handles BEGIN/END blocks in triggers
    const statements = [];
    let current = '';
    let depth = 0;

    for (const line of migration.split('\n')) {
      const trimmed = line.trim().toUpperCase();
      if (trimmed.includes('BEGIN')) depth++;
      if (trimmed.includes('END')) depth--;
      current += line + '\n';

      if (current.trim().endsWith(';') && depth === 0) {
        const stmt = current.trim();
        if (stmt.length > 1) {
          statements.push(stmt);
        }
        current = '';
      }
    }

    const remaining = current.trim();
    if (remaining.length > 0 && remaining !== ';') {
      statements.push(remaining);
    }

    console.log(`[DEBUG] Migration ${i + 1}/${allMigrations.length}: executing ${statements.length} statement(s)...`);

    for (let j = 0; j < statements.length; j++) {
      const statement = statements[j];
      try {
        await db.execute(statement);
      } catch (error) {
        console.error(`[ERROR] Statement ${j + 1}/${statements.length} failed:`, error.message);
        console.error(`[ERROR] Statement was:`, statement);
        throw error;
      }
    }
  }

  console.log('[DEBUG] All migrations completed');

  // Enable foreign keys (must be set per connection)
  try {
    await db.execute('PRAGMA foreign_keys = ON');
    console.log('[DEBUG] Foreign keys enabled successfully');
  } catch (error) {
    console.error('[ERROR] Failed to enable foreign keys:', error);
    throw error;
  }

  console.log('[DEBUG] Non-leader writes remain enabled for BroadcastChannel sync');

  return db;
}

/**
 * Convert JavaScript value to absurder-sql ColumnValue format.
 */
export function toColumnValue(value) {
  if (value === null || value === undefined) {
    return { type: 'Null' };
  }

  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'Integer', value }
      : { type: 'Real', value };
  }

  if (typeof value === 'string') {
    return { type: 'Text', value };
  }

  if (value instanceof Date) {
    return { type: 'Date', value: value.getTime() };
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const uint8 = value instanceof Uint8Array ? value : new Uint8Array(value);
    return { type: 'Blob', value: Array.from(uint8) };
  }

  return { type: 'Text', value: String(value) };
}

/**
 * Execute a SQL query with proper parameter binding.
 */
export async function executeQuery(db, sql, params = []) {
  if (!db || typeof db.executeWithParams !== 'function') {
    throw new Error('Invalid database handle: must have executeWithParams method');
  }

  const columnValues = params.map(toColumnValue);
  return db.executeWithParams(sql, columnValues);
}

/**
 * Convert absurder-sql QueryResult rows to plain JavaScript objects.
 */
export function rowsToObjects(result) {
  if (!result || !result.rows || !result.columns) {
    return [];
  }

  return result.rows.map(row => {
    const obj = {};
    for (let i = 0; i < result.columns.length; i++) {
      const colName = result.columns[i];
      const colValue = row.values[i];

      if (!colValue || colValue.type === 'Null') {
        obj[colName] = null;
      } else if ('value' in colValue) {
        obj[colName] = colValue.value;
      } else {
        obj[colName] = null;
      }
    }
    return obj;
  });
}
