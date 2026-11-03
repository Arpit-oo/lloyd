import { z } from "zod";
import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import { brandBlock, campaignBlock } from "../context";
import type { CampaignData } from "../types";

/**
 * Guard rail before an edit: does the request go against the brand's voice or style rules, the
 * campaign's own constraints (e.g. "no humor for this audience"), or is it unusual for a brand
 * asset (memes, slang, animals, emoji spam, mocking competitors)? If so the agent asks first
 * instead of quietly watering the request down. Ordinary edits pass straight through.
 */
const CheckSchema = z.object({
  verdict: z.enum(["go", "confirm"]),
  conflicts: z.array(
    z.object({
      rule: z.string().describe("The brand rule or campaign constraint the request goes against, in plain words."),
      source_doc: z.string().nullable(),
      affects: z.array(z.string()).describe("Titles of the assets this applies to."),
    }),
  ),
  question: z.string().describe("If confirm: one or two plain sentences to the marketer naming what goes against what, and asking whether to do it anyway. Empty if go."),
});

const RULES = `You review a marketer's edit request BEFORE it is applied to campaign assets.
Answer "confirm" when the request:
- goes against the brand's voice, tone or style rules (e.g. slang, memes, jokes, emoji when the voice is plain and serious), or a campaign constraint (audience notes, "no humor", channel rules); or
- is unusual or risky for a professional brand asset (animals or mascots that aren't the brand's, internet slang, profanity, mocking competitors or customers, fake urgency), even if no rule names it.
Answer "go" for ordinary edits: shorten, clarify, reorder, change a headline, make it punchier within the voice, fix facts, change colours or layout.
Be specific: quote or paraphrase the rule and name which assets it affects. Requests to add forbidden claims are "confirm" too, and say those claims will still be blocked by the legal rules.`;

export async function checkEditRequest(
  brand: Brand,
  data: CampaignData,
  instruction: string,
  assets: { title: string; type: string }[],
  ctx: CallContext,
): Promise<z.infer<typeof CheckSchema>> {
  const res = await llm.json({
    step: "edit:request-check",
    tier: "fast",
    effort: "low",
    system: [brandBlock(brand, RULES), campaignBlock(data, [])],
    input: `Assets the request applies to:\n${assets.map((a) => `- ${a.title} (${a.type})`).join("\n")}\n\nEdit request: "${instruction}"`,
    schema: CheckSchema,
    schemaName: "request_check",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });
  return res.data;
}
