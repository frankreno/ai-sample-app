/**
 * Tests for the Generic MCP adapter.
 *
 * Verifies that all tools use server.registerTool (no ext-apps),
 * all responses are text-only, and directHandlers are used where available.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupFetchMock } from "../helpers/mock-api.js";
import { register } from "../../adapters/generic.js";
import { tools } from "../../core/tools.js";

describe("Generic adapter", () => {
  let mockServer;

  beforeEach(() => {
    setupFetchMock();
    mockServer = {
      registerTool: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers all 11 tools via server.registerTool", () => {
    register(mockServer, tools);
    expect(mockServer.registerTool.mock.calls.length).toBe(11);
  });

  it("registers tools with correct names", () => {
    register(mockServer, tools);
    const registeredNames = mockServer.registerTool.mock.calls.map((c) => c[0]);
    const expectedNames = tools.map((t) => t.name);
    expect(registeredNames).toEqual(expectedNames);
  });

  it("no tool registration includes _meta", () => {
    register(mockServer, tools);
    for (const call of mockServer.registerTool.mock.calls) {
      const [, toolDef] = call;
      expect(toolDef._meta).toBeUndefined();
    }
  });

  it("all tool handlers return content text, never structuredContent", async () => {
    register(mockServer, tools);
    for (const call of mockServer.registerTool.mock.calls) {
      const [name, , handler] = call;
      // Build minimal valid args for each tool
      const args = buildArgs(name);
      const result = await handler(args);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text.length).toBeGreaterThan(0);
      expect(result.structuredContent).toBeUndefined();
    }
  });

  it("log_deficiency uses directHandler (creates deficiency)", async () => {
    register(mockServer, tools);
    const logCall = mockServer.registerTool.mock.calls.find((c) => c[0] === "log_deficiency");
    const handler = logCall[2];

    const result = await handler({
      project_id: "proj-001",
      title: "Test deficiency",
      category: "Safety",
    });

    expect(result.content[0].text).toContain("Created DEF-009");
  });

  it("set_severity uses directHandler (patches directly when severity given)", async () => {
    register(mockServer, tools);
    const call = mockServer.registerTool.mock.calls.find((c) => c[0] === "set_severity");
    const handler = call[2];

    const result = await handler({ deficiency_id: "DEF-001", severity: "Minor" });
    expect(result.content[0].text).toContain('severity set to "Minor"');
  });

  it("set_severity directHandler asks for input when severity omitted", async () => {
    register(mockServer, tools);
    const call = mockServer.registerTool.mock.calls.find((c) => c[0] === "set_severity");
    const handler = call[2];

    const result = await handler({ deficiency_id: "DEF-001" });
    expect(result.content[0].text).toContain("Please specify the new severity");
  });

  it("upload_photo uses directHandler (explains browser requirement)", async () => {
    register(mockServer, tools);
    const call = mockServer.registerTool.mock.calls.find((c) => c[0] === "upload_photo");
    const handler = call[2];

    const result = await handler({ deficiency_id: "DEF-001" });
    expect(result.content[0].text).toContain("Photo upload requires a browser");
  });

  it("tool handlers return isError on API failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Connection refused");
    }));

    register(mockServer, tools);
    const call = mockServer.registerTool.mock.calls.find((c) => c[0] === "show_projects");
    const handler = call[2];
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not reach SiteCheck API");
  });
});

// ── Test helpers ──────────────────────────────────────────────────────────────

function buildArgs(toolName) {
  const argMap = {
    set_project: {},
    show_projects: {},
    search_projects: { q: "Maple" },
    get_deficiency: { deficiency_id: "DEF-001" },
    log_deficiency: { project_id: "proj-001", title: "Test issue", category: "Safety" },
    get_deficiency_list: { project_id: "proj-001" },
    set_severity: { deficiency_id: "DEF-001", severity: "Minor" },
    update_status: { deficiency_id: "DEF-001", status: "Resolved" },
    upload_photo: { deficiency_id: "DEF-001" },
    get_summary_stats: { project_id: "proj-001" },
    generate_report: { project_id: "proj-001" },
  };
  return argMap[toolName] ?? {};
}
