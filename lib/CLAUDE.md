# Lib — Shared Utilities

This directory contains the shared foundation used by all API routes.

## `api.ts` — Response Helpers & Enums

### Response Helpers

Every API route must use these — never build response JSON manually:

- `ok(data, status?)` — returns `{ success: true, data, error: null }` with the given status (default 200)
- `err(message, status?)` — returns `{ success: false, data: null, error: message }` with the given status (default 400)

### Enum Constants

The canonical enum arrays and their derived TypeScript types:

- `CATEGORIES` — 7 values: Structural, Mechanical, Electrical, Plumbing, Finish, Safety, Other
- `SEVERITIES` — 4 values: Critical, Major, Minor, Observation
- `STATUSES` — 4 values: Open, In Progress, Resolved, Closed

These arrays are the single source of truth for API validation. The same values appear in:
- `db/schema.sql` CHECK constraints
- `types/index.ts` (frontend copies for UI rendering)

When adding or changing an enum value, update all three locations.

## `db.ts` — SQLite Singleton

Provides a single `db` export — a `better-sqlite3` Database instance.

Uses `global.__db` to persist the connection across Next.js hot reloads in development. The connection is configured with:
- `PRAGMA journal_mode = WAL` (write-ahead logging for better concurrency)
- `PRAGMA foreign_keys = ON` (enforce referential integrity)

Database path: `./db/sitecheck.db` (relative to `process.cwd()`).
