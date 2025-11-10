/**
 * IndexedDB Debug Test
 *
 * Directly inspects IndexedDB to see if data is being written
 */

import { test, expect } from '@playwright/test';

test.describe('IndexedDB Debug', () => {
  test('Check if database writes to IndexedDB', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Wait for the database to initialize
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    console.log('✓ Database initialized');

    // Check initial IndexedDB state
    const initialDBs = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.map(db => ({ name: db.name, version: db.version }));
    });
    console.log('📦 Initial IndexedDB databases:', JSON.stringify(initialDBs, null, 2));

    // Create a note
    const testTitle = `IndexedDB Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', testTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${testTitle}")`, { timeout: 5000 });
    console.log('✓ Note created:', testTitle);

    // Wait a bit for any async operations
    await page.waitForTimeout(2000);

    // Check IndexedDB after write
    const afterWriteDBs = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.map(db => ({ name: db.name, version: db.version }));
    });
    console.log('📦 After write IndexedDB databases:', JSON.stringify(afterWriteDBs, null, 2));

    // Try to read IndexedDB directly to see if blocks exist
    const indexedDBData = await page.evaluate(async () => {
      const dbName = 'basalt-vault-main';

      try {
        // Open IndexedDB directly
        const request = indexedDB.open(dbName);

        return new Promise((resolve, reject) => {
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const objectStoreNames = Array.from(db.objectStoreNames);

            console.log('[Browser] IndexedDB object stores:', objectStoreNames);

            if (objectStoreNames.length === 0) {
              resolve({ objectStores: [], data: 'No object stores found' });
              return;
            }

            // Try to read from the first object store
            const transaction = db.transaction(objectStoreNames, 'readonly');
            const store = transaction.objectStore(objectStoreNames[0]);
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
              const data = getAllRequest.result;
              resolve({
                objectStores: objectStoreNames,
                firstStore: objectStoreNames[0],
                itemCount: data.length,
                sample: data.slice(0, 3) // First 3 items
              });
            };

            getAllRequest.onerror = () => reject(getAllRequest.error);
          };
        });
      } catch (error) {
        return { error: error.message };
      }
    });

    console.log('📊 IndexedDB raw data:', JSON.stringify(indexedDBData, null, 2));

    // Now test if the note query works
    const noteExists = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes WHERE title = ?',
        [title]
      );
      return { exists: result.rows.length > 0, rowCount: result.rows.length };
    }, testTitle);

    console.log('🔍 Note query result:', noteExists);
    expect(noteExists.exists).toBe(true);
  });
});
