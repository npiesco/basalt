# Repository Guidelines

## Project Structure & Module Organization
The monorepo contains `apps/`, `packages/`, `backend/`, and `docs/`. `apps/pwa` hosts the Next.js PWA that wraps AbsurderSQL WASM; `apps/desktop` ships the Tauri 2.0 shell that reuses the shared UI. Put cross-app React pieces in `packages/shared-ui` and migrations plus data helpers in `packages/domain`. Store experimental services in `backend/` and roadmap notes or ADRs in `docs/`.

## Build, Test, and Development Commands
Run `npm install` at the repo root once package manifests land. Start the web client with `npm run dev --workspace apps/pwa` for Next.js hot reload and IndexedDB persistence. Use `npm run tauri dev --workspace apps/desktop` to boot the Tauri 2.0 shell. Rebuild shared packages with `npm run build --workspace packages/domain` after schema or helper changes so apps consume fresh types.

## Coding Style & Naming Conventions
Follow TypeScript + React patterns from the Next.js 14 app directory and Rust 2024 idioms for the Tauri backend. Use 2-space indentation for TSX/JSX and 4 spaces for Rust. Name components `PascalCase.tsx`, hooks `use-*.ts`, and migrations with incremental timestamps (e.g., `20250115_create_notes.sql`). Run `npm run lint` (ESLint + Prettier) and `cargo fmt` before opening a PR.

## Testing Guidelines
Adopt Vitest or Jest for the PWA and colocate specs under `__tests__/` or `*.test.ts`. Snapshot UI states sparingly; focus on behavioural tests that cover AbsurderSQL integration. Run `npm run test --workspace apps/pwa` for web tests and `cargo test` inside `apps/desktop/src-tauri` for Rust validation. Target strong coverage on migrations, sync workflows, and import/export flows.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat:`, `fix:`, `chore:`) to keep the history searchable and compatible with semantic release tooling. Each PR should describe the user-facing change, reference roadmap checklist items, and note any schema migrations or data shape shifts. Include screenshots or short clips for UI work, and link to relevant docs in `docs/` when touching architecture decisions. Request review from a domain owner before merging, and ensure CI checks pass locally.

## Reference Material & Example Repos
Review `/Users/nicholas.piesco/basalt/docs/UNIFIED_OBSIDIAN_REBUILD_PLAN.md` before starting a feature. It maps milestones to the reference repos you must consult: the published `@npiesco/absurder-sql` package, the `/Downloads/absurder-sql/pwa` WASM scaffold, and the Tauri 2.0 explorer docs. Use those sources for database initialization, command bridge patterns, and multi-tab sync details; capture any deviations in `docs/` with clear rationale.
