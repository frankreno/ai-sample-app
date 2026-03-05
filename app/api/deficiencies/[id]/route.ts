import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, SEVERITIES, STATUSES } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = db.prepare("SELECT * FROM deficiencies WHERE id = ?").get(id);
  if (!row) return err("Deficiency not found", 404);
  return ok(row);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = db.prepare("SELECT * FROM deficiencies WHERE id = ?").get(id);
  if (!existing) return err("Deficiency not found", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const allowed = ["title", "description", "category", "severity", "status", "location", "trade"];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      if (key === "severity" && !SEVERITIES.includes(body[key] as never))
        return err(`severity must be one of: ${SEVERITIES.join(", ")}`);
      if (key === "status" && !STATUSES.includes(body[key] as never))
        return err(`status must be one of: ${STATUSES.join(", ")}`);
      updates.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (updates.length === 0) return err("No valid fields to update");

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(
    `UPDATE deficiencies SET ${updates.join(", ")} WHERE id = ?`
  ).run(...values);

  const updated = db.prepare("SELECT * FROM deficiencies WHERE id = ?").get(id);
  return ok(updated);
}
