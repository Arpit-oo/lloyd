import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import { brandBlock, campaignBlock } from "../context";
import { QuestionsSchema, type CampaignData, type Questions } from "../types";
import type { MemoryForPrompt } from "@/lib/memory/store";

/**
 * Decides whether to ask anything before planning.
 * The bar: a question is asked only if its answer would change the asset list, the audience,
 * the angle or a claim, AND it cannot be answered from the brief, the brand documents or memory.
 * At most three, each with a default so the user can just say "go with defaults".
 */
const RULES = `You decide what to ask a marketer before planning a campaign. Asking costs their time; guessing wrong costs a re-plan.

Ask a question ONLY if both hold:
1. The answer would change which assets get made, who they target, their main angle, or a claim.
2. It cannot be answered from the brief, the brand kernel, the brand check decisions, or what the marketer told us before.

Never ask about things the brand documents already settle (voice, approved wording, proof rules). Never ask to confirm a brand-check decision; it is already decided and will be shown to them.
Never ask for missing details the writer can leave out or the marketer fills in later (a link URL, a sender address, an image, a time zone) or for documents to be supplied: write from what the brand folder says and list it as an assumption.
If the brief asks for no questions, ask only when guessing would produce the wrong assets.
A detailed brief usually needs zero questions. A vague brief usually needs two or three.
Exception that always needs a question: when the brand check removed or changed the brief's centerpiece or lead (verdict conflict / needs_change on a strategy, headline claim or hero story), the marketer must choose the new lead. Ask it, with the strongest evidence-backed alternative as the default.
Maximum three questions. Each needs 2-4 short options and a sensible default.
Set multi_select when the options can be combined (channels, asset types, audiences); then the options must not overlap, and the default is the single most useful pick.
List the assumptions you made instead of asking, so the marketer can correct them.`;

export async function decideQuestions(brand: Brand, data: CampaignData, memories: MemoryForPrompt[], ctx: CallContext): Promise<Questions> {
  const res = await llm.json({
    step: "questions",
    tier: "reasoner",
    effort: "medium",
    system: [brandBlock(brand, RULES)],
    input: [campaignBlock(data, memories), { label: "brief text", text: `Original brief:\n"""\n${data.briefText}\n"""\n\nUnclear points noted at intake:\n${data.brief?.unclear.map((u) => `- ${u}`).join("\n") || "none"}` }],
    schema: QuestionsSchema,
    schemaName: "questions",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });
  // A question without a usable default would block "use defaults"; fall back to the first option.
  const questions = res.data.questions.slice(0, 3).map((q) => ({ ...q, default: q.default.trim() || q.options[0] || "Your call" }));
  return { ...res.data, questions };
}
