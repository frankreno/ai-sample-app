# SiteCheck AI

A construction site inspection tracker built as a two-phase prototype demonstrating how SaaS products connect to AI conversational platforms.

**Phase 1:** Standalone Next.js web app with a REST API backed by SQLite.
**Phase 2:** ChatGPT integration via OpenAI Apps SDK + MCP server, calling the same REST API.

The analogy is OpenTable — users can log inspections via the web app *or* through ChatGPT. Same database, two interfaces.

---

## Architecture

```
[React Frontend]  →  [REST API]  →  [SQLite DB]
[MCP Server]      →  [REST API]  →  [SQLite DB]
```

The MCP server is a thin wrapper — all business logic lives in the REST API. A deficiency created via ChatGPT appears immediately in the web app, and vice versa.

---

## Quick Start — Phase 1 (Web App)

```bash
npm install
npm run setup   # creates SQLite DB + seeds 3 projects, 8 deficiencies
npm run dev     # http://localhost:3000
```

No Docker, no external services, no API keys required.

---

## Quick Start — Phase 2 (ChatGPT Integration)

Requires the web app running on port 3000 and ngrok installed.

```bash
# Terminal 1 — Next.js REST API
npm run dev

# Terminal 2 — MCP server
npm run mcp     # http://localhost:8787

# Terminal 3 — expose MCP server publicly
ngrok http 8787
```

### Register in ChatGPT

1. Go to **chatgpt.com** → profile → **Settings → Apps**
2. Click **Add app** → paste `<ngrok-url>/mcp`
3. Complete the OAuth flow (auto-approves in dev)
4. In a new chat, click **"+"** near the input to add SiteCheck to the conversation

### Test prompts

| Prompt | Widget rendered |
|---|---|
| "Show me my SiteCheck projects" | Project dashboard |
| "Show deficiencies for Maple Street" | Deficiency table |
| "Show only Critical deficiencies for Maple Street" | Deficiency table (filtered) |
| "Show stats for Maple Street" | Stats dashboard |
| "Log a cracked beam at Grid B4 on Maple Street" | Deficiency form (pre-filled) |
| "Change the severity of DEF-001" | Severity picker |
| "Attach a photo to DEF-001" | Photo upload |
| "Generate a report for Maple Street" | Report download |
| "Mark DEF-001 as resolved" | Text only (no widget) |

> **Tip:** ngrok free tunnels expire after a few hours. When the URL changes, remove and re-add the app in ChatGPT settings. A free static domain is available at dashboard.ngrok.com.

---

## What's in the Web App

- **Project selector** — switch between projects from the header
- **Summary dashboard** — total count, counts by severity (clickable to filter), counts by status
- **Deficiency table** — sortable view with color-coded severity and status badges
- **Filter bar** — filter by severity, status, and trade simultaneously
- **New Deficiency modal** — all fields including visual severity picker and photo upload
- **Inline status cycling** — click any status badge to advance it (Open → In Progress → Resolved → Closed)
- **Report generation** — generates a PDF inspection report, available for immediate download

---

## REST API

All responses use a consistent envelope:
```json
{ "success": true, "data": {}, "error": null }
```

| Endpoint | Method | Description |
|---|---|---|
| `/api/projects` | GET | List all projects — optional `q` to search by name or location |
| `/api/deficiencies` | GET | List deficiencies — `project_id` (required), optional filters: `severity`, `status`, `trade`, `date_from`, `date_to`; sorting: `sort_by`, `sort_dir`; pagination: `page`, `limit` |
| `/api/deficiencies` | POST | Create a deficiency |
| `/api/deficiencies/[id]` | GET | Get a single deficiency |
| `/api/deficiencies/[id]` | PATCH | Update fields (severity, status, title, description, category, location, trade) |
| `/api/deficiencies/[id]/photos` | POST | Upload a photo (multipart/form-data, field name `photo`) — returns updated deficiency + `photo_url` |
| `/api/deficiencies/stats` | GET | Counts grouped by severity and status for a `project_id` |
| `/api/reports/generate` | POST | Generate a PDF report — returns `download_url` and `deficiency_count` |

### Enums

| Field | Values |
|---|---|
| `category` | `Structural`, `Mechanical`, `Electrical`, `Plumbing`, `Finish`, `Safety`, `Other` |
| `severity` | `Critical`, `Major`, `Minor`, `Observation` |
| `status` | `Open`, `In Progress`, `Resolved`, `Closed` |

---

## MCP Tools

The MCP server exposes these tools to ChatGPT:

| Tool | Widget | Description |
|---|---|---|
| `set_project` | — | Silent project lookup (resolves name → ID) |
| `show_projects` | project-dashboard | Browse all projects |
| `log_deficiency` | deficiency-form | Pre-filled form to log a new deficiency |
| `get_deficiency_list` | deficiency-table | List/filter deficiencies |
| `get_summary_stats` | stats-dashboard | Counts by severity and status |
| `set_severity` | severity-picker | Pick/confirm severity for a deficiency |
| `update_status` | — | Directly patch status (no UI needed) |
| `upload_photo` | photo-upload | Attach a photo to a deficiency |
| `generate_report` | report-download | Generate PDF + download link |

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── projects/route.ts
│   │   ├── deficiencies/route.ts
│   │   ├── deficiencies/[id]/route.ts
│   │   ├── deficiencies/[id]/photos/route.ts
│   │   ├── deficiencies/stats/route.ts
│   │   └── reports/generate/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # Main SPA
├── components/
│   ├── NewDeficiencyModal.tsx
│   ├── SeverityBadge.tsx
│   └── StatusBadge.tsx
├── db/
│   ├── schema.sql                # Table definitions
│   └── setup.ts                  # Seed script (npm run setup)
├── lib/
│   ├── api.ts                    # Response helpers + enum constants
│   └── db.ts                     # SQLite singleton
├── mcp/
│   ├── server.js                 # MCP server (thin wrapper over REST API)
│   └── widgets/                  # Embedded UI HTML files
│       ├── project-dashboard.html
│       ├── deficiency-form.html
│       ├── deficiency-table.html
│       ├── severity-picker.html
│       ├── photo-upload.html
│       ├── stats-dashboard.html
│       └── report-download.html
├── middleware.ts                 # CORS headers for API routes
├── public/
│   ├── uploads/                  # Photo uploads
│   └── reports/                  # Generated PDFs
└── types/index.ts
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| Database | SQLite via `better-sqlite3` |
| PDF generation | `pdfkit` |
| MCP server | `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps` |
| Language | TypeScript |

---

## Database Schema

### `projects`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `name` | TEXT | |
| `location` | TEXT | |
| `description` | TEXT | |
| `created_at` | TEXT | ISO datetime |

### `deficiencies`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key, e.g. `DEF-001` |
| `project_id` | TEXT | Foreign key → projects |
| `title` | TEXT | |
| `description` | TEXT | |
| `category` | TEXT | Enum |
| `severity` | TEXT | Enum |
| `status` | TEXT | Enum, default `Open` |
| `location` | TEXT | Grid ref or description |
| `trade` | TEXT | Responsible trade |
| `photo_paths` | TEXT | JSON array of `/uploads/...` paths |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

---

## Seed Data

`npm run setup` seeds:

- **Maple Street Renovation** — historic seismic retrofit, Boulder CO
- **Oakwood Tower** — 22-story mixed-use tower, Denver CO
- **Riverside Industrial Park** — warehouse/logistics facility, Aurora CO

Deficiencies span all severity levels and statuses so the dashboard and filters are populated immediately.
