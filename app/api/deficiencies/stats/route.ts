import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, SEVERITIES, STATUSES } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const project_id = searchParams.get("project_id");
  if (!project_id) return err("project_id is required", 400);

  const bySeverity = db
    .prepare(
      `SELECT severity, COUNT(*) as count FROM deficiencies WHERE project_id = ? GROUP BY severity`
    )
    .all(project_id) as { severity: string; count: number }[];

  const byStatus = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM deficiencies WHERE project_id = ? GROUP BY status`
    )
    .all(project_id) as { status: string; count: number }[];

  const { total } = db
    .prepare(
      `SELECT COUNT(*) as total FROM deficiencies WHERE project_id = ?`
    )
    .get(project_id) as { total: number };

  // Normalize to always include all enum values with 0 for missing
  const severityMap = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const row of bySeverity) severityMap[row.severity] = row.count;

  const statusMap = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) statusMap[row.status] = row.count;

  return ok({ total, by_severity: severityMap, by_status: statusMap });
}
