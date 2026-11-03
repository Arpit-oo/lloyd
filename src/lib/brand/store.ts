import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { getConfig } from "@/lib/config";

/**
 * Each brand gets its own SQLite file keyed by a hash of the brand folder's contents.
 * - Changing any brand file changes the hash, so a stale index is never used by accident.
 * - The file can be shipped as a gzipped seed (seed/brands/<hash>.db.gz, made by `npm run seed`)
 *   so a fresh clone opens instantly.
 */
export type BrandDB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS docs (
  id        TEXT PRIMARY KEY,           -- relative path
  hash      TEXT NOT NULL,
  title     TEXT NOT NULL,
  tokens    INTEGER NOT NULL,
  card_json TEXT,                       -- DocCard
  tier      INTEGER,                    -- 1 = highest authority
  tier_reason TEXT
);

CREATE TABLE IF NOT EXISTS chunks (
  id           INTEGER PRIMARY KEY,
  doc_id       TEXT NOT NULL REFERENCES docs(id),
  ord          INTEGER NOT NULL,
  heading_path TEXT NOT NULL,
  text         TEXT NOT NULL,
  tokens       INTEGER NOT NULL,
  embedding    BLOB
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, heading_path, content='chunks', content_rowid='id');

CREATE TABLE IF NOT EXISTS facts (
  id          TEXT PRIMARY KEY,
  doc_id      TEXT NOT NULL REFERENCES docs(id),
  kind        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  statement   TEXT NOT NULL,
  quote       TEXT NOT NULL,
  heading     TEXT,
  scope_json  TEXT,
  valid_from  TEXT,
  valid_until TEXT,
  embedding   BLOB,
  cluster     INTEGER
);

CREATE TABLE IF NOT EXISTS conflicts (
  id              TEXT PRIMARY KEY,
  topic           TEXT NOT NULL,
  fact_ids_json   TEXT NOT NULL,
  resolution_json TEXT NOT NULL,
  needs_user      INTEGER NOT NULL DEFAULT 0,
  user_decision   TEXT
);

CREATE TABLE IF NOT EXISTS images (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  meta_json   TEXT NOT NULL,            -- original metadata record, untouched
  caption     TEXT,                     -- from vision
  rules_json  TEXT,                     -- parsed usage rules
  usable      INTEGER NOT NULL DEFAULT 1,
  embedding   BLOB
);
`;

const open = new Map<string, BrandDB>();

export function brandDbPath(hash: string) {
  return path.join(getConfig().dataDir, "brands", `${hash}.db`);
}

/** Shipped seeds are gzipped (the index is mostly embeddings) and unpacked on first use. */
export function seedDbPath(hash: string) {
  return path.join(getConfig().rootDir, "seed", "brands", `${hash}.db.gz`);
}

export function openBrandDb(hash: string): BrandDB {
  const existing = open.get(hash);
  if (existing) return existing;
  const file = brandDbPath(hash);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Fresh clone + unchanged sample brand: start from the shipped seed instead of re-ingesting.
  if (!fs.existsSync(file) && fs.existsSync(seedDbPath(hash))) fs.writeFileSync(file, zlib.gunzipSync(fs.readFileSync(seedDbPath(hash))));
  const conn = new Database(file);
  conn.pragma("journal_mode = WAL");
  conn.exec(SCHEMA);
  open.set(hash, conn);
  return conn;
}

export function getMeta<T>(bdb: BrandDB, key: string): T | null {
  const row = bdb.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setMeta(bdb: BrandDB, key: string, value: unknown) {
  bdb.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

export const toBlob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
export const fromBlob = (b: Buffer) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
