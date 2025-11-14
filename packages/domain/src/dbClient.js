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

  // Multi-tab coordination: Use BroadcastChannel to coordinate database creation
  // Only one tab should call newDatabase() at a time to prevent IndexedDB corruption
  const initChannel = new BroadcastChannel(`${storageKey}-init`);
  const myTabId = `${Date.now()}-${Math.random()}`;

  // Check if another tab is currently initializing
  let canProceed = false;
  const initRequest = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // No response after 1s, we can proceed
      canProceed = true;
      resolve();
    }, 1000);

    initChannel.onmessage = (event) => {
      if (event.data.type === 'INIT_IN_PROGRESS' && event.data.tabId !== myTabId) {
        // Another tab is initializing, wait for it to finish
        clearTimeout(timeout);
      } else if (event.data.type === 'INIT_COMPLETE') {
        // Another tab finished initializing
        clearTimeout(timeout);
        resolve();
      }
    };

    // Broadcast that we want to initialize
    initChannel.postMessage({ type: 'INIT_REQUEST', tabId: myTabId });
  });

  await initRequest;

  // Broadcast that we're initializing
  initChannel.postMessage({ type: 'INIT_IN_PROGRESS', tabId: myTabId });

  // Create database - newDatabase takes a string name, not an object
  const db = await Database.newDatabase(storageKey);

  if (!db || typeof db.execute !== 'function') {
    throw new Error('absurder-sql database handle must expose execute method');
  }

  // Notify other tabs that initialization is complete
  initChannel.postMessage({ type: 'INIT_COMPLETE', tabId: myTabId });
  initChannel.close();

  // Check if database is already initialized (tables exist)
  // This prevents race conditions when multiple tabs open simultaneously
  let tablesExist = false;
  try {
    const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'");
    tablesExist = result && result.rows && result.rows.length > 0;
  } catch (error) {
    // Table check failed, database might be corrupted or not initialized
    console.log('[DEBUG] Table check failed, will attempt initialization');
  }

  if (tablesExist) {
    // Database already initialized by another tab or previous session
    console.log('[DEBUG] Database already initialized, skipping migrations');

    // Just enable foreign keys and return
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

  // Database not initialized - check if we're the leader
  const isLeader = await db.isLeader();
  console.log(`[DEBUG] Database needs initialization. Tab is ${isLeader ? 'LEADER' : 'FOLLOWER'}`);

  if (!isLeader) {
    // Non-leader tab: wait for leader to complete initialization via event-based sync
    console.log('[DEBUG] Follower waiting for leader to complete initialization (event-based)...');

    // Use onDataChange callback to detect when leader syncs the initialized database
    const initComplete = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for leader to initialize database'));
      }, 30000); // 30 second timeout

      db.onDataChange(async () => {
        try {
          // Check if notes table now exists
          const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'");
          if (result && result.rows && result.rows.length > 0) {
            clearTimeout(timeout);
            console.log('[DEBUG] Leader initialization complete (via onDataChange), follower proceeding');
            resolve();
          }
        } catch (error) {
          // Ignore errors during check
        }
      });
    });

    await initComplete;

    // Enable foreign keys
    try {
      await db.execute('PRAGMA foreign_keys = ON');
      console.log('[DEBUG] Foreign keys enabled successfully (follower)');
    } catch (error) {
      console.error('[ERROR] Failed to enable foreign keys:', error);
      throw error;
    }

    console.log('[DEBUG] Non-leader writes remain enabled for BroadcastChannel sync');
    return db;
  }

  // Leader tab: run migrations
  console.log('[DEBUG] Leader tab proceeding with migrations...');

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

  // Enable foreign keys (must be set per connection, not persisted across reopens)
  // This ensures CASCADE DELETE and other FK constraints work correctly
  try {
    await db.execute('PRAGMA foreign_keys = ON');
    console.log('[DEBUG] Foreign keys enabled successfully');
  } catch (error) {
    console.error('[ERROR] Failed to enable foreign keys:', error);
    throw error;
  }

  // Leader: Sync to IndexedDB to persist changes and notify followers via BroadcastChannel
  console.log('[DEBUG] Leader syncing to IndexedDB to notify followers...');
  try {
    await db.sync();
    console.log('[DEBUG] Leader sync complete - followers notified via BroadcastChannel');
  } catch (error) {
    console.error('[ERROR] Failed to sync database:', error);
    throw error;
  }

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
 * absurder-sql uses a tagged union format for column values.
 * Each value is an object with a "type" and optional "value" field.
 *
 * @param {*} value - JavaScript value to convert
 * @returns {Object} - ColumnValue in absurder-sql format
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

  // Fallback: convert to string
  return { type: 'Text', value: String(value) };
}

/**
 * Execute a SQL query with proper parameter binding.
 *
 * This is a convenience wrapper around db.executeWithParams that handles
 * parameter conversion to the absurder-sql ColumnValue format.
 *
 * @param {Object} db - Database handle from initDb()
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Array of values to bind (auto-converted to ColumnValue format)
 * @returns {Promise<Object>} - Query result
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
 *
 * absurder-sql returns rows in a specialized format with typed column values.
 * This function converts them to plain JS objects for easier consumption.
 *
 * @param {Object} result - QueryResult from absurder-sql
 * @returns {Array<Object>} - Array of plain JS objects with column names as keys
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

      // Extract the actual value from the ColumnValue union
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
