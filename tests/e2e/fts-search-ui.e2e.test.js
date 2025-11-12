// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * INTEGRATION TEST: FTS5 Full-Text Search UI
 *
 * Tests the live search panel with real FTS5 queries:
 * - Search input in UI
 * - Real-time search results from FTS5
 * - Result highlighting and snippets
 * - Click to open note from search results
 * - Empty state handling
 *
 * NO MOCKS - tests real FTS5 search with actual absurder-sql
 */

test.describe('INTEGRATION: FTS5 Search UI', () => {
  test('Search input exists and is accessible', async ({ page }) => {
    console.log('[E2E] Starting search input test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] App is ready');

    // VERIFY: Search input exists (should be in header or sidebar)
    const searchInput = await page.locator('[data-testid="search-input"]');
    await expect(searchInput).toBeVisible();
    console.log('[E2E] ✓ Search input visible');

    // VERIFY: Search input is functional
    await searchInput.click();
    await searchInput.fill('test query');
    const value = await searchInput.inputValue();
    expect(value).toBe('test query');
    console.log('[E2E] ✓ Search input functional');
  });

  test('Search finds notes by title and displays results', async ({ page }) => {
    console.log('[E2E] Starting search by title test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Notes with searchable content
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    // Create note 1
    await noteInput.fill('React Hooks Tutorial');
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created note 1');

    // Create note 2
    await noteInput.fill('Python Data Science Guide');
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created note 2');

    // Create note 3
    await noteInput.fill('React Component Patterns');
    await createButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created note 3');

    // SEARCH: For "React" - should find 2 notes
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('React');
    await page.waitForTimeout(800); // Wait for search to execute
    console.log('[E2E] Searched for "React"');

    // VERIFY: Search results appear
    const searchResults = await page.locator('[data-testid="search-results"]');
    await expect(searchResults).toBeVisible();
    console.log('[E2E] ✓ Search results visible');

    // VERIFY: Correct number of results (2 notes with "React")
    const resultItems = await page.locator('[data-testid="search-result-item"]');
    const count = await resultItems.count();
    expect(count).toBe(2);
    console.log('[E2E] ✓ Found 2 results for "React"');

    // VERIFY: Result items show note titles
    const firstResult = resultItems.first();
    const firstTitle = await firstResult.locator('[data-testid="result-title"]').textContent();
    expect(firstTitle).toContain('React');
    console.log('[E2E] ✓ Result shows matching title:', firstTitle);
  });

  test('Search finds notes by body content', async ({ page }) => {
    console.log('[E2E] Starting search by body test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Note with body content
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Meeting Notes');
    await createButton.click();
    await page.waitForTimeout(500);

    // OPEN: Note and add body content
    const noteItem = await page.locator('[data-testid="note-item"]').first();
    await noteItem.click();
    await page.waitForTimeout(300);

    const bodyTextarea = await page.locator('[data-testid="editor-note-body"]');
    await bodyTextarea.fill('Discussed the new database migration strategy using absurder-sql for IndexedDB persistence.');

    const saveButton = await page.locator('[data-testid="save-note-button"]');
    await saveButton.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Created note with body content');

    // SEARCH: For word in body ("migration")
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('migration');
    await page.waitForTimeout(800);
    console.log('[E2E] Searched for "migration"');

    // VERIFY: Note found by body content
    const resultItems = await page.locator('[data-testid="search-result-item"]');
    const count = await resultItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
    console.log('[E2E] ✓ Found note by body content');

    // VERIFY: Result shows snippet/context
    const snippet = await resultItems.first().locator('[data-testid="result-snippet"]');
    await expect(snippet).toBeVisible();
    const snippetText = await snippet.textContent();
    expect(snippetText?.toLowerCase()).toContain('migration');
    console.log('[E2E] ✓ Result shows snippet with search term');
  });

  test('Clicking search result opens the note in editor', async ({ page }) => {
    console.log('[E2E] Starting search result click test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Unique note
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Unique Search Test Note');
    await createButton.click();
    await page.waitForTimeout(500);

    // Close the note if it auto-opened
    const cancelButton = await page.locator('[data-testid="cancel-edit-button"]');
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
      await page.waitForTimeout(300);
    }

    // SEARCH: For unique term
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('Unique Search Test');
    await page.waitForTimeout(800);
    console.log('[E2E] Searched for note');

    // CLICK: First result
    const firstResult = await page.locator('[data-testid="search-result-item"]').first();
    await firstResult.click();
    await page.waitForTimeout(500);
    console.log('[E2E] Clicked search result');

    // VERIFY: Note opened in center editor
    const editorTitle = await page.locator('[data-testid="editor-note-title"]');
    await expect(editorTitle).toBeVisible();

    const titleValue = await editorTitle.inputValue();
    expect(titleValue).toBe('Unique Search Test Note');
    console.log('[E2E] ✓ Note opened in editor with correct title');

    // VERIFY: Right sidebar shows metadata for opened note
    const metadata = await page.locator('[data-testid="metadata-created-date"]');
    await expect(metadata).toBeVisible();
    console.log('[E2E] ✓ Metadata visible for opened note');
  });

  test('Search shows empty state when no results found', async ({ page }) => {
    console.log('[E2E] Starting empty search results test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: One note
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Simple Note');
    await createButton.click();
    await page.waitForTimeout(500);

    // SEARCH: For term that doesn't exist
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('xyznonexistentquery123');
    await page.waitForTimeout(800);
    console.log('[E2E] Searched for non-existent term');

    // VERIFY: Empty state message
    const emptyState = await page.locator('[data-testid="search-empty-state"]');
    await expect(emptyState).toBeVisible();
    console.log('[E2E] ✓ Empty state visible');

    // VERIFY: No result items
    const resultItems = await page.locator('[data-testid="search-result-item"]');
    const count = await resultItems.count();
    expect(count).toBe(0);
    console.log('[E2E] ✓ No results shown');
  });

  test('Search clears when input is empty', async ({ page }) => {
    console.log('[E2E] Starting search clear test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Note
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Clearable Search Note');
    await createButton.click();
    await page.waitForTimeout(500);

    // SEARCH: Type query
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('Clearable');
    await page.waitForTimeout(800);

    // VERIFY: Results visible
    let searchResults = await page.locator('[data-testid="search-results"]');
    await expect(searchResults).toBeVisible();
    console.log('[E2E] ✓ Search results visible');

    // CLEAR: Search input
    await searchInput.fill('');
    await page.waitForTimeout(500);
    console.log('[E2E] Cleared search input');

    // VERIFY: Search results hidden or empty
    const resultItems = await page.locator('[data-testid="search-result-item"]');
    const count = await resultItems.count();
    expect(count).toBe(0);
    console.log('[E2E] ✓ Search results cleared');
  });

  test('Search is case-insensitive', async ({ page }) => {
    console.log('[E2E] Starting case-insensitive search test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Note with mixed case
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('JavaScript Programming');
    await createButton.click();
    await page.waitForTimeout(500);

    // SEARCH: Lowercase query
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('javascript');
    await page.waitForTimeout(800);
    console.log('[E2E] Searched for "javascript" (lowercase)');

    // VERIFY: Found the note
    const resultItems = await page.locator('[data-testid="search-result-item"]');
    const count = await resultItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
    console.log('[E2E] ✓ Case-insensitive search works');

    // SEARCH: UPPERCASE query
    await searchInput.fill('JAVASCRIPT');
    await page.waitForTimeout(800);
    console.log('[E2E] Searched for "JAVASCRIPT" (uppercase)');

    // VERIFY: Still found
    const count2 = await resultItems.count();
    expect(count2).toBeGreaterThanOrEqual(1);
    console.log('[E2E] ✓ Uppercase search also works');
  });

  test('Search highlights matching terms in results', async ({ page }) => {
    console.log('[E2E] Starting search highlighting test');

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // CREATE: Note
    const noteInput = await page.locator('[data-testid="note-title-input"]');
    const createButton = await page.locator('[data-testid="new-note-button"]');

    await noteInput.fill('Database Architecture');
    await createButton.click();
    await page.waitForTimeout(500);

    // Add body content
    const noteItem = await page.locator('[data-testid="note-item"]').first();
    await noteItem.click();
    await page.waitForTimeout(300);

    const bodyTextarea = await page.locator('[data-testid="editor-note-body"]');
    await bodyTextarea.fill('This note covers database design patterns and architecture principles.');

    const saveButton = await page.locator('[data-testid="save-note-button"]');
    await saveButton.click();
    await page.waitForTimeout(500);

    const cancelButton = await page.locator('[data-testid="cancel-edit-button"]');
    await cancelButton.click();
    await page.waitForTimeout(300);

    // SEARCH: For specific term
    const searchInput = await page.locator('[data-testid="search-input"]');
    await searchInput.fill('architecture');
    await page.waitForTimeout(800);
    console.log('[E2E] Searched for "architecture"');

    // VERIFY: Highlight element exists in result
    const highlight = await page.locator('[data-testid="search-result-item"] mark').first();
    await expect(highlight).toBeVisible();

    const highlightText = await highlight.textContent();
    expect(highlightText?.toLowerCase()).toContain('architecture');
    console.log('[E2E] ✓ Search term highlighted in results');
  });
});
