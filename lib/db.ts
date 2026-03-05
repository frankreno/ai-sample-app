import Database from "better-sqlite3";
import { join } from "path";

const DB_PATH = join(process.cwd(), "db", "sitecheck.db");

// Singleton — reuse across hot reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (!global.__db) {
    global.__db = new Database(DB_PATH);
    global.__db.pragma("journal_mode = WAL");
    global.__db.pragma("foreign_keys = ON");
  }
  return global.__db;
}

export const db = getDb();
