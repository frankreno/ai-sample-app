import { db } from "@/lib/db";
import { ok } from "@/lib/api";

export async function GET() {
  const projects = db
    .prepare("SELECT * FROM projects ORDER BY name ASC")
    .all();
  return ok(projects);
}
