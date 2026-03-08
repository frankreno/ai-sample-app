/**
 * OpenAI platform adapter for the SiteCheck MCP server.
 *
 * Uses @modelcontextprotocol/ext-apps to:
 *   - Register widget-capable tools via registerAppTool (adds _meta.ui.resourceUri)
 *   - Register widget HTML as App resources
 *   - Return structuredContent for tools that have widgets
 *   - Return plain text content for tools without widgets
 *
 * This adapter is selected when MCP_PLATFORM=openai (the default).
 */

import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiError, API_BASE } from "../core/api-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGETS_DIR = path.join(__dirname, "..", "widgets");

/**
 * Read shared theme CSS and bridge JS once at import time.
 */
const sharedTheme  = fs.readFileSync(path.join(WIDGETS_DIR, "shared", "theme.css"),  "utf-8");
const sharedBridge = fs.readFileSync(path.join(WIDGETS_DIR, "shared", "bridge.js"), "utf-8");

function injectShared(html) {
  return html
    .replace("<!-- SHARED:CSS -->",    `<style>\n${sharedTheme}</style>`)
    .replace("<!-- SHARED:BRIDGE -->", `<script>\n${sharedBridge}<\/script>`);
}

/**
 * Register a widget HTML file as an MCP App resource.
 */
function registerWidgetResource(server, name, uri, filename) {
  registerAppResource(
    server,
    name,
    uri,
    {},
    async (resourceUri) => {
      const filePath = path.join(WIDGETS_DIR, filename);
      const html = injectShared(fs.readFileSync(filePath, "utf-8"));
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

/**
 * Register all tools and widget resources on the given McpServer.
 *
 * @param {McpServer} server
 * @param {Array} tools — tool definitions from core/tools.js
 */
export function register(server, tools) {
  const registeredWidgets = new Set();

  for (const tool of tools) {
    if (tool.widget) {
      // Widget tool — use registerAppTool so ChatGPT gets _meta.ui.resourceUri
      registerAppTool(
        server,
        tool.name,
        {
          description: tool.description,
          ...(Object.keys(tool.inputSchema).length > 0 ? { inputSchema: tool.inputSchema } : {}),
          annotations: tool.annotations,
          _meta: { ui: { resourceUri: tool.widget.uri } },
        },
        async (args) => {
          let result;
          try {
            result = await tool.handler(args);
          } catch (e) {
            return apiError(`Could not reach SiteCheck API: ${e.message}`);
          }
          if (result.error) return apiError(result.error);
          return {
            structuredContent: tool.formatStructured(result),
            content: [],
          };
        }
      );

      // Register the widget HTML resource (once per unique URI)
      if (!registeredWidgets.has(tool.widget.uri)) {
        registeredWidgets.add(tool.widget.uri);
        const safeName = tool.widget.file.replace(".html", "-widget");
        registerWidgetResource(server, safeName, tool.widget.uri, tool.widget.file);
      }
    } else {
      // Non-widget tool — plain server.registerTool, text-only responses
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          ...(Object.keys(tool.inputSchema).length > 0 ? { inputSchema: tool.inputSchema } : {}),
          annotations: tool.annotations,
        },
        async (args) => {
          let result;
          try {
            result = await tool.handler(args);
          } catch (e) {
            return apiError(`Could not reach SiteCheck API: ${e.message}`);
          }
          if (result.error) return apiError(result.error);
          return {
            content: [{ type: "text", text: tool.formatText(result) }],
          };
        }
      );
    }
  }
}

/**
 * Serve a widget HTML file with shared assets injected.
 * Used by the dev widget server route in server.js.
 */
export function serveWidget(filename) {
  const filePath = path.join(WIDGETS_DIR, filename);
  if (!filename.endsWith(".html") || !fs.existsSync(filePath)) return null;
  return injectShared(fs.readFileSync(filePath, "utf-8"));
}
