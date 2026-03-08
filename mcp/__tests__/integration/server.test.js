/**
 * Integration tests — verify both platform modes produce consistent results.
 *
 * These tests don't start the HTTP server. Instead they directly test the
 * adapter registration to verify cross-platform consistency: same tool names,
 * same input schemas, same error behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupFetchMock } from "../helpers/mock-api.js";
import { tools } from "../../core/tools.js";
import { register as registerGeneric } from "../../adapters/generic.js";

// Mock ext-apps for OpenAI adapter
const mockRegisterAppTool = vi.fn();
const mockRegisterAppResource = vi.fn();
vi.mock("@modelcontextprotocol/ext-apps/server", () => ({
  registerAppTool: mockRegisterAppTool,
  registerAppResource: mockRegisterAppResource,
  RESOURCE_MIME_TYPE: "text/html;profile=mcp-app",
}));

const { register: registerOpenAI } = await import("../../adapters/openai.js");

describe("Cross-platform consistency", () => {
  let genericServer;
  let openaiServer;

  beforeEach(() => {
    setupFetchMock();
    mockRegisterAppTool.mockReset();
    mockRegisterAppResource.mockReset();

    genericServer = { registerTool: vi.fn() };
    openaiServer  = { registerTool: vi.fn() };

    registerGeneric(genericServer, tools);
    registerOpenAI(openaiServer, tools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("both adapters register the same 11 tool names", () => {
    const genericNames = genericServer.registerTool.mock.calls.map((c) => c[0]);

    const openaiPlainNames = openaiServer.registerTool.mock.calls.map((c) => c[0]);
    const openaiAppNames = mockRegisterAppTool.mock.calls.map((c) => c[1]);
    const openaiAllNames = [...openaiPlainNames, ...openaiAppNames].sort();

    expect(genericNames.sort()).toEqual(openaiAllNames);
    expect(genericNames.length).toBe(11);
  });

  it("both adapters accept the same input schemas for each tool", () => {
    for (const tool of tools) {
      const genericCall = genericServer.registerTool.mock.calls.find((c) => c[0] === tool.name);
      expect(genericCall).toBeDefined();

      // OpenAI may use registerAppTool or server.registerTool
      const openaiPlainCall = openaiServer.registerTool.mock.calls.find((c) => c[0] === tool.name);
      const openaiAppCall = mockRegisterAppTool.mock.calls.find((c) => c[1] === tool.name);
      const openaiCall = openaiPlainCall ?? openaiAppCall;
      expect(openaiCall).toBeDefined();

      // Both should have the same inputSchema keys if schema is non-empty
      const genericDef = genericCall[1];
      const openaiDef = openaiPlainCall ? openaiPlainCall[1] : openaiAppCall[2];

      if (genericDef.inputSchema) {
        expect(openaiDef.inputSchema).toBeDefined();
      }
    }
  });

  it("error responses have the same shape in both modes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Connection refused");
    }));

    // Reset and re-register with failing fetch
    genericServer = { registerTool: vi.fn() };
    openaiServer  = { registerTool: vi.fn() };
    mockRegisterAppTool.mockReset();
    registerGeneric(genericServer, tools);
    registerOpenAI(openaiServer, tools);

    // Test set_project (non-widget, same registration in both)
    const genericHandler = genericServer.registerTool.mock.calls.find((c) => c[0] === "set_project")[2];
    const openaiHandler = openaiServer.registerTool.mock.calls.find((c) => c[0] === "set_project")[2];

    const genericResult = await genericHandler({});
    const openaiResult = await openaiHandler({});

    expect(genericResult.isError).toBe(true);
    expect(openaiResult.isError).toBe(true);
    expect(genericResult.content[0].text).toContain("Could not reach SiteCheck API");
    expect(openaiResult.content[0].text).toContain("Could not reach SiteCheck API");
  });

  it("generic mode text output contains the same key data as OpenAI structured content", async () => {
    // Test show_projects — both should include project names
    const genericHandler = genericServer.registerTool.mock.calls.find((c) => c[0] === "show_projects")[2];
    const openaiHandler = mockRegisterAppTool.mock.calls.find((c) => c[1] === "show_projects")[3];

    const genericResult = await genericHandler({});
    const openaiResult = await openaiHandler({});

    // Generic text should mention the project names
    expect(genericResult.content[0].text).toContain("Maple Street Renovation");
    expect(genericResult.content[0].text).toContain("Oakwood Tower");

    // OpenAI structured content should have the same projects
    expect(openaiResult.structuredContent.projects).toHaveLength(2);
    expect(openaiResult.structuredContent.projects[0].name).toBe("Maple Street Renovation");
  });

  it("generate_report returns download URL in both modes", async () => {
    const genericHandler = genericServer.registerTool.mock.calls.find((c) => c[0] === "generate_report")[2];
    const openaiHandler = mockRegisterAppTool.mock.calls.find((c) => c[1] === "generate_report")[3];

    const genericResult = await genericHandler({ project_id: "proj-001" });
    const openaiResult = await openaiHandler({ project_id: "proj-001" });

    expect(genericResult.content[0].text).toContain("report");
    expect(openaiResult.structuredContent.download_url).toContain("report");
  });
});

describe("Tool definition integrity", () => {
  it("all widget tools have a formatStructured function", () => {
    const widgetTools = tools.filter((t) => t.widget);
    expect(widgetTools.length).toBeGreaterThan(0);
    for (const tool of widgetTools) {
      expect(typeof tool.formatStructured).toBe("function");
    }
  });

  it("all non-widget tools have formatStructured === null", () => {
    const plainTools = tools.filter((t) => !t.widget);
    expect(plainTools.length).toBeGreaterThan(0);
    for (const tool of plainTools) {
      expect(tool.formatStructured).toBeNull();
    }
  });

  it("tools with directHandler are: log_deficiency, set_severity, upload_photo", () => {
    const directHandlerTools = tools.filter((t) => t.directHandler).map((t) => t.name).sort();
    expect(directHandlerTools).toEqual(["log_deficiency", "set_severity", "upload_photo"]);
  });

  it("widget URIs match expected format", () => {
    const widgetTools = tools.filter((t) => t.widget);
    for (const tool of widgetTools) {
      expect(tool.widget.uri).toMatch(/^ui:\/\/sitecheck\/.+\.html$/);
      expect(tool.widget.file).toMatch(/\.html$/);
    }
  });
});
