import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getConfig } from "@/lib/config";
import { MIGRATIONS } from "./migrations";

/**
 * One SQLite file holds all app state (campaigns, assets, memory, LLM call log).
 * The brand index lives in a separate file per brand hash (see lib/brand/store.ts),
 * so switching brands never mixes indexes and a cached brand can be shipped as one file.
 */
type DB = Database.Database;

const globalForDb = globalThis as unknown as { __appDb?: DB };

export function db(): DB {
  // Reuse across Next.js hot reloads in dev.
  if (globalForDb.__appDb) return globalForDb.__appDb;
  const { dataDir } = getConfig();
  fs.mkdirSync(dataDir, { recursive: true });
  const conn = new Database(path.join(dataDir, "app.db"));
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  migrate(conn);
  globalForDb.__appDb = conn;
  return conn;
}

function migrate(conn: DB) {
  const current = conn.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[v]);
      conn.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
