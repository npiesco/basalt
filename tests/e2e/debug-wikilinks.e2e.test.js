// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * DEBUG TEST: Wikilinks with Console Logging
 */

test('Debug wikilink parsing with full console logs', async ({ page }) => {
  const consoleLogs = [];
  const consoleErrors = [];

  // Capture all console output
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();

    if (type === 'error') {
      consoleErrors.push(text);
      console.log('[BROWSER ERROR]:', text);
    } else {
      consoleLogs.push(text);
      console.log('[BROWSER]:', text);
    }
  });

  console.log('[E2E] Starting debug test');

  await page.goto('http://localhost:3000');
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });
  console.log('[E2E] ✓ App loaded');

  // Create note-1 (target note)
  const note1Title = `Meeting Notes ${Date.now()}`;
  await page.locator('[data-testid="note-title-input"]').fill(note1Title);
  await page.locator('[data-testid="new-note-button"]').click();
  await page.waitForTimeout(1000);

  const note1Id = await page.evaluate(async (title) => {
    const result = await window.basaltDb.executeQuery(
      'SELECT note_id FROM notes WHERE title = ?',
      [title]
    );
    return result.rows[0].values[0].value;
  }, note1Title);

  console.log('[E2E] ✓ Created note-1:', note1Title, 'ID:', note1Id);

  // Create note-2 with wikilink to note-1
  const note2Title = `Project Plan ${Date.now()}`;
  const note2Body = `This references [[${note1Id}]] in the text.`;

  await page.locator('[data-testid="note-title-input"]').fill(note2Title);
  await page.locator('[data-testid="new-note-button"]').click();
  await page.waitForTimeout(1000);

  console.log('[E2E] ✓ Created note-2:', note2Title);

  // Click note-2 to edit it
  await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).click();
  await page.waitForTimeout(500);

  console.log('[E2E] ✓ Clicked note-2 to edit');

  // Use CodeMirror editor to add wikilinks
  await page.waitForSelector('.cm-content');
  const cmContent = page.locator('.cm-content');
  await cmContent.click();
  await page.keyboard.type(note2Body);
  console.log('[E2E] ✓ Typed body with wikilink:', note2Body);

  // Wait for autosave
  console.log('[E2E] Waiting for autosave...');
  await page.waitForTimeout(3500);
  await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
  await page.waitForTimeout(1000);
  console.log('[E2E] ✓ Autosave completed');

  // Query backlinks from database
  const backlinks = await page.evaluate(async (targetId) => {
    const result = await window.basaltDb.executeQuery(
      'SELECT source_note_id, target_note_id FROM backlinks WHERE target_note_id = ?',
      [targetId]
    );
    return result.rows.map(row => ({
      source: row.values[0].value,
      target: row.values[1].value
    }));
  }, note1Id);

  console.log('[E2E] Backlinks in database:', JSON.stringify(backlinks, null, 2));
  console.log('[E2E] Backlinks count:', backlinks.length);

  // Print all captured console logs
  console.log('\n========== BROWSER CONSOLE LOGS ==========');
  consoleLogs.forEach((log, i) => {
    if (log.includes('BACKLINKS') || log.includes('wikilink')) {
      console.log(`[${i}]`, log);
    }
  });

  console.log('\n========== BROWSER CONSOLE ERRORS ==========');
  consoleErrors.forEach((err, i) => {
    console.log(`[${i}]`, err);
  });

  // Assertions
  expect(backlinks.length).toBeGreaterThan(0);
  expect(backlinks[0].target).toBe(note1Id);
});
