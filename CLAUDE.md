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
- **Phase 2: Complete** — MCP server with platform adapter architecture, OpenAI widgets, generic MCP text mode, 74 automated tests

See [docs/PRD.md](docs/PRD.md) for full product requirements.

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
├── mcp/
│   ├── server.js         # Entry point — HTTP, OAuth, adapter selection
│   ├── core/
│   │   ├── api-client.js # Shared REST API client + enum constants
│   │   └── tools.js      # Platform-neutral tool definitions + handlers
│   ├── adapters/
│   │   ├── openai.js     # OpenAI ext-apps adapter (widgets + structuredContent)
│   │   └── generic.js    # Generic MCP adapter (text-only responses)
│   ├── widgets/          # HTML widget files (OpenAI mode only)
│   │   ├── shared/
│   │   │   ├── bridge.js # JSON-RPC postMessage bridge for widget ↔ ChatGPT
│   │   │   └── theme.css # Shared widget styles
│   │   ├── project-dashboard.html
│   │   ├── deficiency-form.html
│   │   ├── deficiency-table.html
│   │   ├── severity-picker.html
│   │   ├── photo-upload.html
│   │   ├── stats-dashboard.html
│   │   └── report-download.html
│   └── __tests__/        # Vitest test suites
│       ├── core/handlers.test.js
│       ├── adapters/openai.test.js
│       ├── adapters/generic.test.js
│       ├── integration/server.test.js
│       └── helpers/mock-api.js
├── types/
│   └── index.ts          # TypeScript interfaces + UI constants
├── .env.example          # Environment variable template
├── vitest.config.js      # Test configuration
├── CLAUDE.md             # This file
└── README.md             # Project overview
```

---

## Architecture

### Core Principle: API-First

All business logic lives in the REST API (`app/api/`). Neither the frontend nor the MCP server duplicates logic — they both call the same API endpoints.

```
[React Frontend]  →  [REST API]  →  [SQLite DB]
[MCP Server]      →  [REST API]  →  [SQLite DB]
```

This means a deficiency created via ChatGPT (or any MCP client) will appear immediately in the standalone app, and vice versa.

### MCP Server — Platform Adapter Architecture

The MCP server uses a layered architecture with swappable platform adapters:

```
[mcp/server.js]          Entry point — HTTP, OAuth, routing
        ↓
[mcp/adapters/*.js]      Platform adapters — controls registration + response format
        ↓
[mcp/core/tools.js]      Platform-neutral tool definitions + handlers
        ↓
[mcp/core/api-client.js] Shared REST API fetch wrapper
        ↓
[REST API]               All business logic lives here
```

Both adapters run simultaneously on the same server — the URL path determines which one handles a request:

| Endpoint | Adapter | Response format | Widgets? |
|---|---|---|---|
| `/mcp` (default) | `adapters/generic.js` | Plain text `content` | No |
| `/mcp/openai` | `adapters/openai.js` | `structuredContent` + widget HTML | Yes |

**Adding a new platform** only requires a new adapter file and a new URL path — no changes to core tools or existing adapters.

### MCP Tool Definitions (`mcp/core/tools.js`)

Each tool is a plain object with platform-neutral handler logic:
- `handler(args)` — calls the REST API, returns `{ data }` or `{ error }`
- `directHandler(args)` — optional override for non-widget platforms (e.g., `log_deficiency` creates the deficiency directly instead of returning a pre-fill form)
- `formatText(result)` — human-readable text for generic MCP clients
- `formatStructured(result)` — structured payload for widget-capable platforms
- `widget` — `{ uri, file }` if the tool has a UI widget, `null` otherwise
- `description` — used by the OpenAI adapter (widget-oriented: minimal reply, don't restate). Required.
- `descriptionGeneric` — optional; used by the generic adapter when present. Instructs the LLM to summarize or interpret the tool result; if absent, generic adapter uses `description`.

The adapters decide which handler and formatter to use. Tool handlers must **not** contain platform-specific logic.

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

### Phase 2 — MCP Server

Both platform modes run simultaneously on one server:

```bash
npm run mcp        # http://localhost:8787 — both endpoints active
```

| Endpoint | Mode | Use with |
|---|---|---|
| `http://localhost:8787/mcp` | Generic (text-only) | Any MCP client |
| `http://localhost:8787/mcp/openai` | OpenAI (widgets) | ChatGPT |

For ChatGPT: `ngrok http 8787` → **Settings → Apps → Add App** → paste `<ngrok-url>/mcp/openai`

For any other MCP client: connect to `http://localhost:8787/mcp` directly.

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
```

---

## Environment Variables

See `.env.example` for the template. Copy to `.env` before running.

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Path to SQLite file, e.g. `./db/sitecheck.db` | Yes |
| `API_BASE_URL` | Internal base URL for REST API, e.g. `http://localhost:3000` | Phase 2 |
| `MCP_PORT` | Port for the MCP server (default: `8787`) | Phase 2 |
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

### Adding a New MCP Tool

1. **Tool definition:** Add a new object to the `tools` array in `mcp/core/tools.js` with `name`, `description`, `inputSchema` (zod), `annotations`, `handler(args)`, `formatText(result)`, and optionally `widget`, `directHandler`, `formatStructured`, `descriptionGeneric`. For tools with widget-specific LLM instructions (e.g. "do not restate"), add `descriptionGeneric` so generic MCP clients are instructed to summarize or interpret the tool result.
2. **Widget (if needed):** Create `mcp/widgets/<name>.html` with `<!-- SHARED:CSS -->` and `<!-- SHARED:BRIDGE -->` placeholders, and an `init(data)` function
3. **Set `widget`** to `{ uri: "ui://sitecheck/<name>.html", file: "<name>.html" }` — the OpenAI adapter auto-registers the resource
4. **directHandler:** If the tool is interactive (widget does the mutation), add a `directHandler` that performs the action directly for generic mode
5. **Tests:** Add handler tests in `mcp/__tests__/core/handlers.test.js`
6. Run `npm test` to verify

### Adding a New Platform Adapter

1. Create `mcp/adapters/<platform>.js` exporting a `register(server, tools)` function
2. Loop over `tools`, call `server.registerTool(...)` for each, choosing `tool.handler` or `tool.directHandler` and the appropriate formatter
3. Add the platform to the switch in `mcp/server.js` (dynamic import based on `MCP_PLATFORM`)
4. Add an npm script: `"mcp:<platform>": "MCP_PLATFORM=<platform> node mcp/server.js"`
5. Add adapter tests in `mcp/__tests__/adapters/<platform>.test.js`
6. No changes needed to `mcp/core/tools.js` or other adapters

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
3. **MCP tool handlers stay platform-neutral** — handler logic belongs in `mcp/core/tools.js`; platform-specific behavior (widgets, structured content) belongs in the adapter
4. **Adapters are independent** — changing one adapter must never break another; each adapter file only imports from `mcp/core/`
5. **Enum values only** — severity, status, and category must use the exact defined Title Case values; reject free text
6. **No hardcoded secrets** — use environment variables; add new ones to `.env.example`
7. **Consistent API envelope** — all responses must use `ok()` / `err()` from `lib/api.ts`
8. **Widgets are static bundles** — keep widget code self-contained in `/mcp/widgets`; no server-side rendering
9. **Run tests** — run `npm test` before committing MCP changes; all 74 tests must pass
10. **Never push to main** — all changes go to the designated feature branch
11. **Commit often** — small, focused commits with clear messages
12. **Minimal changes** — only change what is necessary; do not refactor unrelated code
