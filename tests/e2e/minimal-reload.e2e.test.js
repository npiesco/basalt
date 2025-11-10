/**
 * Absolute minimal test - just reload and check if we can query
 */

import { test, expect } from '@playwright/test';

test.describe('Minimal Reload Test', () => {
  test('Can query database after reload', async ({ page }) => {
    // Load page
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });

    console.log('Initial load - DB initialized');

    // Simple query before reload
    const before = await page.evaluate(async () => {
      const result = await window.basaltDb.executeQuery('SELECT 1 as test', []);
      return result.rows.length;
    });
    console.log('Query before reload returned:', before, 'rows');

    // Reload
    console.log('Reloading...');
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for DB
    await page.waitForFunction(() => window.basaltDb !== undefined, { timeout: 10000 });
    console.log('After reload - DB exists');

    // Try simple query after reload with timeout
    try {
      const after = await Promise.race([
        page.evaluate(async () => {
          const result = await window.basaltDb.executeQuery('SELECT 1 as test', []);
          return result.rows.length;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 5000))
      ]);
      console.log('Query after reload returned:', after, 'rows');
      expect(after).toBe(1);
    } catch (err) {
      console.error('Query failed or timed out:', err.message);
      throw err;
    }
  });
});
