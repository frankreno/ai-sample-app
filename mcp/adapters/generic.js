/**
 * Generic MCP adapter for the SiteCheck MCP server.
 *
 * Uses only core MCP SDK features (server.registerTool). No widgets, no
 * structuredContent, no ext-apps imports. Every tool returns plain text
 * content that any MCP client can consume.
 *
 * For tools that have a directHandler (log_deficiency, set_severity,
 * upload_photo), this adapter uses the directHandler to perform the action
 * immediately instead of returning widget pre-fill data.
 *
 * This adapter is selected when MCP_PLATFORM=generic.
 */

import { apiError } from "../core/api-client.js";

/**
 * Register all tools on the given McpServer using plain text responses.
 *
 * @param {McpServer} server
 * @param {Array} tools — tool definitions from core/tools.js
 */
export function register(server, tools) {
  for (const tool of tools) {
    const handler = tool.directHandler ?? tool.handler;

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
          result = await handler(args);
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
