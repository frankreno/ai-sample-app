/**
 * Tests for the OpenAI platform adapter.
 *
 * Verifies that widget tools use registerAppTool with correct resourceUri,
 * non-widget tools use server.registerTool, and responses have the expected shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupFetchMock } from "../helpers/mock-api.js";

// We need to mock the ext-apps module before importing the adapter
const mockRegisterAppTool = vi.fn();
const mockRegisterAppResource = vi.fn();

vi.mock("@modelcontextprotocol/ext-apps/server", () => ({
  registerAppTool: mockRegisterAppTool,
  registerAppResource: mockRegisterAppResource,
  RESOURCE_MIME_TYPE: "text/html;profile=mcp-app",
}));

const { register } = await import("../../adapters/openai.js");
const { tools } = await import("../../core/tools.js");

describe("OpenAI adapter", () => {
  let mockServer;

  beforeEach(() => {
    setupFetchMock();
    mockRegisterAppTool.mockReset();
    mockRegisterAppResource.mockReset();
    mockServer = {
      registerTool: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers all 11 tools", () => {
    register(mockServer, tools);
    const appToolCount = mockRegisterAppTool.mock.calls.length;
    const plainToolCount = mockServer.registerTool.mock.calls.length;
    expect(appToolCount + plainToolCount).toBe(11);
  });

  it("registers widget tools via registerAppTool", () => {
    register(mockServer, tools);
    const widgetTools = tools.filter((t) => t.widget);
    expect(mockRegisterAppTool.mock.calls.length).toBe(widgetTools.length);
  });

  it("registers non-widget tools via server.registerTool", () => {
    register(mockServer, tools);
    const plainTools = tools.filter((t) => !t.widget);
    expect(mockServer.registerTool.mock.calls.length).toBe(plainTools.length);
  });

  it("widget tool registrations include _meta.ui.resourceUri", () => {
    register(mockServer, tools);
    for (const call of mockRegisterAppTool.mock.calls) {
      const [, , toolDef] = call;
      expect(toolDef._meta?.ui?.resourceUri).toBeTruthy();
    }
  });

  it("non-widget tool registrations do NOT include _meta", () => {
    register(mockServer, tools);
    for (const call of mockServer.registerTool.mock.calls) {
      const [, toolDef] = call;
      expect(toolDef._meta).toBeUndefined();
    }
  });

  it("registers widget resources for each unique widget URI", () => {
    register(mockServer, tools);
    const uniqueWidgetUris = new Set(tools.filter((t) => t.widget).map((t) => t.widget.uri));
    expect(mockRegisterAppResource.mock.calls.length).toBe(uniqueWidgetUris.size);
  });

  it("widget tool handler returns structuredContent", async () => {
    register(mockServer, tools);
    // Find the show_projects handler in registerAppTool calls
    const showProjectsCall = mockRegisterAppTool.mock.calls.find(
      (call) => call[1] === "show_projects"
    );
    expect(showProjectsCall).toBeDefined();

    const handler = showProjectsCall[3];
    const result = await handler({});
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent.projects).toHaveLength(2);
    expect(result.content).toEqual([]);
  });

  it("non-widget tool handler returns content text only", async () => {
    register(mockServer, tools);
    const setProjectCall = mockServer.registerTool.mock.calls.find(
      (call) => call[0] === "set_project"
    );
    expect(setProjectCall).toBeDefined();

    const handler = setProjectCall[2];
    const result = await handler({});
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.structuredContent).toBeUndefined();
  });

  it("tool handlers return isError on API failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Connection refused");
    }));

    register(mockServer, tools);
    const showProjectsCall = mockRegisterAppTool.mock.calls.find(
      (call) => call[1] === "show_projects"
    );
    const handler = showProjectsCall[3];
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not reach SiteCheck API");
  });
});
