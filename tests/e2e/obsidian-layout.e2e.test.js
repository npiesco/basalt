// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * INTEGRATION TEST: Obsidian-Style Three-Pane Layout
 *
 * Tests the classic Obsidian UI layout:
 * - Left Sidebar: Folder tree + Note list
 * - Center Pane: Markdown editor (when note selected)
 * - Right Sidebar: Metadata panel (optional)
 *
 * NO MOCKS - tests real UI layout with actual absurder-sql
 */

test.describe('INTEGRATION: Obsidian-Style Layout', () => {
  test('Layout has three main panes: left sidebar, center editor, right metadata', async ({ page }) => {
    console.log('[E2E] Starting Obsidian layout test');

    // Navigate to the app
    await page.goto('http://localhost:3000');
    console.log('[E2E] Navigated to app');

    // Wait for app to be ready
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] App is ready');

    // VERIFY: Left sidebar exists and contains folders + notes sections
    const leftSidebar = await page.locator('[data-testid="left-sidebar"]');
    await expect(leftSidebar).toBeVisible();
    console.log('[E2E] ✓ Left sidebar exists');

    // VERIFY: Left sidebar has folders section
    const foldersSection = await page.locator('[data-testid="folders-section"]');
    await expect(foldersSection).toBeVisible();
    console.log('[E2E] ✓ Folders section exists in left sidebar');

    // VERIFY: Left sidebar has notes section
    const notesSection = await page.locator('[data-testid="notes-section"]');
    await expect(notesSection).toBeVisible();
    console.log('[E2E] ✓ Notes section exists in left sidebar');

    // VERIFY: Center pane exists (editor area)
    const centerPane = await page.locator('[data-testid="center-pane"]');
    await expect(centerPane).toBeVisible();
    console.log('[E2E] ✓ Center pane exists');

    // VERIFY: Right sidebar exists (metadata panel)
    const rightSidebar = await page.locator('[data-testid="right-sidebar"]');
    await expect(rightSidebar).toBeVisible();
    console.log('[E2E] ✓ Right sidebar exists');

    console.log('[E2E] ✓ All three panes verified');
  });

  test('Left sidebar shows folder tree and can create folders', async ({ page }) => {
    console.log('[E2E] Starting folder tree test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // VERIFY: Folder tree is in left sidebar
    const folderTree = await page.locator('[data-testid="left-sidebar"] [data-testid="folders-section"]');
    await expect(folderTree).toBeVisible();
    console.log('[E2E] ✓ Folder tree visible in left sidebar');

    // CREATE: New folder through sidebar
    const folderInput = await page.locator('[data-testid="folders-section"] [data-testid="folder-name-input"]');
    await folderInput.fill('Project Notes');

    const createButton = await page.locator('[data-testid="folders-section"] [data-testid="create-folder-button"]');
    await createButton.click();
    console.log('[E2E] Created folder through sidebar');

    // VERIFY: Folder appears in the folder tree
    await page.waitForTimeout(500); // Wait for database sync
    const folderItems = await page.locator('[data-testid="folders-section"] [data-testid="folder-item"]');
    const count = await folderItems.count();
    expect(count).toBeGreaterThan(1); // Root + new folder
    console.log('[E2E] ✓ Folder appears in tree, count:', count);
  });

  test('Left sidebar shows note list and clicking note opens in center editor', async ({ page }) => {
    console.log('[E2E] Starting note list and editor test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Note through sidebar
    const titleInput = await page.locator('[data-testid="notes-section"] [data-testid="note-title-input"]');
    await titleInput.fill('Test Note for Layout');

    const createButton = await page.locator('[data-testid="notes-section"] [data-testid="new-note-button"]');
    await createButton.click();
    console.log('[E2E] Created note');

    // Wait for note to appear in sidebar
    await page.waitForTimeout(500);

    // VERIFY: Note appears in left sidebar notes list
    const noteItems = await page.locator('[data-testid="notes-section"] [data-testid="note-item"]');
    const count = await noteItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
    console.log('[E2E] ✓ Note appears in sidebar list, count:', count);

    // CLICK: Note in sidebar to open in center editor
    const firstNote = noteItems.first();
    await firstNote.click();
    console.log('[E2E] Clicked note in sidebar');

    // VERIFY: Center pane now shows the editor for this note
    const centerPane = await page.locator('[data-testid="center-pane"]');
    const editorTitle = await centerPane.locator('[data-testid="editor-note-title"]');
    await expect(editorTitle).toBeVisible();

    const titleValue = await editorTitle.inputValue();
    expect(titleValue).toBe('Test Note for Layout');
    console.log('[E2E] ✓ Note opened in center editor with correct title:', titleValue);

    // VERIFY: Editor has body textarea
    const editorBody = await centerPane.locator('[data-testid="editor-note-body"]');
    await expect(editorBody).toBeVisible();
    console.log('[E2E] ✓ Editor body visible');
  });

  test('Center editor shows welcome message when no note selected', async ({ page }) => {
    console.log('[E2E] Starting welcome message test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // VERIFY: Center pane shows welcome/empty state
    const centerPane = await page.locator('[data-testid="center-pane"]');
    await expect(centerPane).toBeVisible();

    // VERIFY: Welcome message or empty state is visible
    const welcomeMessage = await centerPane.locator('[data-testid="editor-empty-state"]');
    await expect(welcomeMessage).toBeVisible();
    console.log('[E2E] ✓ Welcome message visible when no note selected');
  });

  test('Right sidebar shows metadata for selected note', async ({ page }) => {
    console.log('[E2E] Starting metadata panel test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Note
    const titleInput = await page.locator('[data-testid="notes-section"] [data-testid="note-title-input"]');
    await titleInput.fill('Metadata Test Note');

    const createButton = await page.locator('[data-testid="notes-section"] [data-testid="new-note-button"]');
    await createButton.click();
    await page.waitForTimeout(500);

    // CLICK: Note to open
    const noteItems = await page.locator('[data-testid="notes-section"] [data-testid="note-item"]');
    await noteItems.first().click();
    console.log('[E2E] Opened note');

    // VERIFY: Right sidebar shows metadata
    const rightSidebar = await page.locator('[data-testid="right-sidebar"]');
    await expect(rightSidebar).toBeVisible();

    // VERIFY: Metadata shows created date
    const createdDate = await rightSidebar.locator('[data-testid="metadata-created-date"]');
    await expect(createdDate).toBeVisible();
    console.log('[E2E] ✓ Created date visible in metadata');

    // VERIFY: Metadata shows updated date
    const updatedDate = await rightSidebar.locator('[data-testid="metadata-updated-date"]');
    await expect(updatedDate).toBeVisible();
    console.log('[E2E] ✓ Updated date visible in metadata');

    // VERIFY: Metadata shows folder
    const folderInfo = await rightSidebar.locator('[data-testid="metadata-folder"]');
    await expect(folderInfo).toBeVisible();
    console.log('[E2E] ✓ Folder info visible in metadata');
  });

  test('Layout is responsive and panes have proper widths', async ({ page }) => {
    console.log('[E2E] Starting responsive layout test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // VERIFY: Left sidebar has reasonable width (200-400px typically)
    const leftSidebar = await page.locator('[data-testid="left-sidebar"]');
    const leftBox = await leftSidebar.boundingBox();
    expect(leftBox).not.toBeNull();
    if (leftBox) {
      expect(leftBox.width).toBeGreaterThan(150);
      expect(leftBox.width).toBeLessThan(500);
      console.log('[E2E] ✓ Left sidebar width:', leftBox.width, 'px');
    }

    // VERIFY: Center pane takes up majority of space
    const centerPane = await page.locator('[data-testid="center-pane"]');
    const centerBox = await centerPane.boundingBox();
    expect(centerBox).not.toBeNull();
    if (centerBox && leftBox) {
      expect(centerBox.width).toBeGreaterThan(leftBox.width);
      console.log('[E2E] ✓ Center pane width:', centerBox.width, 'px (larger than left)');
    }

    // VERIFY: Right sidebar has reasonable width
    const rightSidebar = await page.locator('[data-testid="right-sidebar"]');
    const rightBox = await rightSidebar.boundingBox();
    expect(rightBox).not.toBeNull();
    if (rightBox) {
      expect(rightBox.width).toBeGreaterThan(150);
      expect(rightBox.width).toBeLessThan(500);
      console.log('[E2E] ✓ Right sidebar width:', rightBox.width, 'px');
    }

    console.log('[E2E] ✓ Layout dimensions verified');
  });
});
