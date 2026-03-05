import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { ok, err, CATEGORIES, SEVERITIES, STATUSES } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const project_id = searchParams.get("project_id");

  if (!project_id) {
    return err("project_id is required", 400);
  }

  const conditions: string[] = ["project_id = ?"];
  const params: unknown[] = [project_id];

  const severity = searchParams.get("severity");
  if (severity) {
    conditions.push("severity = ?");
    params.push(severity);
  }

  const status = searchParams.get("status");
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const trade = searchParams.get("trade");
  if (trade) {
    conditions.push("LOWER(trade) = LOWER(?)");
    params.push(trade);
  }

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = (page - 1) * limit;

  const where = conditions.join(" AND ");
  const rows = db
    .prepare(
      `SELECT * FROM deficiencies WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const { count } = db
    .prepare(`SELECT COUNT(*) as count FROM deficiencies WHERE ${where}`)
    .get(...params) as { count: number };

  return ok({ items: rows, total: count, page, limit });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const { title, description, category, severity, status, location, trade, project_id } = body;

  if (!title || typeof title !== "string") return err("title is required");
  if (!category || !CATEGORIES.includes(category as never))
    return err(`category must be one of: ${CATEGORIES.join(", ")}`);
  if (!severity || !SEVERITIES.includes(severity as never))
    return err(`severity must be one of: ${SEVERITIES.join(", ")}`);
  if (status && !STATUSES.includes(status as never))
    return err(`status must be one of: ${STATUSES.join(", ")}`);
  if (!project_id || typeof project_id !== "string")
    return err("project_id is required");

  const project = db
    .prepare("SELECT id FROM projects WHERE id = ?")
    .get(project_id);
  if (!project) return err("project_id not found", 404);

  // Generate sequential DEF-XXX id
  const { max_num } = db
    .prepare("SELECT COUNT(*) as max_num FROM deficiencies")
    .get() as { max_num: number };
  const defId = `DEF-${String(max_num + 1).padStart(3, "0")}`;

  const now = new Date().toISOString();
  const row = {
    id: defId,
    project_id,
    title: title as string,
    description: (description as string) ?? "",
    category,
    severity,
    status: (status as string) ?? "Open",
    location: (location as string) ?? "",
    trade: (trade as string) ?? "",
    photo_paths: "[]",
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO deficiencies (id, project_id, title, description, category, severity, status, location, trade, photo_paths, created_at, updated_at)
    VALUES (@id, @project_id, @title, @description, @category, @severity, @status, @location, @trade, @photo_paths, @created_at, @updated_at)
  `).run(row);

  const created = db.prepare("SELECT * FROM deficiencies WHERE id = ?").get(defId);
  return ok(created, 201);
}
