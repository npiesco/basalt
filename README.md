# Basalt

Basalt is the working repository for the AbsurderSQL-powered Obsidian rebuild. It hosts:

- `apps/pwa` – Next.js PWA that consumes `@npiesco/absurder-sql` for IndexedDB persistence.
- `apps/desktop` – Tauri 2.0 desktop shell reusing the React UI and the AbsurderSQL Rust crate (Rust 2024 edition) for filesystem-backed vaults.
- `packages/shared-ui` – (Optional) shared React components/hooks used by both apps.
- `packages/domain` – Schema definitions, SQL migrations, and data-access helpers built on AbsurderSQL.
- `backend/` – Placeholder for an optional sync API service.
- `docs/` – Product and architecture documentation.

To get started:

1. Install dependencies in new applications by running `npm install @npiesco/absurder-sql` (web) and adding `absurder-sql` to `Cargo.toml` (desktop) as shown in `absurder-sql-explorer`.
2. Mirror the project roadmap in `docs/UNIFIED_OBSIDIAN_REBUILD_PLAN.md` when populating the codebase.
3. Keep AbsurderSQL itself as an external dependency; Basalt is dedicated to product code only.
