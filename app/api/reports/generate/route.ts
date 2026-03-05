import { NextRequest } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { ok, err } from "@/lib/api";

type Project = { id: string; name: string; location: string; description: string; created_at: string };
type Deficiency = {
  id: string; title: string; description: string; category: string;
  severity: string; status: string; location: string; trade: string;
  created_at: string; updated_at: string;
};

const SEVERITY_COLORS: Record<string, [number, number, number]> = {
  Critical: [220, 38, 38],
  Major: [234, 88, 12],
  Minor: [202, 138, 4],
  Observation: [37, 99, 235],
};

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const project_id = body.project_id as string | undefined;
  if (!project_id) return err("project_id is required");

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(project_id) as Project | undefined;
  if (!project) return err("project not found", 404);

  const deficiencies = db
    .prepare("SELECT * FROM deficiencies WHERE project_id = ? ORDER BY severity, created_at DESC")
    .all(project_id) as Deficiency[];

  const filename = `report-${project_id}-${Date.now()}.pdf`;
  const outputPath = join(process.cwd(), "public", "reports", filename);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", async () => {
      await writeFile(outputPath, Buffer.concat(chunks));
      resolve();
    });
    doc.on("error", reject);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill("#1c1917");
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
      .text("SiteCheck AI", 50, 22);
    doc.fontSize(11).font("Helvetica")
      .text("Inspection Report", 50, 50);

    doc.fillColor("#1c1917").fontSize(16).font("Helvetica-Bold")
      .text(project.name, 50, 110);
    doc.fontSize(10).font("Helvetica").fillColor("#78716c")
      .text(project.location, 50, 130)
      .text(`Generated: ${new Date().toLocaleString()}`, 50, 145)
      .text(`Total Deficiencies: ${deficiencies.length}`, 50, 160);

    // Summary table
    const severityOrder = ["Critical", "Major", "Minor", "Observation"];
    const counts = severityOrder.map((s) => ({
      severity: s,
      count: deficiencies.filter((d) => d.severity === s).length,
    }));

    doc.moveDown(5);
    let y = doc.y;

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1c1917")
      .text("Summary by Severity", 50, y);
    y += 20;

    for (const { severity, count } of counts) {
      const [r, g, b] = SEVERITY_COLORS[severity] ?? [100, 100, 100];
      doc.roundedRect(50, y, 100, 20, 4).fill(`rgb(${r},${g},${b})`);
      doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold")
        .text(severity, 55, y + 6, { width: 90, align: "center" });
      doc.fillColor("#1c1917").fontSize(10).font("Helvetica")
        .text(`${count} items`, 160, y + 6);
      y += 28;
    }

    // Deficiency list
    doc.moveDown(1);
    y = doc.y + 10;
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1c1917")
      .text("Deficiency Log", 50, y);
    y += 20;

    for (const d of deficiencies) {
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 50;
      }

      const [r, g, b] = SEVERITY_COLORS[d.severity] ?? [100, 100, 100];
      doc.roundedRect(50, y, 511, 1).fill("#e7e5e4");
      y += 6;

      doc.roundedRect(50, y, 60, 16, 3).fill(`rgb(${r},${g},${b})`);
      doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold")
        .text(d.severity.toUpperCase(), 52, y + 5, { width: 56, align: "center" });

      doc.fillColor("#1c1917").fontSize(10).font("Helvetica-Bold")
        .text(`${d.id} — ${d.title}`, 120, y + 3);
      y += 22;

      doc.fontSize(8).font("Helvetica").fillColor("#78716c")
        .text(`Category: ${d.category}  |  Status: ${d.status}  |  Trade: ${d.trade || "—"}  |  Location: ${d.location || "—"}`, 52, y);
      y += 14;

      if (d.description) {
        doc.fontSize(8).fillColor("#44403c")
          .text(d.description, 52, y, { width: 500 });
        y += doc.heightOfString(d.description, { width: 500 }) + 6;
      }

      y += 10;
    }

    doc.end();
  });

  const downloadUrl = `/reports/${filename}`;
  return ok({ download_url: downloadUrl, deficiency_count: deficiencies.length });
}
