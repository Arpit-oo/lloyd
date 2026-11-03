import type { Brand } from "@/lib/brand";
import { searchBrand, searchFacts } from "@/lib/brand/retrieve";
import { llm, type CallContext } from "@/lib/llm/client";
import { brandBlock } from "../context";
import { BrandCheckSchema, type BrandCheckItem, type StructuredBrief } from "../types";

/**
 * Checks what the brief asks for against the brand's rules BEFORE planning, so the user sees
 * pushback up front ("the brief asks for X; the certification sheet says Y; we'll use Z instead")
 * instead of discovering a silently changed asset later.
 *
 * Evidence is retrieved per requested item from the highest-authority sources, and the model
 * must quote it. Items that are fine are returned too, so the card shows what was checked.
 */
const RULES = `You are the brand and legal check for a marketing team. You compare what a campaign brief asks for with the brand's rules.

For each requested item:
- verdict "ok" if the rules allow it as asked;
- "needs_change" if it is allowed only with different wording, a qualifier, or a narrower scope;
- "conflict" if the rules forbid it.
Quote the rule verbatim from the evidence (source_quote) and name its document. Higher-authority sources win (tier 1 is highest).
Give a concrete alternative the campaign can use instead, using the brand's approved wording exactly where it exists.
A brief's explicit, scoped override (e.g. a product status change effective for this campaign) is legitimate for that subject only; check everything else normally.
For a "strategy" item, judge whether leading with it still works once the claims are corrected. Verdict "ok" if the lead stands (execution advice is not a change). Verdict "needs_change" only if the corrected version would lead with a weakness, a status not yet achieved, or an audience the brand treats as out of scope; then propose a stronger lead the evidence supports.

Supported vs. forbidden, and process vs. rule:
- A product capability or limit that the brand's own product documents, release notes or this brief state is SUPPORTED. Describing it accurately, in the brand's words, needs no further approval.
- A review step in the brand's process (e.g. "claims go to Legal before publishing", "developer relations checks how-tos") is a workflow note for the humans, not a reason to block or rewrite copy. Mention it at most as a warning.
- Block only what breaks a rule: banned or wrongly worded claims, facts that contradict a higher-authority source, statements with no support in any brand document or the brief, uncleared customers, expired or unsourced statistics, broken brief constraints, internal numbers in copy.
So: a key message that restates the product documents is "ok"; a claim that needs a reviewer's sign-off under the brand's process is "ok" with that noted in the rule; "needs_change" means the WORDING must change.
Do not invent rules. If the evidence does not cover an item, verdict "ok" with rule "No rule found in brand documents".`;

export async function checkBrief(brand: Brand, brief: StructuredBrief, ctx: CallContext): Promise<BrandCheckItem[]> {
  const items = [
    ...(brief.lead_angle ? [`strategy: lead the campaign with "${brief.lead_angle}" for ${brief.audiences.map((a) => a.name).join(" and ")}`] : []),
    ...brief.requested_claims.map((c) => `${c.kind}: ${c.text} (brief says: "${c.brief_quote}")`),
    ...brief.requested_assets.filter((a) => a.type === "other").map((a) => `asset outside allowed types: ${a.description}`),
  ];
  if (!items.length) return [];

  const evidence = await Promise.all(
    items.map(async (item) => {
      const strategic = item.startsWith("strategy:");
      const [facts, chunks] = await Promise.all([
        searchFacts(brand.db, item, 8, ctx),
        // A strategy is judged against who the brand sells to and how it positions itself,
        // not only against legal rules.
        strategic
          ? searchBrand(brand.db, item, { docTypes: ["persona", "messaging", "brand_guidelines", "legal_claims"], limit: 5 }, ctx)
          : searchBrand(brand.db, item, { maxTier: 2, limit: 3 }, ctx),
      ]);
      return `## Requested: ${item}\nFacts:\n${facts.map((f) => `- [${f.docId}, tier ${f.tier}] ${f.statement} | quote: "${f.quote}"`).join("\n")}\nPassages:\n${chunks.map((c) => `[${c.docId} | ${c.headingPath} | tier ${c.tier}]\n${c.text.slice(0, 1800)}`).join("\n\n")}`;
    }),
  );

  const overrides = brief.overrides.map((o) => `- ${o.subject}: ${o.statement} ("${o.quote}")`).join("\n");
  const res = await llm.json({
    step: "brand-check",
    tier: "reasoner",
    effort: "medium",
    system: [brandBlock(brand, RULES)],
    input: [{ label: "brief overrides", text: `Brief overrides:\n${overrides || "none"}` }, { label: "evidence", text: evidence.join("\n\n") }],
    schema: BrandCheckSchema,
    schemaName: "brand_check",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });
  return res.data.items;
}
