import path from "node:path";
import { currentBrandHash, getBrand } from "@/lib/brand";
import { knownBrandName } from "@/lib/brand/active";
import { getConfig } from "@/lib/config";
import type { IngestSummary } from "@/lib/brand/ingest";
import { getMeta, openBrandDb } from "@/lib/brand/store";
import { json } from "@/lib/http/sse";

/**
 * What the brand layer knows, for the Brand Truths panel: authority order, settled conflicts,
 * entity names, excluded images, the compiled kernel and design tokens.
 */
export async function GET() {
  const brand = getBrand();
  if (!brand) {
    const bdb = openBrandDb(currentBrandHash());
    return json({ ready: false, docs: (bdb.prepare("SELECT COUNT(*) n FROM docs").get() as { n: number }).n });
  }
  const conflicts = (brand.db.prepare("SELECT id, topic, fact_ids_json, resolution_json, needs_user FROM conflicts").all() as {
    id: string; topic: string; fact_ids_json: string; resolution_json: string; needs_user: number;
  }[]).map((c) => {
    const ids = JSON.parse(c.fact_ids_json) as string[];
    const facts = brand.db
      .prepare(`SELECT f.id, f.doc_id, f.statement, f.quote, d.tier FROM facts f JOIN docs d ON d.id = f.doc_id WHERE f.id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids);
    return { id: c.id, topic: c.topic, resolution: JSON.parse(c.resolution_json), needsUser: !!c.needs_user, facts };
  });
  const images = (brand.db.prepare("SELECT id, filename, meta_json, caption, rules_json, usable FROM images ORDER BY usable, id").all() as {
    id: string; filename: string; meta_json: string; caption: string | null; rules_json: string | null; usable: number;
  }[]).map((i) => ({ id: i.id, usable: !!i.usable, meta: JSON.parse(i.meta_json), vision: i.caption ? JSON.parse(i.caption) : null, rules: i.rules_json ? JSON.parse(i.rules_json) : null }));
  const docs = brand.db.prepare("SELECT id, title, tier, tier_reason, card_json FROM docs ORDER BY tier, id").all() as {
    id: string; title: string; tier: number; tier_reason: string; card_json: string;
  }[];

  return json({
    ready: true,
    hash: brand.hash,
    // The brand's own name if its documents give one, else the folder's name.
    name: brand.tokens?.brand_name?.trim() || knownBrandName(getConfig().dataDir, getConfig().brandDir) || path.basename(getConfig().brandDir),
    summary: getMeta<IngestSummary>(brand.db, "ingest:summary"),
    governance: brand.governance,
    docs: docs.map((d) => ({ id: d.id, title: d.title, tier: d.tier, reason: d.tier_reason, card: JSON.parse(d.card_json) })),
    conflicts,
    entities: brand.entities,
    images,
    kernel: brand.kernel,
    tokens: brand.tokens,
  });
}
