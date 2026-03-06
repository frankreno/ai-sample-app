// ── Apps SDK bridge ───────────────────────────────────────────────────────────
// Shared MCP Apps UI bridge for all SiteCheck widgets.
//
// Handles the JSON-RPC 2.0 handshake with ChatGPT and provides helpers for
// sending results back. Each widget must define an init(structuredContent)
// function — the bridge calls it when ChatGPT delivers the tool result.
//
// INCOMING (ChatGPT → widget, via postMessage):
//   JSON-RPC: { jsonrpc: "2.0", id: "init", result: {} }          ← init ack
//   JSON-RPC: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent } }
//
// OUTGOING (widget → ChatGPT, via postMessage):
//   { type: "mcp:result", result: { ... } }   ← widget completed with data
//   { type: "mcp:cancel" }                    ← user cancelled

function rpcSend(method, params, id) {
  const msg = { jsonrpc: "2.0", method, params: params ?? {} };
  if (id !== undefined) msg.id = id;
  window.parent.postMessage(msg, "*");
}

function postToParent(payload) {
  window.parent.postMessage(payload, "*");
}

function sendResult(data) {
  postToParent({ type: "mcp:result", result: data });
}

function sendCancel() {
  postToParent({ type: "mcp:cancel" });
}

rpcSend("ui/initialize", {
  appInfo: { name: "SiteCheck", version: "1.0.0" },
  appCapabilities: {},
  protocolVersion: "2026-01-26",
}, "init");

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data;
  if (!msg || msg.jsonrpc !== "2.0") return;
  if (msg.id === "init") rpcSend("ui/notifications/initialized");
  if (msg.method === "ui/notifications/tool-result") init(msg.params?.structuredContent);
});
