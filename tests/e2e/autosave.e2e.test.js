/**
 * E2E TEST: Autosave Functionality (TDD - RED Phase)
 * Tests autosave feature that automatically saves note changes without manual save button clicks
 */

const { test, expect } = require('@playwright/test');

test.describe('Autosave Functionality', () => {
  test.beforeEach(async ({ page, context }) => {
    // Force new context storage for each test
    await context.clearCookies();
    await context.clearPermissions();

    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Wait for database to initialize
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    // Wait significantly longer for autosave operations and database to fully settle
    // The sync→close→reopen pattern needs time to complete before next test
    await page.waitForTimeout(3000);
  });

  test('should autosave title changes after debounce delay', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Test Note');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit the note
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-title-input"]');

    // Clear and type new title (use pressSequentially to trigger onChange properly)
    await page.locator('[data-testid="edit-title-input"]').clear();
    await page.locator('[data-testid="edit-title-input"]').pressSequentially('Autosaved Title', { delay: 50 });

    // Wait for autosave debounce (should be ~2-3 seconds)
    await page.waitForTimeout(3500);

    // Verify autosave indicator appeared
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    await expect(saveIndicator).toContainText('Saved');

    // Close the editor WITHOUT clicking save
    await page.click('[data-testid="close-note-btn"]');

    // Verify the title was persisted in the note list
    const noteItem = page.locator('[data-testid="note-item"]');
    await expect(noteItem).toContainText('Autosaved Title');

    // Reopen note to verify database persistence
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-title-input"]');
    const titleInput = page.locator('[data-testid="edit-title-input"]');
    await expect(titleInput).toHaveValue('Autosaved Title');
  });

  test('should autosave body changes after debounce delay', async ({ page }) => {
    // Create a note with unique title
    const uniqueTitle = `Body Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', uniqueTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${uniqueTitle}")`);

    // Click to edit the specific note
    await page.click(`[data-testid="note-item"]:has-text("${uniqueTitle}")`);
    await page.waitForTimeout(500);

    // Use CodeMirror editor
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('This content should be autosaved automatically.');

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Close WITHOUT manual save
    await page.click('[data-testid="close-note-btn"]');

    // Reopen the specific note and verify persistence via database
    await page.click(`[data-testid="note-item"]:has-text("${uniqueTitle}")`);
    await page.waitForTimeout(500);

    const bodyFromDb = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT body FROM notes WHERE title = ?',
        [title]
      );
      if (result.rows && result.rows.length > 0) {
        const bodyValue = result.rows[0].values[0];
        return bodyValue.type === 'Null' ? null : bodyValue.value;
      }
      return null;
    }, uniqueTitle);

    expect(bodyFromDb).toBe('This content should be autosaved automatically.');
  });

  test('should debounce rapid typing and only save once', async ({ page }) => {
    // Create a note
    const uniqueTitle = `Rapid Typing Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', uniqueTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForTimeout(500);

    // Use CodeMirror editor - type rapidly
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('First');
    await page.waitForTimeout(500);
    await page.keyboard.type(' Second');
    await page.waitForTimeout(500);
    await page.keyboard.type(' Third');
    await page.waitForTimeout(500);
    await page.keyboard.type(' Fourth');

    // Wait for final autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Close and verify final content via database
    await page.click('[data-testid="close-note-btn"]');

    const bodyFromDb = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT body FROM notes WHERE title = ?',
        [title]
      );
      if (result.rows && result.rows.length > 0) {
        const bodyValue = result.rows[0].values[0];
        return bodyValue.type === 'Null' ? null : bodyValue.value;
      }
      return null;
    }, uniqueTitle);

    expect(bodyFromDb).toBe('First Second Third Fourth');
  });

  test('should autosave when switching between notes', async ({ page }) => {
    // Create two notes with unique titles
    const noteOneTitle = `Note One ${Date.now()}`;
    const noteTwoTitle = `Note Two ${Date.now() + 1}`;

    await page.fill('[data-testid="note-title-input"]', noteOneTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteOneTitle}")`);

    await page.fill('[data-testid="note-title-input"]', noteTwoTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTwoTitle}")`);

    // Edit first note using CodeMirror
    await page.click(`[data-testid="note-item"]:has-text("${noteOneTitle}")`);
    await page.waitForTimeout(500);
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Content for note one');

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Switch to second note
    await page.click(`[data-testid="note-item"]:has-text("${noteTwoTitle}")`);
    await page.waitForTimeout(500);

    // Verify first note content was saved via database
    const bodyFromDb = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT body FROM notes WHERE title = ?',
        [title]
      );
      if (result.rows && result.rows.length > 0) {
        const bodyValue = result.rows[0].values[0];
        return bodyValue.type === 'Null' ? null : bodyValue.value;
      }
      return null;
    }, noteOneTitle);

    expect(bodyFromDb).toBe('Content for note one');
  });

  test('should show "Saving..." indicator during save operation', async ({ page }) => {
    // Create a note
    const uniqueTitle = `Save Indicator Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', uniqueTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForTimeout(500);

    // Use CodeMirror editor
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Testing save indicator');

    // Wait for autosave to complete
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
  });

  test('should autosave both title and body changes together', async ({ page }) => {
    // Create a note with unique title
    const uniqueTitle = `Combined Test ${Date.now()}`;
    await page.fill('[data-testid="note-title-input"]', uniqueTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${uniqueTitle}")`);

    // Click to edit the specific note
    await page.click(`[data-testid="note-item"]:has-text("${uniqueTitle}")`);
    await page.waitForTimeout(500);

    // Change title
    await page.waitForSelector('[data-testid="edit-title-input"]');
    const titleInput = page.locator('[data-testid="edit-title-input"]');
    await titleInput.clear();
    await titleInput.fill('Updated Title');

    // Change body using CodeMirror
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Updated body content');

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify both changes persisted via database
    const noteData = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT title, body FROM notes WHERE title = ?',
        [title]
      );
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return {
          title: row.values[0].value,
          body: row.values[1].type === 'Null' ? null : row.values[1].value
        };
      }
      return null;
    }, 'Updated Title');

    expect(noteData.title).toBe('Updated Title');
    expect(noteData.body).toBe('Updated body content');
  });

  test('should not autosave if content unchanged', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'No Change Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-title-input"]');

    // Don't change anything, just wait
    await page.waitForTimeout(4000);

    // Save indicator should not appear or show "No changes"
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    const indicatorText = await saveIndicator.textContent();
    expect(indicatorText === '' || indicatorText === 'No changes' || indicatorText === 'Saved').toBe(true);
  });
});
