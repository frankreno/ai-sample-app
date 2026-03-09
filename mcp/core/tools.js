/**
 * Platform-neutral tool definitions for the SiteCheck MCP server.
 *
 * Each tool is a plain object with:
 *   - name, description, inputSchema (zod), annotations
 *   - descriptionGeneric – optional; used by the generic adapter when present. Instructs the LLM
 *                          to summarize or interpret the tool result. If absent, generic adapter uses description.
 *   - widget        – { uri, file } if the tool has a UI widget, null otherwise
 *   - handler(args) – calls the REST API; returns { data } or { error }
 *   - directHandler – optional override for non-widget platforms (e.g. log_deficiency
 *                     creates the deficiency directly instead of returning a pre-fill form)
 *   - formatText(result)       – human-readable text for generic MCP clients
 *   - formatStructured(result) – structuredContent payload for widget-capable platforms
 *
 * description is used by the OpenAI adapter (widget-oriented: minimal reply, don't restate).
 * The generic adapter uses descriptionGeneric ?? description so text-only clients get guidance
 * to summarize/interpret the returned data.
 *
 * The adapters (openai.js, generic.js) decide which handler and formatter to use.
 */

import { z } from "zod";
import { api, API_BASE, CATEGORIES, SEVERITIES, STATUSES } from "./api-client.js";

// ── Widget URI constants ──────────────────────────────────────────────────────
export const WIDGET_URIS = {
  projectDashboard: "ui://sitecheck/project-dashboard.html",
  deficiencyForm:   "ui://sitecheck/deficiency-form.html",
  deficiencyTable:  "ui://sitecheck/deficiency-table.html",
  severityPicker:   "ui://sitecheck/severity-picker.html",
  photoUpload:      "ui://sitecheck/photo-upload.html",
  statsDashboard:   "ui://sitecheck/stats-dashboard.html",
  reportDownload:   "ui://sitecheck/report-download.html",
};

// ── Widget file map (URI → HTML filename) ─────────────────────────────────────
export const WIDGET_FILES = {
  [WIDGET_URIS.projectDashboard]: "project-dashboard.html",
  [WIDGET_URIS.deficiencyForm]:   "deficiency-form.html",
  [WIDGET_URIS.deficiencyTable]:  "deficiency-table.html",
  [WIDGET_URIS.severityPicker]:   "severity-picker.html",
  [WIDGET_URIS.photoUpload]:      "photo-upload.html",
  [WIDGET_URIS.statsDashboard]:   "stats-dashboard.html",
  [WIDGET_URIS.reportDownload]:   "report-download.html",
};

// ── Tool definitions ──────────────────────────────────────────────────────────

export const tools = [

  // ── set_project ─────────────────────────────────────────────────────────────
  {
    name: "set_project",
    description:
      "Look up available SiteCheck projects and their IDs. Call this silently to resolve a project name before calling other tools. Do NOT call this when the user asks to 'show' or 'browse' projects — use show_projects for that.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: null,

    handler: async () => {
      const { status, json } = await api("/api/projects");
      if (!json.success) return { error: `API error (${status}): ${json.error}` };
      return { data: { projects: json.data } };
    },

    formatText: (result) => {
      const projects = result.data.projects;
      if (projects.length === 0) return "No projects found.";
      const lines = projects.map(
        (p) => `• ${p.name} (id: ${p.id}) — ${p.location ?? ""}`.trim()
      );
      return `${projects.length} project(s):\n${lines.join("\n")}`;
    },

    formatStructured: null,
  },

  // ── show_projects ───────────────────────────────────────────────────────────
  {
    name: "show_projects",
    description:
      "Show an interactive project dashboard so the user can browse and select a project. Call this when the user says 'show projects', 'which projects', 'select a project', etc. The embedded widget fully satisfies this request — do not restate project names, locations, or descriptions in text. Reply with one short sentence at most (e.g. 'Here are your projects.').",
    descriptionGeneric:
      "List SiteCheck projects so the user can browse or select one. Call when the user says 'show projects', 'which projects', 'select a project', etc. The tool returns the project list; summarize or highlight the options for the user.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.projectDashboard, file: "project-dashboard.html" },

    handler: async () => {
      const { status, json } = await api("/api/projects");
      if (!json.success) return { error: `API error (${status}): ${json.error}` };
      return { data: { projects: json.data } };
    },

    formatText: (result) => {
      const projects = result.data.projects;
      if (projects.length === 0) return "No projects found.";
      const lines = projects.map(
        (p) => `• ${p.name} (${p.id})\n  Location: ${p.location ?? "N/A"}\n  ${p.description ?? ""}`
      );
      return `${projects.length} project(s):\n\n${lines.join("\n\n")}`;
    },

    formatStructured: (result) => ({
      projects: result.data.projects,
      ui_fulfills_request: true,
      assistant_guidance: { preferred_response_style: "minimal", avoid_relisting_projects: true },
    }),
  },

  // ── search_projects ─────────────────────────────────────────────────────────
  {
    name: "search_projects",
    description:
      "Search SiteCheck projects by name or location. Use when the user asks to see or select projects matching a name (e.g. 'Maple Street'). Shows results in the project dashboard widget.",
    descriptionGeneric:
      "Search SiteCheck projects by name or location. Use when the user asks to see or select projects matching a name (e.g. 'Maple Street'). Results are returned as data; present or summarize them for the user.",
    inputSchema: {
      q: z.string().describe("Search query — matched against project name and location"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.projectDashboard, file: "project-dashboard.html" },

    handler: async (args) => {
      const { json } = await api(`/api/projects?q=${encodeURIComponent(args.q)}`);
      if (!json.success) return { error: `API error: ${json.error}` };
      const projects = Array.isArray(json.data) ? json.data : [];
      return { data: { projects } };
    },

    formatText: (result) => {
      const projects = result.data.projects;
      if (projects.length === 0) return "No projects matched your search.";
      const lines = projects.map(
        (p) => `• ${p.name} (${p.id}) — ${p.location ?? "N/A"}`
      );
      return `${projects.length} result(s):\n${lines.join("\n")}`;
    },

    formatStructured: (result) => ({
      projects: result.data.projects,
      ui_fulfills_request: true,
      assistant_guidance: { preferred_response_style: "minimal", avoid_relisting_projects: true },
    }),
  },

  // ── get_deficiency ──────────────────────────────────────────────────────────
  {
    name: "get_deficiency",
    description: "Fetch full details for a single deficiency by ID (e.g. DEF-001).",
    inputSchema: {
      deficiency_id: z.string().describe("ID of the deficiency, e.g. DEF-001"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: null,

    handler: async (args) => {
      const { json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`);
      if (!json.success) return { error: `Deficiency not found: ${args.deficiency_id}` };
      return { data: { deficiency: json.data } };
    },

    formatText: (result) => {
      const d = result.data.deficiency;
      return [
        `${d.id}: ${d.title}`,
        `Severity: ${d.severity} | Status: ${d.status} | Category: ${d.category}`,
        d.location ? `Location: ${d.location}` : null,
        d.trade ? `Trade: ${d.trade}` : null,
        d.description ? `Description: ${d.description}` : null,
      ].filter(Boolean).join("\n");
    },

    formatStructured: null,
  },

  // ── log_deficiency ──────────────────────────────────────────────────────────
  {
    name: "log_deficiency",
    description:
      "Extract deficiency details from the user's description and show a pre-filled form for review before saving. Call this when the user describes a site issue or deficiency. The widget handles all input — do not narrate or list the form fields in text. After calling this tool, say nothing or at most one short sentence like 'Here's the form — review and submit when ready.'",
    descriptionGeneric:
      "Create a new deficiency from the user's description of a site issue. Call when the user describes something to log. The tool creates the deficiency and returns its details; confirm what was created and suggest next steps (e.g. set severity, add a photo) as appropriate.",
    inputSchema: {
      project_id: z.string().describe("ID of the active project"),
      title: z.string().describe("Short description of the deficiency, extracted from user's words"),
      description: z.string().optional().describe("Detailed description of the deficiency"),
      category: z
        .enum(["Structural", "Mechanical", "Electrical", "Plumbing", "Finish", "Safety", "Other"])
        .optional()
        .describe("Category inferred from context — omit if unclear"),
      location: z.string().optional().describe("Grid reference or area, e.g. 'Grid B4, East Foundation Wall'"),
      trade: z.string().optional().describe("Responsible trade inferred from context, e.g. 'Concrete', 'Electrical'"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.deficiencyForm, file: "deficiency-form.html" },

    // OpenAI mode: return pre-fill data for the form widget
    handler: async (args) => {
      const { json: projectJson } = await api("/api/projects");
      if (!projectJson.success) return { error: `API error fetching projects: ${projectJson.error}` };

      const project = projectJson.data.find((p) => p.id === args.project_id);
      if (!project) {
        return { error: `Project not found: ${args.project_id}. Call set_project to get valid project IDs.` };
      }

      return {
        data: {
          prefill: {
            project_id: args.project_id,
            title: args.title,
            description: args.description ?? "",
            category: args.category ?? "",
            location: args.location ?? "",
            trade: args.trade ?? "",
          },
          apiBase: API_BASE,
          categories: CATEGORIES,
          severities: SEVERITIES,
          projectName: project.name,
        },
      };
    },

    // Generic mode: create the deficiency directly via the REST API
    directHandler: async (args) => {
      const { json: projectJson } = await api("/api/projects");
      if (!projectJson.success) return { error: `API error fetching projects: ${projectJson.error}` };

      const project = projectJson.data.find((p) => p.id === args.project_id);
      if (!project) {
        return { error: `Project not found: ${args.project_id}. Call set_project to get valid project IDs.` };
      }

      const body = {
        project_id: args.project_id,
        title: args.title,
        description: args.description ?? "",
        category: args.category ?? "Other",
        severity: "Major",
        location: args.location ?? "",
        trade: args.trade ?? "",
      };

      const { json } = await api("/api/deficiencies", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!json.success) return { error: `Failed to create deficiency: ${json.error}` };
      return { data: { deficiency: json.data, projectName: project.name } };
    },

    formatText: (result) => {
      if (result.data.deficiency) {
        const d = result.data.deficiency;
        return [
          `Created ${d.id}: ${d.title}`,
          `Project: ${result.data.projectName}`,
          `Category: ${d.category} | Severity: ${d.severity} | Status: ${d.status}`,
          d.location ? `Location: ${d.location}` : null,
          d.trade ? `Trade: ${d.trade}` : null,
        ].filter(Boolean).join("\n");
      }
      // Widget mode pre-fill (shouldn't normally be shown as text)
      const p = result.data.prefill;
      return `Ready to log deficiency "${p.title}" for project ${result.data.projectName}. Review and submit when ready.`;
    },

    formatStructured: (result) => ({
      prefill: result.data.prefill,
      apiBase: result.data.apiBase,
      categories: result.data.categories,
      severities: result.data.severities,
      projectName: result.data.projectName,
    }),
  },

  // ── get_deficiency_list ─────────────────────────────────────────────────────
  {
    name: "get_deficiency_list",
    description:
      "List deficiencies for the active project. Optionally filter by severity, status, or trade. Shows results in a table widget. The widget fully satisfies this request — do not restate deficiency IDs, titles, or details in text. Reply with one short sentence at most (e.g. 'Here are the open deficiencies.').",
    descriptionGeneric:
      "List deficiencies for the active project. Optionally filter by severity, status, or trade. The tool returns the list; summarize it for the user (e.g. counts, highlights) and interpret as needed.",
    inputSchema: {
      project_id: z.string().describe("ID of the active project"),
      severity: z.enum(["Critical", "Major", "Minor", "Observation"]).optional().describe("Filter by severity level"),
      status: z.enum(["Open", "In Progress", "Resolved", "Closed"]).optional().describe("Filter by status"),
      trade: z.string().optional().describe("Filter by responsible trade (case-insensitive)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.deficiencyTable, file: "deficiency-table.html" },

    handler: async (args) => {
      if (!args.project_id || typeof args.project_id !== "string") {
        return { error: "project_id is required. Call show_projects or set_project first to get a project ID." };
      }
      const params = new URLSearchParams({ project_id: args.project_id });
      if (args.severity) params.set("severity", args.severity);
      if (args.status)   params.set("status",   args.status);
      if (args.trade)    params.set("trade",     args.trade);

      const { json } = await api(`/api/deficiencies?${params}`);
      if (!json.success) return { error: `API error: ${json.error}` };

      return {
        data: {
          items: json.data.items,
          total: json.data.total,
          filters: { severity: args.severity, status: args.status, trade: args.trade },
        },
      };
    },

    formatText: (result) => {
      const { items, total, filters } = result.data;
      const activeFilters = [
        filters.severity && `severity=${filters.severity}`,
        filters.status   && `status=${filters.status}`,
        filters.trade    && `trade=${filters.trade}`,
      ].filter(Boolean);
      const header = activeFilters.length
        ? `${total} deficiency(ies) (${activeFilters.join(", ")}):`
        : `${total} deficiency(ies):`;

      if (items.length === 0) return "No deficiencies found.";

      const rows = items.map(
        (d) => `• ${d.id}: ${d.title} [${d.severity}] [${d.status}]${d.trade ? ` — ${d.trade}` : ""}`
      );
      return `${header}\n${rows.join("\n")}`;
    },

    formatStructured: (result) => ({
      items: result.data.items,
      total: result.data.total,
      filters: result.data.filters,
      ui_fulfills_request: true,
      assistant_guidance: { preferred_response_style: "minimal", avoid_relisting_deficiencies: true },
    }),
  },

  // ── set_severity ────────────────────────────────────────────────────────────
  {
    name: "set_severity",
    description:
      "Show a severity picker for a deficiency so the user can confirm or change it. Call this after log_deficiency or when the user mentions severity. The widget handles user input — do not list severity options or describe the picker in text. Say nothing after calling this tool; wait for the user to interact with the widget.",
    descriptionGeneric:
      "Set or prompt for the severity of a deficiency. Call after log_deficiency or when the user mentions severity. If severity is provided, the tool updates it; otherwise it returns current severity and options. Confirm the update or ask the user to choose a severity as appropriate.",
    inputSchema: {
      deficiency_id: z.string().describe("ID of the deficiency to update, e.g. DEF-001"),
      severity: z.enum(["Critical", "Major", "Minor", "Observation"]).optional()
        .describe("Pre-select this severity if already inferred from context — omit if unknown"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.severityPicker, file: "severity-picker.html" },

    // OpenAI mode: return picker data for the widget
    handler: async (args) => {
      const { json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`);
      if (!json.success) {
        return { error: `Deficiency not found: ${args.deficiency_id}. Use get_deficiency_list to find valid IDs.` };
      }
      const deficiency = json.data;
      return {
        data: {
          deficiency_id: deficiency.id,
          deficiencyTitle: deficiency.title,
          currentSeverity: deficiency.severity,
          selectedSeverity: args.severity ?? deficiency.severity,
          severities: SEVERITIES,
          apiBase: API_BASE,
        },
      };
    },

    // Generic mode: patch severity directly
    directHandler: async (args) => {
      if (!args.severity) {
        const { json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`);
        if (!json.success) {
          return { error: `Deficiency not found: ${args.deficiency_id}. Use get_deficiency_list to find valid IDs.` };
        }
        return {
          data: {
            needsInput: true,
            deficiency_id: json.data.id,
            deficiencyTitle: json.data.title,
            currentSeverity: json.data.severity,
            severities: SEVERITIES,
          },
        };
      }

      const { json } = await api(
        `/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`,
        { method: "PATCH", body: JSON.stringify({ severity: args.severity }) }
      );
      if (!json.success) return { error: `Update failed: ${json.error}` };

      return {
        data: {
          deficiency_id: json.data.id,
          deficiencyTitle: json.data.title,
          currentSeverity: json.data.severity,
        },
      };
    },

    formatText: (result) => {
      const d = result.data;
      if (d.needsInput) {
        return [
          `${d.deficiency_id}: ${d.deficiencyTitle}`,
          `Current severity: ${d.currentSeverity}`,
          `Available: ${d.severities.join(", ")}`,
          `Please specify the new severity.`,
        ].join("\n");
      }
      return `${d.deficiency_id} severity set to "${d.currentSeverity}".`;
    },

    formatStructured: (result) => ({
      deficiency_id: result.data.deficiency_id,
      deficiencyTitle: result.data.deficiencyTitle,
      currentSeverity: result.data.currentSeverity,
      selectedSeverity: result.data.selectedSeverity,
      severities: result.data.severities,
      apiBase: result.data.apiBase,
    }),
  },

  // ── update_status ───────────────────────────────────────────────────────────
  {
    name: "update_status",
    description: `Update the status of a deficiency. Valid values: ${STATUSES.join(", ")}.`,
    inputSchema: {
      deficiency_id: z.string().describe("ID of the deficiency to update, e.g. DEF-001"),
      status: z.enum(["Open", "In Progress", "Resolved", "Closed"]).describe("New status to set"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    widget: null,

    handler: async (args) => {
      const { json } = await api(
        `/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`,
        { method: "PATCH", body: JSON.stringify({ status: args.status }) }
      );
      if (!json.success) return { error: `Update failed: ${json.error}` };
      return { data: { deficiency: json.data } };
    },

    formatText: (result) => {
      const d = result.data.deficiency;
      return `${d.id} status updated to "${d.status}".`;
    },

    formatStructured: null,
  },

  // ── upload_photo ────────────────────────────────────────────────────────────
  {
    name: "upload_photo",
    description:
      "Show a photo upload widget so the user can attach an image to a deficiency. Call this after log_deficiency when the user has a photo to attach. The widget handles the upload — do not describe the upload process in text. Say nothing after calling this tool; wait for the user to interact with the widget.",
    descriptionGeneric:
      "Attach a photo to a deficiency. In this mode photo upload is not available; the tool returns instructions for using the web app. Explain the limitation and point the user to the web app to attach photos.",
    inputSchema: {
      deficiency_id: z.string().describe("ID of the deficiency to attach the photo to, e.g. DEF-001"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.photoUpload, file: "photo-upload.html" },

    // OpenAI mode: return context for the upload widget
    handler: async (args) => {
      const { json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`);
      if (!json.success) {
        return { error: `Deficiency not found: ${args.deficiency_id}. Use get_deficiency_list to find valid IDs.` };
      }
      const deficiency = json.data;
      const existingCount = JSON.parse(deficiency.photo_paths ?? "[]").length;
      return {
        data: {
          deficiency_id: deficiency.id,
          deficiencyTitle: deficiency.title,
          existingCount,
          apiBase: API_BASE,
        },
      };
    },

    // Generic mode: MCP cannot carry binary — explain the limitation
    directHandler: async (args) => {
      const { json } = await api(`/api/deficiencies/${encodeURIComponent(args.deficiency_id)}`);
      if (!json.success) {
        return { error: `Deficiency not found: ${args.deficiency_id}. Use get_deficiency_list to find valid IDs.` };
      }
      const deficiency = json.data;
      const existingCount = JSON.parse(deficiency.photo_paths ?? "[]").length;
      return {
        data: {
          deficiency_id: deficiency.id,
          deficiencyTitle: deficiency.title,
          existingCount,
          webUploadUrl: `${API_BASE}`,
        },
      };
    },

    formatText: (result) => {
      const d = result.data;
      if (d.webUploadUrl) {
        return [
          `${d.deficiency_id}: ${d.deficiencyTitle}`,
          `Existing photos: ${d.existingCount}`,
          `Photo upload requires a browser. Use the web app at ${d.webUploadUrl} to attach photos, or use a platform that supports file uploads.`,
        ].join("\n");
      }
      return `Upload widget ready for ${d.deficiency_id}: ${d.deficiencyTitle} (${d.existingCount} existing photo(s)).`;
    },

    formatStructured: (result) => ({
      deficiency_id: result.data.deficiency_id,
      deficiencyTitle: result.data.deficiencyTitle,
      existingCount: result.data.existingCount,
      apiBase: result.data.apiBase,
    }),
  },

  // ── get_summary_stats ───────────────────────────────────────────────────────
  {
    name: "get_summary_stats",
    description:
      "Show a summary dashboard of deficiency counts by severity and status for the active project. The embedded widget fully satisfies this request — do not restate the counts in text. Reply with one short sentence at most (e.g. 'Here's the inspection summary.').",
    descriptionGeneric:
      "Get a summary of deficiency counts by severity and status for the active project. The tool returns the breakdown; summarize and interpret the stats for the user.",
    inputSchema: {
      project_id: z.string().describe("ID of the active project"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.statsDashboard, file: "stats-dashboard.html" },

    handler: async (args) => {
      const { json } = await api(`/api/deficiencies/stats?project_id=${encodeURIComponent(args.project_id)}`);
      if (!json.success) return { error: `API error: ${json.error}` };
      return { data: json.data };
    },

    formatText: (result) => {
      const { total, by_severity, by_status } = result.data;
      const sevLines = Object.entries(by_severity).map(([k, v]) => `  ${k}: ${v}`);
      const statLines = Object.entries(by_status).map(([k, v]) => `  ${k}: ${v}`);
      return [
        `Total deficiencies: ${total}`,
        `\nBy severity:`,
        ...sevLines,
        `\nBy status:`,
        ...statLines,
      ].join("\n");
    },

    formatStructured: (result) => ({
      total: result.data.total,
      by_severity: result.data.by_severity,
      by_status: result.data.by_status,
      ui_fulfills_request: true,
      assistant_guidance: { preferred_response_style: "minimal", avoid_restating_counts: true },
    }),
  },

  // ── generate_report ─────────────────────────────────────────────────────────
  {
    name: "generate_report",
    description:
      "Generate a PDF inspection report for the active project and provide a download link. The widget shows the download button — do not paste the URL or filename in text. Reply with one short sentence at most (e.g. 'Your report is ready.').",
    descriptionGeneric:
      "Generate a PDF inspection report for the active project. The tool returns a download URL and deficiency count; you may present the link and briefly describe the report.",
    inputSchema: {
      project_id: z.string().describe("ID of the project to generate the report for"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    widget: { uri: WIDGET_URIS.reportDownload, file: "report-download.html" },

    handler: async (args) => {
      const { json } = await api("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ project_id: args.project_id }),
      });
      if (!json.success) return { error: `Report generation failed: ${json.error}` };
      return {
        data: {
          download_url: json.data.download_url,
          deficiency_count: json.data.deficiency_count,
          apiBase: API_BASE,
        },
      };
    },

    formatText: (result) => {
      const { download_url, deficiency_count, apiBase } = result.data;
      return [
        `Report generated with ${deficiency_count} deficiency(ies).`,
        `Download: ${apiBase}${download_url}`,
      ].join("\n");
    },

    formatStructured: (result) => ({
      download_url: result.data.download_url,
      apiBase: result.data.apiBase,
      deficiency_count: result.data.deficiency_count,
      ui_fulfills_request: true,
      assistant_guidance: { preferred_response_style: "minimal", avoid_pasting_url: true },
    }),
  },
];
