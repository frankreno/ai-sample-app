/**
 * SiteCheck AI — MCP Server (entry point)
 *
 * Thin wrapper over the Phase 1 REST API. All business logic lives in
 * the Next.js API routes at localhost:3000. This server only translates
 * MCP tool calls into REST API requests.
 *
 * Platform adapters control how tools are registered and what response
 * format is used:
 *   - "openai"  → ext-apps widgets + structuredContent (for ChatGPT)
 *   - "generic" → plain MCP text content (for any MCP client)
 *
 * Set MCP_PLATFORM env var to choose. Default: "openai".
 *
 * Transport: Streamable HTTP (stateless) on port 8787
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "node:http";
import path from "node:path";

import { tools } from "./core/tools.js";

const PORT     = process.env.MCP_PORT ?? 8787;
const PLATFORM = process.env.MCP_PLATFORM ?? "openai";

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "sitecheck-ai",
  version: "1.0.0",
});

// ── Load platform adapter and register tools ─────────────────────────────────
let serveWidget = null;

if (PLATFORM === "openai") {
  const adapter = await import("./adapters/openai.js");
  adapter.register(server, tools);
  serveWidget = adapter.serveWidget;
} else {
  const adapter = await import("./adapters/generic.js");
  adapter.register(server, tools);
}

console.log(`   Platform     : ${PLATFORM}`);

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
//
// These endpoints are harmless for non-OpenAI clients that don't use them.

function getBaseUrl(req) {
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
      sessionIdGenerator: undefined,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  // ── Widget dev server (OpenAI mode only) ────────────────────────────────────
  if (req.method === "GET" && req.url?.startsWith("/widgets/") && serveWidget) {
    const filename = path.basename(req.url.split("?")[0]);
    const html = serveWidget(filename);
    if (!html) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Widget not found\n");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end("Not found\n");
});

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

httpServer.listen(PORT, () => {
  console.log(`\n✅ SiteCheck MCP server running`);
  console.log(`   MCP endpoint : http://localhost:${PORT}/mcp`);
  console.log(`   Platform     : ${PLATFORM}`);
  console.log(`   OAuth disco  : http://localhost:${PORT}/.well-known/oauth-authorization-server`);
  console.log(`   Health check : http://localhost:${PORT}/health`);
  console.log(`   REST API base: ${API_BASE}`);
  if (PLATFORM === "openai") {
    console.log(`\n   For ChatGPT: ngrok http ${PORT}  →  register <ngrok-url>/mcp`);
  } else {
    console.log(`\n   Generic MCP mode — connect any MCP client to http://localhost:${PORT}/mcp`);
  }
  console.log();
});
