#!/usr/bin/env tsx
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const DB_PATH = join(process.cwd(), "db", "sitecheck.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables
const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf-8");
db.exec(schema);

// Clear existing data
db.exec("DELETE FROM deficiencies; DELETE FROM projects;");

// Seed projects
const projects = [
  {
    id: uuidv4(),
    name: "Oakwood Tower",
    location: "450 Oakwood Ave, Denver, CO 80203",
    description: "22-story mixed-use residential tower, Phase 2 fit-out",
  },
  {
    id: uuidv4(),
    name: "Riverside Industrial Park",
    location: "1200 River Rd, Aurora, CO 80010",
    description: "40,000 sqft warehouse and logistics facility",
  },
  {
    id: uuidv4(),
    name: "Maple Street Renovation",
    location: "88 Maple St, Boulder, CO 80302",
    description: "Historic building seismic retrofit and interior renovation",
  },
];

const now = new Date().toISOString();

const insertProject = db.prepare(
  "INSERT INTO projects (id, name, location, description, created_at) VALUES (?, ?, ?, ?, ?)"
);
for (const p of projects) {
  insertProject.run(p.id, p.name, p.location, p.description, now);
}

// Seed deficiencies
const deficiencies = [
  // Oakwood Tower
  {
    id: `DEF-${String(1).padStart(3, "0")}`,
    project_id: projects[0].id,
    title: "Foundation crack at grid B4",
    description:
      "Visible horizontal crack approximately 3mm wide running 2m along east wall foundation. Potential water ingress risk.",
    category: "Structural",
    severity: "Critical",
    status: "Open",
    location: "Grid B4, East Foundation Wall",
    trade: "Concrete",
  },
  {
    id: `DEF-${String(2).padStart(3, "0")}`,
    project_id: projects[0].id,
    title: "Missing fire stopping at floor 14 penetrations",
    description:
      "Electrical conduit penetrations through floor 14 slab missing intumescent fire stopping material.",
    category: "Safety",
    severity: "Critical",
    status: "In Progress",
    location: "Floor 14, Electrical Room",
    trade: "Electrical",
  },
  {
    id: `DEF-${String(3).padStart(3, "0")}`,
    project_id: projects[0].id,
    title: "HVAC ductwork condensation – Floor 8",
    description:
      "Supply air ductwork showing signs of condensation and minor corrosion around joints. Insulation gaps identified.",
    category: "Mechanical",
    severity: "Major",
    status: "Open",
    location: "Floor 8 Ceiling Plenum",
    trade: "HVAC",
  },
  {
    id: `DEF-${String(4).padStart(3, "0")}`,
    project_id: projects[0].id,
    title: "Drywall finish – Level 5 required",
    description:
      "Lobby accent wall finish not meeting Level 5 specification. Visible trowel marks under raking light.",
    category: "Finish",
    severity: "Minor",
    status: "Resolved",
    location: "Ground Floor Lobby",
    trade: "Drywall",
  },
  // Riverside Industrial Park
  {
    id: `DEF-${String(5).padStart(3, "0")}`,
    project_id: projects[1].id,
    title: "Loading dock floor slab cracking",
    description:
      "Control joint spalling and slab cracking at dock 3 approach. Forklift traffic risk.",
    category: "Structural",
    severity: "Major",
    status: "Open",
    location: "Loading Dock 3",
    trade: "Concrete",
  },
  {
    id: `DEF-${String(6).padStart(3, "0")}`,
    project_id: projects[1].id,
    title: "Plumbing slope non-compliant – Restroom B",
    description:
      "Floor drain slope measured at 0.5% — code requires minimum 1%. Ponding likely.",
    category: "Plumbing",
    severity: "Minor",
    status: "Open",
    location: "Restroom B, Grid F7",
    trade: "Plumbing",
  },
  // Maple Street Renovation
  {
    id: `DEF-${String(7).padStart(3, "0")}`,
    project_id: projects[2].id,
    title: "Seismic anchor bolt spacing non-compliant",
    description:
      "Anchor bolts at shear wall SW-3 installed at 24\" o.c. Drawings specify 16\" o.c. per engineer of record.",
    category: "Structural",
    severity: "Critical",
    status: "In Progress",
    location: "Shear Wall SW-3, Level 2",
    trade: "Structural Steel",
  },
  {
    id: `DEF-${String(8).padStart(3, "0")}`,
    project_id: projects[2].id,
    title: "Window sill flashing incomplete",
    description:
      "Sill flashing missing at 3 of 12 historic window openings on north elevation.",
    category: "Other",
    severity: "Observation",
    status: "Closed",
    location: "North Elevation, Windows 4, 7, 11",
    trade: "Masonry",
  },
];

const insertDeficiency = db.prepare(`
  INSERT INTO deficiencies (id, project_id, title, description, category, severity, status, location, trade, photo_paths, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const d of deficiencies) {
  insertDeficiency.run(
    d.id, d.project_id, d.title, d.description,
    d.category, d.severity, d.status, d.location,
    d.trade, "[]", now, now
  );
}

console.log("✅ Database initialized at", DB_PATH);
console.log(`   ${projects.length} projects seeded`);
console.log(`   ${deficiencies.length} deficiencies seeded`);

db.close();
