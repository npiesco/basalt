/**
 * DEBUG TEST - Capture console logs to see autosave errors
 */

const { test, expect } = require('@playwright/test');

test('Debug autosave with console logs', async ({ page }) => {
  // Capture ALL console messages
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log(`[BROWSER ${msg.type()}]`, text);
  });

  page.on('pageerror', error => {
    console.log('[BROWSER ERROR]', error.message);
    logs.push(`ERROR: ${error.message}`);
  });

  // Navigate
  await page.goto('http://localhost:3000');
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

  // Create a note
  await page.fill('[data-testid="note-title-input"]', 'Debug Test');
  await page.click('[data-testid="new-note-button"]');
  await page.waitForSelector('[data-testid="note-item"]');

  // Click to edit
  await page.click('[data-testid="note-item"]');
  await page.waitForSelector('[data-testid="edit-title-input"]');

  // Change title - use type instead of fill to trigger onChange properly
  await page.locator('[data-testid="edit-title-input"]').clear();
  await page.locator('[data-testid="edit-title-input"]').pressSequentially('Changed Title', { delay: 50 });

  // Verify the input value changed
  const titleValue = await page.locator('[data-testid="edit-title-input"]').inputValue();
  console.log('\n=== Title input value after change ===', titleValue);

  // Wait for autosave to trigger and complete (or fail)
  console.log('\n=== Waiting 5 seconds for autosave ===\n');
  await page.waitForTimeout(5000);

  // Print all logs
  console.log('\n=== ALL BROWSER LOGS ===');
  logs.forEach((log, i) => console.log(`${i}: ${log}`));

  // Check indicator status
  const indicator = await page.locator('[data-testid="autosave-indicator"]').textContent();
  console.log('\n=== FINAL INDICATOR STATE ===', indicator);
});
