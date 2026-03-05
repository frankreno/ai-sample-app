# SiteCheck AI

A construction site inspection tracker built as a two-phase prototype demonstrating how SaaS products connect to AI conversational platforms.

**Phase 1 (this branch):** Standalone Next.js web app with a clean REST API backed by SQLite.
**Phase 2 (planned):** ChatGPT integration via OpenAI Apps SDK / MCP server, calling the same REST API.

The analogy is OpenTable — users can log inspections via the web app *or* through ChatGPT. Same database, two interfaces.

---

## Quick Start

```bash
npm install
npm run setup   # creates SQLite DB + seeds 3 projects, 8 deficiencies
npm run dev     # http://localhost:3000
```

No Docker, no external services, no API keys required for Phase 1.

---

## What's in Phase 1

### Web App

- **Project selector** — switch between projects from the header
- **Summary dashboard** — total count, counts by severity (clickable to filter), counts by status
- **Deficiency table** — sortable view with color-coded severity and status badges
- **Filter bar** — filter by severity, status, and trade simultaneously
- **New Deficiency modal** — all fields including visual severity picker and photo upload
- **Inline status cycling** — click any status badge to advance it (Open → In Progress → Resolved → Closed)
- **Report generation** — generates a PDF inspection report, available for immediate download

### Severity colors (consistent everywhere)

| Severity | Color |
|---|---|
| Critical | Red |
| Major | Orange |
| Minor | Yellow |
| Observation | Blue |

### REST API

All responses use a consistent envelope:
```json
{ "success": true, "data": {}, "error": null }
```

| Endpoint | Method | Description |
|---|---|---|
| `/api/projects` | GET | List all projects |
| `/api/deficiencies` | GET | List deficiencies — filters: `project_id` (required), `severity`, `status`, `trade`; pagination: `page`, `limit` |
| `/api/deficiencies` | POST | Create a deficiency |
| `/api/deficiencies/[id]` | GET | Get a single deficiency |
| `/api/deficiencies/[id]` | PATCH | Update fields (severity, status, title, etc.) |
| `/api/deficiencies/[id]/photos` | POST | Upload a photo (multipart/form-data), attach to deficiency |
| `/api/deficiencies/stats` | GET | Counts grouped by severity and status for a `project_id` |
| `/api/reports/generate` | POST | Generate a PDF report for a `project_id`, returns download URL |

#### Enums

| Field | Values |
|---|---|
| `category` | `Structural`, `Mechanical`, `Electrical`, `Plumbing`, `Finish`, `Safety`, `Other` |
| `severity` | `Critical`, `Major`, `Minor`, `Observation` |
| `status` | `Open`, `In Progress`, `Resolved`, `Closed` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Database | SQLite via `better-sqlite3` |
| PDF generation | `pdfkit` |
| Language | TypeScript |

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
├── public/
│   ├── uploads/                  # Photo uploads stored here
│   └── reports/                  # Generated PDFs stored here
└── types/index.ts                # Shared TypeScript types
```

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
| `category` | TEXT | Enum — see above |
| `severity` | TEXT | Enum — see above |
| `status` | TEXT | Enum — see above, default `Open` |
| `location` | TEXT | Grid ref or description |
| `trade` | TEXT | Responsible trade |
| `photo_paths` | TEXT | JSON array of `/uploads/...` paths |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

---

## API Design Notes (for Phase 2 / MCP integration)

The REST API is intentionally designed for external consumers, not just the frontend:

- **Consistent envelope** — every response has `success`, `data`, `error`
- **Enum validation** — invalid values return a `400` with a clear message listing accepted values
- **Filter parameters** on list endpoints — the MCP server can query by severity, status, trade without fetching everything
- **Pagination** — `?page=N&limit=N` on `/api/deficiencies` (max 200 per page)
- **Idempotency-friendly** — PATCH accepts partial updates; creating duplicate deficiencies generates a new sequential ID

In Phase 2, an MCP server will wrap these endpoints as ChatGPT tools — each tool handler is a thin HTTP call to this API with no duplicated business logic.

---

## Seed Data

`npm run setup` seeds:

- **Oakwood Tower** — 22-story mixed-use residential tower, Denver CO (4 deficiencies)
- **Riverside Industrial Park** — warehouse/logistics facility, Aurora CO (2 deficiencies)
- **Maple Street Renovation** — historic seismic retrofit, Boulder CO (2 deficiencies)

Deficiencies span all severity levels and statuses so the dashboard and filters are populated immediately.
