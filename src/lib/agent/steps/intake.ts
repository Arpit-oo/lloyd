import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import { StructuredBriefSchema, type StructuredBrief } from "../types";

/** Reads the brief into a structured form. Pure reading: no judgments about the brand yet. */
const RULES = `You read marketing campaign briefs and turn them into structured data.
Be faithful: copy constraints, dates, names and claims close to verbatim. Do not add ideas of your own.
Allowed asset types are social posts (LinkedIn, X), blog posts, landing pages and emails; anything else is type "other". "X post", "x post", "tweet" or "thread" is a post on X (Twitter); "1 x post" means one X post, not "times".
Mark as an override only where the brief explicitly says it takes precedence over brand documents, and quote it.
"requested_claims" = every specific claim, certification, customer, quote, statistic or result the brief wants used.`;

export async function readBrief(brand: Brand, briefText: string, today: string, ctx: CallContext): Promise<StructuredBrief> {
  const res = await llm.json({
    step: "intake",
    tier: "fast",
    effort: "low",
    system: [{ text: RULES, label: "intake rules" }],
    input: `Today is ${today}. Brand: ${brand.tokens?.brand_name ?? "unknown"}.\n\nBrief:\n"""\n${briefText}\n"""`,
    schema: StructuredBriefSchema,
    schemaName: "structured_brief",
    ctx,
  });
  return res.data;
}
