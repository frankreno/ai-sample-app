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

/**
 * Fetch JSON from the REST API. Returns { status, json }.
 * Throws on network errors — callers should catch and surface via apiError().
 */
export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
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
