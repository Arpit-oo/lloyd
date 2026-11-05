import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import type { MemoryForPrompt } from "@/lib/memory/store";
import { brandBlock, campaignBlock } from "../context";
import { PlanSchema, type CampaignData, type Plan } from "../types";

/**
 * Proposes the asset plan, and revises it from the marketer's chat feedback.
 * Only social posts, blog posts, landing pages and emails are allowed.
 */
const RULES = `You are a senior B2B campaign strategist planning assets for this brand.

Allowed asset types: linkedin_post, x_post, email, blog_post, landing_page. Nothing else.
- If the brief lists assets, start from that list. If the mix looks wrong for the goal, change it and say why in mix_rationale.
- If the mix is open, propose the smallest set that does the job, and explain each choice.
- Keep audiences separate when the brief or brand says so. Respect every brief constraint and brand-check decision.
- "proof" may only contain proof the brand allows for this product and channel. If none exists, leave it empty: a thin asset beats borrowed proof.
- Set research_question only when a fresh, sourced third-party fact would genuinely strengthen the asset.
- image_brief: describe the picture you want in words (subject, mood). Respect brief rules about images.
- Dates: use the brief's dates; otherwise propose a sensible sequence.
- notes are for the writer, who gets the product documents. Don't tell it to avoid product details or "verify against the docs": it writes from what the documents say. Restrict only what a brand rule or the brief restricts.`;

export async function proposePlan(brand: Brand, data: CampaignData, memories: MemoryForPrompt[], ctx: CallContext): Promise<Plan> {
  const res = await llm.json({
    step: "plan",
    tier: "reasoner",
    effort: "medium",
    system: [brandBlock(brand, RULES)],
    input: [campaignBlock({ ...data, plan: undefined }, memories), { label: "brief text", text: `Original brief:\n"""\n${data.briefText}\n"""` }],
    schema: PlanSchema,
    schemaName: "plan",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });
  return res.data;
}

export async function revisePlan(brand: Brand, data: CampaignData, memories: MemoryForPrompt[], request: string, ctx: CallContext): Promise<Plan> {
  const res = await llm.json({
    step: "plan:revise",
    tier: "reasoner",
    effort: "low",
    system: [brandBlock(brand, RULES)],
    input: [
      campaignBlock({ ...data, plan: undefined }, memories),
      { label: "current plan", text: `Current plan:\n${JSON.stringify(data.plan, null, 2)}` },
      { label: "request", text: `The marketer asks for this change:\n"${request}"\n\nReturn the full revised plan. Change only what they asked for (plus anything it logically forces). Keep ids of unchanged items. Mention the change in mix_rationale.` },
    ],
    schema: PlanSchema,
    schemaName: "plan",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });
  return res.data;
}
