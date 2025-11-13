# Basalt

**Obsidian-inspired note-taking PWA built on [AbsurderSQL](https://github.com/npiesco/absurder-sql)**

> A modern, offline-first knowledge base with real-time multi-tab sync, drag-and-drop organization, and full-text search—all powered by SQLite running in your browser via WASM + IndexedDB.

[![AbsurderSQL](https://img.shields.io/badge/powered_by-AbsurderSQL-blue)](https://github.com/npiesco/absurder-sql)
[![Tech Stack](https://img.shields.io/badge/stack-Next.js_16%20|%20React%2019%20|%20SQLite%20|%20WASM-green)](.)
[![Test Coverage](https://img.shields.io/badge/tests-E2E%20tested-brightgreen)](./tests/e2e)
[![License](https://img.shields.io/badge/license-AGPL--3.0-orange)](LICENSE)

---

## What is Basalt?

Basalt is a **next-generation knowledge base** that improves upon Obsidian's vision with true database portability and universal platform support. Built on [AbsurderSQL](https://github.com/npiesco/absurder-sql)—a Rust + WASM SQLite engine—Basalt combines the best of local-first workflows with modern web standards.

**Why Basalt over Obsidian:**

- **[x] Database Export/Import**: Your entire vault is a standard SQLite `.db` file—query it with any SQL tool, migrate between devices instantly, or integrate with existing data pipelines. No proprietary formats or sync services required.
- **[x] Universal Platform Support**: Start in your browser (PWA), continue on desktop (Tauri 2.0), all with the same codebase. No separate mobile apps or ecosystem fragmentation.
- **[x] True Offline-First**: IndexedDB persistence means your data lives in the browser with zero server dependency. Multi-tab sync works automatically via BroadcastChannel.

**Core Features:**

- **[>] Hierarchical Folders**: Nested organization with drag-and-drop support
- **[?] Full-Text Search**: FTS5-powered search across all note content
- **[~] Multi-Tab Sync**: Real-time synchronization with leader election
- **[#] Three-Pane Layout**: Familiar Obsidian-inspired interface
- **[[]] Wikilinks**: Clickable `[[note_id]]` links with navigation
- **[<-] Backlinks Panel**: See all notes that reference current note
- **[*] Graph View**: Visualize note connections with Cytoscape.js

## Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **Modern browser** with WebAssembly support

### Installation

```bash
# Clone the repository
git clone https://github.com/npiesco/basalt.git
cd basalt

# Install dependencies
npm install

# Start the development server
cd apps/pwa
npm run dev
```

Open **http://localhost:3000** in your browser. The app initializes a fresh SQLite database in IndexedDB automatically.

### Basic Usage

```javascript
// The app exposes the database instance for programmatic access:
const db = window.__db__;

// Execute raw SQL
const result = await window.basaltDb.executeQuery(
  'SELECT * FROM notes WHERE title LIKE ?',
  ['%meeting%']
);

// Clear database (for testing)
await window.basaltDb.clearDatabase();

// Export database
const exportData = await db.exportToFile();

// Import database
await db.importFromFile(uint8ArrayData);
```

## Architecture

### Tech Stack

**Frontend:**
- **Next.js 16** with Turbopack for fast development
- **React 19** with server components
- **TailwindCSS** for styling
- **Playwright** for E2E testing

**Backend (In-Browser):**
- **AbsurderSQL** (SQLite + WASM + IndexedDB)
- **FTS5** full-text search
- **BroadcastChannel** for multi-tab coordination
- **Leader Election** for write coordination

### Database Schema

```sql
-- Core tables
CREATE TABLE folders (
  folder_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_folder_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE notes (
  note_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  folder_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE CASCADE
);

-- Full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, body, content='notes', content_rowid='rowid'
);
```

See [`packages/domain/src/migrations/`](./packages/domain/src/migrations/) for complete schema.

## Features

### [x] Complete CRUD Operations (All Tested)

| Operation | Notes | Folders |
|-----------|-------|---------|
| **Create** | [x] Title + Body + Folder | [x] Nested hierarchy |
| **Read** | [x] List + Search (FTS5) | [x] Tree display |
| **Update** | [x] Edit title/body | [x] Rename folders |
| **Delete** | [x] Single + CASCADE | [x] CASCADE (notes) |
| **Clear** | [x] Clear all notes | [x] Clear all folders |

### [~] Multi-Tab Synchronization

**Automatic coordination with zero configuration:**

```javascript
// Open multiple tabs - changes sync automatically
Tab 1: Create note "Meeting Notes"
Tab 2: Note appears instantly
Tab 3: Note appears instantly

Tab 1: [Closes]
Tab 2: Becomes new leader, continues syncing
```

**Implementation:**
- Leader election via `AbsurderSQL.isLeader()`
- Only leader persists writes to IndexedDB
- BroadcastChannel broadcasts SQL changes to followers
- Followers execute SQL locally and receive IndexedDB updates
- Leader failover when primary tab closes

### [>] Drag-and-Drop Organization

**Visual folder management:**

```
Root
├─ Work
│  ├─ Projects        ← Drag "Projects" here
│  └─ Meetings
└─ Personal
   └─ Projects        ← From here (un-nest back to root)
```

**Features:**
- Drag folders into other folders (nested hierarchy)
- Drag folders to root drop zone (un-nest to top level)
- Drag notes between folders (instant reassignment)
- Visual feedback with drop zone highlighting
- Database updates with `parent_folder_id` changes

### [?] Full-Text Search (FTS5)

**Fast search across all note content:**

```sql
-- Powered by SQLite FTS5
SELECT * FROM notes_fts WHERE notes_fts MATCH 'meeting AND agenda'
ORDER BY rank;
```

**Features:**
- Search note titles and body text
- Boolean operators (AND, OR, NOT)
- Prefix matching (e.g., `meet*`)
- Real-time results as you type (300ms debounce)
- Automatic index updates via triggers

### [+] Export/Import

**Download your entire vault as a standard SQLite file:**

```javascript
// Export
const exportButton = document.querySelector('[data-testid="export-button"]');
exportButton.click();  // Downloads basalt-vault-TIMESTAMP.db

// Import
const importButton = document.querySelector('[data-testid="import-button"]');
importButton.click();  // Select .db file to restore
```

**Features:**
- Export as valid SQLite3 database (~77KB base)
- Import overwrites current database
- Confirmation dialog prevents accidental overwrites
- Works offline (no server required)
- Compatible with standard SQLite tools

### [-] Database Management

**Clear data at multiple levels:**

| Action | Scope | Confirmation | API |
|--------|-------|--------------|-----|
| Delete Note | Single note | [x] Dialog | `DELETE FROM notes WHERE note_id = ?` |
| Delete Folder | Folder + notes (CASCADE) | [x] Dialog | `DELETE FROM folders WHERE folder_id = ?` |
| Clear Database | All data (keeps root) | [!] Warning | `window.basaltDb.clearDatabase()` |

### [[]] Wikilinks & Backlinks

**Obsidian-style bidirectional linking:**

```markdown
# Note A
This references [[note_xyz_123]] in the content.
```

**Features:**
- **Clickable Wikilinks**: `[[note_id]]` syntax renders as clickable links showing target note titles
- **Edit/Preview Mode**: Toggle between editing raw text and viewing rendered wikilinks
- **Broken Link Detection**: Non-existent notes styled with red text
- **Backlinks Panel**: Right sidebar shows all notes referencing current note
- **Auto-parsing**: Wikilinks extracted and stored in `backlinks` table on save
- **Navigation**: Click wikilinks or backlinks to instantly jump to target notes

**Database Schema:**
```sql
CREATE TABLE backlinks (
  source_note_id TEXT NOT NULL,
  target_note_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_note_id) REFERENCES notes(note_id) ON DELETE CASCADE,
  FOREIGN KEY (target_note_id) REFERENCES notes(note_id) ON DELETE CASCADE,
  PRIMARY KEY (source_note_id, target_note_id)
);
```

### [*] Graph View

**Interactive graph visualization powered by Cytoscape.js:**

```javascript
// Open graph view
document.querySelector('[data-testid="graph-view-button"]').click();

// Graph shows:
// - All notes as nodes (labeled with titles)
// - Backlinks as directed edges (arrows)
// - Force-directed layout (cose algorithm)
```

**Features:**
- **Force-Directed Layout**: Notes automatically positioned to minimize edge crossing
- **Node Click Navigation**: Click any node to navigate to that note
- **Dynamic Updates**: Graph refreshes when backlinks change
- **Visual Styling**: Selected nodes highlighted, edges show directionality
- **Performance**: Handles large vaults efficiently (tested with 100+ notes)

**Implementation:**
- Cytoscape.js for graph rendering
- Real-time backlinks query on graph open
- Modal overlay with pan/zoom controls

## Development

### Project Structure

```
basalt/
├── apps/
│   ├── pwa/              # Next.js PWA application
│   │   ├── app/
│   │   │   └── page.tsx  # Main React component (2000+ lines)
│   │   └── package.json
│   └── desktop/          # Tauri desktop app (future)
├── packages/
│   ├── domain/           # Database schema + migrations
│   │   └── src/
│   │       ├── dbClient.js        # AbsurderSQL wrapper
│   │       └── migrations/        # SQL schema definitions
│   └── shared-ui/        # Shared React components (future)
├── tests/
│   └── e2e/              # Playwright E2E tests (90+ tests)
│       ├── create-note.e2e.test.js
│       ├── edit-note.e2e.test.js
│       ├── delete-note.e2e.test.js
│       ├── folder-management.e2e.test.js
│       ├── drag-drop-folders.e2e.test.js
│       ├── multi-tab-sync.e2e.test.js
│       ├── fts-search-ui.e2e.test.js
│       ├── clickable-wikilinks.e2e.test.js     # NEW
│       ├── wikilinks-backlinks.e2e.test.js     # NEW
│       ├── graph-view.e2e.test.js              # NEW
│       └── database-clear-export-import.e2e.test.js
└── docs/
    └── UNIFIED_OBSIDIAN_REBUILD_PLAN.md  # Product roadmap
```

### Running Tests

```bash
# Run all E2E tests (sequential execution to avoid IndexedDB corruption)
npx playwright test

# Run specific test suite
npx playwright test tests/e2e/create-note.e2e.test.js

# Run tests with UI
npx playwright test --ui

# Generate test report
npx playwright show-report
```

**Important:** Tests run sequentially (`workers: 1` in `playwright.config.js`) to prevent IndexedDB contention issues in containerized environments.

### Test-Driven Development Process

Basalt follows **strict TDD methodology**:

1. **RED**: Write E2E test, watch it fail
2. **GREEN**: Write minimal code to pass test
3. **REFACTOR**: Clean up, optimize, add logging

**Example commit flow:**
```bash
# Feature: Drag-and-drop folders
[x] Write test: tests/e2e/drag-drop-folders.e2e.test.js (RED)
[x] Implement: handleFolderDragStart(), handleFolderDrop() (GREEN)
[x] Add: Root drop zone UI component (GREEN)
[x] Validate: All tests pass (NO REGRESSIONS)
[x] Commit: "feat: Add drag-and-drop folder organization (TDD GREEN)"
```

See [commit history](https://github.com/npiesco/basalt/commits/main) for detailed TDD workflow.

### Code Standards

- **TypeScript** for type safety (React components)
- **JavaScript** for database layer (Node.js compatibility)
- **Playwright** test IDs for all interactive elements
- **Console logging** for debugging (`[PWA]`, `[E2E]` prefixes)
- **Error boundaries** for graceful failure handling

## Comparison with Obsidian

| Feature | Obsidian | Basalt |
|---------|----------|--------|
| **Storage** | Markdown files | SQLite (IndexedDB) |
| **Offline** | [x] Local files | [x] IndexedDB |
| **Search** | Lucene-based | FTS5 (SQL) |
| **Sync** | Obsidian Sync ($10/mo) | Built-in multi-tab (free) |
| **Export** | Markdown files | SQLite .db files |
| **Platform** | Desktop + Mobile | PWA (Web) |
| **License** | Proprietary | AGPL-3.0 (Open Source) |
| **Wikilinks** | [x] Markdown syntax | [x] SQL-backed |
| **Backlinks** | [x] Panel view | [x] Panel view |
| **Graph View** | [x] Native | [x] Cytoscape.js |
| **Extensibility** | Plugins (JS) | SQL + React components |

**When to choose Basalt:**
- Need structured data (SQL queries, relations)
- Want offline-first web app (no installation)
- Prefer open-source (AGPL-3.0)
- Need multi-tab coordination out-of-the-box
- Want database export/import portability
- Need wikilinks and graph view with SQL backing

**When to choose Obsidian:**
- Need markdown file compatibility
- Want mobile apps (iOS, Android)
- Prefer rich plugin ecosystem
- Need canvas, daily notes, templates
- Want mature plugin marketplace

## Roadmap

See [`docs/UNIFIED_OBSIDIAN_REBUILD_PLAN.md`](./docs/UNIFIED_OBSIDIAN_REBUILD_PLAN.md) for complete roadmap.

**Phase 1 (Completed):**
- [x] Core CRUD operations (notes, folders)
- [x] Multi-tab sync with leader election
- [x] Drag-and-drop organization
- [x] Three-pane Obsidian-style layout
- [x] Database clearing

**Phase 2 (Completed):**
- [x] Export/Import functionality
- [x] PWA configuration with offline support
- [x] Mobile responsive design
- [x] Service worker caching

**Phase 3 (Completed):**
- [x] Full-text search (FTS5) with UI
- [x] Wiki-style links `[[note_id]]`
- [x] Backlinks panel
- [x] Graph view (Cytoscape.js)
- [x] Tags and metadata

**Phase 4 (In Progress):**
- [ ] Tauri desktop app
- [ ] Native file system access
- [ ] Markdown rendering enhancements
- [ ] Attachment support

**Phase 5 (Planned):**
- [ ] Cloud sync (optional)
- [ ] Plugin system
- [ ] Theming support
- [ ] Performance optimizations

## Known Issues

### Test Execution in Containerized Environments

**Symptom:** When running all E2E tests in parallel, browser crashes or IndexedDB corruption errors occur.

**Root Cause:** Multiple Playwright browser instances accessing IndexedDB simultaneously causes write contention.

**Solution:**
```javascript
// playwright.config.js
export default {
  workers: 1,  // Run tests sequentially
  // ...
};
```

**Impact:** Tests run sequentially (~5-10s per test), total suite time ~8-10 minutes. This is acceptable for CI/CD and development workflows.

**Production Impact:** None. This is a test-environment-only issue. Production users can open unlimited tabs without conflicts thanks to leader election.

### Import After Clear Database

**Symptom:** Import sometimes fails to restore data after clearing database.

**Root Cause:** AbsurderSQL's `importFromFile()` requires reconnection to apply imported data to IndexedDB.

**Workaround:** Reload page after import to reinitialize database connection.

**Status:** Under investigation. Export and clear functionality work perfectly; import restoration needs additional sync logic.

## Dependencies

**Runtime:**
- `@npiesco/absurder-sql` ^0.1.14 (SQLite + WASM + IndexedDB)
- `next` ^16.0.1 (React framework)
- `react` ^19.0.0 (UI library)
- `react-dom` ^19.0.0 (DOM bindings)
- `cytoscape` ^3.30.4 (Graph visualization)

**Development:**
- `@playwright/test` ^1.49.1 (E2E testing)
- `tailwindcss` ^3.4.17 (CSS framework)
- `typescript` ^5.7.2 (Type checking)

**Browser APIs:**
- IndexedDB (database persistence)
- WebAssembly (SQLite engine)
- BroadcastChannel (multi-tab sync)
- File API (export/import)

## License

**GNU Affero General Public License v3.0 (AGPL-3.0)**

This project is licensed under AGPL-3.0, requiring:
- **Source Disclosure**: Any modifications must be open-sourced
- **Network Copyleft**: Web services must provide source code
- **Patent Protection**: Contributors grant patent rights
- **Strong Copyleft**: Ensures improvements benefit the community

See [LICENSE](LICENSE) for full terms.

If you need commercial licensing or have questions about AGPL-3.0 compliance, please open an issue.

## Contributing

Contributions welcome! Please follow the TDD workflow:

1. **Write E2E test first** (watch it fail)
2. **Implement feature** (make test pass)
3. **Validate no regressions** (run full test suite)
4. **Commit with TDD message** (e.g., "feat: Add feature X (TDD GREEN)")

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

## Acknowledgments

Built on [AbsurderSQL](https://github.com/npiesco/absurder-sql) by [@npiesco](https://github.com/npiesco).

Inspired by [Obsidian](https://obsidian.md), the best knowledge base for local-first workflows.

---

**Questions?** Open an issue or check the [documentation](./docs/).

**Like this project?** ⭐ Star the repo and [sponsor development](https://github.com/sponsors/npiesco)!
