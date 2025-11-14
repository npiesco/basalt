// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E TEST: Graph View Visualization
 *
 * Tests the complete graph view workflow:
 * 1. Open graph view panel/modal
 * 2. Render nodes for all notes
 * 3. Render edges based on backlinks
 * 4. Click nodes to navigate
 * 5. Dynamic updates when notes/links change
 *
 * NO MOCKS - tests real Cytoscape.js rendering, real backlinks data, real UI
 */

test.describe('INTEGRATION: Graph View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });

    // Clear database before each test for isolation
    await page.evaluate(async () => {
      await window.basaltDb.clearDatabase();
    });
    console.log('[TEST] Database cleared, reloading page for clean state');

    // Reload page to ensure clean state after database clear
    await page.reload();
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });
    await page.waitForTimeout(500); // Extra wait for UI to stabilize
  });

  test('Open graph view and render nodes for all notes', async ({ page }) => {
    console.log('[E2E] Starting graph view basic rendering test');

    // Create 3 notes
    const note1Title = `Core Concepts ${Date.now()}`;
    const note2Title = `Advanced Topics ${Date.now() + 1}`;
    const note3Title = `Examples ${Date.now() + 2}`;

    await page.locator('[data-testid="note-title-input"]').fill(note1Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-title-input"]').fill(note3Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    // Open graph view
    await expect(page.locator('[data-testid="graph-view-button"]')).toBeVisible();
    await page.locator('[data-testid="graph-view-button"]').click();
    await page.waitForTimeout(500);

    // Verify graph view panel is visible
    await expect(page.locator('[data-testid="graph-view-panel"]')).toBeVisible();

    // Verify Cytoscape container exists
    await expect(page.locator('[data-testid="graph-container"]')).toBeVisible();

    // Verify 3 nodes are rendered (check via data attribute or graph state)
    const nodeCount = await page.evaluate(() => {
      return window.cy ? window.cy.nodes().length : 0;
    });
    expect(nodeCount).toBe(3);

    console.log('[E2E] ✓✓✓ GRAPH VIEW RENDERS NODES!');
  });

  test('Render edges based on backlinks between notes', async ({ page }) => {
    console.log('[E2E] Starting graph edges rendering test');

    // Create note 1 (target)
    const note1Title = `Architecture ${Date.now()}`;
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

    // Create note 2 that links to note 1
    const note2Title = `Implementation ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).click();
    await page.waitForTimeout(300);

    // Use CodeMirror editor
    await page.waitForSelector('.cm-content');
    let cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type(`See [[${note1Id}]] for details.`);

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Create note 3 that also links to note 1
    const note3Title = `Testing ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note3Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    await page.locator(`[data-testid="note-item"]:has-text("${note3Title}")`).click();
    await page.waitForTimeout(300);

    // Use CodeMirror editor
    await page.waitForSelector('.cm-content');
    cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type(`Based on [[${note1Id}]].`);

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Open graph view
    await page.locator('[data-testid="graph-view-button"]').click();
    await page.waitForTimeout(500);

    // Verify edges are rendered
    const edgeCount = await page.evaluate(() => {
      return window.cy ? window.cy.edges().length : 0;
    });
    expect(edgeCount).toBe(2); // 2 backlinks to note 1

    console.log('[E2E] ✓✓✓ GRAPH EDGES RENDERED FROM BACKLINKS!');
  });

  test('Click node to navigate to that note', async ({ page }) => {
    console.log('[E2E] Starting graph node click navigation test');

    // Create 2 notes
    const note1Title = `Design Patterns ${Date.now()}`;
    const note2Title = `SOLID Principles ${Date.now() + 1}`;

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

    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    // Open graph view
    await page.locator('[data-testid="graph-view-button"]').click();
    await page.waitForTimeout(500);

    // Click node 1 in the graph
    await page.evaluate((noteId) => {
      if (window.cy) {
        const node = window.cy.$(`#${noteId}`);
        node.trigger('tap'); // Cytoscape tap event
      }
    }, note1Id);

    // Wait for graph view to close
    await expect(page.locator('[data-testid="graph-view-panel"]')).not.toBeVisible();
    await page.waitForTimeout(300);

    // Verify note 1 is now selected in editor (check the visible input value)
    await expect(page.locator('[data-testid="edit-title-input"]')).toBeVisible();
    const selectedTitle = await page.locator('[data-testid="edit-title-input"]').inputValue();
    expect(selectedTitle).toContain(note1Title);

    console.log('[E2E] ✓✓✓ GRAPH NODE NAVIGATION WORKS!');
  });

  test('Graph updates dynamically when adding new backlinks', async ({ page }) => {
    console.log('[E2E] Starting graph dynamic update test');

    // Create 2 notes initially
    const note1Title = `Database ${Date.now()}`;
    const note2Title = `API ${Date.now() + 1}`;

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

    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    // Open graph view
    await page.locator('[data-testid="graph-view-button"]').click();
    await page.waitForTimeout(500);

    // Verify initial state: 2 nodes, 0 edges
    let nodeCount = await page.evaluate(() => window.cy ? window.cy.nodes().length : 0);
    let edgeCount = await page.evaluate(() => window.cy ? window.cy.edges().length : 0);
    expect(nodeCount).toBe(2);
    expect(edgeCount).toBe(0);

    // Close graph view
    await page.locator('[data-testid="close-graph-view"]').click();
    await page.waitForTimeout(300);

    // Add backlink from note2 to note1
    await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).click();
    await page.waitForTimeout(300);

    // Use CodeMirror editor
    await page.waitForSelector('.cm-content');
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type(`Connects to [[${note1Id}]].`);

    // Wait for autosave
    await page.waitForTimeout(3500);
    await page.waitForSelector('[data-testid="autosave-indicator"]:has-text("Saved")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Reopen graph view
    await page.locator('[data-testid="graph-view-button"]').click();
    await page.waitForTimeout(500);

    // Verify updated state: 2 nodes, 1 edge
    nodeCount = await page.evaluate(() => window.cy ? window.cy.nodes().length : 0);
    edgeCount = await page.evaluate(() => window.cy ? window.cy.edges().length : 0);
    expect(nodeCount).toBe(2);
    expect(edgeCount).toBe(1);

    console.log('[E2E] ✓✓✓ GRAPH DYNAMIC UPDATES WORK!');
  });

  test('Close graph view and return to normal editor', async ({ page }) => {
    console.log('[E2E] Starting graph view close test');

    // Create 1 note
    const noteTitle = `Test Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(300);

    // Open graph view
    await page.locator('[data-testid="graph-view-button"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="graph-view-panel"]')).toBeVisible();

    // Close graph view
    await page.locator('[data-testid="close-graph-view"]').click();
    await page.waitForTimeout(300);

    // Verify graph panel is hidden
    await expect(page.locator('[data-testid="graph-view-panel"]')).not.toBeVisible();

    // Verify normal editor is still visible
    await expect(page.locator('[data-testid="note-title-input"]')).toBeVisible();

    console.log('[E2E] ✓✓✓ GRAPH VIEW CLOSE WORKS!');
  });
});
