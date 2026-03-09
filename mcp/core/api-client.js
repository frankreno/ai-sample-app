/**
 * Shared REST API client for all MCP tool handlers.
 *
 * Centralizes the base URL, fetch wrapper, error helper, and enum constants
 * so that neither tool definitions nor platform adapters duplicate them.
 */

export const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

export const CATEGORIES = ["Structural", "Mechanical", "Electrical", "Plumbing", "Finish", "Safety", "Other"];
export const SEVERITIES = ["Critical", "Major", "Minor", "Observation"];
export const STATUSES   = ["Open", "In Progress", "Resolved", "Closed"];

/** Request timeout in ms so the MCP server responds before clients (e.g. Claude proxy) time out. */
const API_TIMEOUT_MS = 25_000;

/**
 * Fetch JSON from the REST API. Returns { status, json }.
 * Throws on network errors or timeout — callers should catch and surface via apiError().
 */
export async function api(path, options = {}) {
  const signal = options.signal ?? AbortSignal.timeout(API_TIMEOUT_MS);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    signal,
  });
  let json;
  if (typeof res.text === "function") {
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`API returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
  } else {
    json = typeof res.json === "function" ? await res.json() : {};
  }
  return { status: res.status, json };
}

/**
 * Standard MCP error envelope. Platform adapters pass this through unchanged.
 */
export function apiError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
