# CLAUDE.md — SiteCheck AI

This file provides guidance for AI assistants (Claude Code, Cursor, and others) working on this repository. Read it fully before making changes.

---

## Project Overview

**SiteCheck AI** is a construction site inspection tracker built as a two-phase prototype that demonstrates how SaaS products connect to AI conversational platforms.

**Repository:** `frankreno/ai-sample-app`
**Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · SQLite · PDFKit
**Analogy:** Like OpenTable — users can log inspections via the standalone web app *or* through ChatGPT. Same database, two interfaces.

### Two Phases

| Phase | What it builds | AI involved? |
|---|---|---|
| **Phase 1** | Standalone Next.js web app + REST API | No |
| **Phase 2** | ChatGPT integration via MCP server + UI widgets | Yes (ChatGPT / OpenAI Apps SDK) |

### Current Implementation Status

- **Phase 1: Complete** — Web app, REST API, SQLite database, PDF reports, photo uploads all working
- **Phase 2: Not started** — No `mcp/` directory, no MCP server, no widgets yet

See [docs/PRD.md](docs/PRD.md) for full product requirements and Phase 2 specifications.

---

## Repository Structure

```
├── app/
│   ├── api/
│   │   ├── projects/route.ts          # GET list all projects
│   │   ├── deficiencies/route.ts      # GET list (filtered) + POST create
│   │   ├── deficiencies/[id]/route.ts # GET one + PATCH update
│   │   ├── deficiencies/[id]/photos/route.ts  # POST upload photo
│   │   ├── deficiencies/stats/route.ts        # GET severity/status counts
│   │   └── reports/generate/route.ts          # POST generate PDF
│   ├── globals.css       # Tailwind v4 imports + CSS variables
│   ├── layout.tsx        # Root layout with metadata
│   └── page.tsx          # Main SPA (client component)
├── components/
│   ├── NewDeficiencyModal.tsx  # Create deficiency form + photo upload
│   ├── SeverityBadge.tsx       # Color-coded severity pill
│   └── StatusBadge.tsx         # Clickable status badge with cycle
├── db/
│   ├── schema.sql        # Table definitions with CHECK constraints
│   └── setup.ts          # Database init + seed data script
├── docs/
│   └── PRD.md            # Product requirements document
├── lib/
│   ├── api.ts            # ok()/err() response helpers + enum constants
│   └── db.ts             # SQLite singleton connection
├── types/
│   └── index.ts          # TypeScript interfaces + UI constants
├── .env.example          # Environment variable template
├── CLAUDE.md             # This file
└── README.md             # Project overview
```

---

## Architecture

### Core Principle: API-First

All business logic lives in the REST API (`app/api/`). Neither the frontend nor the future MCP server duplicates logic — they both call the same API endpoints.

```
[React Frontend]  →  [REST API]  →  [SQLite DB]
[MCP Server]      →  [REST API]  →  [SQLite DB]    (Phase 2)
```

This means a deficiency created via ChatGPT will appear immediately in the standalone app, and vice versa.

### MCP Server as Thin Wrapper (Phase 2 — not yet built)

The MCP server will map ChatGPT tool calls to REST API requests. It must **not** contain business logic:

```typescript
server.tool("log_deficiency", schema, async (args) => {
  const res = await fetch(`${API_BASE}/deficiencies`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  return await res.json();
});
```

---

## Data Model

### Projects

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `name` | TEXT | Project name |
| `location` | TEXT | Site address |
| `description` | TEXT | Optional |
| `created_at` | TEXT | ISO datetime, auto-generated |

### Deficiencies

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key, sequential format `DEF-001`, `DEF-002`, etc. |
| `project_id` | TEXT | Foreign key → projects |
| `title` | TEXT | Short description |
| `description` | TEXT | Detailed description |
| `category` | TEXT | Enum: `Structural`, `Mechanical`, `Electrical`, `Plumbing`, `Finish`, `Safety`, `Other` |
| `severity` | TEXT | Enum: `Critical`, `Major`, `Minor`, `Observation` |
| `status` | TEXT | Enum: `Open`, `In Progress`, `Resolved`, `Closed` (default: `Open`) |
| `location` | TEXT | Grid ref or description, e.g. `Grid B4, East Foundation Wall` |
| `trade` | TEXT | Responsible trade, e.g. `Concrete`, `Electrical` |
| `photo_paths` | TEXT | JSON array of file paths, e.g. `["/uploads/abc.jpg"]` |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

### Enum Values (single source of truth)

These are defined in `lib/api.ts` (for API validation) and `types/index.ts` (for frontend). Both must stay in sync.

```typescript
// Categories
"Structural" | "Mechanical" | "Electrical" | "Plumbing" | "Finish" | "Safety" | "Other"

// Severities
"Critical" | "Major" | "Minor" | "Observation"

// Statuses
"Open" | "In Progress" | "Resolved" | "Closed"
```

---

## REST API Design Conventions

### Response Envelope

All responses use this exact shape:

```typescript
// Success
{ "success": true, "data": { ... }, "error": null }

// Error
{ "success": false, "data": null, "error": "Human-readable error message" }
```

Use the `ok()` and `err()` helpers from `lib/api.ts` — never construct responses manually.

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/projects` | GET | List all projects |
| `/api/deficiencies` | GET | List deficiencies — requires `project_id`, optional `severity`, `status`, `trade`, `page`, `limit` |
| `/api/deficiencies` | POST | Create deficiency — validates enums, generates sequential `DEF-XXX` ID |
| `/api/deficiencies/[id]` | GET | Get single deficiency |
| `/api/deficiencies/[id]` | PATCH | Update fields — validates severity/status enums, auto-updates `updated_at` |
| `/api/deficiencies/[id]/photos` | POST | Upload photo (multipart/form-data), appends to `photo_paths` JSON array |
| `/api/deficiencies/stats` | GET | Counts by severity and status for a `project_id` |
| `/api/reports/generate` | POST | Generate PDF report for a `project_id`, returns `{ download_url }` |

### API Rules

- **Enum validation** — reject values not in the defined enum; return 400 with accepted values listed
- **Parameterized queries** — always use `?` placeholders in SQL, never string interpolation
- **Return full row after mutations** — POST and PATCH return the complete row from the database
- **Pagination** — `?page=1&limit=50` on list endpoints; limit is capped at 200
- **Consistent error messages** — include what values are acceptable, e.g. `"severity must be one of: Critical, Major, Minor, Observation"`

---

## Development Setup

### Prerequisites

- Node.js 18+
- ngrok (Phase 2 only — for ChatGPT tunnel)

### Phase 1 — Standalone App

```bash
npm install
npm run setup      # Initialize SQLite + seed 3 projects, 8 deficiencies
npm run dev        # Next.js on http://localhost:3000
```

### Phase 2 — ChatGPT Integration (not yet implemented)

```bash
npm run mcp        # MCP server on http://localhost:8787
ngrok http 8787    # Expose via public HTTPS URL
```

Then in ChatGPT: **Settings → Apps → Developer Mode → Add App** → paste `<ngrok-url>/mcp`

---

## Environment Variables

See `.env.example` for the template. Copy to `.env` before running.

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Path to SQLite file, e.g. `./db/sitecheck.db` | Yes |
| `API_BASE_URL` | Internal base URL for REST API, e.g. `http://localhost:3000` | Phase 2 |
| `NEXTAUTH_SECRET` | Session secret (if auth is added) | Planned |

Add all new variables to `.env.example` with placeholder values. Never hardcode secrets in source.

---

## Common Workflows

### Adding a New API Endpoint

1. Create route file in `app/api/<resource>/route.ts`
2. Import `ok`, `err` from `@/lib/api` and `db` from `@/lib/db`
3. Export async functions named `GET`, `POST`, `PATCH`, or `DELETE`
4. For dynamic routes, use `{ params }: { params: Promise<{ id: string }> }` and `await params`
5. Validate all input; return `err("message", statusCode)` on failure
6. Use parameterized SQL queries: `db.prepare("SELECT * FROM x WHERE id = ?").get(id)`
7. Return `ok(data)` or `ok(data, 201)` on success

### Adding a New Field to Deficiencies

1. **Schema:** Add column to `db/schema.sql` with appropriate type and constraints
2. **Seed data:** Update `db/setup.ts` to include the new field in seed records
3. **Types:** Add field to the `Deficiency` interface in `types/index.ts`
4. **API create:** Update `POST /api/deficiencies` in `app/api/deficiencies/route.ts` — add to validation, INSERT statement, and row object
5. **API update:** Update `PATCH /api/deficiencies/[id]` — add field name to the `allowed` array; add validation if it's an enum
6. **Frontend form:** Add input to `components/NewDeficiencyModal.tsx` — add to form state, add input element, include in POST body
7. **Frontend table:** Add column to the table in `app/page.tsx` if it should be displayed
8. Re-run `npm run setup` to recreate the database with the new schema

### Adding a New Enum Value

1. **Schema:** Update the CHECK constraint in `db/schema.sql`
2. **API constants:** Add to the array in `lib/api.ts` (e.g., `SEVERITIES`, `STATUSES`, `CATEGORIES`)
3. **Frontend constants:** Add to the matching array in `types/index.ts`
4. **Style maps:** If the enum has a color, add an entry to the relevant style map in `types/index.ts` (e.g., `SEVERITY_STYLES`, `STATUS_STYLES`)
5. Re-run `npm run setup` to recreate the database with the updated constraint

### Adding a New Filter Parameter

1. **API:** In `GET /api/deficiencies` (`app/api/deficiencies/route.ts`), add `searchParams.get("param_name")` and push a condition + value into the `conditions`/`params` arrays
2. **Frontend state:** Add a `useState` for the filter in `app/page.tsx`
3. **Frontend URL:** Include the filter in the `URLSearchParams` in the `loadData` callback
4. **Frontend dropdown:** Add a `<select>` element in the filter bar section of `app/page.tsx`
5. **Clear filters:** Include the new filter in the clear-filters button handler

---

## Git Workflow

### Branch Naming

- Feature branches: `claude/feature-description-<session-id>`
- Bug fixes: `fix/description`
- **Never push to `main` or `master` directly**

### Commits

- Imperative mood: `Add severity filter to deficiency list endpoint`
- One logical change per commit
- Run `npm run lint` before committing

---

## Key Conventions for AI Assistants

1. **Read before modifying** — always read a file before editing it
2. **API is the source of truth** — never add business logic to the MCP server or frontend; it belongs in `app/api/`
3. **MCP server stays thin** — tool handlers call REST endpoints, nothing more
4. **Enum values only** — severity, status, and category must use the exact defined Title Case values; reject free text
5. **No hardcoded secrets** — use environment variables; add new ones to `.env.example`
6. **Consistent API envelope** — all responses must use `ok()` / `err()` from `lib/api.ts`
7. **Widgets are static bundles** — keep widget code self-contained in `/mcp/widgets`; no server-side rendering
8. **Never push to main** — all changes go to the designated feature branch
9. **Commit often** — small, focused commits with clear messages
10. **Minimal changes** — only change what is necessary; do not refactor unrelated code
