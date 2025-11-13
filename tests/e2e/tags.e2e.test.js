import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Tags and Metadata', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });
  });

  test('Add tags to a note and persist to database', async ({ page }) => {
    console.log('[E2E] Starting tag addition test');

    // Create a new note
    const noteTitle = `Tagged Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    // Get the note ID from database
    const noteId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, noteTitle);
    console.log('[E2E] Created note:', noteId);

    // Select the note to edit it
    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(500);

    // Add tags using the tag input field
    const tagsInput = page.locator('[data-testid="note-tags-input"]');
    await expect(tagsInput).toBeVisible();

    await tagsInput.fill('javascript, programming, tutorial');
    console.log('[E2E] Entered tags: javascript, programming, tutorial');

    // Save the note with tags
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify tags are stored in the database
    const tagsInDb = await page.evaluate(async (nId) => {
      const result = await window.basaltDb.executeQuery(
        `SELECT t.label
         FROM tags t
         JOIN note_tags nt ON t.tag_id = nt.tag_id
         WHERE nt.note_id = ?
         ORDER BY t.label`,
        [nId]
      );
      return result.rows.map(row => row.values[0].value);
    }, noteId);

    console.log('[E2E] Tags in database:', tagsInDb);

    expect(tagsInDb).toHaveLength(3);
    expect(tagsInDb).toContain('javascript');
    expect(tagsInDb).toContain('programming');
    expect(tagsInDb).toContain('tutorial');

    // Verify tags are displayed in the UI
    await expect(page.locator('[data-testid="note-tag"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="note-tag"]:has-text("javascript")')).toBeVisible();
    await expect(page.locator('[data-testid="note-tag"]:has-text("programming")')).toBeVisible();
    await expect(page.locator('[data-testid="note-tag"]:has-text("tutorial")')).toBeVisible();

    console.log('[E2E] ✓✓✓ TAG ADDITION AND PERSISTENCE WORKS!');
  });

  test('Display tags on note list items', async ({ page }) => {
    console.log('[E2E] Starting tag display test');

    // Create a note with tags
    const noteTitle = `Display Tags ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    // Select and add tags
    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(500);

    await page.locator('[data-testid="note-tags-input"]').fill('react, frontend');
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify tags are shown in the note list item (tags appear even when note is selected)
    const noteItem = page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`);
    await expect(noteItem.locator('[data-testid="note-tag-badge"]')).toHaveCount(2);

    // Verify the specific tags are present
    await expect(noteItem.locator('[data-testid="note-tag-badge"]:has-text("react")')).toBeVisible();
    await expect(noteItem.locator('[data-testid="note-tag-badge"]:has-text("frontend")')).toBeVisible();

    console.log('[E2E] ✓✓✓ TAGS DISPLAYED IN NOTE LIST!');
  });

  test('Remove tags from a note', async ({ page }) => {
    console.log('[E2E] Starting tag removal test');

    // Create note with tags
    const noteTitle = `Remove Tags ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const noteId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, noteTitle);

    // Select note and add tags
    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(500);

    await page.locator('[data-testid="note-tags-input"]').fill('python, backend, api');
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify 3 tags exist
    let tagsCount = await page.evaluate(async (nId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) FROM note_tags WHERE note_id = ?',
        [nId]
      );
      return result.rows[0].values[0].value;
    }, noteId);
    expect(tagsCount).toBe(3);

    // Remove one tag by editing the input
    await page.locator('[data-testid="note-tags-input"]').fill('python, backend');
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify only 2 tags remain
    tagsCount = await page.evaluate(async (nId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) FROM note_tags WHERE note_id = ?',
        [nId]
      );
      return result.rows[0].values[0].value;
    }, noteId);
    expect(tagsCount).toBe(2);

    const remainingTags = await page.evaluate(async (nId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT t.label FROM tags t JOIN note_tags nt ON t.tag_id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.label',
        [nId]
      );
      return result.rows.map(row => row.values[0].value);
    }, noteId);

    expect(remainingTags).toContain('python');
    expect(remainingTags).toContain('backend');
    expect(remainingTags).not.toContain('api');

    console.log('[E2E] ✓✓✓ TAG REMOVAL WORKS!');
  });

  test('Delete note removes associated tags (CASCADE)', async ({ page }) => {
    console.log('[E2E] Starting tag cascade delete test');

    // Create note with tags
    const noteTitle = `Cascade Delete ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const noteId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, noteTitle);

    // Add tags
    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(500);

    await page.locator('[data-testid="note-tags-input"]').fill('delete-test, cascade');
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify tags exist in note_tags
    let noteTagsCount = await page.evaluate(async (nId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) FROM note_tags WHERE note_id = ?',
        [nId]
      );
      return result.rows[0].values[0].value;
    }, noteId);
    expect(noteTagsCount).toBe(2);

    // Delete the note
    await page.locator('[data-testid="delete-note-button"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="confirm-delete-button"]').click();
    await page.waitForTimeout(500);

    // Verify note_tags entries are CASCADE deleted
    noteTagsCount = await page.evaluate(async (nId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) FROM note_tags WHERE note_id = ?',
        [nId]
      );
      return result.rows[0].values[0].value;
    }, noteId);
    expect(noteTagsCount).toBe(0);

    console.log('[E2E] ✓✓✓ CASCADE DELETE OF TAGS WORKS!');
  });

  test('Search notes by tag', async ({ page }) => {
    console.log('[E2E] Starting tag search test');

    // Create multiple notes with different tags
    const note1Title = `Search Note 1 ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note1Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${note1Title}")`).click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="note-tags-input"]').fill('urgent, bug');
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(800);

    const note2Title = `Search Note 2 ${Date.now() + 1}`;
    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="note-tags-input"]').fill('feature, enhancement');
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(800);

    const note3Title = `Search Note 3 ${Date.now() + 2}`;
    await page.locator('[data-testid="note-title-input"]').fill(note3Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${note3Title}")`).click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="note-tags-input"]').fill('bug, testing');
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(800);

    // Click on a tag to filter notes
    await page.locator('[data-testid="note-tag"]:has-text("bug")').first().click();
    await page.waitForTimeout(500);

    // Verify only notes with "bug" tag are shown
    const visibleNotes = await page.locator('[data-testid="note-item"]').count();
    console.log('[E2E] Visible notes after filtering by "bug":', visibleNotes);

    // Should show 2 notes (note1 and note3 both have "bug" tag)
    expect(visibleNotes).toBe(2);

    await expect(page.locator(`[data-testid="note-item"]:has-text("${note1Title}")`)).toBeVisible();
    await expect(page.locator(`[data-testid="note-item"]:has-text("${note3Title}")`)).toBeVisible();
    await expect(page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`)).not.toBeVisible();

    // Clear filter
    await page.locator('[data-testid="clear-tag-filter"]').click();
    await page.waitForTimeout(300);

    // All notes should be visible again
    const allNotes = await page.locator('[data-testid="note-item"]').count();
    expect(allNotes).toBeGreaterThanOrEqual(3);

    console.log('[E2E] ✓✓✓ TAG SEARCH/FILTER WORKS!');
  });
});
