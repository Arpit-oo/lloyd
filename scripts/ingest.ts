/**
 * Build (or load from cache) the brand index and print what the brand layer found.
 * Usage: npm run ingest            (uses BRAND_DIR)
 *        npm run ingest -- --force (rebuild even if cached)
 *        npm run ingest -- --redo conflicts,entities,kernel   (redo only those steps)
 */
import fs from "node:fs";
import { getConfig } from "@/lib/config";
import { ingestBrand, REDOABLE, resetSteps, type RedoStep } from "@/lib/brand/ingest";
import { scanBrand } from "@/lib/brand/scan";
import { brandDbPath, getMeta, openBrandDb } from "@/lib/brand/store";
import type { Governance } from "@/lib/brand/governance";

async function main() {
  const { brandDir } = getConfig();
  console.log(`Brand folder: ${brandDir}`);
  if (process.argv.includes("--force")) {
    const file = brandDbPath(scanBrand(brandDir).hash);
    for (const f of [file, `${file}-wal`, `${file}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
    console.log("Cache cleared.");
  }

  const redoArg = process.argv[process.argv.indexOf("--redo") + 1];
  if (process.argv.includes("--redo") && redoArg) {
    const steps = redoArg.split(",").map((x) => x.trim()) as RedoStep[];
    const bad = steps.filter((x) => !REDOABLE.includes(x));
    if (bad.length) throw new Error(`Unknown step(s): ${bad.join(", ")}. Valid: ${REDOABLE.join(", ")}`);
    resetSteps(scanBrand(brandDir).hash, steps);
    console.log(`Redoing: ${steps.join(", ")}`);
  }

  const t0 = Date.now();
  let last = "";
  const summary = await ingestBrand((e) => {
    const line = e.total ? `[${e.step}] ${e.done}/${e.total} ${e.message ?? ""}` : `[${e.step}] ${e.message ?? ""}`;
    if (line !== last) console.log(line);
    last = line;
  });

  const bdb = openBrandDb(summary.hash);
  const gov = getMeta<Governance>(bdb, "governance");
  console.log(`\n${summary.fromCache ? "Loaded from cache" : "Built"} in ${((Date.now() - t0) / 1000).toFixed(1)}s, cost $${summary.costUSD.toFixed(3)}`);
  console.log(`${summary.docs} docs, ${summary.chunks} chunks, ${summary.facts} facts, ${summary.conflicts} conflicts, ${summary.usableImages}/${summary.images} images usable`);
  if (summary.skippedFiles.length) console.log(`Skipped (unsupported): ${summary.skippedFiles.join(", ")}`);

  if (gov) {
    console.log(`\nAuthority (${gov.source}, ${gov.confidence}):`);
    for (const t of [...gov.tiers].sort((a, b) => a.rank - b.rank)) console.log(`  ${t.rank}. ${t.name}${t.evidence ? `  <- "${t.evidence.slice(0, 90)}"` : "  (inferred)"}`);
    for (const s of gov.supersessions) console.log(`  ${s.newer_doc} replaces ${s.older_doc}`);
  }

  const entities = getMeta<{ current_name: string; status: string; former_names: string[] }[]>(bdb, "entities") ?? [];
  console.log("\nEntities:");
  for (const e of entities) console.log(`  ${e.current_name} [${e.status}]${e.former_names.length ? `  formerly: ${e.former_names.join(", ")}` : ""}`);

  console.log("\nConflicts:");
  const rows = bdb.prepare("SELECT topic, resolution_json, needs_user FROM conflicts").all() as { topic: string; resolution_json: string; needs_user: number }[];
  for (const r of rows) {
    const res = JSON.parse(r.resolution_json);
    console.log(`  ${r.needs_user ? "?" : "•"} ${r.topic} [${res.confidence}] ${res.explanation}`);
  }

  console.log("\nExcluded images:");
  const imgs = bdb.prepare("SELECT id, rules_json FROM images WHERE usable = 0").all() as { id: string; rules_json: string | null }[];
  for (const i of imgs) {
    const r = i.rules_json ? JSON.parse(i.rules_json) : null;
    console.log(`  ${i.id}: ${r?.caution ?? (r?.deprecated ? "deprecated" : r?.expired ? "expired" : r?.people_unavailable?.join(", ") || "not usable")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
