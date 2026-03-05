# Product Requirements Document — SiteCheck AI

**AI-Powered Site Inspection Tracker**
Standalone App + ChatGPT Integration via OpenAI Apps SDK

| | |
|---|---|
| Document Version | 2.0 |
| Date | March 4, 2026 |
| Status | Draft |
| Classification | Internal — Partner Engineering |

This document defines requirements for SiteCheck AI, a construction site inspection application built in two phases: (1) a standalone web app with REST API, and (2) an integration with ChatGPT via the OpenAI Apps SDK (MCP). Together they demonstrate how partners connect existing SaaS products to AI conversational platforms.

---

## 1. Executive Summary

SiteCheck AI is a functional prototype built in two phases to demonstrate how construction software partners can connect their existing SaaS products to AI conversational platforms.

The analogy is **OpenTable**: users can book a restaurant on opentable.com (the standalone app) OR through ChatGPT (the AI integration). Same data, same backend, different experience. SiteCheck AI follows this same pattern for construction site inspections.

| Phase | What We Build | What Partners Learn |
|---|---|---|
| Phase 1 | Standalone SiteCheck web app with its own UI and a clean REST API | How to structure an app so it's "AI-ready" with a proper API layer |
| Phase 2 | ChatGPT integration via the OpenAI Apps SDK (MCP server + ChatGPT UI widgets) | How to connect an existing product to ChatGPT: tools, widgets, auth, and the MCP protocol |

### 1.1 Goals

- Demonstrate the full journey from standalone SaaS app to ChatGPT integration
- Show how a clean REST API enables AI platform connectivity without rewriting the app
- Build an MCP server that wraps the REST API and exposes tools to ChatGPT
- Build ChatGPT UI widgets (rendered in iframe) that provide rich interactive experiences inside the chat
- Illustrate what's portable across AI platforms (REST API, tool definitions) vs. what's platform-specific (MCP protocol, widget runtime)
- Run locally with minimal setup to lower the barrier for partner engineering teams

### 1.2 Non-Goals

- Production-grade authentication, authorization, or multi-tenancy
- Publishing to the ChatGPT app directory (local dev mode testing is sufficient)
- Real-time collaboration or multi-user concurrency
- Mobile-native camera integration (web upload is sufficient)

---

## 2. Product Overview

### 2.1 The Two Experiences

Just like OpenTable has both a website and a ChatGPT integration, SiteCheck AI provides two ways to interact with the same data:

| | Experience 1: SiteCheck Website | Experience 2: SiteCheck in ChatGPT |
|---|---|---|
| How users access it | Go to localhost:3000 in a browser | Start a conversation in ChatGPT and mention SiteCheck |
| UI | Full React app with forms, tables, photo upload, dashboards | ChatGPT renders inline widgets (iframe) triggered by MCP tool calls |
| Who controls the flow | The user navigates the app directly | ChatGPT's model decides when to call tools based on conversation |
| Backend | REST API → SQLite | MCP server → REST API → SQLite (same database) |
| Data | Same data, same database | Same data, same database |

### 2.2 Example User Flow: Standalone App (Phase 1)

1. User opens SiteCheck at localhost:3000 and selects the Oakwood Tower project
2. User clicks "New Deficiency" and fills out a form: title, category, location, trade
3. User uploads a photo of the deficiency
4. User selects severity: Critical
5. Deficiency appears in the inspection log table
6. User filters the table to show only Critical items
7. User clicks "Generate Report" and downloads a PDF

### 2.3 Example User Flow: ChatGPT Integration (Phase 2)

1. User in ChatGPT: *"SiteCheck, I found a crack in the east wall foundation at grid B4"*
2. ChatGPT calls the `log_deficiency` MCP tool with extracted fields
3. SiteCheck widget renders inline: a pre-filled deficiency form in the chat. User reviews and submits.
4. ChatGPT calls `upload_photo` tool. Widget renders a photo upload dropzone. User attaches image.
5. ChatGPT calls `set_severity` tool. Widget renders severity picker. User selects "Critical."
6. ChatGPT confirms: *"Logged critical structural deficiency DEF-042 at grid B4 with photo."*
7. User: *"Show me all critical items this week."*
8. ChatGPT calls `get_deficiency_list` tool. Widget renders a filtered data table inline.
9. User: *"Generate the inspection report."*
10. ChatGPT calls `generate_report` tool. Widget shows a download link.

**Key insight:** the same deficiency created via ChatGPT appears in the standalone app, and vice versa. One database, two interfaces.

### 2.4 Target Users (for the prototype demo)

- Partner engineering teams evaluating our AI platform
- Internal product and solutions engineering teams
- Construction technology PMs assessing conversational AI feasibility

---

## 3. Architecture & Tech Stack

### 3.1 Overall System Architecture

The system has three layers. The standalone app and the ChatGPT integration share the same REST API and database:

| Layer | Technology | Responsibility |
|---|---|---|
| Standalone Frontend | Next.js (React) | Full web UI for direct user interaction |
| REST API | Next.js API Routes | CRUD operations for projects, deficiencies, photos, reports. Shared by both experiences. |
| Database | SQLite | Stores all inspection data. Shared by both experiences. |
| File Storage | Local filesystem | Stores uploaded photos and generated reports |
| MCP Server | Node.js + @modelcontextprotocol/sdk | Wraps the REST API as MCP tools. Connects to ChatGPT via Apps SDK. |
| ChatGPT Widgets | HTML/React bundles in iframe | Rich UI components rendered inside ChatGPT (forms, tables, pickers, etc.) |

### 3.2 Phase 1 Architecture: Standalone App

Phase 1 is a conventional Next.js web application. No AI, no MCP — just a clean app with a well-designed API:

- Users interact with the React frontend directly
- Frontend calls REST API routes for all data operations
- API routes are the single source of truth for business logic
- **Critical:** the API is designed to be called by external clients, not just the frontend. Clean request/response schemas, proper error handling, consistent JSON envelope.

**Why this matters:** Partners already have apps. The lesson of Phase 1 is that if your API is clean and well-structured, connecting it to an AI platform is straightforward. If your API is tightly coupled to your frontend, it's painful.

### 3.3 Phase 2 Architecture: ChatGPT via Apps SDK

Phase 2 adds an MCP server and ChatGPT UI widgets on top of the existing app. The standalone app continues to work unchanged.

**How the OpenAI Apps SDK works:**

1. You build an MCP server that defines tools (functions ChatGPT can call) and registers UI widget resources
2. You connect the MCP server to ChatGPT via Developer Mode (locally via ngrok tunnel during development)
3. When a user mentions your app in ChatGPT, the model can call your tools
4. Each tool can return structured data + point to a UI widget template
5. ChatGPT renders your widget in an iframe inline in the conversation
6. Your widget communicates with ChatGPT via the MCP Apps UI bridge (JSON-RPC over postMessage)
7. Your MCP server's tool handlers call your REST API — the same API the standalone app uses

### 3.4 How the MCP Server Wraps the REST API

The MCP server is a thin translation layer. It does not duplicate business logic — it just maps MCP tool calls to REST API requests:

| MCP Tool | REST API Call | Returns |
|---|---|---|
| `log_deficiency` | `POST /api/deficiencies` | Created deficiency record + widget |
| `upload_photo` | `POST /api/deficiencies/:id/photos` | Photo path + widget |
| `set_severity` | `PATCH /api/deficiencies/:id` | Updated record + widget |
| `update_status` | `PATCH /api/deficiencies/:id` | Updated record confirmation |
| `get_deficiency_list` | `GET /api/deficiencies?filters` | Filtered list + table widget |
| `get_summary_stats` | `GET /api/deficiencies/stats` | Counts + dashboard widget |
| `generate_report` | `POST /api/reports/generate` | PDF download link |
| `set_project` | `GET /api/projects` + session state | Project confirmation + widget |

**Key principle for partners:** your MCP server should be a thin wrapper. All real logic stays in your REST API. This means your standalone app and your ChatGPT integration always behave identically.

### 3.5 ChatGPT Widget Architecture

Widgets are HTML/React bundles rendered inside an iframe in ChatGPT. They communicate with the host via the MCP Apps UI bridge:

- Each tool can reference a widget template via `_meta.ui.resourceUri` (MCP standard) or `_meta["openai/outputTemplate"]` (ChatGPT extension)
- Widget receives structured data from the tool call result (e.g., pre-filled form fields, deficiency list)
- Widget renders interactive UI: forms, tables, pickers, photo upload, download links
- User interactions are sent back to the MCP server via `tools/call` on the bridge
- Widgets are built with the framework of your choice (React, vanilla HTML, etc.) and bundled as static assets

### 3.6 Key Technical Decisions

- **REST API first:** business logic lives in the API, not the frontend or the MCP server
- **SQLite** for zero-config local development
- **MCP server as thin wrapper:** no duplicated logic
- **ngrok** for local tunnel during ChatGPT development (standard Apps SDK dev workflow)
- **Widgets bundled as static HTML:** keeps things simple, avoids needing a separate build pipeline
- **Single repo with clear separation:** `/app` (frontend), `/api` (REST), `/mcp` (MCP server + widgets)

---

## 4. Phase 1: Standalone App Requirements

Phase 1 delivers a fully functional construction inspection app. No AI integration — this is the partner's "existing product."

### 4.1 Web Frontend

A clean, functional React UI for direct inspection management.

| ID | Requirement | Interaction Type | Priority |
|---|---|---|---|
| FR-01 | Project selector in the app header to set the active project context | Dropdown | P0 |
| FR-02 | Deficiency entry form with fields: title, description, category, location, trade, severity | Form | P0 |
| FR-03 | Photo upload component (drag-and-drop or click-to-browse, JPEG/PNG, max 10MB) | Photo Upload | P0 |
| FR-04 | Deficiency list table: sortable columns (ID, title, severity, status, location, trade, date) | Data Table | P0 |
| FR-05 | Color-coded severity and status badges in the table | Data Table | P0 |
| FR-06 | Filter controls on the table: by severity, status, trade, date range | Filters | P1 |
| FR-07 | Status update control on each deficiency item (Open → In Progress → Resolved → Closed) | Status Update | P0 |
| FR-08 | Summary dashboard: total items, breakdown by severity and status with counts | Dashboard | P1 |
| FR-09 | Generate Report button that produces a PDF with all deficiencies, photos, and summary | File Generation | P1 |

### 4.2 REST API

The API is the shared backbone. It must be designed for external consumers (the MCP server), not just the frontend.

| ID | Requirement | Interaction Type | Priority |
|---|---|---|---|
| FR-10 | `GET /api/projects` — List all projects | API | P0 |
| FR-11 | `POST /api/deficiencies` — Create a new deficiency with all fields | API | P0 |
| FR-12 | `GET /api/deficiencies` — List deficiencies with query filters (severity, status, trade, date, project_id) | API | P0 |
| FR-13 | `PATCH /api/deficiencies/:id` — Update severity, status, or other fields | API | P0 |
| FR-14 | `POST /api/deficiencies/:id/photos` — Upload a photo to a deficiency | API | P0 |
| FR-15 | `GET /api/deficiencies/stats` — Return counts by severity and status for the active project | API | P1 |
| FR-16 | `POST /api/reports/generate` — Generate a PDF inspection report and return a download URL | API | P1 |
| FR-17 | All API responses use a consistent JSON envelope: `{ success, data, error }` | API | P0 |
| FR-18 | All API errors return appropriate HTTP status codes and structured error objects | API | P0 |

### 4.3 Data Model

**Projects Table**

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `name` | TEXT | e.g., Oakwood Tower |
| `address` | TEXT | Site address |
| `created_at` | DATETIME | Auto-generated |

**Deficiencies Table**

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key, sequential `DEF-XXX` |
| `project_id` | TEXT | FK to projects |
| `title` | TEXT | Short description |
| `description` | TEXT | Detailed description |
| `category` | TEXT | Structural, Mechanical, Electrical, Plumbing, Finish, Safety, Other |
| `severity` | TEXT | Critical, Major, Minor, Observation |
| `status` | TEXT | Open, In Progress, Resolved, Closed |
| `location` | TEXT | Grid line or area reference |
| `trade` | TEXT | Responsible trade/subcontractor |
| `photo_paths` | TEXT (JSON) | Array of file paths |
| `created_at` | DATETIME | Auto-generated |
| `updated_at` | DATETIME | Auto-updated on changes |

---

## 5. Phase 2: ChatGPT Integration via Apps SDK

Phase 2 connects the existing SiteCheck app to ChatGPT using the OpenAI Apps SDK. The standalone app continues to work unchanged. A new MCP server and ChatGPT widgets are added alongside the existing codebase.

### 5.1 MCP Server

The MCP server exposes tools to ChatGPT and registers UI widget resources. It is a thin wrapper over the REST API.

| ID | Requirement | Interaction Type | Priority |
|---|---|---|---|
| FR-50 | MCP server built with `@modelcontextprotocol/sdk` (Node.js) exposing `/mcp` endpoint via Streamable HTTP or SSE | MCP | P0 |
| FR-51 | Each tool definition includes proper tool annotations: `readOnlyHint`, `destructiveHint`, `openWorldHint` | MCP | P0 |
| FR-52 | Tool handlers call the Phase 1 REST API (not the database directly) to execute operations | MCP | P0 |
| FR-53 | Tool responses return `structuredContent` with data payload and `_meta.ui.resourceUri` pointing to widget templates | MCP | P0 |
| FR-54 | MCP server registers UI resource templates (HTML bundles) for each widget type | MCP | P0 |
| FR-55 | MCP server runs on a separate port (e.g., 8787) alongside the Next.js app | MCP | P0 |

### 5.2 MCP Tool Definitions

Each tool maps to a REST API call and optionally triggers a ChatGPT UI widget:

| Tool Name | Description | Widget Rendered in ChatGPT |
|---|---|---|
| `log_deficiency` | Creates a deficiency from conversational context. Pre-fills fields from AI extraction. | Editable form with pre-filled title, category, location, trade |
| `upload_photo` | Attaches a photo to the current deficiency | Drag-and-drop upload zone with thumbnail preview |
| `set_severity` | Sets severity on a deficiency item | Four-option color-coded severity picker |
| `update_status` | Changes status of an existing deficiency | Status dropdown with color badges |
| `get_deficiency_list` | Retrieves filtered deficiency items for the active project | Sortable, filterable data table |
| `get_summary_stats` | Returns counts grouped by severity and status | Dashboard card with counts and mini chart |
| `generate_report` | Generates a PDF inspection report | Loading indicator then download link |
| `set_project` | Sets the active project context | Project confirmation card |

### 5.3 ChatGPT UI Widgets

Widgets are interactive UI components rendered inside ChatGPT's iframe. They are built as static HTML/React bundles and registered as MCP resources.

| ID | Requirement | Interaction Type | Priority |
|---|---|---|---|
| FR-60 | Deficiency form widget: editable fields pre-populated by AI, Submit and Cancel buttons, result sent back via MCP bridge | Widget (Form) | P0 |
| FR-61 | Photo upload widget: drag-and-drop or file picker, thumbnail preview, Skip button for optional uploads | Widget (Upload) | P0 |
| FR-62 | Severity picker widget: 4-option horizontal buttons (Critical=red, Major=orange, Minor=yellow, Observation=blue) | Widget (Picker) | P0 |
| FR-63 | Deficiency table widget: sortable columns, color-coded badges, renders filtered results inline | Widget (Table) | P0 |
| FR-64 | Summary dashboard widget: counts by severity and status with colored indicators | Widget (Dashboard) | P1 |
| FR-65 | Report download widget: shows generation progress then a download link | Widget (Download) | P1 |
| FR-66 | All widgets use the MCP Apps UI bridge (JSON-RPC over postMessage) for host communication | System | P0 |
| FR-67 | Widgets are styled to feel native in ChatGPT using the `@openai/apps-sdk-ui` kit (optional) | System | P2 |

### 5.4 ChatGPT Connection & Developer Mode

During development, the MCP server connects to ChatGPT via Developer Mode using a local tunnel:

| ID | Requirement | Interaction Type | Priority |
|---|---|---|---|
| FR-70 | MCP server is accessible via ngrok tunnel for ChatGPT Developer Mode connection | Dev Setup | P0 |
| FR-71 | App is registered in ChatGPT Settings → Apps using the ngrok tunnel URL + `/mcp` | Dev Setup | P0 |
| FR-72 | Tool calls work end-to-end: ChatGPT → ngrok → MCP server → REST API → SQLite | Integration | P0 |
| FR-73 | Changes to MCP server are testable by refreshing the connector in ChatGPT settings | Dev Setup | P0 |

### 5.5 Error Handling & Edge Cases

| ID | Requirement | Interaction Type | Priority |
|---|---|---|---|
| FR-80 | If a user cancels a widget (form, picker), a cancellation result is sent back via the MCP bridge and the model recovers gracefully | System | P0 |
| FR-81 | If a REST API call fails, the MCP tool returns a structured error so the model can inform the user | System | P0 |
