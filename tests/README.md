# Integration Tests

## Real Integration Tests (NO MOCKS)

This directory contains REAL integration tests that use actual absurder-sql WASM, not mocks.

### Working Tests

#### ✅ `integration.simple.test.js`
- Tests basic CRUD operations with real absurder-sql
- Validates: DB init, migrations, INSERT, SELECT, UPDATE, DELETE
- **Status**: PASSING
- **Environment**: Node.js (with limitations)

#### ✅ `integration.export-only.test.js`
- Tests database export to SQLite .db file format
- Validates: Export produces valid SQLite file with correct header
- **Status**: PASSING ✅
- **Environment**: Node.js
- **Result**: Successfully exports 73,728 bytes with valid "SQLite format 3" header

#### ✅ `integration.fts5.test.js`
- Tests FTS5 Full-Text Search with real absurder-sql
- Validates: Basic search, UPDATE triggers, DELETE triggers, AND operators
- **Status**: ALL 4 TESTS PASSING ✅
- **Environment**: Node.js
- **Result**: FTS5 triggers work correctly, keeping index synchronized

### Known Limitations

#### ⚠️ Import Tests Require Browser Environment

**Why:** absurder-sql's `importFromFile()` requires IndexedDB, which is not available in Node.js.

**Tests Affected:**
- `integration.import-only.test.js` - times out in Node.js
- `integration.export-import.test.js` - import portion hangs

**Solution:** Import tests must run in a browser environment (Playwright, Puppeteer, or real browser).

**Workaround for CI/CD:**
1. Export tests work in Node.js ✅
2. Import tests need browser-based test runner
3. Consider Playwright for full E2E testing

### Test Environment

**Node.js Tests:**
- ✅ WASM initialization
- ✅ Database creation
- ✅ Migrations
- ✅ CRUD operations
- ✅ Export to .db file
- ❌ Import from .db file (requires IndexedDB)

**Browser Tests (TODO):**
- All Node.js features
- ✅ Import from .db file
- ✅ Multi-tab coordination
- ✅ IndexedDB persistence

### Running Tests

```bash
# Run all Node.js integration tests
npm test

# Run specific test
node --test tests/integration.simple.test.js
node --test tests/integration.export-only.test.js
```

### Future Work

1. Set up Playwright for browser-based integration tests
2. Test import functionality in real browser environment
3. Test multi-tab coordination
4. Test export/import round-trips in browser
