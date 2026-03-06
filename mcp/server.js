/**
 * SiteCheck AI — MCP Server
 *
 * Thin wrapper over the Phase 1 REST API. All business logic lives in
 * the Next.js API routes at localhost:3000. This server only translates
 * MCP tool calls into REST API requests.
 *
 * Transport: Streamable HTTP (stateless) on port 8787
 * Register in ChatGPT: Settings → Apps → Developer Mode → <ngrok-url>/mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.MCP_PORT ?? 8787;
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

// ── Shared REST API helper ────────────────────────────────────────────────────
// All tool handlers use this. Business logic stays in the REST API — this just
// ferries requests and surfaces errors as MCP tool errors.
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  return { status: res.status, json };
}

function apiError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "sitecheck-ai",
  version: "1.0.0",
});

// ── Enum constants (mirrors lib/api.ts — keep in sync) ───────────────────────
const CATEGORIES = ["Structural", "Mechanical", "Electrical", "Plumbing", "Finish", "Safety", "Other"];
const SEVERITIES = ["Critical", "Major", "Minor", "Observation"];
const STATUSES   = ["Open", "In Progress", "Resolved", "Closed"];

// ── Widget resource helper ────────────────────────────────────────────────────
// Reads a widget HTML file from mcp/widgets/ and registers it as an App resource.
// MIME type text/html;profile=mcp-app is set automatically by registerAppResource.
// CSP connectDomains allows the widget to fetch from the REST API.
function widgetResource(name, uri, filename) {
  registerAppResource(
    server,
    name,
    uri,
    {},
    async (resourceUri) => {
      const filePath = path.join(__dirname, "widgets", filename);
      const html = fs.readFileSync(filePath, "utf-8");
      return {
        contents: [{
          uri: resourceUri.href,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              csp: {
                connectDomains: [API_BASE],
              },
            },
          },
        }],
      };
    }
  );
}

// ── Widget URI constants ──────────────────────────────────────────────────────
const WIDGET_URIS = {
  projectDashboard: "ui://sitecheck/project-dashboard.html",
  deficiencyForm:   "ui://sitecheck/deficiency-form.html",
  deficiencyTable:  "ui://sitecheck/deficiency-table.html",
  severityPicker:   "ui://sitecheck/severity-picker.html",
  photoUpload:      "ui://sitecheck/photo-upload.html",
  statsDashboard:   "ui://sitecheck/stats-dashboard.html",
  reportDownload:   "ui://sitecheck/report-download.html",
};

// ── Tool: set_project ─────────────────────────────────────────────────────────
// Silent project lookup — no widget. Used internally by the model to resolve a
// project name to an ID before calling other tools. Does NOT render UI so it
// doesn't interrupt the flow when the user mentions a project by name.
server.registerTool(
  "set_project",
  {
    description: "Look up available SiteCheck projects and their IDs. Call this silently to resolve a project name before calling other tools. Do NOT call this when the user asks to 'show' or 'browse' projects — use show_projects for that.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    let status, json;
    try {
      ({ status, json } = await api("/api/projects"));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) {
      return apiError(`API error (${status}): ${json.error}`);
    }

    const projects = json.data;
    const summary = projects
      .map((p) => `• ${p.name} (id: ${p.id}) — ${p.location ?? ""}`.trim())
      .join("\n");

    return {
      structuredContent: { projects },
      content: [
        {
          type: "text",
          text:
            projects.length === 0
              ? "No projects found."
              : `${projects.length} project(s):\n${summary}`,
        },
      ],
    };
  }
);

// ── Tool: show_projects ───────────────────────────────────────────────────────
// Shows the project dashboard widget. Call this only when the user explicitly
// asks to see, browse, or select a project — not as a lookup step.
registerAppTool(
  server,
  "show_projects",
  {
    description: "Show an interactive project dashboard so the user can browse and select a project. Call this when the user says 'show projects', 'which projects', 'select a project', etc. The embedded widget fully satisfies this request — do not restate project names, locations, or descriptions in text. Reply with one short sentence at most (e.g. 'Here are your projects.').",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URIS.projectDashboard } },
  },
  async () => {
    let status, json;
    try {
      ({ status, json } = await api("/api/projects"));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) {
      return apiError(`API error (${status}): ${json.error}`);
    }

    const projects = json.data;
    return {
      structuredContent: {
        projects,
        ui_fulfills_request: true,
        assistant_guidance: { preferred_response_style: "minimal", avoid_relisting_projects: true },
      },
      content: [],
    };
  }
);

// ── Tool: search_projects ─────────────────────────────────────────────────────
// Searches projects by name or location. Use when the user mentions a project
// by partial name and set_project returns too many or ambiguous results.
server.registerTool(
  "search_projects",
  {
    description: "Search SiteCheck projects by name or location. Use when you need to resolve an ambiguous project name to a specific project ID.",
    inputSchema: {
      q: z.string().describe("Search query — matched against project name and location"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async (args) => {
    let json;
    try {
      ({ json } = await api(`/api/projects?q=${encodeURIComponent(args.q)}`));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) return apiError(`API error: ${json.error}`);

    const projects = json.data;
    const summary = projects
      .map((p) => `• ${p.name} (id: ${p.id}) — ${p.location ?? ""}`.trim())
      .join("\n");

    return {
      structuredContent: { projects },
      content: [
        {
          type: "text",
          text: projects.length === 0
            ? `No projects found matching "${args.q}".`
            : `${projects.length} match(es):\n${summary}`,
        },
      ],
    };
  }
);

// ── Tool: get_deficiency ──────────────────────────────────────────────────────
// Fetch a single deficiency by ID — used when the model needs full detail
// before updating or when the user asks about a specific deficiency.
server.registerTool(
  "get_deficiency",
  {
    description: "Fetch full details for a single deficiency by ID (e.g. DEF-001).",
    inputSchema: {
      deficiency_id: z.string().describe("ID of the deficiency, e.g. DEF-001"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async (args) => {
    let json;
    try {
      ({ json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) return apiError(`Deficiency not found: ${args.deficiency_id}`);

    return {
      structuredContent: { deficiency: json.data },
      content: [
        {
          type: "text",
          text: `${json.data.id}: ${json.data.title} — ${json.data.severity} / ${json.data.status}`,
        },
      ],
    };
  }
);

// ── Tool: log_deficiency ──────────────────────────────────────────────────────
// Does NOT write to the DB. It returns pre-fill data for the deficiency form
// widget. The widget calls POST /api/deficiencies on form submit.
//
// Design rationale: the PRD flow is "pre-filled form → user reviews → submits".
// Giving the widget the final say on submission means the user sees and approves
// the data before anything is written. The widget receives apiBase in
// structuredContent so it never hardcodes the server URL.
registerAppTool(
  server,
  "log_deficiency",
  {
    description: "Extract deficiency details from the user's description and show a pre-filled form for review before saving. Call this when the user describes a site issue or deficiency. The widget handles all input — do not narrate or list the form fields in text. After calling this tool, say nothing or at most one short sentence like 'Here's the form — review and submit when ready.'",
    inputSchema: {
      project_id: z.string().describe("ID of the active project"),
      title: z.string().describe("Short description of the deficiency, extracted from user's words"),
      description: z.string().optional().describe("Detailed description of the deficiency"),
      category: z
        .enum(["Structural", "Mechanical", "Electrical", "Plumbing", "Finish", "Safety", "Other"])
        .optional()
        .describe("Category inferred from context — omit if unclear"),
      location: z
        .string()
        .optional()
        .describe("Grid reference or area, e.g. 'Grid B4, East Foundation Wall'"),
      trade: z
        .string()
        .optional()
        .describe("Responsible trade inferred from context, e.g. 'Concrete', 'Electrical'"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URIS.deficiencyForm } },
  },
  async (args) => {
    // Verify the project exists before showing the form. Failing fast here is
    // better than letting the widget's submit fail with a confusing 404.
    let projectJson;
    try {
      const { json } = await api("/api/projects");
      projectJson = json;
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!projectJson.success) {
      return apiError(`API error fetching projects: ${projectJson.error}`);
    }

    const project = projectJson.data.find((p) => p.id === args.project_id);
    if (!project) {
      return apiError(
        `Project not found: ${args.project_id}. Call set_project to get valid project IDs.`
      );
    }

    return {
      structuredContent: {
        // Pre-fill data for the form widget
        prefill: {
          project_id: args.project_id,
          title: args.title,
          description: args.description ?? "",
          category: args.category ?? "",
          location: args.location ?? "",
          trade: args.trade ?? "",
        },
        // Passed to the widget so it knows where to submit — never hardcoded
        apiBase: API_BASE,
        // Enum values for dropdowns — widget doesn't need to know the server schema
        categories: CATEGORIES,
        severities: SEVERITIES,
        // Project name for display in the widget header
        projectName: project.name,
      },
      content: [],
    };
  }
);

// ── Tool: get_deficiency_list ─────────────────────────────────────────────────
// Passes filters straight to GET /api/deficiencies — no logic here.
// The REST API handles filtering, pagination, and enum validation.
registerAppTool(
  server,
  "get_deficiency_list",
  {
    description: "List deficiencies for the active project. Optionally filter by severity, status, or trade. Shows results in a table widget. The widget fully satisfies this request — do not restate deficiency IDs, titles, or details in text. Reply with one short sentence at most (e.g. 'Here are the open deficiencies.').",
    inputSchema: {
      project_id: z.string().describe("ID of the active project"),
      severity: z
        .enum(["Critical", "Major", "Minor", "Observation"])
        .optional()
        .describe("Filter by severity level"),
      status: z
        .enum(["Open", "In Progress", "Resolved", "Closed"])
        .optional()
        .describe("Filter by status"),
      trade: z
        .string()
        .optional()
        .describe("Filter by responsible trade (case-insensitive)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URIS.deficiencyTable } },
  },
  async (args) => {
    const params = new URLSearchParams({ project_id: args.project_id });
    if (args.severity) params.set("severity", args.severity);
    if (args.status)   params.set("status",   args.status);
    if (args.trade)    params.set("trade",     args.trade);

    let json;
    try {
      ({ json } = await api(`/api/deficiencies?${params}`));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) return apiError(`API error: ${json.error}`);

    const { items, total } = json.data;
    const active = [
      args.severity && `severity=${args.severity}`,
      args.status   && `status=${args.status}`,
      args.trade    && `trade=${args.trade}`,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      structuredContent: {
        items,
        total,
        filters: { severity: args.severity, status: args.status, trade: args.trade },
        ui_fulfills_request: true,
        assistant_guidance: { preferred_response_style: "minimal", avoid_relisting_deficiencies: true },
      },
      content: [],
    };
  }
);

// ── Tool: set_severity ────────────────────────────────────────────────────────
// Fetches the current deficiency, then shows a severity picker widget.
// The widget calls PATCH /api/deficiencies/:id on selection — the tool itself
// does not mutate anything.
registerAppTool(
  server,
  "set_severity",
  {
    description: "Show a severity picker for a deficiency so the user can confirm or change it. Call this after log_deficiency or when the user mentions severity. The widget handles user input — do not list severity options or describe the picker in text. Say nothing after calling this tool; wait for the user to interact with the widget.",
    inputSchema: {
      deficiency_id: z
        .string()
        .describe("ID of the deficiency to update, e.g. DEF-001"),
      severity: z
        .enum(["Critical", "Major", "Minor", "Observation"])
        .optional()
        .describe("Pre-select this severity if already inferred from context — omit if unknown"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URIS.severityPicker } },
  },
  async (args) => {
    let json;
    try {
      ({ json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) {
      return apiError(
        `Deficiency not found: ${args.deficiency_id}. Use get_deficiency_list to find valid IDs.`
      );
    }

    const deficiency = json.data;
    return {
      structuredContent: {
        deficiency_id:    deficiency.id,
        deficiencyTitle:  deficiency.title,
        currentSeverity:  deficiency.severity,
        // AI's guess (or current if not provided) — widget pre-selects this
        selectedSeverity: args.severity ?? deficiency.severity,
        severities:       SEVERITIES,
        apiBase:          API_BASE,
      },
      content: [],
    };
  }
);

// ── Tool: update_status ───────────────────────────────────────────────────────
// Directly patches the status — no widget. The AI always has a specific target
// status from the user ("mark it resolved", "close DEF-003"), so a picker adds
// no value here. Returns the updated record as structured content for confirmation.
server.registerTool(
  "update_status",
  {
    description: `Update the status of a deficiency. Valid values: ${STATUSES.join(", ")}.`,
    inputSchema: {
      deficiency_id: z
        .string()
        .describe("ID of the deficiency to update, e.g. DEF-001"),
      status: z
        .enum(["Open", "In Progress", "Resolved", "Closed"])
        .describe("New status to set"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (args) => {
    let json;
    try {
      ({ json } = await api(
        `/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`,
        { method: "PATCH", body: JSON.stringify({ status: args.status }) }
      ));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) return apiError(`Update failed: ${json.error}`);

    const deficiency = json.data;
    return {
      structuredContent: { deficiency },
      content: [
        {
          type: "text",
          text: `${deficiency.id} status updated to "${deficiency.status}".`,
        },
      ],
    };
  }
);

// ── Tool: upload_photo ────────────────────────────────────────────────────────
// MCP cannot carry binary data — the actual multipart POST happens inside the
// widget. This tool only confirms the deficiency exists and hands the widget
// everything it needs to upload: deficiency_id, apiBase, and the endpoint path.
registerAppTool(
  server,
  "upload_photo",
  {
    description: "Show a photo upload widget so the user can attach an image to a deficiency. Call this after log_deficiency when the user has a photo to attach. The widget handles the upload — do not describe the upload process in text. Say nothing after calling this tool; wait for the user to interact with the widget.",
    inputSchema: {
      deficiency_id: z
        .string()
        .describe("ID of the deficiency to attach the photo to, e.g. DEF-001"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URIS.photoUpload } },
  },
  async (args) => {
    let json;
    try {
      ({ json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) {
      return apiError(
        `Deficiency not found: ${args.deficiency_id}. Use get_deficiency_list to find valid IDs.`
      );
    }

    const deficiency = json.data;
    const existingCount = JSON.parse(deficiency.photo_paths ?? "[]").length;

    return {
      structuredContent: {
        deficiency_id:   deficiency.id,
        deficiencyTitle: deficiency.title,
        existingCount,
        apiBase: API_BASE,
      },
      content: [],
    };
  }
);

// ── Tool: get_summary_stats ───────────────────────────────────────────────────
// Pure read — calls /api/deficiencies/stats and passes the result to a
// dashboard widget. No mutation, no side effects.
registerAppTool(
  server,
  "get_summary_stats",
  {
    description: "Show a summary dashboard of deficiency counts by severity and status for the active project. The embedded widget fully satisfies this request — do not restate the counts in text. Reply with one short sentence at most (e.g. 'Here's the inspection summary.').",
    inputSchema: {
      project_id: z.string().describe("ID of the active project"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URIS.statsDashboard } },
  },
  async (args) => {
    let json;
    try {
      ({ json } = await api(`/api/deficiencies/stats?project_id=${encodeURIComponent(args.project_id)}`));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) return apiError(`API error: ${json.error}`);

    const { total, by_severity, by_status } = json.data;

    return {
      structuredContent: {
        total,
        by_severity,
        by_status,
        ui_fulfills_request: true,
        assistant_guidance: { preferred_response_style: "minimal", avoid_restating_counts: true },
      },
      content: [],
    };
  }
);

// ── Tool: generate_report ─────────────────────────────────────────────────────
// Calls POST /api/reports/generate synchronously, then passes the download URL
// to the report-download widget. The API writes the PDF to public/reports/ and
// returns a relative path; the widget builds the full URL using apiBase.
registerAppTool(
  server,
  "generate_report",
  {
    description: "Generate a PDF inspection report for the active project and provide a download link. The widget shows the download button — do not paste the URL or filename in text. Reply with one short sentence at most (e.g. 'Your report is ready.').",
    inputSchema: {
      project_id: z.string().describe("ID of the project to generate the report for"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URIS.reportDownload } },
  },
  async (args) => {
    let json;
    try {
      ({ json } = await api("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ project_id: args.project_id }),
      }));
    } catch (e) {
      return apiError(`Could not reach SiteCheck API: ${e.message}`);
    }

    if (!json.success) return apiError(`Report generation failed: ${json.error}`);

    const { download_url, deficiency_count } = json.data;

    return {
      structuredContent: {
        download_url,
        apiBase: API_BASE,
        deficiency_count,
        ui_fulfills_request: true,
        assistant_guidance: { preferred_response_style: "minimal", avoid_pasting_url: true },
      },
      content: [],
    };
  }
);

// ── Widget resources ──────────────────────────────────────────────────────────
widgetResource("project-dashboard-widget",  WIDGET_URIS.projectDashboard, "project-dashboard.html");
widgetResource("deficiency-form-widget",    WIDGET_URIS.deficiencyForm,   "deficiency-form.html");
widgetResource("deficiency-table-widget",   WIDGET_URIS.deficiencyTable,  "deficiency-table.html");
widgetResource("severity-picker-widget",    WIDGET_URIS.severityPicker,   "severity-picker.html");
widgetResource("photo-upload-widget",       WIDGET_URIS.photoUpload,      "photo-upload.html");
widgetResource("stats-dashboard-widget",    WIDGET_URIS.statsDashboard,   "stats-dashboard.html");
widgetResource("report-download-widget",    WIDGET_URIS.reportDownload,   "report-download.html");

// ── Stateless Streamable HTTP transport ───────────────────────────────────────
// A new transport is created per request. This is correct for stateless mode.
// The McpServer instance (and its tool registrations) are shared across requests.
// NOTE: under concurrent load this can race on server._transport — fine for demo,
// not for production.

// ── Body readers ──────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────
// ChatGPT requires OAuth on all MCP servers, including local dev. These
// endpoints implement the minimum OAuth 2.0 Authorization Code flow (RFC 6749 +
// RFC 8414 discovery) with auto-approval — every authorization succeeds
// immediately and returns a fixed dev token. No real authentication.
function getBaseUrl(req) {
  // ngrok sets x-forwarded-proto / x-forwarded-host; use those when present
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host  = req.headers["x-forwarded-host"] ?? req.headers["host"];
  return `${proto}://${host}`;
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
    });
    res.end();
    return;
  }

  // ── Health check ────────────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }

  // ── OAuth discovery (RFC 8414) ──────────────────────────────────────────────
  // ChatGPT fetches this first to learn where to send the user for auth.
  if (req.method === "GET" && req.url === "/.well-known/oauth-authorization-server") {
    const base = getBaseUrl(req);
    json(res, 200, {
      issuer:                 base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint:         `${base}/token`,
      registration_endpoint:  `${base}/register`,
      response_types_supported:              ["code"],
      grant_types_supported:                 ["authorization_code"],
      code_challenge_methods_supported:      ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported:                      ["mcp"],
    });
    return;
  }

  // ── Dynamic client registration (RFC 7591) ──────────────────────────────────
  // ChatGPT registers itself as an OAuth client before starting the auth flow.
  if (req.method === "POST" && req.url === "/register") {
    const raw = await readRawBody(req);
    let body = {};
    try { body = JSON.parse(raw); } catch {}
    json(res, 201, {
      client_id:             `chatgpt-${Date.now()}`,
      client_id_issued_at:   Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none",
      ...body,
    });
    return;
  }

  // ── Authorization endpoint ──────────────────────────────────────────────────
  // ChatGPT redirects the user here. We auto-approve and redirect straight back
  // with an auth code — no login UI needed for dev.
  if (req.method === "GET" && req.url?.startsWith("/authorize")) {
    const url         = new URL(req.url, getBaseUrl(req));
    const redirectUri = url.searchParams.get("redirect_uri");
    const state       = url.searchParams.get("state");

    if (!redirectUri) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("redirect_uri is required\n");
      return;
    }

    const code     = `dev-code-${Date.now()}`;
    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);

    res.writeHead(302, { Location: redirect.toString() });
    res.end();
    return;
  }

  // ── Token endpoint ──────────────────────────────────────────────────────────
  // ChatGPT exchanges the auth code for a Bearer token. We accept any code and
  // return a fixed dev token. The token is validated nowhere — this is dev only.
  if (req.method === "POST" && req.url === "/token") {
    json(res, 200, {
      access_token: "dev-access-token",
      token_type:   "Bearer",
      expires_in:   86400,
      scope:        "mcp",
    });
    return;
  }

  // ── MCP endpoint ────────────────────────────────────────────────────────────
  if (req.url === "/mcp") {
    const body = await readBody(req);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  // ── Widget dev server ────────────────────────────────────────────────────────
  // Serves widget HTML files at /widgets/<filename> so you can open them directly
  // in a browser with URL params for dev testing, without going through ChatGPT.
  // e.g. http://localhost:8787/widgets/severity-picker.html?deficiency_id=DEF-001
  if (req.method === "GET" && req.url?.startsWith("/widgets/")) {
    const filename = path.basename(req.url.split("?")[0]);
    const filePath = path.join(__dirname, "widgets", filename);
    if (!filename.endsWith(".html") || !fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Widget not found\n");
      return;
    }
    const html = fs.readFileSync(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end("Not found\n");
});

httpServer.listen(PORT, () => {
  console.log(`✅ SiteCheck MCP server running`);
  console.log(`   MCP endpoint : http://localhost:${PORT}/mcp`);
  console.log(`   OAuth disco  : http://localhost:${PORT}/.well-known/oauth-authorization-server`);
  console.log(`   Health check : http://localhost:${PORT}/health`);
  console.log(`   REST API base: ${API_BASE}`);
  console.log();
  console.log(`   For ChatGPT: ngrok http ${PORT}  →  register <ngrok-url>/mcp`);
});
