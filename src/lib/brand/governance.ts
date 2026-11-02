import { z } from "zod";
import { llm, type CallContext } from "@/lib/llm/client";
import type { DocCard } from "./cards";
import type { BrandDB } from "./store";

/**
 * Works out which documents win when they disagree.
 *
 * Layer 1, explicit: the folder often says it itself ("order of authority", "replaces X in full",
 *   "this document wins"). We find those passages and let the model turn them into a ranking.
 * Layer 2, inferred: with no explicit rule, the model ranks by document type (legal > guidelines >
 *   playbooks > reference > notes > past content). Dates and words like FINAL are tie-breakers only:
 *   stale "start here" docs and "FINAL" files are a common way real folders mislead.
 * Layer 3, the user: the Brand Truths panel shows the result and lets the user reorder or pin.
 *   That decision is stored and beats both automatic layers.
 */
export const GovernanceSchema = z.object({
  source: z.enum(["explicit", "partly_explicit", "inferred"]),
  confidence: z.enum(["high", "medium", "low"]),
  tiers: z.array(
    z.object({
      rank: z.number().int().describe("1 = highest authority"),
      name: z.string(),
      description: z.string().describe("Which documents belong here."),
      evidence: z.string().nullable().describe("Verbatim quote that establishes this tier, or null if inferred."),
    }),
  ),
  doc_tiers: z.array(z.object({ doc_id: z.string(), rank: z.number().int(), reason: z.string() })),
  supersessions: z.array(
    z.object({ newer_doc: z.string(), older_doc: z.string(), evidence: z.string(), stated_in: z.string() }),
  ),
  principles: z.array(z.string()).describe(
    "Other governance rules worth following, as short imperatives, e.g. 'A lower source still applies where no higher source speaks'. Quote-backed only.",
  ),
  owners: z.array(z.object({ area: z.string(), owner: z.string() })),
});
export type Governance = z.infer<typeof GovernanceSchema>;

const GOVERNANCE_PATTERNS =
  /(order of authority|takes? precedence|supersed|replaces?\b.*\b(in full|guidelines|version)|\bwins\b|out of date|source of truth|which one wins|if (this|two) (document|source)s? (disagree|conflict)|single source|do not use|no longer (valid|current|used))/i;

const INSTRUCTIONS = `You determine document authority for a brand folder: when two documents disagree, which wins.

Method:
1. Look for explicit governance in the passages: an order of authority, "X replaces Y", "this document wins", statements that a file is out of date. Explicit statements from authoritative documents beat everything else. A document's claim about ITSELF ("FINAL", "current", "start here") is weak unless a higher document confirms it.
2. Where nothing explicit exists, infer tiers from document type, in this default order:
   legal / compliance / approved claims  >  current brand guidelines and their addenda  >  channel playbooks
   >  voice, style, messaging, product, persona, template references  >  sales material, internal notes, onboarding docs
   >  past published content and anything superseded.
3. File dates and words like FINAL / CURRENT / v3 only break ties. Never let them override a document type or an explicit statement.
4. A superseded document goes to the lowest tier, even if its type would rank higher.
Assign every listed document a rank. Quote evidence verbatim; never invent quotes.`;

export async function deriveGovernance(
  bdb: BrandDB,
  docs: { id: string; title: string; card: DocCard }[],
  ctx: CallContext,
): Promise<Governance> {
  const passages = (bdb.prepare("SELECT doc_id, heading_path, text FROM chunks").all() as { doc_id: string; heading_path: string; text: string }[])
    .filter((c) => GOVERNANCE_PATTERNS.test(c.text))
    .slice(0, 40)
    .map((c) => `[${c.doc_id} | ${c.heading_path}]\n${c.text.slice(0, 2500)}`)
    .join("\n\n---\n\n");

  const docList = docs
    .map((d) => `- ${d.id} | type=${d.card.doc_type} | status=${d.card.status} | date=${d.card.stated_date ?? "?"} | "${d.title}"${d.card.authority_claims.length ? ` | claims: ${d.card.authority_claims.join(" / ")}` : ""}`)
    .join("\n");

  const res = await llm.json({
    step: "ingest:governance",
    tier: "reasoner",
    effort: "medium",
    system: [{ text: INSTRUCTIONS, label: "governance instructions" }],
    input: [
      { text: `Documents (${docs.length}):\n${docList}`, label: "doc list" },
      { text: `Passages that mention authority, replacement or conflicts:\n\n${passages || "(none found)"}`, label: "governance passages" },
    ],
    schema: GovernanceSchema,
    schemaName: "governance",
    ctx,
  });

  // Every doc must have a rank. Anything the model skipped goes one below the lowest tier, visibly.
  const gov = res.data;
  const lowest = Math.max(...gov.tiers.map((t) => t.rank), 1);
  const ranked = new Set(gov.doc_tiers.map((d) => d.doc_id));
  for (const d of docs) {
    if (!ranked.has(d.id)) gov.doc_tiers.push({ doc_id: d.id, rank: lowest + 1, reason: "Not ranked by the governance step; treated as lowest authority." });
  }
  return gov;
}
