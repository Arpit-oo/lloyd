import { cosine, embed } from "@/lib/llm/embed";
import type { CallContext } from "@/lib/llm/client";
import { fromBlob, type BrandDB } from "./store";

/**
 * Hybrid retrieval over brand chunks: BM25 (exact names, numbers, rule words) fused with
 * embeddings (paraphrase) by reciprocal rank fusion. Filters use doc cards and authority tiers,
 * so a writer can ask for "channel rules for email" without dragging in old campaign emails.
 */
export interface ChunkHit {
  id: number;
  docId: string;
  headingPath: string;
  text: string;
  tokens: number;
  tier: number;
  docType: string;
  score: number;
}

export interface SearchOptions {
  limit?: number;
  docTypes?: string[];
  excludeDocTypes?: string[];
  maxTier?: number;
  docIds?: string[];
}

interface Row {
  id: number;
  doc_id: string;
  heading_path: string;
  text: string;
  tokens: number;
  embedding: Buffer | null;
  tier: number | null;
  card_json: string;
}

const RRF_K = 60;

export async function searchBrand(bdb: BrandDB, query: string, opts: SearchOptions = {}, ctx: CallContext = {}): Promise<ChunkHit[]> {
  return (await searchBrandMany(bdb, [query], opts, ctx))[0];
}

/** searchBrand for several queries with one embedding call (the claim check runs one per paragraph). */
export async function searchBrandMany(bdb: BrandDB, queries: string[], opts: SearchOptions = {}, ctx: CallContext = {}): Promise<ChunkHit[][]> {
  const limit = opts.limit ?? 8;
  const rows = candidateRows(bdb, opts);
  if (!rows.length || !queries.length) return queries.map(() => []);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const vectors = rows.filter((r) => r.embedding).map((r) => ({ id: r.id, v: fromBlob(r.embedding!) }));
  const queryVectors = await embed(queries, "retrieve:query", ctx);
  const fts = bdb.prepare("SELECT rowid AS id FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT 200");

  return queries.map((query, q) => {
    // BM25 over the filtered set.
    const ftsQuery = toFtsQuery(query);
    const bm25 = ftsQuery
      ? (fts.all(ftsQuery) as { id: number }[])
          .map((r) => r.id)
          .filter((id) => byId.has(id))
      : [];

    // Embedding similarity over the filtered set.
    const dense = vectors
      .map((r) => ({ id: r.id, s: cosine(queryVectors[q], r.v) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 200)
      .map((r) => r.id);

    const score = new Map<number, number>();
    bm25.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i)));
    dense.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i)));

    return [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, s]) => {
        const r = byId.get(id)!;
        return { id, docId: r.doc_id, headingPath: r.heading_path, text: r.text, tokens: r.tokens, tier: r.tier ?? 99, docType: JSON.parse(r.card_json).doc_type, score: s };
      });
  });
}

function candidateRows(bdb: BrandDB, opts: SearchOptions): Row[] {
  const rows = bdb
    .prepare("SELECT c.id, c.doc_id, c.heading_path, c.text, c.tokens, c.embedding, d.tier, d.card_json FROM chunks c JOIN docs d ON d.id = c.doc_id")
    .all() as Row[];
  return rows.filter((r) => {
    const type = JSON.parse(r.card_json).doc_type as string;
    if (opts.docTypes && !opts.docTypes.includes(type)) return false;
    if (opts.excludeDocTypes?.includes(type)) return false;
    if (opts.maxTier !== undefined && (r.tier ?? 99) > opts.maxTier) return false;
    if (opts.docIds && !opts.docIds.includes(r.doc_id)) return false;
    return true;
  });
}

export interface FactHit {
  id: string;
  docId: string;
  tier: number;
  kind: string;
  subject: string;
  statement: string;
  quote: string;
  validUntil: string | null;
  score: number;
}

/** Facts most related to a query, minus facts that lost a conflict. */
export async function searchFacts(bdb: BrandDB, query: string, limit = 20, ctx: CallContext = {}): Promise<FactHit[]> {
  return (await searchFactsMany(bdb, [query], limit, ctx))[0];
}

/**
 * Facts for several queries at once (one embedding call). The claim check uses this with one
 * query per paragraph, so each claim in an asset is matched against its own evidence instead of
 * one blurred query for the whole text.
 */
export async function searchFactsMany(bdb: BrandDB, queries: string[], limit = 20, ctx: CallContext = {}): Promise<FactHit[][]> {
  if (!queries.length) return [];
  const losers = loserFactIds(bdb);
  const rows = (
    bdb
      .prepare("SELECT f.id, f.doc_id, f.kind, f.subject, f.statement, f.quote, f.valid_until, f.embedding, d.tier FROM facts f JOIN docs d ON d.id = f.doc_id WHERE f.embedding IS NOT NULL")
      .all() as { id: string; doc_id: string; kind: string; subject: string; statement: string; quote: string; valid_until: string | null; embedding: Buffer; tier: number | null }[]
  )
    .filter((r) => !losers.has(r.id))
    .map((r) => ({ ...r, vector: fromBlob(r.embedding) }));
  const vectors = await embed(queries, "retrieve:facts", ctx);
  return vectors.map((qv) =>
    rows
      .map((r) => ({
        id: r.id, docId: r.doc_id, tier: r.tier ?? 99, kind: r.kind, subject: r.subject, statement: r.statement, quote: r.quote, validUntil: r.valid_until,
        // Small authority bonus so a legal rule outranks an equally similar sales note.
        score: cosine(qv, r.vector) + 0.02 * Math.max(0, 5 - (r.tier ?? 99)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit),
  );
}

export function loserFactIds(bdb: BrandDB): Set<string> {
  const rows = bdb.prepare("SELECT resolution_json FROM conflicts").all() as { resolution_json: string }[];
  return new Set(rows.flatMap((r) => JSON.parse(r.resolution_json).loser_fact_ids as string[]));
}

/** Turns free text into a safe FTS5 OR-query of its meaningful words. */
function toFtsQuery(q: string): string {
  const words = q
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu)
    ?.filter((w) => !STOP.has(w))
    .slice(0, 16);
  return words?.length ? words.map((w) => `"${w.replace(/"/g, "")}"`).join(" OR ") : "";
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "was", "our", "your", "you", "how", "what", "about", "into", "should", "would", "can", "not"]);
