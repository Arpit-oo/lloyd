import { z } from "zod";
import type { Brand } from "@/lib/brand";
import { findFormerNames } from "@/lib/brand/entities";
import { isImageAllowed, type ImageRules } from "@/lib/brand/images";
import { searchBrandMany, searchFactsMany, type ChunkHit, type FactHit } from "@/lib/brand/retrieve";
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
- Missing details the brand documents do not supply (a link target, an address, a sender, a time zone) and missing optional elements (no image or screenshot) are warnings for the human to fill in, never blocks.
- Craft and completeness (a recommended point left out, section order, a weaker opening than the plan intended) are warnings. Block means the asset must not be published as is.
- Block what the asset SAYS, never what it leaves out. No single asset has to carry every key message, limit or approved statement of the campaign; an omission is at most a warning, unless the brief names this exact asset as the one that must include it.
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
    for (const n of leakedTargetNumbers(text, target)) issues.push({ check: "rule", quote: n, problem: "An internal target appears in copy", rule: `Internal target: "${target}"`, source_doc: "brief", severity: "block", fix: "Remove the internal number." });
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

  // Evidence per paragraph, plus the product and claims passages themselves: a capability the
  // product doc states is not "unsupported" just because no extracted fact matched the whole asset.
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 30).slice(0, 24);
  const queries = paragraphs.length ? paragraphs : [text.slice(0, 6000)];
  const [perParagraph, passagesPerParagraph] = await Promise.all([
    searchFactsMany(brand.db, queries, 8, ctx),
    searchBrandMany(brand.db, queries, { docTypes: ["product", "messaging", "legal_claims"], limit: 2 }, ctx),
  ]);
  const facts = [...new Map(perParagraph.flat().map((f): [string, FactHit] => [f.id, f])).values()].slice(0, 60);
  const passages = [...new Map(passagesPerParagraph.flat().map((h): [number, ChunkHit] => [h.id, h])).values()].slice(0, 12);
  const res = await llm.json({
    step: `guard:${content.type}`,
    tier: "fast",
    effort: "medium",
    system: [brandBlock(brand, RULES), campaignBlock(data, [])],
    input: [
      { label: "related facts", text: `Brand facts related to this asset:\n${facts.map((f) => `- [${f.docId}, tier ${f.tier}] ${f.statement} ("${f.quote}")`).join("\n")}` },
      { label: "related passages", text: `Product, messaging and claims passages related to this asset:\n\n${passages.map((h) => `[${h.docId} | ${h.headingPath} | tier ${h.tier}]\n${h.text}`).join("\n\n---\n\n")}` },
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

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RE = new RegExp(
  [
    String.raw`\b${MONTH}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?`,
    String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+${MONTH}\.?(?:,?\s+\d{4})?`,
    String.raw`\b\d{4}-\d{2}-\d{2}\b`,
    String.raw`\b(?:Q[1-4]\s+)?(?:19|20)\d{2}\b`,
  ].join("|"),
  "gi",
);

/**
 * The numbers in an internal target that must not appear in copy ("60 demo requests by
 * March 31, 2027" -> ["60"]). Dates and years are the campaign's calendar, not the target.
 */
export function targetNumbers(target: string): string[] {
  return (target.replace(DATE_RE, " ").match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]+$/, "")).filter((n) => n.length >= 2);
}

const STOP = new Set(["at", "least", "more", "than", "of", "the", "a", "an", "new", "from", "by", "in", "to", "and", "or", "per"]);
const stem = (w: string) => w.toLowerCase().slice(0, 5);
const wordsAfter = (s: string, from: number) => (s.slice(from).match(/^\s*%|[a-z]+/gi) ?? []).slice(0, 4).map((w) => w.trim().toLowerCase()).filter((w) => !STOP.has(w));

/**
 * The target numbers that appear in copy counting the same thing: "30 customers" leaks the
 * target "30 customers moving to contain mode", but "30 minutes by default" doesn't, and
 * neither do "1,300" or "2030".
 */
export function leakedTargetNumbers(text: string, target: string): string[] {
  const plainTarget = target.replace(DATE_RE, " ");
  return targetNumbers(target).filter((n) => {
    const whole = `(?:^|[^\\d.,])${n.replace(/[.,]/g, "\\$&")}(?!\\d|[.,]\\d)`;
    const at = new RegExp(whole, "g");
    const unitMatch = new RegExp(whole).exec(plainTarget);
    const units = unitMatch ? wordsAfter(plainTarget, unitMatch.index + unitMatch[0].length).map(stem) : [];
    if (!units.length) return at.test(text);
    for (const m of text.matchAll(at)) {
      const after = wordsAfter(text, (m.index ?? 0) + m[0].length).map(stem);
      if (after.some((w) => units.includes(w))) return true;
    }
    return false;
  });
}
