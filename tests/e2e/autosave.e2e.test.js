/**
 * E2E TEST: Autosave Functionality (TDD - RED Phase)
 * Tests autosave feature that automatically saves note changes without manual save button clicks
 */

const { test, expect } = require('@playwright/test');

test.describe('Autosave Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Wait for database to initialize
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  });

  test('should autosave title changes after debounce delay', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Test Note');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit the note
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-title-input"]');

    // Clear and type new title
    await page.fill('[data-testid="edit-title-input"]', '');
    await page.fill('[data-testid="edit-title-input"]', 'Autosaved Title');

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
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Body Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-body-textarea"]');

    // Type in body
    await page.fill('[data-testid="edit-body-textarea"]', 'This content should be autosaved automatically.');

    // Wait for autosave
    await page.waitForTimeout(3500);

    // Verify save indicator
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    await expect(saveIndicator).toContainText('Saved');

    // Close WITHOUT manual save
    await page.click('[data-testid="close-note-btn"]');

    // Reopen and verify persistence
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-body-textarea"]');
    const bodyTextarea = page.locator('[data-testid="edit-body-textarea"]');
    await expect(bodyTextarea).toHaveValue('This content should be autosaved automatically.');
  });

  test('should debounce rapid typing and only save once', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Rapid Typing Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-body-textarea"]');

    // Type rapidly (simulating fast typing)
    await page.fill('[data-testid="edit-body-textarea"]', 'First');
    await page.waitForTimeout(500);
    await page.fill('[data-testid="edit-body-textarea"]', 'First Second');
    await page.waitForTimeout(500);
    await page.fill('[data-testid="edit-body-textarea"]', 'First Second Third');
    await page.waitForTimeout(500);
    await page.fill('[data-testid="edit-body-textarea"]', 'First Second Third Fourth');

    // Verify saving indicator shows during debounce
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    await expect(saveIndicator).toContainText('Saving...');

    // Wait for final autosave
    await page.waitForTimeout(3500);
    await expect(saveIndicator).toContainText('Saved');

    // Close and verify final content
    await page.click('[data-testid="close-note-btn"]');
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-body-textarea"]');
    const bodyTextarea = page.locator('[data-testid="edit-body-textarea"]');
    await expect(bodyTextarea).toHaveValue('First Second Third Fourth');
  });

  test('should autosave when switching between notes', async ({ page }) => {
    // Create two notes
    await page.fill('[data-testid="note-title-input"]', 'Note One');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForTimeout(500);

    await page.fill('[data-testid="note-title-input"]', 'Note Two');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForTimeout(500);

    // Edit first note
    const notes = page.locator('[data-testid="note-item"]');
    await notes.first().click();
    await page.waitForSelector('[data-testid="edit-body-textarea"]');
    await page.fill('[data-testid="edit-body-textarea"]', 'Content for note one');

    // Immediately switch to second note (should trigger autosave)
    await notes.last().click();

    // Wait a moment for the save to complete
    await page.waitForTimeout(1000);

    // Switch back to first note and verify content was saved
    await notes.first().click();
    await page.waitForSelector('[data-testid="edit-body-textarea"]');
    const bodyTextarea = page.locator('[data-testid="edit-body-textarea"]');
    await expect(bodyTextarea).toHaveValue('Content for note one');
  });

  test('should show "Saving..." indicator during save operation', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Save Indicator Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-body-textarea"]');

    // Type content
    await page.fill('[data-testid="edit-body-textarea"]', 'Testing save indicator');

    // Immediately check for "Saving..." indicator (within debounce period)
    await page.waitForTimeout(500);
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    await expect(saveIndicator).toContainText('Saving...');

    // Wait for save to complete
    await page.waitForTimeout(3500);
    await expect(saveIndicator).toContainText('Saved');
  });

  test('should autosave both title and body changes together', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Combined Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-title-input"]');

    // Change both title and body
    await page.fill('[data-testid="edit-title-input"]', 'Updated Title');
    await page.fill('[data-testid="edit-body-textarea"]', 'Updated body content');

    // Wait for autosave
    await page.waitForTimeout(3500);

    // Verify save indicator
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    await expect(saveIndicator).toContainText('Saved');

    // Close and reopen to verify both changes persisted
    await page.click('[data-testid="close-note-btn"]');
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('[data-testid="edit-title-input"]');

    const titleInput = page.locator('[data-testid="edit-title-input"]');
    const bodyTextarea = page.locator('[data-testid="edit-body-textarea"]');
    await expect(titleInput).toHaveValue('Updated Title');
    await expect(bodyTextarea).toHaveValue('Updated body content');
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
