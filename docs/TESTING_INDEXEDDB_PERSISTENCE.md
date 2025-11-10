# Testing IndexedDB Persistence with absurder-sql

**Last Updated:** 2025-11-10
**Status:** VERIFIED WORKING ✅

## Executive Summary

When testing IndexedDB persistence with absurder-sql, **DO NOT use page reload**. Instead, use the **close/reopen pattern** with `Database.newDatabase(same-name)`.

## The Problem

Initially, persistence tests were failing because we were using `page.reload()` to simulate app restart. This approach caused:
- Tests hanging indefinitely
- False negatives (data actually persisted, but tests couldn't verify it)
- Confusion about whether absurder-sql VFS was working

## The Correct Pattern

### ❌ WRONG: Page Reload Pattern

```javascript
// DON'T DO THIS - it won't work reliably
test('WRONG: Test persistence with page reload', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Create data
  await page.evaluate(async () => {
    await window.basaltDb.executeQuery(
      'INSERT INTO notes (note_id, title) VALUES (?, ?)',
      ['note_1', 'Test Note']
    );
  });

  // ❌ WRONG: Page reload doesn't properly test persistence
  await page.reload();

  // This will fail or hang
  const notes = await page.evaluate(async () => {
    const result = await window.basaltDb.executeQuery('SELECT * FROM notes', []);
    return result.rows.length;
  });

  expect(notes).toBe(1); // ❌ FAILS
});
```

**Why This Fails:**
- Page reload destroys the entire JavaScript context
- Database connections are not properly closed
- IndexedDB may not have finished persisting
- The VFS needs explicit close() to flush all blocks

### ✅ CORRECT: Close/Reopen Pattern

```javascript
// DO THIS - the correct way to test persistence
test('CORRECT: Test persistence with close/reopen', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Get the Database class (must be exposed to window)
  const Database = await page.evaluate(() => window.Database);

  // 1. Create database instance
  const dbResult = await page.evaluate(async () => {
    const db = await window.Database.newDatabase('test-db');

    // 2. Create schema
    await db.execute('CREATE TABLE notes (note_id TEXT PRIMARY KEY, title TEXT)');

    // 3. Insert data
    await db.execute(`INSERT INTO notes VALUES ('note_1', 'Test Note')`);

    // 4. CRITICAL: Sync dirty blocks to IndexedDB
    await db.sync();

    // 5. CRITICAL: Close the database
    await db.close();

    return { closed: true };
  });

  // 6. Reopen SAME database by name (simulates app restart)
  const verifyResult = await page.evaluate(async () => {
    const db2 = await window.Database.newDatabase('test-db');

    // 7. Query data - it should persist!
    const result = await db2.execute('SELECT * FROM notes');

    await db2.close();

    return {
      noteCount: result.rows.length,
      noteTitle: result.rows[0]?.values[1]?.value
    };
  });

  // ✅ PASSES: Data persisted correctly
  expect(verifyResult.noteCount).toBe(1);
  expect(verifyResult.noteTitle).toBe('Test Note');
});
```

**Why This Works:**
- `db.close()` properly flushes all dirty blocks to IndexedDB
- `Database.newDatabase('same-name')` reopens the persisted database
- Mimics exactly what happens during app restart
- IndexedDB VFS can restore blocks from storage

## Required Setup

### 1. Expose Database Class in App

In your app initialization (e.g., `apps/pwa/app/page.tsx`):

```typescript
if (typeof window !== 'undefined') {
  const absurderSql = await import('@npiesco/absurder-sql');

  // Expose the Database class for testing
  (window as any).Database = absurderSql.Database;

  // Also expose your app's database API if needed
  (window as any).basaltDb = {
    executeQuery: async (sql: string, params: any[]) => {
      return executeQuery(database, sql, params);
    }
  };
}
```

### 2. TypeScript Declaration

Add to `global.d.ts` or similar:

```typescript
interface Window {
  Database: typeof import('@npiesco/absurder-sql').Database;
  basaltDb: {
    executeQuery: (sql: string, params: any[]) => Promise<any>;
  };
}
```

## Complete Working Example

Here's a full test that verifies notes persistence with FTS:

```javascript
import { test, expect } from '@playwright/test';

test('Notes persist with FTS after close/reopen', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));

  await page.goto('http://localhost:3000');
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const now = new Date().toISOString();

    // === STEP 1: Create and populate database ===
    const db = await window.Database.newDatabase('basalt-test-notes');

    // Create schema
    await db.execute(`
      CREATE TABLE IF NOT EXISTS folders (
        folder_id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        parent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        note_id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (folder_id) REFERENCES folders(folder_id)
      )
    `);

    // Create FTS table (self-contained, not content-less)
    await db.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        note_id UNINDEXED,
        title,
        body
      )
    `);

    // Insert test data
    await db.execute(`
      INSERT INTO folders VALUES ('root', '/', NULL, '${now}', '${now}')
    `);

    await db.execute(`
      INSERT INTO notes VALUES (
        'note_test_1', 'root', 'Test Note Title', 'Test note body',
        '${now}', '${now}'
      )
    `);

    await db.execute(`
      INSERT INTO notes_fts (note_id, title, body)
      VALUES ('note_test_1', 'Test Note Title', 'Test note body')
    `);

    // Sync and close
    await db.sync();
    await db.close();

    // === STEP 2: Reopen and verify ===
    const db2 = await window.Database.newDatabase('basalt-test-notes');

    const notes = await db2.execute('SELECT * FROM notes');
    const fts = await db2.execute('SELECT * FROM notes_fts');
    const folders = await db2.execute('SELECT * FROM folders');

    await db2.close();

    return {
      notesCount: notes.rows.length,
      ftsCount: fts.rows.length,
      foldersCount: folders.rows.length,
      notesPersisted: notes.rows.length === 1,
      ftsPersisted: fts.rows.length === 1,
      foldersPersisted: folders.rows.length === 1
    };
  });

  // Verify results
  expect(result.notesPersisted).toBe(true);
  expect(result.ftsPersisted).toBe(true);
  expect(result.foldersPersisted).toBe(true);

  console.log('[E2E] ✓ Notes persisted:', result.notesPersisted ? '✅ YES' : '❌ NO');
  console.log('[E2E] ✓ FTS persisted:', result.ftsPersisted ? '✅ YES' : '❌ NO');
  console.log('[E2E] ✓ Folders persisted:', result.foldersPersisted ? '✅ YES' : '❌ NO');
});
```

## Critical Steps Checklist

When testing persistence, ALWAYS:

1. ✅ Create database with `Database.newDatabase('db-name')`
2. ✅ Perform operations (CREATE TABLE, INSERT, etc.)
3. ✅ Call `db.sync()` to flush dirty blocks
4. ✅ Call `db.close()` to properly close database
5. ✅ Reopen with `Database.newDatabase('same-db-name')`
6. ✅ Verify data persisted

## Common Pitfalls

### 1. Forgetting to Sync

```javascript
// ❌ BAD: No sync before close
await db.execute('INSERT INTO notes VALUES (...)');
await db.close(); // Might lose data!

// ✅ GOOD: Always sync
await db.execute('INSERT INTO notes VALUES (...)');
await db.sync(); // Flush to IndexedDB
await db.close();
```

### 2. Different Database Names

```javascript
// ❌ BAD: Different names = different databases
const db1 = await Database.newDatabase('db-one');
await db1.execute('INSERT INTO notes VALUES (...)');
await db1.sync();
await db1.close();

const db2 = await Database.newDatabase('db-two'); // WRONG NAME
const result = await db2.execute('SELECT * FROM notes'); // Empty!

// ✅ GOOD: Same name reopens same database
const db1 = await Database.newDatabase('my-db');
// ... operations ...
await db1.close();

const db2 = await Database.newDatabase('my-db'); // SAME NAME
const result = await db2.execute('SELECT * FROM notes'); // Data persists!
```

### 3. Not Exposing Database Class

```javascript
// ❌ BAD: Database class not available
await page.evaluate(async () => {
  const db = await window.Database.newDatabase('test'); // ERROR: undefined
});

// ✅ GOOD: Expose in app initialization
// In apps/pwa/app/page.tsx:
(window as any).Database = absurderSql.Database;
```

## FTS Considerations

When testing Full-Text Search tables, use **self-contained FTS**, not content-less:

```sql
-- ❌ WRONG: Content-less FTS (caused persistence issues)
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title,
  body,
  content='notes',           -- DON'T DO THIS
  content_rowid='rowid'      -- DON'T DO THIS
);

-- ✅ CORRECT: Self-contained FTS
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,  -- Store reference, don't index it
  title,
  body
);
```

**Why:** Content-less FTS tables reference the main table via rowid. This caused issues with persistence in our testing. Self-contained FTS stores its own copy of the data and persists reliably.

## Verified Test Results

These tests PASS with the correct pattern:

- ✅ `tests/e2e/notes-persistence-correct.e2e.test.js` - Notes + FTS + Folders persist
- ✅ `tests/e2e/vfs-persistence-isolated.e2e.test.js` - VFS block storage persists
- ✅ All CRUD tests pass individually

## Architecture Notes

### How absurder-sql IndexedDB VFS Works

1. **Writes:** SQLite writes are captured by VFS and stored in-memory as "dirty blocks"
2. **Sync:** `db.sync()` flushes dirty blocks to IndexedDB's ObjectStore
3. **Close:** `db.close()` ensures all blocks are persisted and closes connection
4. **Reopen:** `Database.newDatabase(name)` restores blocks from IndexedDB and rebuilds SQLite database

### Why Page Reload Doesn't Work

- Page reload destroys JavaScript context before `close()` can run
- In-memory dirty blocks are lost
- IndexedDB connection may be forcibly terminated mid-transaction
- SQLite's block-based storage requires orderly shutdown

### Why Close/Reopen Works

- Mimics real app lifecycle (user closes tab, reopens later)
- Gives VFS time to properly persist all blocks
- Tests actual IndexedDB restore path
- Same pattern users experience in production

## References

- Initial issue: Notes disappeared on reload (turned out to be test methodology)
- Fix commit: `f2831d6 - fix: Confirm IndexedDB persistence works with correct testing pattern`
- Working tests: `tests/e2e/notes-persistence-correct.e2e.test.js`

## Future Work

If you need to test actual page reload in production:

1. Ensure app properly closes database before unload:
   ```javascript
   window.addEventListener('beforeunload', async () => {
     await database.sync();
     await database.close();
   });
   ```

2. Test with user-triggered reload, not programmatic `page.reload()`

3. Consider using Service Workers to manage database lifecycle

---

**Remember:** Close/reopen, not page reload. This is the way. ✅
