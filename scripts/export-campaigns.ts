/**
 * Writes every campaign in a data directory as a readable Markdown file (the same document as
 * Share -> Export). Use it to read test runs, which live in their own SQLite files.
 *
 *   npm run export -- [--data ./data/mock2] [--out ./exports] [--prefix mock-2-]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dataDir = arg("--data", "./data");
const outDir = arg("--out", "./exports");
const prefix = arg("--prefix", "");

if (!fs.existsSync(path.join(dataDir, "app.db"))) throw new Error(`No app.db in ${dataDir}`);
process.env.DATA_DIR = dataDir;

async function main() {
  // Imported after DATA_DIR is set, so the store opens that directory's database.
  const { db } = await import("@/lib/db");
  const { campaignMarkdown, slugify } = await import("@/lib/agent/export");
  fs.mkdirSync(outDir, { recursive: true });
  const ids = (db().prepare("SELECT id FROM campaigns ORDER BY created_at").all() as { id: string }[]).map((r) => r.id);
  for (const id of ids) {
    const doc = campaignMarkdown(id);
    if (!doc) continue;
    const file = path.join(outDir, `${prefix}${slugify(doc.title)}.md`);
    fs.writeFileSync(file, doc.markdown);
    console.log(`wrote ${file}`);
  }
}

main();
