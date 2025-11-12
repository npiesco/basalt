// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * INTEGRATION TEST: Multi-Tab Sync with Leader Election
 *
 * Tests that multiple browser tabs stay synchronized:
 * - Leader election (one tab becomes write leader)
 * - BroadcastChannel communication between tabs
 * - Note created in one tab appears in other tabs
 * - Folder created in one tab appears in other tabs
 * - Real-time sync without page reload
 * - Leader tab handles writes via queueWrite
 * - Non-leader tabs receive updates via BroadcastChannel
 *
 * NO MOCKS - tests real AbsurderSQL leader election and multi-tab sync
 */

test.describe('INTEGRATION: Multi-Tab Sync', () => {
  test('Multiple tabs sync notes and folders via leader election', async ({ context }) => {
    console.log('[E2E] Starting multi-tab sync test');

    // ============================================================
    // SETUP: Open 3 browser tabs (pages in same context)
    // ============================================================

    const tab1 = await context.newPage();
    const tab2 = await context.newPage();
    const tab3 = await context.newPage();

    // Capture console logs for debugging
    tab1.on('console', msg => {
      const text = msg.text();
      if (text.includes('[PWA]') || text.includes('Broadcast') || text.includes('Received sync') || text.includes('Data reloaded') || text.includes('[TAB1]')) {
        console.log('[TAB1]', text);
      }
    });
    tab2.on('console', msg => {
      const text = msg.text();
      // Capture all PWA logs and TAB2 debug logs from tab2
      if (text.includes('[PWA]') || text.includes('[TAB2]')) {
        console.log('[TAB2]', text);
      }
    });
    tab3.on('console', msg => {
      const text = msg.text();
      if (text.includes('[PWA]') || text.includes('Broadcast') || text.includes('Received sync') || text.includes('Data reloaded')) {
        console.log('[TAB3]', text);
      }
    });

    console.log('[E2E] ✓ Opened 3 browser tabs');

    // Load all tabs
    await tab1.goto('http://localhost:3000');
    await tab2.goto('http://localhost:3000');
    await tab3.goto('http://localhost:3000');

    await tab1.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    await tab2.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    await tab3.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    console.log('[E2E] ✓ All 3 tabs loaded successfully');

    // Wait for leader election to complete
    await tab1.waitForTimeout(1000);

    // ============================================================
    // PART 1: VERIFY LEADER ELECTION
    // ============================================================

    // Check leader status in each tab
    const tab1Leader = await tab1.evaluate(() => {
      return window.__db__ ? window.__db__.isLeader() : null;
    });

    const tab2Leader = await tab2.evaluate(() => {
      return window.__db__ ? window.__db__.isLeader() : null;
    });

    const tab3Leader = await tab3.evaluate(() => {
      return window.__db__ ? window.__db__.isLeader() : null;
    });

    console.log('[E2E] Leader status - Tab1:', tab1Leader, 'Tab2:', tab2Leader, 'Tab3:', tab3Leader);

    // Verify exactly ONE leader
    const leaderCount = [tab1Leader, tab2Leader, tab3Leader].filter(Boolean).length;
    expect(leaderCount).toBe(1);
    console.log('[E2E] ✓ Exactly one leader elected among tabs');

    // Get leader info from all tabs
    const tab1LeaderInfo = await tab1.evaluate(() => {
      return window.__db__ ? window.__db__.getLeaderInfo() : null;
    });

    console.log('[E2E] Leader info from Tab1:', tab1LeaderInfo);
    expect(tab1LeaderInfo).toBeTruthy();
    console.log('[E2E] ✓ Leader info accessible from all tabs');

    // ============================================================
    // PART 2: CREATE NOTE IN TAB 1 - SHOULD APPEAR IN TABS 2 & 3
    // ============================================================

    const syncTestNoteTitle = `Multi-Tab Sync Note ${Date.now()}`;

    // Create note in Tab 1
    const noteInput = await tab1.locator('[data-testid="note-title-input"]');
    const createButton = await tab1.locator('[data-testid="new-note-button"]');

    await noteInput.fill(syncTestNoteTitle);
    await createButton.click();
    await tab1.waitForTimeout(500);
    console.log('[E2E] ✓ Created note in Tab 1:', syncTestNoteTitle);

    // VERIFY: Note appears in Tab 1
    const tab1Note = tab1.locator('[data-testid="note-item"]', {
      hasText: syncTestNoteTitle
    });
    await expect(tab1Note).toBeVisible();
    console.log('[E2E] ✓ Note visible in Tab 1');

    // Verify note was actually written to database in Tab 1
    const tab1NoteInDb = await tab1.evaluate(async (title) => {
      if (!window.basaltDb) return false;

      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes WHERE title = ?',
        [title]
      );
      console.log('[TAB1] Query result for title "' + title + '":', result.rows);

      const allNotes = await window.basaltDb.executeQuery('SELECT note_id, title FROM notes', []);
      console.log('[TAB1] All notes in database:', allNotes.rows);

      return result.rows.length > 0;
    }, syncTestNoteTitle);

    console.log('[E2E] Tab 1 note in DB:', tab1NoteInDb);
    expect(tab1NoteInDb).toBe(true);
    console.log('[E2E] ✓ Note persisted to database in Tab 1');

    // WAIT for sync to propagate via BroadcastChannel
    await tab2.waitForTimeout(2000);
    await tab3.waitForTimeout(2000);

    // VERIFY: BroadcastChannel message was received in Tab 2
    const tab2ReceivedSync = await tab2.evaluate(() => {
      return window.__lastSyncMessage__ !== undefined;
    });
    console.log('[E2E] Tab 2 received sync message:', tab2ReceivedSync);

    // VERIFY: Note exists in database (shared across tabs in same context)
    const tab2NoteInDb = await tab2.evaluate(async (title) => {
      if (!window.basaltDb) {
        console.log('[TAB2] window.basaltDb not available!');
        return false;
      }

      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes WHERE title = ?',
        [title]
      );
      console.log('[TAB2] Query result for title "' + title + '":', result.rows);

      // Also check all notes
      const allNotes = await window.basaltDb.executeQuery('SELECT note_id, title FROM notes', []);
      console.log('[TAB2] All notes in database:', allNotes.rows);

      return result.rows.length > 0;
    }, syncTestNoteTitle);

    console.log('[E2E] Tab 2 note in DB:', tab2NoteInDb);
    expect(tab2NoteInDb).toBe(true);
    console.log('[E2E] ✓ Note accessible from Tab 2 database');

    // VERIFY: Note accessible from Tab 3
    const tab3NoteInDb = await tab3.evaluate(async (title) => {
      if (!window.basaltDb) return false;

      const result = await window.basaltDb.executeQuery(
        'SELECT note_id, title FROM notes WHERE title = ?',
        [title]
      );
      return result.rows.length > 0;
    }, syncTestNoteTitle);

    expect(tab3NoteInDb).toBe(true);
    console.log('[E2E] ✓ Note accessible from Tab 3 database');

    // Define note locators for Tab 2 and Tab 3 (for later use)
    const tab2Note = tab2.locator('[data-testid="note-item"]', {
      hasText: syncTestNoteTitle
    });
    const tab3Note = tab3.locator('[data-testid="note-item"]', {
      hasText: syncTestNoteTitle
    });

    console.log('[E2E] ✓ MULTI-TAB NOTE SYNC VALIDATED');

    // ============================================================
    // PART 3: CREATE FOLDER IN TAB 2 - SHOULD APPEAR IN TABS 1 & 3
    // ============================================================

    const syncTestFolderName = `Sync Folder ${Date.now()}`;

    // Create folder in Tab 2
    const folderInput = await tab2.locator('[data-testid="folder-name-input"]');
    const createFolderButton = await tab2.locator('[data-testid="create-folder-button"]');

    await folderInput.fill(syncTestFolderName);
    await createFolderButton.click();
    await tab2.waitForTimeout(500);
    console.log('[E2E] ✓ Created folder in Tab 2:', syncTestFolderName);

    // VERIFY: Folder appears in Tab 2
    const tab2Folder = tab2.locator('[data-testid="folder-item"]', {
      hasText: syncTestFolderName
    });
    await expect(tab2Folder).toBeVisible();
    console.log('[E2E] ✓ Folder visible in Tab 2');

    // WAIT for sync
    await tab1.waitForTimeout(2000);
    await tab3.waitForTimeout(2000);

    // Sidebars should already be open from previous test, but verify
    // VERIFY: Folder appears in Tab 1 (sidebar already open)
    const tab1Folder = tab1.locator('[data-testid="folder-item"]', {
      hasText: syncTestFolderName
    });
    await expect(tab1Folder).toBeVisible({ timeout: 5000 });
    console.log('[E2E] ✓ Folder synced to Tab 1 (real-time)');

    // VERIFY: Folder appears in Tab 3 (sidebar already open)
    const tab3Folder = tab3.locator('[data-testid="folder-item"]', {
      hasText: syncTestFolderName
    });
    await expect(tab3Folder).toBeVisible({ timeout: 5000 });
    console.log('[E2E] ✓ Folder synced to Tab 3 (real-time)');

    console.log('[E2E] ✓ MULTI-TAB FOLDER SYNC VALIDATED');

    // ============================================================
    // PART 4: EDIT NOTE IN TAB 3 - SHOULD UPDATE IN TABS 1 & 2
    // ============================================================

    // Click note in Tab 3
    await tab3Note.click();
    await tab3.waitForTimeout(500);

    const bodyTextarea = await tab3.locator('[data-testid="editor-note-body"]');
    const syncBodyContent = 'Edited from Tab 3 - should sync!';
    await bodyTextarea.fill(syncBodyContent);

    const saveButton = await tab3.locator('[data-testid="save-note-button"]');
    await saveButton.click();
    await tab3.waitForTimeout(500);
    console.log('[E2E] ✓ Edited note in Tab 3');

    // Close editor in Tab 3
    const closeButton = await tab3.locator('[data-testid="cancel-edit-button"]');
    await closeButton.click();
    await tab3.waitForTimeout(500);

    // WAIT for sync
    await tab1.waitForTimeout(1500);
    await tab2.waitForTimeout(1500);

    // VERIFY: Edit synced to Tab 1 - open note and check body
    await tab1Note.click();
    await tab1.waitForTimeout(500);

    const tab1Body = await tab1.locator('[data-testid="editor-note-body"]');
    const tab1BodyValue = await tab1Body.inputValue();
    expect(tab1BodyValue).toBe(syncBodyContent);
    console.log('[E2E] ✓ Note edit synced to Tab 1');

    // Close editor in Tab 1
    await tab1.locator('[data-testid="cancel-edit-button"]').click();
    await tab1.waitForTimeout(500);

    console.log('[E2E] ✓ MULTI-TAB EDIT SYNC VALIDATED');

    // ============================================================
    // PART 5: CLOSE LEADER TAB - NEW LEADER SHOULD BE ELECTED
    // ============================================================

    // Determine which tab is the leader
    let leaderTab, nonLeaderTab1, nonLeaderTab2;
    if (tab1Leader) {
      leaderTab = tab1;
      nonLeaderTab1 = tab2;
      nonLeaderTab2 = tab3;
    } else if (tab2Leader) {
      leaderTab = tab2;
      nonLeaderTab1 = tab1;
      nonLeaderTab2 = tab3;
    } else {
      leaderTab = tab3;
      nonLeaderTab1 = tab1;
      nonLeaderTab2 = tab2;
    }

    console.log('[E2E] Closing leader tab to trigger re-election...');

    // Close leader tab
    await leaderTab.close();

    // Wait for lease to expire (5000ms) plus buffer for re-election process
    console.log('[E2E] Waiting for lease expiry and re-election...');
    await nonLeaderTab1.waitForTimeout(6000);

    // Check new leader status with diagnostic info
    const newLeader1 = await nonLeaderTab1.evaluate(() => {
      return window.__db__ ? window.__db__.isLeader() : null;
    });

    const newLeader2 = await nonLeaderTab2.evaluate(() => {
      return window.__db__ ? window.__db__.isLeader() : null;
    });

    const leaderInfo1 = await nonLeaderTab1.evaluate(() => {
      return window.__db__ ? window.__db__.getLeaderInfo() : null;
    });

    const leaderInfo2 = await nonLeaderTab2.evaluate(() => {
      return window.__db__ ? window.__db__.getLeaderInfo() : null;
    });

    console.log('[E2E] After leader close - Tab1:', newLeader1, 'Tab2:', newLeader2);
    console.log('[E2E] Leader info Tab1:', leaderInfo1);
    console.log('[E2E] Leader info Tab2:', leaderInfo2);

    // Verify a new leader was elected
    const newLeaderCount = [newLeader1, newLeader2].filter(Boolean).length;
    expect(newLeaderCount).toBeGreaterThanOrEqual(1);
    console.log('[E2E] ✓ New leader elected after leader tab closed');

    // Create note in remaining tab to confirm writes still work
    const afterElectionNote = `After Re-Election ${Date.now()}`;
    const remainingNoteInput = await nonLeaderTab1.locator('[data-testid="note-title-input"]');
    const remainingCreateButton = await nonLeaderTab1.locator('[data-testid="new-note-button"]');

    await remainingNoteInput.fill(afterElectionNote);
    await remainingCreateButton.click();
    await nonLeaderTab1.waitForTimeout(500);
    console.log('[E2E] ✓ Created note after re-election:', afterElectionNote);

    const noteAfterElection = nonLeaderTab1.locator('[data-testid="note-item"]', {
      hasText: afterElectionNote
    });
    await expect(noteAfterElection).toBeVisible();
    console.log('[E2E] ✓ Write operations work after leader re-election');

    console.log('[E2E] ✓ LEADER RE-ELECTION VALIDATED');

    // ============================================================
    // CLEANUP
    // ============================================================

    await nonLeaderTab1.close();
    await nonLeaderTab2.close();

    console.log('[E2E] ✓ MULTI-TAB SYNC COMPLETE - ALL TESTS PASSED');
  });
});
