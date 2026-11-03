/**
 * Packs the current brand's finished index into seed/brands/<hash>.db.gz so a fresh clone with
 * the same brand folder opens instantly, without paying for ingest. Run after `npm run ingest`.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { requireBrand } from "@/lib/brand";
import { brandDbPath, seedDbPath } from "@/lib/brand/store";

async function main() {
  const brand = requireBrand();
  brand.db.pragma("wal_checkpoint(TRUNCATE)");
  const tmp = `${brandDbPath(brand.hash)}.seed-tmp`;
  await brand.db.backup(tmp);
  const out = seedDbPath(brand.hash);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zlib.gzipSync(fs.readFileSync(tmp), { level: 9 }));
  fs.rmSync(tmp);
  console.log(`Wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
