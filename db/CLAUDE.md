# Database — Conventions

SQLite database stored at `db/sitecheck.db`. Managed via `better-sqlite3`.

## Schema Rules (`schema.sql`)

- **Primary keys** are TEXT — UUIDs for projects, sequential `DEF-XXX` for deficiencies
- **Enum fields** use CHECK constraints listing every valid value. When adding a value, update the CHECK constraint.
- **JSON arrays** are stored as TEXT with a default of `'[]'` (e.g., `photo_paths`)
- **Timestamps** are TEXT in ISO format, using `DEFAULT (datetime('now'))`
- **Foreign keys** use `REFERENCES` — enforced at runtime via `PRAGMA foreign_keys = ON`

## Connection (`lib/db.ts`)

Singleton pattern using `global.__db` to survive Next.js hot reloads in dev. Never create a second connection — always import from `@/lib/db`:

```typescript
import { db } from "@/lib/db";
```

The connection enables WAL mode and foreign keys on creation.

## Setup Script (`setup.ts`)

`npm run setup` (runs `npx tsx db/setup.ts`) performs:

1. Creates or opens the database file
2. Runs `schema.sql` (CREATE TABLE IF NOT EXISTS)
3. Deletes all existing data (deficiencies first, then projects — FK order)
4. Seeds 3 projects and 8 deficiencies with realistic construction data

When modifying the schema:

- Update `schema.sql` with the new column/constraint
- Update `setup.ts` seed data to include the new field
- Re-run `npm run setup` — this is a destructive reset

## Seed Data

Three projects across Colorado:

- **Oakwood Tower** (Denver) — 4 deficiencies
- **Riverside Industrial Park** (Aurora) — 2 deficiencies
- **Maple Street Renovation** (Boulder) — 2 deficiencies

Deficiencies span all severity levels (Critical, Major, Minor, Observation) and multiple statuses so the dashboard is immediately populated.
