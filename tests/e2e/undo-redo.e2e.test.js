/**
 * E2E TEST: Undo/Redo Functionality (TDD)
 * Tests CodeMirror 6 undo/redo history stack with keyboard shortcuts
 */

const { test, expect } = require('@playwright/test');

test.describe('Undo/Redo Functionality', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.clearPermissions();
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
  });

  test('should undo text typing with Ctrl+Z', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Undo Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('.cm-content');

    // Type some text
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('First line');

    // Verify text is there
    await expect(cmContent).toHaveText('First line');

    // Undo with Ctrl+Z
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // Text should be undone (empty or partial)
    const afterUndo = await cmContent.textContent();
    expect(afterUndo).not.toBe('First line');
  });

  test('should redo text typing with Ctrl+Y', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Redo Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('.cm-content');

    // Type text
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Content to redo');

    // Undo it
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    const afterUndo = await cmContent.textContent();
    expect(afterUndo).not.toBe('Content to redo');

    // Redo with Ctrl+Y
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);

    // Text should be back
    await expect(cmContent).toHaveText('Content to redo');
  });

  test('should undo multiple edits sequentially', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Multi Undo Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('.cm-content');

    const cmContent = page.locator('.cm-content');
    await cmContent.click();

    // Type three separate edits
    await page.keyboard.type('First edit');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second edit');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Third edit');
    await page.waitForTimeout(200);

    // Verify all content is there
    const fullText = await cmContent.textContent();
    expect(fullText).toContain('First edit');
    expect(fullText).toContain('Second edit');
    expect(fullText).toContain('Third edit');

    // Undo once - should remove "Third edit"
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    let currentText = await cmContent.textContent();
    expect(currentText).toContain('First edit');
    expect(currentText).toContain('Second edit');

    // Undo again - should remove "Second edit"
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    currentText = await cmContent.textContent();
    expect(currentText).toContain('First edit');

    // Undo one more time
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    currentText = await cmContent.textContent();
    // Should have minimal or no text
    expect(currentText.length).toBeLessThan(fullText.length);
  });

  test('should redo multiple edits sequentially', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Multi Redo Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('.cm-content');

    const cmContent = page.locator('.cm-content');
    await cmContent.click();

    // Type multiple edits
    await page.keyboard.type('Line 1');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');
    await page.waitForTimeout(200);

    // Undo twice
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // Text should be mostly gone
    let currentText = await cmContent.textContent();
    expect(currentText.length).toBeLessThan(15);

    // Redo twice
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);

    // Text should be back
    currentText = await cmContent.textContent();
    expect(currentText).toContain('Line 1');
    expect(currentText).toContain('Line 2');
  });

  test('should preserve undo history when switching notes', async ({ page }) => {
    // Create first note
    await page.fill('[data-testid="note-title-input"]', 'Note A');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("Note A")');

    // Edit first note
    await page.click('[data-testid="note-item"]:has-text("Note A")');
    await page.waitForSelector('.cm-content');

    let cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Content in Note A');
    await page.waitForTimeout(500);

    // Create second note
    await page.fill('[data-testid="note-title-input"]', 'Note B');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]:has-text("Note B")');

    // Edit second note
    await page.click('[data-testid="note-item"]:has-text("Note B")');
    await page.waitForSelector('.cm-content');

    cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Content in Note B');
    await page.waitForTimeout(500);

    // Undo in Note B
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    let currentText = await cmContent.textContent();
    expect(currentText).not.toBe('Content in Note B');

    // Switch back to Note A
    await page.click('[data-testid="note-item"]:has-text("Note A")');
    await page.waitForSelector('.cm-content');

    cmContent = page.locator('.cm-content');

    // Note A should still have its content
    currentText = await cmContent.textContent();
    expect(currentText).toBe('Content in Note A');
  });

  test('should undo deletions (backspace)', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Delete Undo Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('.cm-content');

    const cmContent = page.locator('.cm-content');
    await cmContent.click();

    // Type text
    await page.keyboard.type('Hello World');
    await page.waitForTimeout(500);

    // Delete some characters with longer waits between to create separate undo events
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    // Should have "Hello " left
    let currentText = await cmContent.textContent();
    expect(currentText).toBe('Hello ');

    // Undo one deletion at a time
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // Text should have at least one character restored (CodeMirror may group undos differently)
    currentText = await cmContent.textContent();
    // CodeMirror may restore all deletions at once or one at a time
    // Just verify that SOME text was restored
    expect(currentText.length).toBeGreaterThanOrEqual(7); // At least "Hello W" or more
  });

  test('should work with Ctrl+Shift+Z for redo (alternative shortcut)', async ({ page }) => {
    // Create a note
    await page.fill('[data-testid="note-title-input"]', 'Shift Redo Test');
    await page.click('[data-testid="new-note-button"]');
    await page.waitForSelector('[data-testid="note-item"]');

    // Click to edit
    await page.click('[data-testid="note-item"]');
    await page.waitForSelector('.cm-content');

    const cmContent = page.locator('.cm-content');
    await cmContent.click();

    // Type text
    await page.keyboard.type('Redo with Shift+Z');
    await page.waitForTimeout(300);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    let currentText = await cmContent.textContent();
    expect(currentText).not.toBe('Redo with Shift+Z');

    // Redo with Ctrl+Shift+Z
    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(300);

    // Text should be back
    await expect(cmContent).toHaveText('Redo with Shift+Z');
  });
});
