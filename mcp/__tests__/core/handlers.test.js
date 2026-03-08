/**
 * Unit tests for core tool handlers.
 *
 * Each handler is tested in isolation with a mocked REST API.
 * Tests verify: correct data shape, error handling, text formatting,
 * structured content formatting, and directHandler behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupFetchMock, MOCK_PROJECTS, MOCK_DEFICIENCY, MOCK_DEFICIENCY_LIST, MOCK_STATS } from "../helpers/mock-api.js";
import { tools } from "../../core/tools.js";

function getTool(name) {
  return tools.find((t) => t.name === name);
}

describe("Core tool handlers", () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── set_project ───────────────────────────────────────────────────────────
  describe("set_project", () => {
    it("returns project list data", async () => {
      const tool = getTool("set_project");
      const result = await tool.handler({});
      expect(result.data.projects).toHaveLength(2);
      expect(result.data.projects[0].name).toBe("Maple Street Renovation");
    });

    it("formatText lists projects", () => {
      const tool = getTool("set_project");
      const text = tool.formatText({ data: { projects: MOCK_PROJECTS } });
      expect(text).toContain("2 project(s)");
      expect(text).toContain("Maple Street Renovation");
      expect(text).toContain("proj-001");
    });

    it("formatText handles empty list", () => {
      const tool = getTool("set_project");
      const text = tool.formatText({ data: { projects: [] } });
      expect(text).toBe("No projects found.");
    });

    it("has no widget", () => {
      expect(getTool("set_project").widget).toBeNull();
    });

    it("has no formatStructured", () => {
      expect(getTool("set_project").formatStructured).toBeNull();
    });
  });

  // ── show_projects ─────────────────────────────────────────────────────────
  describe("show_projects", () => {
    it("returns project list data", async () => {
      const result = await getTool("show_projects").handler({});
      expect(result.data.projects).toHaveLength(2);
    });

    it("has project-dashboard widget", () => {
      expect(getTool("show_projects").widget.file).toBe("project-dashboard.html");
    });

    it("formatStructured includes ui_fulfills_request", () => {
      const sc = getTool("show_projects").formatStructured({ data: { projects: MOCK_PROJECTS } });
      expect(sc.ui_fulfills_request).toBe(true);
      expect(sc.projects).toHaveLength(2);
    });

    it("formatText provides readable output", () => {
      const text = getTool("show_projects").formatText({ data: { projects: MOCK_PROJECTS } });
      expect(text).toContain("Maple Street Renovation");
      expect(text).toContain("Boulder, CO");
    });
  });

  // ── search_projects ───────────────────────────────────────────────────────
  describe("search_projects", () => {
    it("passes query parameter to API", async () => {
      await getTool("search_projects").handler({ q: "Maple" });
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("q=Maple");
    });

    it("returns filtered projects", async () => {
      const result = await getTool("search_projects").handler({ q: "Maple" });
      expect(result.data.projects).toHaveLength(1);
      expect(result.data.projects[0].name).toContain("Maple");
    });

    it("formatText handles no results", () => {
      const text = getTool("search_projects").formatText({ data: { projects: [] } });
      expect(text).toContain("No projects matched");
    });
  });

  // ── get_deficiency ────────────────────────────────────────────────────────
  describe("get_deficiency", () => {
    it("returns deficiency data", async () => {
      const result = await getTool("get_deficiency").handler({ deficiency_id: "DEF-001" });
      expect(result.data.deficiency.id).toBe("DEF-001");
      expect(result.data.deficiency.title).toBe("Cracked foundation wall");
    });

    it("formatText includes key fields", () => {
      const text = getTool("get_deficiency").formatText({ data: { deficiency: MOCK_DEFICIENCY } });
      expect(text).toContain("DEF-001");
      expect(text).toContain("Critical");
      expect(text).toContain("Structural");
      expect(text).toContain("Grid B4");
    });

    it("has no widget", () => {
      expect(getTool("get_deficiency").widget).toBeNull();
    });
  });

  // ── log_deficiency ────────────────────────────────────────────────────────
  describe("log_deficiency", () => {
    const args = {
      project_id: "proj-001",
      title: "Cracked beam",
      description: "Large crack in support beam",
      category: "Structural",
      location: "Grid A2",
      trade: "Concrete",
    };

    it("handler returns pre-fill data for widget mode", async () => {
      const result = await getTool("log_deficiency").handler(args);
      expect(result.data.prefill.title).toBe("Cracked beam");
      expect(result.data.projectName).toBe("Maple Street Renovation");
      expect(result.data.categories).toContain("Structural");
    });

    it("handler errors on invalid project_id", async () => {
      const result = await getTool("log_deficiency").handler({ ...args, project_id: "invalid" });
      expect(result.error).toContain("Project not found");
    });

    it("directHandler creates deficiency via API", async () => {
      const result = await getTool("log_deficiency").directHandler(args);
      expect(result.data.deficiency.id).toBe("DEF-009");
      expect(result.data.deficiency.title).toBe("Cracked beam");
    });

    it("directHandler errors on invalid project_id", async () => {
      const result = await getTool("log_deficiency").directHandler({ ...args, project_id: "invalid" });
      expect(result.error).toContain("Project not found");
    });

    it("formatText for direct result shows created deficiency", () => {
      const text = getTool("log_deficiency").formatText({
        data: {
          deficiency: { id: "DEF-009", title: "Cracked beam", category: "Structural", severity: "Major", status: "Open" },
          projectName: "Maple Street Renovation",
        },
      });
      expect(text).toContain("Created DEF-009");
      expect(text).toContain("Maple Street Renovation");
    });

    it("formatStructured includes prefill and categories", () => {
      const sc = getTool("log_deficiency").formatStructured({
        data: {
          prefill: { project_id: "proj-001", title: "Cracked beam" },
          apiBase: "http://localhost:3000",
          categories: ["Structural"],
          severities: ["Critical"],
          projectName: "Maple Street Renovation",
        },
      });
      expect(sc.prefill.title).toBe("Cracked beam");
      expect(sc.projectName).toBe("Maple Street Renovation");
    });
  });

  // ── get_deficiency_list ───────────────────────────────────────────────────
  describe("get_deficiency_list", () => {
    it("returns list with filters", async () => {
      const result = await getTool("get_deficiency_list").handler({
        project_id: "proj-001",
        severity: "Critical",
      });
      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(2);
      expect(result.data.filters.severity).toBe("Critical");
    });

    it("formatText shows deficiency rows", () => {
      const text = getTool("get_deficiency_list").formatText({
        data: {
          items: MOCK_DEFICIENCY_LIST.items,
          total: 2,
          filters: { severity: "Critical" },
        },
      });
      expect(text).toContain("DEF-001");
      expect(text).toContain("severity=Critical");
    });

    it("formatStructured includes ui_fulfills_request", () => {
      const sc = getTool("get_deficiency_list").formatStructured({
        data: { items: [], total: 0, filters: {} },
      });
      expect(sc.ui_fulfills_request).toBe(true);
    });
  });

  // ── set_severity ──────────────────────────────────────────────────────────
  describe("set_severity", () => {
    it("handler returns picker data", async () => {
      const result = await getTool("set_severity").handler({
        deficiency_id: "DEF-001",
        severity: "Minor",
      });
      expect(result.data.currentSeverity).toBe("Critical");
      expect(result.data.selectedSeverity).toBe("Minor");
      expect(result.data.severities).toContain("Critical");
    });

    it("directHandler patches severity when provided", async () => {
      const result = await getTool("set_severity").directHandler({
        deficiency_id: "DEF-001",
        severity: "Minor",
      });
      expect(result.data.currentSeverity).toBe("Minor");
    });

    it("directHandler asks for input when severity not provided", async () => {
      const result = await getTool("set_severity").directHandler({
        deficiency_id: "DEF-001",
      });
      expect(result.data.needsInput).toBe(true);
      expect(result.data.severities).toContain("Critical");
    });

    it("formatText for needsInput prompts user", () => {
      const text = getTool("set_severity").formatText({
        data: {
          needsInput: true,
          deficiency_id: "DEF-001",
          deficiencyTitle: "Cracked wall",
          currentSeverity: "Critical",
          severities: ["Critical", "Major", "Minor", "Observation"],
        },
      });
      expect(text).toContain("Please specify the new severity");
      expect(text).toContain("Current severity: Critical");
    });
  });

  // ── update_status ─────────────────────────────────────────────────────────
  describe("update_status", () => {
    it("patches status and returns confirmation", async () => {
      const result = await getTool("update_status").handler({
        deficiency_id: "DEF-001",
        status: "Resolved",
      });
      expect(result.data.deficiency.status).toBe("Resolved");
    });

    it("formatText confirms the update", () => {
      const text = getTool("update_status").formatText({
        data: { deficiency: { id: "DEF-001", status: "Resolved" } },
      });
      expect(text).toContain('DEF-001 status updated to "Resolved"');
    });

    it("has no widget", () => {
      expect(getTool("update_status").widget).toBeNull();
    });
  });

  // ── upload_photo ──────────────────────────────────────────────────────────
  describe("upload_photo", () => {
    it("handler returns widget context", async () => {
      const result = await getTool("upload_photo").handler({ deficiency_id: "DEF-001" });
      expect(result.data.deficiency_id).toBe("DEF-001");
      expect(result.data.apiBase).toBeDefined();
    });

    it("directHandler explains browser requirement", async () => {
      const result = await getTool("upload_photo").directHandler({ deficiency_id: "DEF-001" });
      expect(result.data.webUploadUrl).toBeDefined();
    });

    it("formatText for generic mode mentions web app", () => {
      const text = getTool("upload_photo").formatText({
        data: {
          deficiency_id: "DEF-001",
          deficiencyTitle: "Cracked wall",
          existingCount: 0,
          webUploadUrl: "http://localhost:3000",
        },
      });
      expect(text).toContain("Photo upload requires a browser");
      expect(text).toContain("http://localhost:3000");
    });
  });

  // ── get_summary_stats ─────────────────────────────────────────────────────
  describe("get_summary_stats", () => {
    it("returns stats from API", async () => {
      const result = await getTool("get_summary_stats").handler({ project_id: "proj-001" });
      expect(result.data.total).toBe(8);
      expect(result.data.by_severity.Critical).toBe(2);
    });

    it("formatText shows breakdown", () => {
      const text = getTool("get_summary_stats").formatText({ data: MOCK_STATS });
      expect(text).toContain("Total deficiencies: 8");
      expect(text).toContain("Critical: 2");
      expect(text).toContain("Open: 4");
    });

    it("formatStructured includes ui_fulfills_request", () => {
      const sc = getTool("get_summary_stats").formatStructured({ data: MOCK_STATS });
      expect(sc.ui_fulfills_request).toBe(true);
      expect(sc.total).toBe(8);
    });
  });

  // ── generate_report ───────────────────────────────────────────────────────
  describe("generate_report", () => {
    it("generates report and returns download URL", async () => {
      const result = await getTool("generate_report").handler({ project_id: "proj-001" });
      expect(result.data.download_url).toContain("report");
      expect(result.data.deficiency_count).toBe(8);
    });

    it("formatText includes download link", () => {
      const text = getTool("generate_report").formatText({
        data: { download_url: "/reports/report.pdf", deficiency_count: 8, apiBase: "http://localhost:3000" },
      });
      expect(text).toContain("8 deficiency(ies)");
      expect(text).toContain("http://localhost:3000/reports/report.pdf");
    });

    it("formatStructured includes ui_fulfills_request", () => {
      const sc = getTool("generate_report").formatStructured({
        data: { download_url: "/reports/report.pdf", deficiency_count: 8, apiBase: "http://localhost:3000" },
      });
      expect(sc.ui_fulfills_request).toBe(true);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────
  describe("error handling", () => {
    it("handlers return error on API failure", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({
        status: 500,
        json: async () => ({ success: false, data: null, error: "Internal error" }),
      })));

      const result = await getTool("show_projects").handler({});
      expect(result.error).toContain("API error");
    });

    it("handlers return error on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("Connection refused");
      }));

      // Network errors should propagate — adapters catch them
      await expect(getTool("show_projects").handler({})).rejects.toThrow("Connection refused");
    });
  });

  // ── Cross-cutting ─────────────────────────────────────────────────────────
  describe("all tools", () => {
    it("every tool has a name and description", () => {
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
      }
    });

    it("every tool has a formatText function", () => {
      for (const tool of tools) {
        expect(typeof tool.formatText).toBe("function");
      }
    });

    it("widget tools have formatStructured, non-widget tools do not", () => {
      for (const tool of tools) {
        if (tool.widget) {
          expect(typeof tool.formatStructured).toBe("function");
        } else {
          expect(tool.formatStructured).toBeNull();
        }
      }
    });

    it("there are exactly 11 tools", () => {
      expect(tools).toHaveLength(11);
    });

    it("expected tool names are present", () => {
      const names = tools.map((t) => t.name);
      expect(names).toContain("set_project");
      expect(names).toContain("show_projects");
      expect(names).toContain("search_projects");
      expect(names).toContain("get_deficiency");
      expect(names).toContain("log_deficiency");
      expect(names).toContain("get_deficiency_list");
      expect(names).toContain("set_severity");
      expect(names).toContain("update_status");
      expect(names).toContain("upload_photo");
      expect(names).toContain("get_summary_stats");
      expect(names).toContain("generate_report");
    });
  });
});
