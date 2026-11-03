import { z } from "zod";
import type { Brand } from "@/lib/brand";
import { findFormerNames } from "@/lib/brand/entities";
import { isImageAllowed, type ImageRules } from "@/lib/brand/images";
import { searchFacts } from "@/lib/brand/retrieve";
import { llm, type CallContext } from "@/lib/llm/client";
import { assetToText, type AssetContent } from "../asset-types";
import { brandBlock, campaignBlock } from "../context";
import type { CampaignData, PlanItem } from "../types";

/**
 * Claim guard: checks a finished asset against brand facts, legal rules and the brief.
 * Two layers:
 *  - deterministic: channel length limits, internal targets leaking into copy, image usage rules
 *  - model: claims, names, proof, tone. It must quote the offending text and the rule, and it
 *    judges assertions, not substrings ("we are not X" is not a claim of X).
 */
export const GuardIssueSchema = z.object({
  quote: z.string().describe("The exact text in the asset that has the problem."),
  problem: z.string(),
  rule: z.string().describe("The rule it breaks, quoted or closely paraphrased."),
  source_doc: z.string().nullable(),
  severity: z.enum(["block", "warn"]).describe("block = must not publish (false claim, banned wording, unapproved customer, leaked internal number). warn = style or weaker issue."),
  fix: z.string().describe("Concrete replacement text or action."),
});
export type GuardIssue = z.infer<typeof GuardIssueSchema> & { check: "rule" | "model" };

export interface GuardReport {
  status: "pass" | "warn" | "block";
  issues: GuardIssue[];
  checkedAt: string;
}

const RULES = `You are the final brand and legal check before an asset is published.
Read the asset and find real problems only:
- claims the brand forbids or words differently (certifications, customers, statistics, product capabilities, roadmap, pricing, SLAs)
- product or company names written wrong, or first-mention rules broken
- proof used outside where it is approved; uncleared customers referenced, even indirectly
- third-party statistics without publisher, date and link, or older than the brand allows at the asset's publish date
- brief constraints broken (including image rules); internal targets in copy
- clear voice violations (banned words, wrong tone for the audience)
Judge what the text asserts, not word matches: "we are not X" does not claim X. Approved wording used exactly is fine.

Supported vs. forbidden, and process vs. rule:
- A product capability or limit that the brand's own product documents, release notes or this brief state is SUPPORTED. Describing it accurately, in the brand's words, needs no further approval.
- A review step in the brand's process (e.g. "claims go to Legal before publishing", "developer relations checks how-tos") is a workflow note for the humans, not a reason to block or rewrite copy. Mention it at most as a warning.
- Missing details the brand documents do not supply (a link target, an address, a sender) are warnings for the human to fill in, never blocks.
- Craft and completeness (a recommended point left out, section order, a weaker opening than the plan intended) are warnings. Block means the asset must not be published as is.
- Block only what breaks a rule: banned or wrongly worded claims, facts that contradict a higher-authority source, statements with no support in any brand document or the brief, uncleared customers, expired or unsourced statistics, broken brief constraints, internal numbers in copy.

Quote the exact offending text. If the asset is clean, return no issues.`;

const LIMITS: Partial<Record<AssetContent["type"], (a: AssetContent) => GuardIssue[]>> = {
  x_post: (a) =>
    a.type === "x_post"
      ? a.data.posts.filter((p) => p.text.length > 280).map((p) => ({ check: "rule" as const, quote: p.text.slice(0, 80) + "...", problem: `Post is ${p.text.length} characters`, rule: "X posts are limited to 280 characters", source_doc: null, severity: "block" as const, fix: "Shorten below 280 characters." }))
      : [],
  linkedin_post: (a) =>
    a.type === "linkedin_post" && a.data.text.length > 3000
      ? [{ check: "rule" as const, quote: a.data.text.slice(0, 80) + "...", problem: `Post is ${a.data.text.length} characters`, rule: "LinkedIn posts are limited to 3,000 characters", source_doc: null, severity: "block" as const, fix: "Shorten." }]
      : [],
};

export async function guardAsset(brand: Brand, data: CampaignData, item: PlanItem, content: AssetContent, ctx: CallContext): Promise<GuardReport> {
  const text = assetToText(content);
  const issues: GuardIssue[] = [...(LIMITS[content.type]?.(content) ?? [])];

  for (const target of data.brief?.internal_targets ?? []) {
    const numbers = target.match(/\d[\d,.]*/g) ?? [];
    for (const n of numbers) if (n.length >= 2 && text.includes(n)) issues.push({ check: "rule", quote: n, problem: "An internal target appears in copy", rule: `Internal target: "${target}"`, source_doc: "brief", severity: "block", fix: "Remove the internal number." });
  }

  for (const hit of findFormerNames(text, brand.entities)) {
    issues.push({ check: "rule", quote: hit.found, problem: `Former name "${hit.found}" used`, rule: `Current name is ${hit.entity.current_name}${hit.entity.former_name_rule ? ` (${hit.entity.former_name_rule})` : ""}`, source_doc: hit.entity.source_doc, severity: "block", fix: `Use "${hit.entity.current_name}".` });
  }

  const imageId = imageIdOf(content);
  if (imageId) {
    const row = brand.db.prepare("SELECT rules_json FROM images WHERE id = ?").get(imageId) as { rules_json: string | null } | undefined;
    const verdict = row ? isImageAllowed(row.rules_json ? (JSON.parse(row.rules_json) as ImageRules) : null) : { ok: false, reason: "Image not in library" };
    if (!verdict.ok) issues.push({ check: "rule", quote: imageId, problem: `Image not allowed: ${verdict.reason}`, rule: "Image usage restrictions", source_doc: "image metadata", severity: "block", fix: "Pick another image." });
  }

  const facts = await searchFacts(brand.db, text.slice(0, 6000), 30, ctx);
  const res = await llm.json({
    step: `guard:${content.type}`,
    tier: "fast",
    effort: "medium",
    system: [brandBlock(brand, RULES), campaignBlock(data, [])],
    input: [
      { label: "related facts", text: `Brand facts related to this asset:\n${facts.map((f) => `- [${f.docId}, tier ${f.tier}] ${f.statement} ("${f.quote}")`).join("\n")}` },
      { label: "asset", text: `Asset (${content.type}, publish date ${item.publish_date ?? "unknown"}, image: ${imageId ?? "none"}):\n${JSON.stringify(content.data, null, 2)}` },
    ],
    schema: z.object({ issues: z.array(GuardIssueSchema) }),
    schemaName: "guard",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });
  issues.push(...res.data.issues.map((i) => ({ ...i, check: "model" as const })));

  const status = issues.some((i) => i.severity === "block") ? "block" : issues.length ? "warn" : "pass";
  return { status, issues, checkedAt: new Date().toISOString() };
}

export function imageIdOf(a: AssetContent): string | null {
  switch (a.type) {
    case "linkedin_post":
    case "x_post":
      return a.data.image.image_id;
    case "email":
      return a.data.header_image.image_id;
    case "blog_post":
      return a.data.hero_image.image_id;
    case "landing_page":
      return a.data.hero.image.image_id;
  }
}
