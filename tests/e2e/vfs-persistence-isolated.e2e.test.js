/**
 * Isolated VFS Persistence Test
 *
 * This test isolates the suspected VFS bug by:
 * 1. Creating a minimal database with simple data
 * 2. Syncing to IndexedDB
 * 3. Simulating a "reload" by closing and reopening the database
 * 4. Checking if data persists
 *
 * If this test FAILS, it proves there's a VFS bug in absurder-sql.
 * If this test PASSES, the bug is application-specific.
 */

import { test, expect } from '@playwright/test';

const VITE_URL = 'http://localhost:3000';

test.describe('VFS Persistence - Isolated Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(VITE_URL);
    await page.waitForTimeout(1000); // Wait for DB init
  });

  test('MINIMAL: data survives close and reopen (no FTS, no FK)', async ({ page }) => {
    // Test 1: Create fresh database with simple table
    const setupResult = await page.evaluate(async () => {
      const logs = [];
      try {
        // Access the raw Database class (not wrapped)
        const { Database } = window;
        if (!Database) throw new Error('Database class not available');

        logs.push('Creating new database instance...');
        const db = await Database.newDatabase('vfs_test_minimal');

        logs.push('Creating simple table...');
        await db.execute('DROP TABLE IF EXISTS test_data');
        await db.execute('CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT)');

        logs.push('Inserting test data...');
        await db.execute("INSERT INTO test_data (id, value) VALUES (1, 'test_value_1')");
        await db.execute("INSERT INTO test_data (id, value) VALUES (2, 'test_value_2')");

        logs.push('Verifying data before sync...');
        const beforeSync = await db.execute('SELECT * FROM test_data ORDER BY id');
        logs.push(`Before sync: ${beforeSync.rows.length} rows`);

        logs.push('Calling sync()...');
        await db.sync();

        logs.push('Verifying data after sync...');
        const afterSync = await db.execute('SELECT * FROM test_data ORDER BY id');
        logs.push(`After sync: ${afterSync.rows.length} rows`);

        logs.push('Closing database...');
        await db.close();

        return { success: true, logs, rowCount: afterSync.rows.length };
      } catch (err) {
        logs.push(`ERROR: ${err.message}`);
        return { success: false, logs, error: err.message };
      }
    });

    console.log('Setup phase:', setupResult.logs.join('\n'));
    expect(setupResult.success, `Setup failed: ${setupResult.error}`).toBe(true);
    expect(setupResult.rowCount).toBe(2);

    // Test 2: Simulate reload - create NEW instance of database with SAME name
    await page.waitForTimeout(500); // Brief pause to ensure IndexedDB write completes

    const reloadResult = await page.evaluate(async () => {
      const logs = [];
      try {
        const { Database } = window;

        logs.push('Creating NEW database instance (simulating reload)...');
        const db2 = await Database.newDatabase('vfs_test_minimal');

        logs.push('Querying data from reloaded database...');
        const result = await db2.execute('SELECT * FROM test_data ORDER BY id');

        logs.push(`Found ${result.rows.length} rows`);
        const data = result.rows.map(row => ({
          id: row.values[0].value,
          value: row.values[1].value
        }));
        logs.push(`Data: ${JSON.stringify(data)}`);

        await db2.close();

        return { success: true, logs, rowCount: result.rows.length, data };
      } catch (err) {
        logs.push(`ERROR: ${err.message}`);
        return { success: false, logs, error: err.message, rowCount: 0 };
      }
    });

    console.log('Reload phase:', reloadResult.logs.join('\n'));

    // THIS IS THE CRITICAL ASSERTION
    // If this fails, it proves the VFS bug exists
    expect(reloadResult.success, `Reload failed: ${reloadResult.error}`).toBe(true);
    expect(reloadResult.rowCount, 'Data disappeared after reload - VFS BUG CONFIRMED').toBe(2);
    expect(reloadResult.data).toEqual([
      { id: 1, value: 'test_value_1' },
      { id: 2, value: 'test_value_2' }
    ]);
  });

  test('HANG TEST: does SELECT 1 hang after reload?', async ({ page }) => {
    // Setup: Create database and sync
    await page.evaluate(async () => {
      const { Database } = window;
      const db = await Database.newDatabase('vfs_test_hang');
      await db.execute('CREATE TABLE IF NOT EXISTS dummy (id INTEGER)');
      await db.execute('INSERT INTO dummy VALUES (1)');
      await db.sync();
      await db.close();
    });

    await page.waitForTimeout(500);

    // Test: Try simple query with timeout
    const hangResult = await Promise.race([
      page.evaluate(async () => {
        const { Database } = window;
        const db2 = await Database.newDatabase('vfs_test_hang');
        const result = await db2.execute('SELECT 1');
        await db2.close();
        return { hung: false, result: result.rows.length };
      }),
      new Promise(resolve => setTimeout(() => resolve({ hung: true }), 5000))
    ]);

    console.log('Hang test result:', hangResult);
    expect(hangResult.hung, 'Query HUNG after reload - VFS BUG CONFIRMED').toBe(false);
  });

  test('BLOCKS TEST: verify blocks are actually restored', async ({ page }) => {
    // Setup
    await page.evaluate(async () => {
      const { Database } = window;
      const db = await Database.newDatabase('vfs_test_blocks');
      await db.execute('CREATE TABLE test (id INTEGER, data TEXT)');
      // Insert enough data to create multiple blocks
      for (let i = 0; i < 100; i++) {
        await db.execute(`INSERT INTO test VALUES (${i}, 'data_${i}')`);
      }
      await db.sync();
      await db.close();
    });

    await page.waitForTimeout(500);

    // Test: Check console for "Restored X blocks" message
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.text().includes('Restored') || msg.text().includes('blocks')) {
        consoleLogs.push(msg.text());
      }
    });

    const blockResult = await page.evaluate(async () => {
      const { Database } = window;
      const db2 = await Database.newDatabase('vfs_test_blocks');

      // Try to query - if blocks are corrupt, this might fail or return wrong data
      const result = await db2.execute('SELECT COUNT(*) as count FROM test');
      const count = result.rows[0].values[0].value;

      await db2.close();
      return { count };
    });

    console.log('Console logs:', consoleLogs);
    console.log('Block restore result:', blockResult);

    expect(blockResult.count, 'Data count wrong after block restore').toBe(100);
  });
});
