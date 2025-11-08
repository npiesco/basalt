# Unified, Step-by-Step Implementation Plan for the AbsurderSQL-Powered Obsidian Rebuild

Last updated: 2025-11-08
Scope: Build an Obsidian-style experience delivered as both a PWA and a Tauri 2.0 desktop app by **consuming** `@npiesco/absurder-sql`. Reference repos:
- `/Downloads/absurder-sql/pwa` – Next.js scaffold showing direct WASM usage.
- `npm install @npiesco/absurder-sql` – published package with WASM bindings.
- `/Downloads/absurder-sql-explorer/docs` – Tauri 2.0 desktop implementation guide.

No modifications to the AbsurderSQL source repo are required; everything below assumes new application codebases that depend on the existing package the same way the Tauri explorer does.

---

## Phase 1: Foundation & MVP (Weeks 1-8)

### Initialize Project & Infrastructure
- [x] Create net-new repos (or an npm workspace/turbo monorepo) with two apps: `pwa` (Next.js 16) and `desktop` (Tauri 2.0 + Vite). (See root `package.json`, `apps/pwa`, and `apps/desktop` scaffolds patterned after `/Downloads/absurder-sql/pwa` and the explorer.)
- [x] Install `@npiesco/absurder-sql` in the PWA (`npm install @npiesco/absurder-sql`); confirm `init()` + `Database.newDatabase()` work using the patterns in `absurder-sql/pwa/lib/db/client.ts`. (See `apps/pwa/lib/db/client.js` with injectable loader mirroring the reference explorer.)
- [x] In the Tauri app, add the crate dependency in `src-tauri/Cargo.toml` exactly like `absurder-sql-explorer/src-tauri/src/commands/native_queries.rs` (`absurder-sql = { version = "...", features = ["fs_persist"] }`) and set the crate to the Rust 2024 edition. (See `apps/desktop/src-tauri/Cargo.toml`.)
- [ ] Stand up shared React + TypeScript tooling: CodeMirror 6 for markdown, Zustand for state, React Query (or TanStack Query) for async cache.

### Design & Implement Database Schema
- [x] Draft SQL migrations describing the Obsidian vault (notes, folders, tags, backlinks, attachment metadata, FTS5 tables). Store migrations with the new apps; execute them through AbsurderSQL’s `execute` API. (See `packages/domain/src/migrations.js`.)
- [x] Define TypeScript-ready models (for the PWA) and optional Rust structs/serde definitions (for desktop services) that map to the schema. Keep these in the consumer repos. (See `packages/domain/src/models.js` for JSDoc-backed factories.)

### Implement AbsurderSQL WASM & Native Integration
- [x] Reuse the initialization flow from `absurder-sql/pwa/lib/db/client.ts` to expose typed wrappers (`initDb`, `executeQuery`, `exportToFile`, `importFromFile`) tailored to Obsidian workflows. (See `packages/domain/src/dbClient.js`.)
- [x] **MAJOR MILESTONE (2025-11-08)**: Implemented REAL integration with @npiesco/absurder-sql v0.1.14 (NO MOCKS). Successfully validated: WASM init, database creation, migrations (11 tables), INSERT/SELECT/UPDATE/DELETE operations. Created real integration tests in `tests/integration.simple.test.js` that use actual WASM-based SQLite. Fixed dbClient.js to handle real API: parameter conversion to ColumnValue format, smart SQL statement splitting with BEGIN/END block support, row format conversion. (See commit dc116af)
- [ ] For the Tauri backend, follow the explorer command pattern: open databases via `SqliteIndexedDB::new`, bridge queries to the React frontend with JSON-serializable results, and expose file export/import commands.

### Build Core Note Editor & List UI
- [ ] Compose UI shell inspired by Obsidian: left sidebar (folder tree + note list), center markdown editor, optional right sidebar for metadata.
- [ ] Implement CRUD flows (create/edit/delete notes and folders) using AbsurderSQL transactions. Persist editor content with debounced saves.
- [ ] Support drag-and-drop folder organization leveraging Zustand state and SQL updates.

### Multi-Tab Sync (PWA)
- [ ] Use AbsurderSQL’s leader election APIs (`isLeader`, `getLeaderInfo`, `queueWrite`) to coordinate writes. Follow strategies in `docs/MULTI_TAB_GUIDE.md`.
- [ ] Add BroadcastChannel listeners so non-leader tabs refresh metadata when changes arrive.
- [ ] Record `updated_at` timestamps and adopt last-write-wins when merging edits across tabs.

---

## Phase 2: Export/Import & Offline-First PWA (Weeks 9-12)

### Export/Import `.db` File Support
- [ ] Provide UI actions to export the current vault (`Database.exportToFile()` for PWA, Tauri command returning file bytes for desktop).
- [ ] Build import wizard: validate schema presence, show merge vs. overwrite choices, and use `Database.importFromFile()` / desktop equivalent to apply data.
- [ ] Test round-trips with external tools (SQLite CLI, DBeaver) to ensure compatibility.

### PWA Configuration
- [ ] Create web app manifest (icons, theme colors, shortcuts) and include current branding assets.
- [ ] Implement service worker (Workbox) to cache the Next.js app shell, WASM bundle, and migrations for offline use.
- [ ] Validate offline behavior: create/edit notes while offline, reload, and ensure IndexedDB persistence survives.

### Responsive Mobile UI Enhancements
- [ ] Optimize layout (collapsible panels, floating add button, improved touch targets) for mobile browsers.
- [ ] Add gesture controls (swipe to open navigation, long press actions).
- [ ] Test on iOS Safari and Android Chrome to confirm PWA install prompt and offline support.

---

## Phase 3: Full-Text Search & Graph Features (Weeks 13-16)

### FTS5 Full-Text Search
- [ ] Keep FTS5 virtual tables in sync via triggers that run inside AbsurderSQL migrations.
- [ ] Build live search panel with snippet highlighting, ranking, and filters.

### Backlinks & Graph View
- [x] Parse markdown `[[wikilinks]]` on save; populate backlinks table via SQL transactions. (See parser utilities in `packages/domain/src/markdown.js` inspired by `/Downloads/absurder-sql/pwa` link handling.)
- [x] Show backlinks list for the active note, with quick navigation to referring contexts. (Create normalized models via `packages/domain/src/models.js` and ensure schema includes `backlinks` table.)
- [x] Visualize the vault graph (D3.js/Cytoscape.js) fed by backlinks data; offer tag/folder filters and performance safeguards for large vaults. (Domain graph aggregator in `packages/domain/src/graph.js` produces node/edge payloads compatible with Cytoscape configuration from `/Downloads/absurder-sql-explorer`.)

---

## Phase 4: Desktop App & Optional Cloud Sync (Weeks 17-24)

### Build Tauri Desktop Wrapper
- [x] Bundle the shared React components inside the Tauri 2.0 app (reuse PWA UI where possible). (Shared `NoteTitleCard` from `packages/shared-ui` renders inside `apps/desktop/src/App.tsx` mirroring the explorer.)
- [ ] Use native file dialogs to open/create `.db` vaults and store them on the filesystem (no IndexedDB limits).
- [ ] Register file associations so `.db` files launch the app when double-clicked.
- [ ] Add desktop niceties: menu bar, system tray, notifications, window persistence.

### Optional: Rust/Axum Backend for Cloud Sync
- [ ] Stand up an optional sync service that accepts `.db` uploads/downloads (standard HTTP endpoints).
- [ ] Handle versioning/conflict resolution server-side (e.g., timestamped snapshots, manual merge prompts).
- [ ] Expose client sync UI—trigger export, upload to server, pull latest, apply via import—with status indicators in both PWA (when online) and desktop.

---

## Phase 5: Polish & Monetization (Weeks 25+)

### UI/UX Enhancements
- [ ] Add theming (light/dark/custom), autosave indicators, undo/redo stack, and markdown preview panes.
- [ ] Optimize performance for large vaults (virtualized lists, chunked loading, cache tuning).

### Plugin System (Optional)
- [ ] Define plugin API that lets community extensions run SQL against the database or extend UI panels, while respecting AbsurderSQL’s transaction model.

### Monetization Strategy
- [ ] Free tier: PWA core features (offline, export/import, multi-tab sync).
- [ ] Pro tier (~$40/year): desktop app access, advanced themes, cloud backup/version history.
- [ ] Optional cloud sync subscription (~$4.99/mo) layered on top when backend is ready.

---

## Why Both PWA and Tauri Desktop?

### PWA – Mass-Market Acquisition Layer
- Browser-based with zero install friction.
- IndexedDB persistence via AbsurderSQL for offline usage and instant updates.
- Works on desktop, mobile, and tablets; easy export for backups.

### Tauri 2.0 Desktop – Power-User Retention Layer
- Native filesystem access bypasses IndexedDB quota and improves large-vault performance.
- Unlocks OS integrations (menus, tray, notifications) and faster I/O.
- Shares React components and AbsurderSQL logic with the PWA to minimize duplicate work.

---

## Visual Hierarchy of Application Codebase

```
your-obsidian-rebuild/
├── packages/
│   ├── shared-ui/            # (Optional) shared React components/hooks
│   └── domain/               # Schema helpers, query utilities
├── apps/
│   ├── pwa/                  # Next.js PWA consuming @npiesco/absurder-sql
│   └── desktop/              # Tauri 2.0 app; frontend reuses shared UI, backend uses absurder-sql crate
└── backend/                  # (Optional) sync service (Axum/Node)
```

This layout matches the original request’s hierarchy while ensuring AbsurderSQL remains an external dependency.

---

## Alignment Notes
- The plan references granular discoveries from `absurder-sql/pwa` (WASM initialization, hooks), `@npiesco/absurder-sql` typings (`pkg/absurder_sql.d.ts`), and `absurder-sql-explorer/docs` (Tauri 2.0 architecture, query command patterns).
- Every phase item maps back to the original checklist but reframed so the new apps **consume** AbsurderSQL instead of restructuring it.
- Future enhancements (cloud sync, plugins, monetization) build on exported `.db` files and the crate’s existing capabilities without source changes.

---

_End of plan._
