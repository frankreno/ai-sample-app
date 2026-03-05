import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const projects = q
    ? db
        .prepare(
          "SELECT * FROM projects WHERE LOWER(name) LIKE LOWER(?) OR LOWER(location) LIKE LOWER(?) ORDER BY name ASC"
        )
        .all(`%${q}%`, `%${q}%`)
    : db.prepare("SELECT * FROM projects ORDER BY name ASC").all();

  return ok(projects);
}
