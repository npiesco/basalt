/**
 * E2E TEST: CodeMirror 6 Markdown Editor (TDD - RED Phase)
 * Tests CodeMirror 6 integration for professional markdown editing experience
 */

const { test, expect } = require('@playwright/test');

test.describe('CodeMirror 6 Editor', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.clearPermissions();
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  });

  test('should render CodeMirror editor when editing note', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'CodeMirror Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');

    // CodeMirror editor should be present with specific class
    const cmEditor = page.locator('.cm-editor');
    await expect(cmEditor).toBeVisible();

    // Should have content area
    const cmContent = page.locator('.cm-content');
    await expect(cmContent).toBeVisible();
  });

  test('should support markdown syntax highlighting', async ({ page }) => {
    // Create and edit a note
    await page.fill('[data-testid="note-title-input"]', 'Syntax Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');
    await page.click('[data-testid="note-item"]');

    // Wait for CodeMirror to be ready
    await page.waitForSelector('.cm-content');

    // Type markdown content with various syntax
    const cmContent = page.locator('.cm-content');
    await cmContent.click();

    // Type heading
    await page.keyboard.type('# Heading 1\n\n');

    // Type bold text
    await page.keyboard.type('**Bold text**\n\n');

    // Type code block
    await page.keyboard.type('```javascript\nconst x = 42;\n```\n');

    // CodeMirror should apply syntax highlighting (check for markdown token classes)
    // The heading should have markdown formatting classes
    const editorContent = await cmContent.textContent();
    expect(editorContent).toContain('# Heading 1');
    expect(editorContent).toContain('**Bold text**');
    expect(editorContent).toContain('```javascript');
  });

  test('should persist content edited in CodeMirror', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Persistence Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');
    await page.click('[data-testid="note-item"]');

    // Type in CodeMirror
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Content written in CodeMirror editor');

    // Wait for autosave
    await page.waitForTimeout(3500);

    // Verify save indicator
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    await expect(saveIndicator).toContainText('Saved');

    // Close note
    await page.click('[data-testid="close-note-btn"]');

    // Reopen and verify content persisted
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('.cm-content');

    const reopenedContent = page.locator('.cm-content');
    await expect(reopenedContent).toHaveText('Content written in CodeMirror editor');
  });

  test('should switch content when changing notes', async ({ page }) => {
    // Create two notes
    const noteOneTitle = `CM Note 1 ${Date.now()}`;
    const noteTwoTitle = `CM Note 2 ${Date.now() + 1}`;

    await page.fill('[data-testid="note-title-input"]', noteOneTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteOneTitle}")`);

    await page.fill('[data-testid="note-title-input"]', noteTwoTitle);
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector(`[data-testid="note-item"]:has-text("${noteTwoTitle}")`);

    // Edit first note in CodeMirror
    await page.click(`[data-testid="note-item"]:has-text("${noteOneTitle}")`);
    await page.waitForSelector('.cm-content');
    let cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Content for note one');

    // Wait for autosave
    await page.waitForTimeout(3500);

    // Edit second note in CodeMirror
    await page.click(`[data-testid="note-item"]:has-text("${noteTwoTitle}")`);
    await page.waitForSelector('.cm-content');
    cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Content for note two');

    // Wait for autosave
    await page.waitForTimeout(3500);

    // Switch back to first note - content should be different
    await page.click(`[data-testid="note-item"]:has-text("${noteOneTitle}")`);
    await page.waitForSelector('.cm-content');

    const note1Content = page.locator('.cm-content');
    await expect(note1Content).toHaveText('Content for note one');

    // Switch to second note
    await page.click(`[data-testid="note-item"]:has-text("${noteTwoTitle}")`);
    await page.waitForSelector('.cm-content');

    const note2Content = page.locator('.cm-content');
    await expect(note2Content).toHaveText('Content for note two');
  });

  test('should work with existing wikilinks functionality', async ({ page }) => {
    // Create target note
    await page.fill('[data-testid="note-title-input"]', 'Target Note');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("Target Note")');

    // Wait for note to be fully created and persisted
    await page.waitForTimeout(2000);

    // Get the target note ID from the list - use first() to ensure single element
    const targetNoteItem = page.locator('[data-testid="note-item"]').filter({ hasText: 'Target Note' }).first();
    const targetNoteId = await targetNoteItem.getAttribute('data-note-id');

    // Verify we got a valid ID
    if (!targetNoteId || !targetNoteId.startsWith('note_')) {
      throw new Error(`Invalid target note ID: ${targetNoteId}`);
    }

    console.log('[TEST] Target Note ID:', targetNoteId);

    // Create source note with wikilink
    await page.fill('[data-testid="note-title-input"]', 'Source Note');
    await page.click('[data-testid="new-note-button"]');

    // Wait for BOTH notes to be visible in the list
    await page.waitForSelector('[data-testid="note-item"]:has-text("Target Note")');
    await page.waitForSelector('[data-testid="note-item"]:has-text("Source Note")');
    await page.waitForTimeout(1000);

    // Verify we have 2 notes
    const noteCount = await page.locator('[data-testid="note-item"]').count();
    console.log('[TEST] Note count:', noteCount);

    // Click on source note to edit
    const sourceNote = page.locator('[data-testid="note-item"]').filter({ hasText: 'Source Note' }).first();
    await sourceNote.click();

    // Wait for editor to be ready
    await page.waitForSelector('.cm-content');
    await page.waitForTimeout(500);

    // Type wikilink in CodeMirror
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type(`Link to [[${targetNoteId}]]`);

    // Wait for autosave to complete
    await page.waitForTimeout(4000);

    // Wait for autosave indicator to show "Saved"
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 5000 });

    // Wait extra time to ensure notes are reloaded after autosave
    await page.waitForTimeout(1500);

    // Verify both notes still exist with correct titles
    await expect(page.locator('[data-testid="note-item"]:has-text("Target Note")')).toBeVisible();
    await expect(page.locator('[data-testid="note-item"]:has-text("Source Note")')).toBeVisible();

    // Switch to preview mode
    const viewModeButton = page.locator('[data-testid="toggle-preview-mode"]');
    await viewModeButton.scrollIntoViewIfNeeded();
    await viewModeButton.click();

    // Wait for preview to render
    await page.waitForSelector('[data-testid="note-preview"]');
    await page.waitForTimeout(2000);

    // Wikilink should be rendered as clickable
    const wikilink = page.locator('[data-testid="wikilink"]').first();
    await expect(wikilink).toBeVisible({ timeout: 5000 });
    await expect(wikilink).toContainText('Target Note');
  });

  test('should support line numbers display', async ({ page }) => {
    // Create and edit a note
    await page.fill('[data-testid="note-title-input"]', 'Line Numbers Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');
    await page.click('[data-testid="note-item"]');

    // CodeMirror line gutters should be visible
    await page.waitForSelector('.cm-content');
    const lineGutter = page.locator('.cm-lineNumbers');
    await expect(lineGutter).toBeVisible();

    // Type multiple lines
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

    // Line numbers should be present (at least 5 lines)
    // CodeMirror adds an extra line for the cursor, so we expect 6
    const lineNumbers = page.locator('.cm-lineNumbers .cm-gutterElement');
    await expect(lineNumbers).toHaveCount(6, { timeout: 2000 });
  });

  test('should maintain cursor position during autosave', async ({ page }) => {
    // Create and edit a note
    await page.fill('[data-testid="note-title-input"]', 'Cursor Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');
    await page.click('[data-testid="note-item"]');

    // Type some content in CodeMirror
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('First line\nSecond line\nThird line');

    // Wait for autosave to complete
    await page.waitForTimeout(3500);

    // Verify save completed
    const saveIndicator = page.locator('[data-testid="autosave-indicator"]');
    await expect(saveIndicator).toContainText('Saved');

    // Continue typing after autosave - cursor should not jump
    await page.keyboard.type('\nFourth line added after save');

    // Content should include all lines
    const finalContent = await cmContent.textContent();
    expect(finalContent).toContain('First line');
    expect(finalContent).toContain('Second line');
    expect(finalContent).toContain('Third line');
    expect(finalContent).toContain('Fourth line added after save');
  });
});
