import { z } from "zod";
import { llm, type Block, type CallContext } from "@/lib/llm/client";
import { cosine } from "@/lib/llm/embed";
import type { Governance } from "./governance";

/**
 * Finds facts from different documents that talk about the same thing, and settles the ones
 * that disagree.
 *
 * Grouping is seed-based, not pairwise: facts are visited from highest authority down, and each
 * joins the first group whose seed it closely matches. Groups are anchored on authoritative facts,
 * cost is facts x groups instead of facts^2, and one vague fact cannot chain unrelated groups together.
 *
 * Only groups that span 2+ documents are sent to the model, in batches, with the governance
 * rules in a cached prefix so every batch after the first reads them from cache.
 */
export interface FactForConflict {
  id: string;
  docId: string;
  tier: number;
  docDate: string | null;
  docStatus: string;
  kind: string;
  subject: string;
  statement: string;
  quote: string;
  embedding: Float32Array;
}

export const ResolutionSchema = z.object({
  group: z.number().int(),
  is_conflict: z.boolean().describe("True only if the facts cannot all be followed at once."),
  topic: z.string(),
  winner_fact_ids: z.array(z.string()),
  loser_fact_ids: z.array(z.string()),
  rule_applied: z.string().describe("Which governance rule decided it, e.g. 'legal outranks sales material', 'explicit supersession', 'newer revision of the same document'."),
  explanation: z.string().describe("One or two sentences a marketer can read."),
  confidence: z.enum(["high", "medium", "low"]),
  needs_user: z.boolean().describe("True if governance does not settle it and a human must decide."),
  owner_note: z.string().nullable().describe("Short note to the owner of the losing document asking for it to be updated, or null."),
});
export type Resolution = z.infer<typeof ResolutionSchema>;

const BatchSchema = z.object({ resolutions: z.array(ResolutionSchema) });

const SIMILARITY = 0.8;
const MAX_GROUP = 10;
const BATCH = 12;

export function groupFacts(facts: FactForConflict[]): FactForConflict[][] {
  const ordered = [...facts].sort((a, b) => a.tier - b.tier);
  const groups: { seed: FactForConflict; members: FactForConflict[] }[] = [];
  for (const f of ordered) {
    let best: (typeof groups)[number] | null = null;
    let bestScore = SIMILARITY;
    for (const g of groups) {
      const s = cosine(f.embedding, g.seed.embedding);
      if (s >= bestScore) {
        best = g;
        bestScore = s;
      }
    }
    if (best) best.members.push(f);
    else groups.push({ seed: f, members: [f] });
  }
  return groups
    .map((g) => g.members.slice(0, MAX_GROUP))
    .filter((m) => new Set(m.map((f) => f.docId)).size >= 2);
}

/**
 * Directed audit: every risky claim in a lower-authority document is paired with its nearest
 * higher-authority facts, however differently worded. This catches the dangerous case that
 * similarity grouping misses: a sales note saying "we're certified" next to a legal sheet that
 * says "in process, never claim it". Only claim-like kinds are audited.
 */
const RISKY_KINDS = new Set(["certification", "customer_reference", "statistic", "company_fact", "product_fact", "naming_rule", "approved_wording", "status_or_date"]);
const AUDIT_SIMILARITY = 0.55;
const AUDIT_NEIGHBORS = 3;

export function auditGroups(facts: FactForConflict[], authoritativeMaxTier = 2): FactForConflict[][] {
  const authoritative = facts.filter((f) => f.tier <= authoritativeMaxTier);
  return facts
    .filter((f) => f.tier > authoritativeMaxTier && RISKY_KINDS.has(f.kind))
    .map((f) => {
      const near = authoritative
        .map((a) => ({ a, s: cosine(f.embedding, a.embedding) }))
        .filter((x) => x.s >= AUDIT_SIMILARITY && x.a.docId !== f.docId)
        .sort((x, y) => y.s - x.s)
        .slice(0, AUDIT_NEIGHBORS)
        .map((x) => x.a);
      return near.length ? [f, ...near] : [];
    })
    .filter((g) => g.length > 1);
}

/** Merges two group lists, dropping groups whose fact set is already covered. */
export function mergeGroups(a: FactForConflict[][], b: FactForConflict[][]): FactForConflict[][] {
  const seen = new Set<string>();
  return [...a, ...b].filter((g) => {
    const key = g.map((f) => f.id).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const INSTRUCTIONS = `You resolve contradictions inside a brand's document folder.

You get groups of facts from different documents that may be about the same thing. For each group:
- Decide if they truly conflict (cannot all be followed at once). Restating, adding detail, or narrowing scope is NOT a conflict. Different scopes (different channel, audience, product, or date range) are usually not a conflict either.
- If they conflict, pick the winner using the governance below, in this order: explicit supersession, authority tier (lower rank number wins), validity dates, then recency as a last tie-break.
- A document's own label (FINAL, CURRENT, "start here") never decides anything.
- If governance does not settle it, set needs_user = true and confidence = low.
- Use the exact fact ids given. Every fact id in a conflicting group goes in winners or losers.
Return resolutions ONLY for groups that truly conflict. Most groups agree; skip them. An empty list is a normal answer.`;

export async function resolveConflicts(
  groups: FactForConflict[][],
  governance: Governance,
  ctx: CallContext,
  onProgress?: (done: number, total: number) => void,
): Promise<{ resolution: Resolution; facts: FactForConflict[] }[]> {
  const govText = renderGovernance(governance);
  const system: Block[] = [
    { text: INSTRUCTIONS, label: "conflict instructions" },
    { text: govText, label: "governance", cache: true },
  ];
  const batches: FactForConflict[][][] = [];
  for (let i = 0; i < groups.length; i += BATCH) batches.push(groups.slice(i, i + BATCH));

  // Warm the shared prefix once, then fan out.
  await llm.prewarm({ step: "ingest:conflicts", tier: "fast", system, cacheKey: "ingest-conflicts", ctx });

  let done = 0;
  const results = await Promise.all(
    batches.map(async (batch, bi) => {
      const body = batch
        .map((g, gi) => {
          const n = bi * BATCH + gi;
          const lines = g.map((f) => `  - id=${f.id} | doc=${f.docId} (tier ${f.tier}, ${f.docStatus}, ${f.docDate ?? "undated"}) | ${f.kind} | ${f.subject}: ${f.statement}\n    quote: "${f.quote}"`);
          return `Group ${n}:\n${lines.join("\n")}`;
        })
        .join("\n\n");
      const res = await llm.json({
        step: "ingest:conflicts",
        tier: "fast",
        effort: "medium",
        system,
        input: body,
        schema: BatchSchema,
        schemaName: "conflict_batch",
        cacheKey: "ingest-conflicts",
        ctx,
      });
      onProgress?.(++done, batches.length);
      return res.data.resolutions.map((r) => ({ resolution: r, facts: groups[r.group] ?? [] }));
    }),
  );
  return results.flat().filter((r) => r.resolution.is_conflict && r.facts.length);
}

/**
 * The audit pairs many low-tier claims with the same authoritative rule, so one real conflict
 * ("no dates in Leashgate claims") can come back ten times. Resolutions that share the same
 * most authoritative winning facts are merged into one, keeping every loser and the most confident explanation.
 */
export interface StoredConflict {
  resolution: Resolution;
  factIds: string[];
}

export function compactResolutions(items: StoredConflict[], tierOf: (factId: string) => number = () => 0): StoredConflict[] {
  const RANK = { high: 0, medium: 1, low: 2 } as const;
  const byWinners = new Map<string, StoredConflict>();
  for (const item of items) {
    // Key on the most authoritative winners only: the model sometimes also lists agreeing
    // lower-tier facts as winners, which would otherwise keep duplicates apart.
    const winners = item.resolution.winner_fact_ids;
    const top = Math.min(...winners.map(tierOf));
    const key = winners.filter((w) => tierOf(w) === top).sort().join("|") || `topic:${item.resolution.topic.toLowerCase()}`;
    const prev = byWinners.get(key);
    if (!prev) {
      byWinners.set(key, item);
      continue;
    }
    const best = RANK[item.resolution.confidence] < RANK[prev.resolution.confidence] ? item : prev;
    byWinners.set(key, {
      factIds: [...new Set([...prev.factIds, ...item.factIds])],
      resolution: {
        ...best.resolution,
        loser_fact_ids: [...new Set([...prev.resolution.loser_fact_ids, ...item.resolution.loser_fact_ids])],
        needs_user: prev.resolution.needs_user || item.resolution.needs_user,
      },
    });
  }
  return [...byWinners.values()];
}

export function renderGovernance(g: Governance): string {
  const tiers = g.tiers
    .sort((a, b) => a.rank - b.rank)
    .map((t) => `${t.rank}. ${t.name}: ${t.description}${t.evidence ? ` (source: "${t.evidence}")` : " (inferred)"}`)
    .join("\n");
  const sup = g.supersessions.map((s) => `- ${s.newer_doc} replaces ${s.older_doc} ("${s.evidence}", stated in ${s.stated_in})`).join("\n");
  const docs = g.doc_tiers.sort((a, b) => a.rank - b.rank || a.doc_id.localeCompare(b.doc_id)).map((d) => `- tier ${d.rank}: ${d.doc_id}`).join("\n");
  return `Governance (${g.source}, confidence ${g.confidence})

Order of authority:
${tiers}

Supersessions:
${sup || "- none stated"}

Principles:
${g.principles.map((p) => `- ${p}`).join("\n") || "- none stated"}

Document tiers:
${docs}`;
}
