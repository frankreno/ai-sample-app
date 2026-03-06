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
//   JSON-RPC request: method "ui/message" — so the host accepts it (no custom type/result).

function rpcSend(method, params, id) {
  const msg = { jsonrpc: "2.0", method, params: params ?? {} };
  if (id !== undefined) msg.id = id;
  window.parent.postMessage(msg, "*");
}

let _rpcId = 0;
function nextId() {
  return "sitecheck-" + (++_rpcId) + "-" + Date.now();
}

function sendResult(data) {
  rpcSend("ui/message", {
    role: "user",
    content: [{ type: "text", text: JSON.stringify(data) }],
  }, nextId());
}

function sendCancel() {
  rpcSend("ui/message", {
    role: "user",
    content: [{ type: "text", text: "User cancelled." }],
  }, nextId());
}

window.sendResult = sendResult;
window.sendCancel = sendCancel;

rpcSend("ui/initialize", {
  appInfo: { name: "SiteCheck", version: "1.0.0" },
  appCapabilities: {},
  protocolVersion: "2026-01-26",
}, "init");

let _toolInput = {};
let _initCalled = false;

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data;
  if (!msg || msg.jsonrpc !== "2.0") return;

  if (msg.id === "init") rpcSend("ui/notifications/initialized");

  if (msg.method === "ui/notifications/tool-input") {
    _toolInput = msg.params?.arguments ?? {};
  }

  if (msg.method === "ui/notifications/tool-result") {
    _initCalled = true;
    const sc = msg.params?.structuredContent ?? {};
    init({ ..._toolInput, ...sc });
  }
});
