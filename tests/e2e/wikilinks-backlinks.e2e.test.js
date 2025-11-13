// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E TEST: Wikilinks and Backlinks
 *
 * Tests the complete wikilink → backlink workflow:
 * 1. Create notes with [[wikilinks]] in the body
 * 2. Verify wikilinks are parsed and stored in backlinks table
 * 3. Display backlinks panel showing referring notes
 * 4. Click backlinks to navigate between notes
 *
 * NO MOCKS - tests real wikilink parsing, real database persistence, real UI
 */

test.describe('INTEGRATION: Wikilinks and Backlinks', () => {
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

  test('Parse wikilinks when saving note and store in backlinks table', async ({ page }) => {
    console.log('[E2E] Starting wikilink parsing test');

    // Create note-1 (target note)
    const note1Title = `Meeting Notes ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note1Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note-1:', note1Title);

    // Get note-1 ID from database
    const note1Id = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, note1Title);
    console.log('[E2E] ✓ note-1 ID:', note1Id);

    // Create note-2 with wikilink to note-1
    const note2Title = `Project Plan ${Date.now()}`;
    const note2Body = `This references [[${note1Id}]] and also mentions [[${note1Id}]] again.`;

    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    // Click note-2 to edit it
    await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).click();
    await page.waitForTimeout(300);

    // Fill body with wikilinks
    await page.locator('[data-testid="note-body-textarea"]').fill(note2Body);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note-2 with wikilinks:', note2Title);

    // Verify backlinks were created in database
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

    console.log('[E2E] Backlinks in database:', backlinks);
    expect(backlinks.length).toBeGreaterThan(0);
    expect(backlinks[0].target).toBe(note1Id);
    console.log('[E2E] ✓✓✓ WIKILINKS PARSED AND STORED AS BACKLINKS!');
  });

  test('Display backlinks panel showing notes that reference current note', async ({ page }) => {
    console.log('[E2E] Starting backlinks panel display test');

    // Create note-1 (target)
    const note1Title = `Architecture Doc ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(note1Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const note1Id = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, note1Title);

    // Create note-2 that references note-1
    const note2Title = `Implementation ${Date.now()}`;
    const note2Body = `Follow the design in [[${note1Id}]] for the architecture.`;

    await page.locator('[data-testid="note-title-input"]').fill(note2Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${note2Title}")`).click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="note-body-textarea"]').fill(note2Body);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note-2 referencing note-1');

    // Create note-3 that also references note-1
    const note3Title = `Testing Strategy ${Date.now()}`;
    const note3Body = `Based on [[${note1Id}]], we should test these components.`;

    await page.locator('[data-testid="note-title-input"]').fill(note3Title);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${note3Title}")`).click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="note-body-textarea"]').fill(note3Body);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);
    console.log('[E2E] ✓ Created note-3 referencing note-1');

    // NOW click note-1 to view its backlinks
    await page.locator(`[data-testid="note-item"]:has-text("${note1Title}")`).click();
    await page.waitForTimeout(500);

    // Check backlinks panel exists and shows referring notes
    await expect(page.locator('[data-testid="backlinks-panel"]')).toBeVisible();

    const backlinkCount = await page.locator('[data-testid="backlink-item"]').count();
    expect(backlinkCount).toBe(2); // note-2 and note-3

    // Verify backlink items show note titles (order doesn't matter - DESC by created_at)
    const backlinkTexts = await page.locator('[data-testid="backlink-item"]').allTextContents();
    const hasNote2 = backlinkTexts.some(text => text.includes(note2Title));
    const hasNote3 = backlinkTexts.some(text => text.includes(note3Title));
    expect(hasNote2).toBe(true);
    expect(hasNote3).toBe(true);

    console.log('[E2E] ✓✓✓ BACKLINKS PANEL DISPLAYS REFERRING NOTES!');
  });

  test('Click backlink to navigate to referring note', async ({ page }) => {
    console.log('[E2E] Starting backlink navigation test');

    // Create note-A (target)
    const noteATitle = `Core Concept ${Date.now()}`;
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

    // Create note-B that references note-A
    const noteBTitle = `Extended Learning ${Date.now()}`;
    const noteBBody = `This builds on [[${noteAId}]] with additional examples.`;

    await page.locator('[data-testid="note-title-input"]').fill(noteBTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteBTitle}")`).click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="note-body-textarea"]').fill(noteBBody);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    // Click note-A to see backlinks
    await page.locator(`[data-testid="note-item"]:has-text("${noteATitle}")`).click();
    await page.waitForTimeout(500);

    // Verify backlink to note-B exists
    await expect(page.locator('[data-testid="backlink-item"]').first()).toBeVisible();

    // Click the backlink
    await page.locator('[data-testid="backlink-item"]').first().click();
    await page.waitForTimeout(500);

    // Verify we navigated to note-B (editor shows note-B)
    const currentNoteTitle = await page.locator('[data-testid="note-title-display"]').textContent();
    expect(currentNoteTitle).toContain(noteBTitle);

    console.log('[E2E] ✓✓✓ BACKLINK NAVIGATION WORKS!');
  });

  test('Update note body to add new wikilinks', async ({ page }) => {
    console.log('[E2E] Starting wikilink update test');

    // Create two target notes
    const targetTitle1 = `Target One ${Date.now()}`;
    const targetTitle2 = `Target Two ${Date.now() + 1}`;

    await page.locator('[data-testid="note-title-input"]').fill(targetTitle1);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const targetId1 = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, targetTitle1);

    await page.locator('[data-testid="note-title-input"]').fill(targetTitle2);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const targetId2 = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, targetTitle2);

    // Create source note with one wikilink
    const sourceTitle = `Source Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(sourceTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${sourceTitle}")`).click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-body-textarea"]').fill(`References [[${targetId1}]]`);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    // Verify 1 backlink exists for target1
    const backlinksBeforeUpdate = await page.evaluate(async (targetId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM backlinks WHERE target_note_id = ?',
        [targetId]
      );
      return result.rows[0].values[0].value;
    }, targetId1);
    expect(backlinksBeforeUpdate).toBe(1);

    // UPDATE the note to add another wikilink
    await page.locator(`[data-testid="note-item"]:has-text("${sourceTitle}")`).click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="note-body-textarea"]').fill(
      `References [[${targetId1}]] and [[${targetId2}]]`
    );
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    // Verify 2 backlinks now exist (one for each target)
    const backlinksAfterUpdate = await page.evaluate(async () => {
      const result = await window.basaltDb.executeQuery(
        'SELECT target_note_id FROM backlinks',
        []
      );
      return result.rows.map(row => row.values[0].value);
    });

    console.log('[E2E] Backlinks after update:', backlinksAfterUpdate);
    expect(backlinksAfterUpdate.length).toBe(2);
    expect(backlinksAfterUpdate).toContain(targetId1);
    expect(backlinksAfterUpdate).toContain(targetId2);

    console.log('[E2E] ✓✓✓ WIKILINK UPDATE WORKS!');
  });

  test('Delete note removes its backlinks from database', async ({ page }) => {
    console.log('[E2E] Starting backlink deletion test');

    // Create target note
    const targetTitle = `Delete Target ${Date.now()}`;
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

    // Create source note with backlink
    const sourceTitle = `Delete Source ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(sourceTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const sourceId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, sourceTitle);

    await page.locator(`[data-testid="note-item"]:has-text("${sourceTitle}")`).click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="note-body-textarea"]').fill(`Links to [[${targetId}]]`);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    // Check if foreign keys are enabled
    const fkEnabled = await page.evaluate(async () => {
      const result = await window.basaltDb.executeQuery('PRAGMA foreign_keys', []);
      return result.rows[0]?.values[0]?.value;
    });
    console.log('[E2E] Foreign keys enabled:', fkEnabled);

    // Verify backlink exists for this specific note
    const backlinksBeforeDelete = await page.evaluate(async (srcId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM backlinks WHERE source_note_id = ?',
        [srcId]
      );
      return result.rows[0].values[0].value;
    }, sourceId);
    console.log('[E2E] Backlinks before delete:', backlinksBeforeDelete);
    expect(backlinksBeforeDelete).toBeGreaterThan(0);

    // Delete source note
    await page.locator(`[data-testid="note-item"]:has-text("${sourceTitle}")`).click();
    await page.waitForTimeout(300);

    // Click delete button to open confirmation dialog
    await page.locator('[data-testid="delete-note-button"]').first().click();
    await page.waitForTimeout(300);

    // Click confirm button in the React confirmation dialog
    await page.locator('[data-testid="confirm-delete-button"]').click();
    await page.waitForTimeout(500);

    // Verify note was actually deleted
    const noteExists = await page.evaluate(async (srcId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM notes WHERE note_id = ?',
        [srcId]
      );
      return result.rows[0].values[0].value;
    }, sourceId);
    console.log('[E2E] Note exists after delete:', noteExists);

    // Verify backlinks for deleted note are CASCADE deleted
    const backlinksAfterDelete = await page.evaluate(async (srcId) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT COUNT(*) as count FROM backlinks WHERE source_note_id = ?',
        [srcId]
      );
      return result.rows[0].values[0].value;
    }, sourceId);
    console.log('[E2E] Backlinks after delete:', backlinksAfterDelete);
    expect(backlinksAfterDelete).toBe(0);

    console.log('[E2E] ✓✓✓ BACKLINK CASCADE DELETE WORKS!');
  });
});
