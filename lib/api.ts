import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data, error: null }, { status });
}

export function err(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, data: null, error: message, error_code: code ?? httpErrorCode(status) },
    { status }
  );
}

function httpErrorCode(status: number): string {
  if (status === 404) return "NOT_FOUND";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  return "VALIDATION_ERROR";
}

export const CATEGORIES = [
  "Structural",
  "Mechanical",
  "Electrical",
  "Plumbing",
  "Finish",
  "Safety",
  "Other",
] as const;

export const SEVERITIES = [
  "Critical",
  "Major",
  "Minor",
  "Observation",
] as const;

export const STATUSES = [
  "Open",
  "In Progress",
  "Resolved",
  "Closed",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Status = (typeof STATUSES)[number];

export const STATUS_CYCLE: Record<Status, Status> = {
  Open: "In Progress",
  "In Progress": "Resolved",
  Resolved: "Closed",
  Closed: "Open",
};
