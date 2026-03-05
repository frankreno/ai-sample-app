import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data, error: null }, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status }
  );
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
