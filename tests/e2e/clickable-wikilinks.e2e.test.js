import { test, expect } from '@playwright/test';

test.describe('INTEGRATION: Clickable Wikilinks in Note Body', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });
  });

  test('Wikilinks render as clickable elements in note preview', async ({ page }) => {
    console.log('[E2E] Starting wikilink rendering test');

    // Create target note
    const targetTitle = `Target Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(targetTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const targetId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, targetTitle);
    console.log('[E2E] Target note ID:', targetId);

    // Create source note with wikilink
    const sourceTitle = `Source Note ${Date.now()}`;
    const sourceBody = `This note references [[${targetId}]] and also mentions [[${targetId}]] again.\n\nMultiple references to the same note.`;

    await page.locator('[data-testid="note-title-input"]').fill(sourceTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${sourceTitle}")`).click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-body-textarea"]').fill(sourceBody);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify wikilinks are rendered as clickable elements in preview
    const wikilinkElements = page.locator('[data-testid="wikilink"]');
    const wikilinkCount = await wikilinkElements.count();
    console.log('[E2E] Wikilink elements found:', wikilinkCount);

    expect(wikilinkCount).toBe(2); // Two [[targetId]] references

    // Verify first wikilink shows the target note title
    const firstWikilink = wikilinkElements.first();
    await expect(firstWikilink).toContainText(targetTitle);
    await expect(firstWikilink).toBeVisible();

    console.log('[E2E] ✓✓✓ WIKILINKS RENDERED AS CLICKABLE ELEMENTS!');
  });

  test('Clicking a wikilink navigates to the target note', async ({ page }) => {
    console.log('[E2E] Starting wikilink navigation test');

    // Create note A
    const noteATitle = `Note A ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteATitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const noteAId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, noteATitle);

    // Create note B that links to note A
    const noteBTitle = `Note B ${Date.now()}`;
    const noteBBody = `This references [[${noteAId}]] in the content.`;

    await page.locator('[data-testid="note-title-input"]').fill(noteBTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteBTitle}")`).click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-body-textarea"]').fill(noteBBody);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify we're viewing note B
    await expect(page.locator('[data-testid="editor-note-title"]')).toHaveValue(noteBTitle);

    // Click the wikilink
    await page.locator('[data-testid="wikilink"]').first().click();
    await page.waitForTimeout(500);

    // Verify we navigated to note A
    await expect(page.locator('[data-testid="editor-note-title"]')).toHaveValue(noteATitle);
    console.log('[E2E] ✓✓✓ WIKILINK NAVIGATION WORKS!');
  });

  test('Wikilinks to non-existent notes are styled differently', async ({ page }) => {
    console.log('[E2E] Starting non-existent wikilink test');

    const noteTitle = `Broken Links ${Date.now()}`;
    const fakeNoteId = 'note_nonexistent_12345';
    const noteBody = `This references [[${fakeNoteId}]] which does not exist.`;

    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-body-textarea"]').fill(noteBody);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify broken wikilink is rendered
    const brokenWikilink = page.locator('[data-testid="wikilink-broken"]');
    await expect(brokenWikilink).toBeVisible();
    await expect(brokenWikilink).toContainText(fakeNoteId);

    // Verify it has a different visual style (check for specific class)
    const classList = await brokenWikilink.getAttribute('class');
    expect(classList).toContain('text-red'); // Should have red text color

    console.log('[E2E] ✓✓✓ BROKEN WIKILINKS STYLED CORRECTLY!');
  });

  test('Wikilinks work with multiple notes in complex content', async ({ page }) => {
    console.log('[E2E] Starting complex wikilink test');

    // Create 3 target notes
    const note1Title = `Topic 1 ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note1Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    const note1Id = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, note1Title);

    const note2Title = `Topic 2 ${Date.now() + 1}`;
    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    const note2Id = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, note2Title);

    const note3Title = `Topic 3 ${Date.now() + 2}`;
    await page.locator('[data-testid="note-title-input"]').fill(note3Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    const note3Id = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, note3Title);

    // Create master note with multiple wikilinks
    const masterTitle = `Master Doc ${Date.now()}`;
    const masterBody = `# Overview\n\nSee [[${note1Id}]] for details on the first topic.\n\nAlso check [[${note2Id}]] and [[${note3Id}]].\n\nReference [[${note1Id}]] again here.`;

    await page.locator('[data-testid="note-title-input"]').fill(masterTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${masterTitle}")`).click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-body-textarea"]').fill(masterBody);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Verify all wikilinks are rendered (4 total: note1 twice, note2 once, note3 once)
    const wikilinkCount = await page.locator('[data-testid="wikilink"]').count();
    expect(wikilinkCount).toBe(4);

    // Click on the second wikilink (should be note2)
    const wikilinks = page.locator('[data-testid="wikilink"]');
    await wikilinks.nth(1).click();
    await page.waitForTimeout(500);

    // Verify we navigated to note2
    await expect(page.locator('[data-testid="editor-note-title"]')).toHaveValue(note2Title);

    console.log('[E2E] ✓✓✓ COMPLEX WIKILINKS WORK!');
  });

  test('Toggle between edit and preview modes', async ({ page }) => {
    console.log('[E2E] Starting edit/preview toggle test');

    // Create target note
    const targetTitle = `Toggle Target ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(targetTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const targetId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, targetTitle);

    // Create note with wikilink
    const sourceTitle = `Toggle Source ${Date.now()}`;
    const sourceBody = `Links to [[${targetId}]] here.`;

    await page.locator('[data-testid="note-title-input"]').fill(sourceTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${sourceTitle}")`).click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-body-textarea"]').fill(sourceBody);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(1000);

    // Should be in preview mode by default (showing rendered wikilinks)
    await expect(page.locator('[data-testid="note-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="wikilink"]')).toBeVisible();

    // Switch to edit mode
    await page.locator('[data-testid="toggle-edit-mode"]').click();
    await page.waitForTimeout(300);

    // Should show textarea, not preview
    await expect(page.locator('[data-testid="note-body-textarea"]')).toBeVisible();
    await expect(page.locator('[data-testid="note-preview"]')).not.toBeVisible();

    // Switch back to preview mode
    await page.locator('[data-testid="toggle-preview-mode"]').click();
    await page.waitForTimeout(300);

    // Should show preview again
    await expect(page.locator('[data-testid="note-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="wikilink"]')).toBeVisible();

    console.log('[E2E] ✓✓✓ EDIT/PREVIEW TOGGLE WORKS!');
  });
});
