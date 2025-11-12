import { generateInitialMigration } from './migrations.js';

/**
 * Initialize absurder-sql database with migrations.
 *
 * The real absurder-sql module exports:
 * - default export: init() function that initializes WASM
 * - named export: Database class with static newDatabase(name: string) method
 *
 * @param {Object} config
 * @param {Object} config.absurderSql - The absurder-sql module (must have default export and Database export)
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

  // Create database - newDatabase takes a string name, not an object
  const db = await Database.newDatabase(storageKey);

  if (!db || typeof db.execute !== 'function') {
    throw new Error('absurder-sql database handle must expose execute method');
  }

  // Allow all tabs to run migrations (schema operations)
  // Schema operations (CREATE TABLE) are identical across tabs, so it's safe
  // After initialization, we'll use leader election for DATA operations
  if (typeof db.allowNonLeaderWrites === 'function') {
    await db.allowNonLeaderWrites(true);
  }

  // Run all migrations (all tabs run same migrations for schema)
  // SQLite databases typically require each statement to be executed separately
  // Split multi-statement SQL into individual statements
  const allMigrations = [generateInitialMigration(), ...migrations];
  console.log(`[DEBUG] Running ${allMigrations.length} migration(s)...`);

  for (let i = 0; i < allMigrations.length; i++) {
    const migration = allMigrations[i];

    // Smart SQL statement splitter that handles BEGIN/END blocks in triggers
    const statements = [];
    let current = '';
    let depth = 0; // Track BEGIN/END nesting depth

    for (const line of migration.split('\n')) {
      const trimmed = line.trim().toUpperCase();

      // Track BEGIN/END depth
      if (trimmed.includes('BEGIN')) depth++;
      if (trimmed.includes('END')) depth--;

      current += line + '\n';

      // Split on semicolon only when not inside a BEGIN/END block
      if (current.trim().endsWith(';') && depth === 0) {
        const stmt = current.trim();
        if (stmt.length > 1) { // More than just semicolon
          statements.push(stmt);
        }
        current = '';
      }
    }

    // Add any remaining statement
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

  // Keep non-leader writes enabled for multi-tab coordination
  // All tabs execute SQL locally, but ONLY the leader persists to IndexedDB via sync()
  // Follower tabs receive SQL via BroadcastChannel and execute it without syncing
  // This prevents database corruption from simultaneous IndexedDB writes
  console.log('[DEBUG] Non-leader writes remain enabled for BroadcastChannel sync');

  return db;
}

/**
 * Convert JavaScript value to absurder-sql ColumnValue format.
 *
 * @param {any} value - JavaScript value to convert
 * @returns {Object} - ColumnValue object with { type, value? }
 */
function toColumnValue(value) {
  if (value === null || value === undefined) {
    return { type: 'Null' };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { type: 'Integer', value };
    }
    return { type: 'Real', value };
  }
  if (typeof value === 'string') {
    return { type: 'Text', value };
  }
  if (typeof value === 'bigint') {
    return { type: 'BigInt', value: value.toString() };
  }
  if (value instanceof Uint8Array || Array.isArray(value)) {
    return { type: 'Blob', value: Array.from(value) };
  }
  if (value instanceof Date) {
    return { type: 'Date', value: value.getTime() };
  }
  // Default to Text for other types
  return { type: 'Text', value: String(value) };
}

/**
 * Escape a parameter value for use in a SQL string.
 *
 * @param {any} value - Value to escape
 * @returns {string} - Escaped SQL string
 */
function escapeSqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    // Escape single quotes by doubling them
    return "'" + value.replace(/'/g, "''") + "'";
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (value instanceof Date) {
    return "'" + value.toISOString() + "'";
  }
  // Default: convert to string and escape
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Build a SQL string with escaped parameters.
 *
 * @param {string} sql - SQL with ? placeholders
 * @param {any[]} params - Parameter values
 * @returns {string} - Complete SQL string
 */
function buildSqlString(sql, params) {
  let result = sql;
  for (const param of params) {
    result = result.replace('?', escapeSqlValue(param));
  }
  return result;
}

/**
 * Check if a SQL statement is a write operation.
 *
 * @param {string} sql - SQL statement
 * @returns {boolean} - True if write operation
 */
function isWriteOperation(sql) {
  const upperSql = sql.trim().toUpperCase();
  return upperSql.startsWith('INSERT') ||
         upperSql.startsWith('UPDATE') ||
         upperSql.startsWith('DELETE') ||
         upperSql.startsWith('CREATE') ||
         upperSql.startsWith('DROP') ||
         upperSql.startsWith('ALTER');
}

/**
 * Execute a query with optional parameters.
 * Automatically uses queueWrite() for non-leader write operations.
 *
 * @param {Database} db - Database instance
 * @param {string} sql - SQL query
 * @param {any[]} params - Optional query parameters
 * @returns {Promise<QueryResult>} - Query result with rows, columns, etc.
 */
export async function executeQuery(db, sql, params) {
  if (!db) {
    throw new Error('Database instance provided to executeQuery is invalid');
  }

  const hasParams = params && params.length > 0;

  // NOTE: Leader election check removed because we keep allowNonLeaderWrites(true)
  // All tabs can execute writes directly, and we use BroadcastChannel to sync SQL
  // across tabs for multi-tab coordination.

  // Execute with or without params
  if (hasParams) {
    if (typeof db.executeWithParams !== 'function') {
      throw new Error('Database instance does not support executeWithParams');
    }
    // Convert JavaScript values to ColumnValue format
    const columnValues = params.map(toColumnValue);

    try {
      return await db.executeWithParams(sql, columnValues);
    } catch (error) {
      console.error('[ERROR] Query failed:', error.message);
      console.error('[ERROR] SQL:', sql.substring(0, 200));
      throw error;
    }
  } else {
    if (typeof db.execute !== 'function') {
      throw new Error('Database instance does not support execute');
    }

    try {
      return await db.execute(sql);
    } catch (error) {
      console.error('[ERROR] Query failed:', error.message);
      console.error('[ERROR] SQL:', sql.substring(0, 200));
      throw error;
    }
  }
}

/**
 * Export database to SQLite .db file format.
 *
 * @param {Database} db - Database instance
 * @returns {Promise<Uint8Array>} - Database file bytes
 */
export async function exportToFile(db) {
  if (!db || typeof db.exportToFile !== 'function') {
    throw new Error('Database instance provided to exportToFile is invalid');
  }
  return db.exportToFile();
}

/**
 * Import SQLite database from .db file bytes.
 *
 * @param {Database} db - Database instance
 * @param {Uint8Array} payload - SQLite file bytes
 * @returns {Promise<void>}
 */
export async function importFromFile(db, payload) {
  console.log('[dbClient] importFromFile called with payload size:', payload?.length);

  if (!db || typeof db.importFromFile !== 'function') {
    throw new Error('Database instance provided to importFromFile is invalid');
  }

  console.log('[dbClient] Calling db.importFromFile...');
  const result = await db.importFromFile(payload);
  console.log('[dbClient] db.importFromFile completed, result:', result);

  return result;
}

/**
 * Close database connection and clean up resources.
 *
 * @param {Database} db - Database instance
 * @returns {Promise<void>}
 */
export async function closeDb(db) {
  if (!db || typeof db.close !== 'function') {
    throw new Error('Database instance provided to closeDb is invalid');
  }
  await db.close();
}
