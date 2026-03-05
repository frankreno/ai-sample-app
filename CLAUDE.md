# CLAUDE.md — SiteCheck AI

This file provides guidance for AI assistants (Claude Code and others) working on this repository. Read it fully before making changes.

---

## Project Overview

**SiteCheck AI** is a construction site inspection tracker built as a two-phase prototype that demonstrates how SaaS products connect to AI conversational platforms.

**Repository:** `frankreno/ai-sample-app`
**Stack:** Next.js · TypeScript · SQLite · OpenAI Apps SDK (MCP)
**Analogy:** Like OpenTable — users can log inspections via the standalone web app *or* through ChatGPT. Same database, two interfaces.

### Two Phases

| Phase | What it builds | AI involved? |
|---|---|---|
| **Phase 1** | Standalone Next.js web app + REST API | No |
| **Phase 2** | ChatGPT integration via MCP server + UI widgets | Yes (ChatGPT / OpenAI Apps SDK) |

---

## Repository Structure

```
sitecheck-ai/
├── app/               # Next.js frontend (React UI)
├── api/               # REST API routes — shared by frontend AND MCP server
├── mcp/               # MCP server + ChatGPT UI widgets
│   ├── server.ts      # MCP tool definitions (thin wrapper over REST API)
│   └── widgets/       # Static HTML/React bundles rendered in ChatGPT iframes
├── db/                # SQLite database + migrations
├── .env.example       # Environment variable template (never commit .env)
├── CLAUDE.md          # This file
└── README.md          # Project overview
```

---

## Architecture

### Core Principle: API-First

All business logic lives in the REST API (`/api`). Neither the frontend nor the MCP server duplicates logic — they both call the same API endpoints.

```
[React Frontend]  →  [REST API]  →  [SQLite DB]
[MCP Server]      →  [REST API]  →  [SQLite DB]
```

This means a deficiency created via ChatGPT appears immediately in the standalone app, and vice versa.

### MCP Server as Thin Wrapper

The MCP server maps ChatGPT tool calls to REST API requests. It does **not** contain business logic:

```typescript
// MCP tool handler — just call the REST API
server.tool("log_deficiency", schema, async (args) => {
  const res = await fetch(`${API_BASE}/deficiencies`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  return await res.json();
});
```

### ChatGPT Widget Flow

1. User speaks to ChatGPT → model calls an MCP tool
2. Tool response includes `_meta["openai/outputTemplate"]` pointing to a widget
3. ChatGPT renders the widget in an iframe inside the chat
4. Widget communicates back to the MCP server via the Apps UI bridge (JSON-RPC over `postMessage`)

---

## Data Model

### Projects

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `name` | TEXT | Project name |
| `location` | TEXT | Site address |
| `created_at` | DATETIME | |

### Deficiencies

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key, e.g. `DEF-042` |
| `project_id` | TEXT | Foreign key → Projects |
| `title` | TEXT | Short description |
| `category` | TEXT | Enum: `structural`, `electrical`, `plumbing`, `fire_safety`, `general` |
| `location` | TEXT | Grid ref or description, e.g. `grid B4` |
| `trade` | TEXT | Responsible trade |
| `severity` | TEXT | Enum: `low`, `medium`, `high`, `critical` |
| `status` | TEXT | Enum: `open`, `in_progress`, `resolved` |
| `photo_url` | TEXT | Path to uploaded photo |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

## REST API Design Conventions

All responses follow a consistent envelope — both the frontend and the MCP server parse this:

```typescript
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Deficiency not found" } }
```

### AI-Ready API rules (enforce on all endpoints)

- **Descriptive field names** — the MCP tool schema relies on field names being self-explanatory
- **Enum values** for `severity`, `status`, `category` — no free-text variants
- **Consistent error shapes** — distinguish `NOT_FOUND` / `VALIDATION_ERROR` / `SERVER_ERROR`
- **Filter params on list endpoints** — `?severity=critical&status=open&from=2025-01-01`
- **Pagination** — `?page=1&limit=50` — ChatGPT tool responses have size limits (~100K chars)
- **Idempotent writes where possible** — the AI may retry a failed tool call

---

## MCP Tool Definitions

Each tool maps 1-to-1 with a REST endpoint and optionally references a widget:

| Tool | REST call | Widget |
|---|---|---|
| `get_project_list` | `GET /api/projects` | Project list table |
| `get_deficiency_list` | `GET /api/deficiencies` | Filtered deficiency table |
| `log_deficiency` | `POST /api/deficiencies` | Pre-filled deficiency form |
| `upload_photo` | `POST /api/deficiencies/:id/photo` | Photo upload dropzone |
| `set_severity` | `PATCH /api/deficiencies/:id` | Severity picker |
| `update_status` | `PATCH /api/deficiencies/:id` | Status picker |
| `generate_report` | `POST /api/reports` | Download link |

---

## Development Setup

### Prerequisites

- Node.js 18+
- ngrok (Phase 2 only — for ChatGPT tunnel)
- ChatGPT account with Developer Mode access (Phase 2 only)

### Phase 1 — Standalone App

```bash
npm install
npm run setup      # Initialize SQLite + seed sample data
npm run dev        # Next.js on http://localhost:3000
```

### Phase 2 — ChatGPT Integration

```bash
npm run mcp        # MCP server on http://localhost:8787
ngrok http 8787    # Expose via public HTTPS URL
```

Then in ChatGPT: **Settings → Apps → Developer Mode → Add App** → paste `<ngrok-url>/mcp`

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Path to SQLite file, e.g. `./db/sitecheck.db` | Yes |
| `API_BASE_URL` | Internal base URL for REST API, e.g. `http://localhost:3000` | Yes (MCP server) |
| `NEXTAUTH_SECRET` | Session secret (if auth is added) | Planned |

Add all new variables to `.env.example` with placeholder values. Never hardcode values in source.

---

## Git Workflow

### Branch Naming

- Feature branches: `claude/feature-description-<session-id>`
- Bug fixes: `fix/description`
- **Never push to `main` or `master` directly**

### Commits

- Imperative mood: `Add severity filter to deficiency list endpoint`
- One logical change per commit
- Run `npm run lint` and `npm run test` before committing if configured

### Push

```bash
git push -u origin <branch-name>
```

---

## Key Conventions for AI Assistants

1. **Read before modifying** — always read a file before editing it
2. **API is the source of truth** — never add business logic to the MCP server or frontend; it belongs in `/api`
3. **MCP server stays thin** — tool handlers call REST endpoints, nothing more
4. **Enum values only** — severity, status, and category must use the defined enum values; reject free text
5. **No hardcoded secrets** — use environment variables; add new ones to `.env.example`
6. **Consistent API envelope** — all responses must use `{ success, data }` / `{ success, error }` shape
7. **Widgets are static bundles** — keep widget code self-contained in `/mcp/widgets`; no server-side rendering
8. **Never push to main** — all changes go to the designated feature branch
9. **Commit often** — small, focused commits with clear messages
10. **Minimal changes** — only change what is necessary; do not refactor unrelated code

---

## Success Criteria

### Phase 1

- Clone → running standalone app in under 5 minutes
- Create a deficiency with photo, severity, category, and location via the web UI
- Filter deficiency list, update statuses, generate and download a PDF report
- REST API response format is consistent and inspectable

### Phase 2

- MCP server connected to ChatGPT via ngrok in under 10 minutes
- Natural language conversation triggers tools and renders widgets in ChatGPT
- Deficiency logged via ChatGPT appears in the standalone app (and vice versa)
- MCP tool → REST API mapping is clear and readable in the source

---

## Future Considerations (Out of Scope for v1)

- Claude (Anthropic) integration using the same REST API with Claude's MCP tool use
- Publishing to the ChatGPT app directory (requires HTTPS + review)
- OAuth authentication for production login
- Floor plan overlay with location-pinning widget
- Mobile-native camera integration
- Integration with Procore, Autodesk Build, PlanGrid
- Commerce SDK integration for premium features
