import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { embed } from "@/lib/llm/embed";
import { buildDocCard, type DocCard } from "./cards";
import { chunkMarkdown, estimateTokens } from "./chunk";
import { auditGroups, compactResolutions, groupFacts, mergeGroups, renderGovernance, resolveConflicts, type FactForConflict, type StoredConflict } from "./conflicts";
import { buildEntityRegistry, type Entity } from "./entities";
import { extractDesignTokens } from "./design-tokens";
import { extractFacts } from "./facts";
import { deriveGovernance, type Governance } from "./governance";
import { captionImage, parseImageRules } from "./images";
import { compileKernel } from "./kernel";
import { scanBrand, type BrandScan } from "./scan";
import { fromBlob, getMeta, openBrandDb, setMeta, toBlob, type BrandDB } from "./store";

/**
 * Builds the brand index. Every step is resumable: it skips work whose output already exists,
 * so a crash or Ctrl-C costs nothing already paid for. A finished index (or a shipped seed)
 * is detected before any network call is made.
 */
export interface IngestEvent {
  step: string;
  done?: number;
  total?: number;
  message?: string;
}
type Progress = (e: IngestEvent) => void;

export interface IngestSummary {
  hash: string;
  docs: number;
  chunks: number;
  facts: number;
  conflicts: number;
  images: number;
  usableImages: number;
  skippedFiles: string[];
  costUSD: number;
  fromCache: boolean;
}

export async function ingestBrand(onProgress: Progress = () => {}): Promise<IngestSummary> {
  const scan = scanBrand(getConfig().brandDir);
  const bdb = openBrandDb(scan.hash);
  const done = getMeta<IngestSummary>(bdb, "ingest:summary");
  if (done) return { ...done, fromCache: true };

  const runId = `ingest-${scan.hash}`;
  const ctx = { runId };
  onProgress({ step: "scan", message: `${scan.docs.length} documents, ${scan.images.length} images, ${scan.imageMetadata.length} metadata records` });

  storeDocsAndChunks(bdb, scan);
  await step("cards", () => buildCards(bdb, scan, ctx, onProgress));
  await step("chunk embeddings", () => embedChunks(bdb, ctx, onProgress));
  const governance = await step("governance", () => buildGovernance(bdb, ctx));
  await step("facts", () => buildFacts(bdb, scan, ctx, onProgress));
  await step("conflicts", () => buildConflicts(bdb, governance, ctx, onProgress));
  compactStoredConflicts(bdb);
  const entities = await step("entities", () => buildEntities(bdb, ctx));
  await step("kernel", () => buildKernel(bdb, governance, entities, ctx));
  await step("images", () => buildImages(bdb, scan, ctx, onProgress));
  await step("design tokens", () => buildDesignTokens(bdb, scan, ctx));

  const summary: IngestSummary = {
    hash: scan.hash,
    docs: count(bdb, "docs"),
    chunks: count(bdb, "chunks"),
    facts: count(bdb, "facts"),
    conflicts: count(bdb, "conflicts"),
    images: count(bdb, "images"),
    usableImages: (bdb.prepare("SELECT COUNT(*) n FROM images WHERE usable = 1").get() as { n: number }).n,
    skippedFiles: scan.skipped,
    costUSD: (db().prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM llm_calls WHERE run_id = ?").get(runId) as { c: number }).c,
    fromCache: false,
  };
  setMeta(bdb, "ingest:summary", summary);
  setMeta(bdb, "ingest:steps", ingestStepCosts(runId));
  onProgress({ step: "done", message: `$${summary.costUSD.toFixed(3)}` });
  return summary;

  async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    onProgress({ step: name, message: "start" });
    const out = await fn();
    onProgress({ step: name, message: "done" });
    return out;
  }
}

// ---------- steps ----------

function storeDocsAndChunks(bdb: BrandDB, scan: BrandScan) {
  if (count(bdb, "docs") > 0) return;
  const insDoc = bdb.prepare("INSERT INTO docs (id, hash, title, tokens) VALUES (?,?,?,?)");
  const insChunk = bdb.prepare("INSERT INTO chunks (doc_id, ord, heading_path, text, tokens) VALUES (?,?,?,?,?)");
  bdb.transaction(() => {
    for (const d of scan.docs) {
      insDoc.run(d.id, d.hash, d.title, estimateTokens(d.text));
      for (const c of chunkMarkdown(d.text, d.id)) insChunk.run(d.id, c.ord, c.headingPath, c.text, c.tokens);
    }
    bdb.exec("INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')");
  })();
}

async function buildCards(bdb: BrandDB, scan: BrandScan, ctx: { runId: string }, onProgress: Progress) {
  const todo = scan.docs.filter((d) => !(bdb.prepare("SELECT card_json FROM docs WHERE id = ?").get(d.id) as { card_json: string | null }).card_json);
  let n = 0;
  await Promise.all(
    todo.map(async (d) => {
      const card = await buildDocCard(d, ctx);
      bdb.prepare("UPDATE docs SET card_json = ? WHERE id = ?").run(JSON.stringify(card), d.id);
      onProgress({ step: "cards", done: ++n, total: todo.length, message: d.id });
    }),
  );
}

async function embedChunks(bdb: BrandDB, ctx: { runId: string }, onProgress: Progress) {
  const rows = bdb.prepare("SELECT id, heading_path, text FROM chunks WHERE embedding IS NULL").all() as { id: number; heading_path: string; text: string }[];
  if (!rows.length) return;
  const vecs = await embed(rows.map((r) => `${r.heading_path}\n${r.text}`), "ingest:embed-chunks", ctx);
  const upd = bdb.prepare("UPDATE chunks SET embedding = ? WHERE id = ?");
  bdb.transaction(() => rows.forEach((r, i) => upd.run(toBlob(vecs[i]), r.id)))();
  onProgress({ step: "chunk embeddings", done: rows.length, total: rows.length });
}

async function buildGovernance(bdb: BrandDB, ctx: { runId: string }): Promise<Governance> {
  const existing = getMeta<Governance>(bdb, "governance");
  if (existing) return existing;
  const docs = allDocs(bdb);
  const gov = await deriveGovernance(bdb, docs, ctx);
  setMeta(bdb, "governance", gov);
  const upd = bdb.prepare("UPDATE docs SET tier = ?, tier_reason = ? WHERE id = ?");
  bdb.transaction(() => gov.doc_tiers.forEach((d) => upd.run(d.rank, d.reason, d.doc_id)))();
  return gov;
}

async function buildFacts(bdb: BrandDB, scan: BrandScan, ctx: { runId: string }, onProgress: Progress) {
  const cards = new Map(allDocs(bdb).map((d) => [d.id, d.card]));
  const todo = scan.docs.filter((d) => !getMeta(bdb, `facts:${d.id}`));
  const ins = bdb.prepare(
    `INSERT INTO facts (id, doc_id, kind, subject, statement, quote, heading, scope_json, valid_from, valid_until) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  let n = 0;
  await Promise.all(
    todo.map(async (d) => {
      const facts = await extractFacts(d, cards.get(d.id)!, ctx);
      bdb.transaction(() => {
        facts.forEach((f, i) =>
          ins.run(`${d.id}#${i + 1}`, d.id, f.kind, f.subject, f.statement, f.quote, f.heading,
            JSON.stringify({ channels: f.channels, audiences: f.audiences, products: f.products }), f.valid_from, f.valid_until),
        );
        setMeta(bdb, `facts:${d.id}`, facts.length);
      })();
      onProgress({ step: "facts", done: ++n, total: todo.length, message: `${d.id}: ${facts.length}` });
    }),
  );
  const missing = bdb.prepare("SELECT id, subject, statement FROM facts WHERE embedding IS NULL").all() as { id: string; subject: string; statement: string }[];
  if (missing.length) {
    const vecs = await embed(missing.map((f) => `${f.subject}: ${f.statement}`), "ingest:embed-facts", ctx);
    const upd = bdb.prepare("UPDATE facts SET embedding = ? WHERE id = ?");
    bdb.transaction(() => missing.forEach((f, i) => upd.run(toBlob(vecs[i]), f.id)))();
  }
}

async function buildConflicts(bdb: BrandDB, governance: Governance, ctx: { runId: string }, onProgress: Progress) {
  if (getMeta(bdb, "conflicts:done")) return;
  const facts = factsForConflict(bdb);
  const similar = groupFacts(facts);
  const audit = auditGroups(facts);
  const groups = mergeGroups(similar, audit);
  onProgress({ step: "conflicts", message: `${facts.length} facts -> ${similar.length} similarity groups + ${audit.length} audit groups` });
  const resolved = await resolveConflicts(groups, governance, ctx, (d, t) => onProgress({ step: "conflicts", done: d, total: t }));
  writeConflicts(bdb, resolved.map((r) => ({ resolution: r.resolution, factIds: r.facts.map((f) => f.id) })));
  setMeta(bdb, "conflicts:done", true);
}

/** Merges duplicate resolutions and rewrites the conflicts table. Idempotent, no model calls. */
function compactStoredConflicts(bdb: BrandDB) {
  const rows = bdb.prepare("SELECT fact_ids_json, resolution_json FROM conflicts").all() as { fact_ids_json: string; resolution_json: string }[];
  writeConflicts(bdb, rows.map((r) => ({ factIds: JSON.parse(r.fact_ids_json), resolution: JSON.parse(r.resolution_json) })));
}

function writeConflicts(bdb: BrandDB, items: StoredConflict[]) {
  const tiers = new Map((bdb.prepare("SELECT id, tier FROM docs").all() as { id: string; tier: number }[]).map((d) => [d.id, d.tier]));
  const ins = bdb.prepare("INSERT INTO conflicts (id, topic, fact_ids_json, resolution_json, needs_user) VALUES (?,?,?,?,?)");
  bdb.transaction(() => {
    bdb.exec("DELETE FROM conflicts");
    compactResolutions(items, (id) => tiers.get(id.split("#")[0]) ?? 99).forEach((c, i) =>
      ins.run(`conflict_${i + 1}`, c.resolution.topic, JSON.stringify(c.factIds), JSON.stringify(c.resolution), c.resolution.needs_user ? 1 : 0),
    );
  })();
}

async function buildEntities(bdb: BrandDB, ctx: { runId: string }): Promise<Entity[]> {
  const existing = getMeta<Entity[]>(bdb, "entities");
  if (existing) return existing;
  const entities = await buildEntityRegistry(bdb, ctx);
  setMeta(bdb, "entities", entities);
  return entities;
}

async function buildKernel(bdb: BrandDB, governance: Governance, entities: Entity[], ctx: { runId: string }) {
  if (getMeta(bdb, "kernel")) return;
  const losers = new Set(
    (bdb.prepare("SELECT resolution_json FROM conflicts").all() as { resolution_json: string }[]).flatMap((r) => JSON.parse(r.resolution_json).loser_fact_ids as string[]),
  );
  const conflicts = (bdb.prepare("SELECT resolution_json FROM conflicts").all() as { resolution_json: string }[])
    .map((r) => JSON.parse(r.resolution_json))
    .map((r) => `- ${r.topic}: ${r.explanation} [winners: ${r.winner_fact_ids.join(", ")}; losers: ${r.loser_fact_ids.join(", ")}]`)
    .join("\n");
  const KERNEL_KINDS = ["approved_wording", "banned_claim", "naming_rule", "customer_reference", "certification", "statistic", "company_fact", "voice_rule", "product_fact"];
  const rows = bdb
    .prepare(`SELECT f.id, f.doc_id, f.kind, f.subject, f.statement, f.quote, f.valid_until, d.tier FROM facts f JOIN docs d ON d.id = f.doc_id
              WHERE f.kind IN (${KERNEL_KINDS.map(() => "?").join(",")}) ORDER BY d.tier, f.doc_id`)
    .all(...KERNEL_KINDS) as { id: string; doc_id: string; kind: string; subject: string; statement: string; quote: string; valid_until: string | null; tier: number }[];
  const maxTier = Math.min(3, Math.max(...rows.map((r) => r.tier)));
  const factText = rows
    .filter((r) => !losers.has(r.id) && r.tier <= maxTier)
    .map((r) => `[${r.id} | tier ${r.tier} | ${r.kind}] ${r.subject}: ${r.statement}${r.valid_until ? ` (usable until ${r.valid_until})` : ""}`)
    .join("\n")
    .slice(0, 160_000);
  const entityText = entities
    .map((e) => `- ${e.current_name}${e.short_name ? ` (short: ${e.short_name})` : ""} | ${e.kind} | ${e.status}${e.former_names.length ? ` | former names, do not use: ${e.former_names.join(", ")}${e.former_name_rule ? ` (${e.former_name_rule})` : ""}` : ""}`)
    .join("\n");
  const kernel = await compileKernel({ governance: renderGovernance(governance), entities: entityText, facts: factText, conflicts }, ctx);
  setMeta(bdb, "kernel", kernel);
}

async function buildImages(bdb: BrandDB, scan: BrandScan, ctx: { runId: string }, onProgress: Progress) {
  const metaByFile = new Map(scan.imageMetadata.map((m) => [String(m.filename ?? m.file ?? m.path ?? "").split("/").pop()!, m]));
  // PNG/SVG twins share an id; keep one row per id, preferring the file named in metadata.
  const byId = new Map<string, (typeof scan.images)[number]>();
  for (const img of scan.images) if (!byId.has(img.id) || metaByFile.has(img.filename)) byId.set(img.id, img);
  const images = [...byId.values()];

  const ins = bdb.prepare("INSERT OR IGNORE INTO images (id, filename, meta_json) VALUES (?,?,?)");
  bdb.transaction(() => images.forEach((img) => ins.run(img.id, img.relPath, JSON.stringify(metaByFile.get(img.filename) ?? {}))))();

  const uncaptioned = bdb.prepare("SELECT id FROM images WHERE caption IS NULL").all() as { id: string }[];
  let n = 0;
  await Promise.all(
    uncaptioned.map(async ({ id }) => {
      const img = byId.get(id)!;
      const v = await captionImage(img, metaByFile.get(img.filename), ctx);
      bdb.prepare("UPDATE images SET caption = ? WHERE id = ?").run(JSON.stringify(v), id);
      onProgress({ step: "images", done: ++n, total: uncaptioned.length, message: img.filename });
    }),
  );

  const unruled = bdb.prepare("SELECT id, meta_json FROM images WHERE rules_json IS NULL").all() as { id: string; meta_json: string }[];
  if (unruled.length) {
    const rules = await parseImageRules(unruled.map((r) => ({ id: r.id, meta: JSON.parse(r.meta_json) })), ctx);
    const upd = bdb.prepare("UPDATE images SET rules_json = ?, usable = ? WHERE id = ?");
    bdb.transaction(() => rules.forEach((r) => upd.run(JSON.stringify(r), r.usable_externally && !r.deprecated && !r.expired && !r.people_unavailable.length ? 1 : 0, r.id)))();
    // Anything the parser skipped stays unusable: unparsed restrictions are not guessed at.
    bdb.prepare("UPDATE images SET usable = 0 WHERE rules_json IS NULL").run();
  }

  const unembedded = bdb.prepare("SELECT id, meta_json, caption FROM images WHERE embedding IS NULL").all() as { id: string; meta_json: string; caption: string }[];
  if (unembedded.length) {
    const texts = unembedded.map((r) => {
      const m = JSON.parse(r.meta_json);
      const v = JSON.parse(r.caption ?? "{}");
      return `${m.title ?? r.id}. ${m.type ?? ""}. ${m.description ?? ""} ${(m.tags ?? []).join(", ")}. Seen: ${v.caption ?? ""}`;
    });
    const vecs = await embed(texts, "ingest:embed-images", ctx);
    const upd = bdb.prepare("UPDATE images SET embedding = ? WHERE id = ?");
    bdb.transaction(() => unembedded.forEach((r, i) => upd.run(toBlob(vecs[i]), r.id)))();
  }
}

async function buildDesignTokens(bdb: BrandDB, scan: BrandScan, ctx: { runId: string }) {
  if (getMeta(bdb, "design_tokens")) return;
  const rows = bdb
    .prepare(
      `SELECT c.doc_id, c.heading_path, c.text, d.tier FROM chunks_fts f JOIN chunks c ON c.id = f.rowid JOIN docs d ON d.id = c.doc_id
       WHERE chunks_fts MATCH 'hex OR color OR colour OR typeface OR typography OR font OR logo OR palette OR tagline' AND d.tier <= 2 ORDER BY d.tier, rank LIMIT 24`,
    )
    .all() as { doc_id: string; heading_path: string; text: string; tier: number }[];
  const passages = rows.map((r) => `[tier ${r.tier} | ${r.heading_path}]\n${r.text}`).join("\n\n---\n\n");
  const tokens = await extractDesignTokens(passages, scan.images.map((i) => i.filename), ctx);
  setMeta(bdb, "design_tokens", tokens);
}

/**
 * Forgets the output of the named steps (and the finished marker) so the next ingest redoes
 * only them. Later steps that depend on them must be listed too (e.g. conflicts -> kernel).
 */
export const REDOABLE = ["cards", "governance", "facts", "conflicts", "entities", "kernel", "image-rules", "vision", "design-tokens"] as const;
export type RedoStep = (typeof REDOABLE)[number];

export function resetSteps(hash: string, steps: RedoStep[]) {
  const bdb = openBrandDb(hash);
  bdb.transaction(() => {
    bdb.prepare("DELETE FROM meta WHERE key = 'ingest:summary'").run();
    for (const s of steps) {
      if (s === "cards") bdb.prepare("UPDATE docs SET card_json = NULL").run();
      if (s === "governance") bdb.prepare("DELETE FROM meta WHERE key = 'governance'").run();
      if (s === "facts") {
        bdb.prepare("DELETE FROM facts").run();
        bdb.prepare("DELETE FROM meta WHERE key LIKE 'facts:%'").run();
      }
      if (s === "conflicts") {
        bdb.prepare("DELETE FROM conflicts").run();
        bdb.prepare("DELETE FROM meta WHERE key = 'conflicts:done'").run();
      }
      if (s === "entities") bdb.prepare("DELETE FROM meta WHERE key = 'entities'").run();
      if (s === "kernel") bdb.prepare("DELETE FROM meta WHERE key = 'kernel'").run();
      if (s === "image-rules") bdb.prepare("UPDATE images SET rules_json = NULL, usable = 1").run();
      if (s === "vision") bdb.prepare("UPDATE images SET caption = NULL, embedding = NULL").run();
      if (s === "design-tokens") bdb.prepare("DELETE FROM meta WHERE key = 'design_tokens'").run();
    }
  })();
}

// ---------- helpers ----------

export interface IngestStepCost {
  step: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

/** Cost of each ingest step, kept in the brand index so it travels with a shipped seed. */
export function ingestStepCosts(runId: string): IngestStepCost[] {
  return db()
    .prepare(
      `SELECT step, COUNT(*) calls, SUM(input_tokens) inputTokens, SUM(output_tokens) outputTokens, SUM(cost_usd) costUSD
       FROM llm_calls WHERE run_id = ? GROUP BY step ORDER BY costUSD DESC`,
    )
    .all(runId) as IngestStepCost[];
}

function count(bdb: BrandDB, table: string): number {
  return (bdb.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
}

export function allDocs(bdb: BrandDB): { id: string; title: string; tier: number | null; card: DocCard }[] {
  return (bdb.prepare("SELECT id, title, tier, card_json FROM docs ORDER BY id").all() as { id: string; title: string; tier: number | null; card_json: string }[]).map(
    (d) => ({ id: d.id, title: d.title, tier: d.tier, card: JSON.parse(d.card_json) }),
  );
}

function factsForConflict(bdb: BrandDB): FactForConflict[] {
  const rows = bdb
    .prepare(`SELECT f.id, f.doc_id, f.kind, f.subject, f.statement, f.quote, f.embedding, d.tier, d.card_json FROM facts f JOIN docs d ON d.id = f.doc_id WHERE f.embedding IS NOT NULL`)
    .all() as { id: string; doc_id: string; kind: string; subject: string; statement: string; quote: string; embedding: Buffer; tier: number; card_json: string }[];
  return rows.map((r) => {
    const card = JSON.parse(r.card_json) as DocCard;
    return {
      id: r.id, docId: r.doc_id, tier: r.tier ?? 99, docDate: card.stated_date, docStatus: card.status,
      kind: r.kind, subject: r.subject, statement: r.statement, quote: r.quote, embedding: fromBlob(r.embedding),
    };
  });
}
