import { NextRequest } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { db } from "@/lib/db";
import { ok, err } from "@/lib/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = db
    .prepare("SELECT * FROM deficiencies WHERE id = ?")
    .get(id) as { photo_paths: string } | undefined;
  if (!existing) return err("Deficiency not found", 404);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err("Invalid multipart form data", 400);
  }

  const file = formData.get("photo") as File | null;
  if (!file) return err("photo field is required");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type))
    return err("photo must be a JPEG, PNG, WebP, or GIF image");

  const ext = file.name.split(".").pop() ?? "jpg";
  const safeName = `${id}-${Date.now()}.${ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads");
  const filePath = join(uploadDir, safeName);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const publicPath = `/uploads/${safeName}`;
  const photos: string[] = JSON.parse(existing.photo_paths);
  photos.push(publicPath);

  db.prepare(
    "UPDATE deficiencies SET photo_paths = ?, updated_at = ? WHERE id = ?"
  ).run(JSON.stringify(photos), new Date().toISOString(), id);

  const updated = db.prepare("SELECT * FROM deficiencies WHERE id = ?").get(id);
  return ok({ deficiency: updated, photo_url: publicPath }, 201);
}
