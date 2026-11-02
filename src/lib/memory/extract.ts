import { z } from "zod";
import { cosine, embed } from "@/lib/llm/embed";
import { llm, type CallContext } from "@/lib/llm/client";
import type { CampaignData } from "@/lib/agent/types";
import { addMemory, listMemories } from "./store";

/**
 * At the end of a campaign, proposes what is worth remembering for the next one.
 *
 * Keep: how this marketer likes to work and write (corrections they made, edits they repeated,
 *   preferences they stated), and decisions they took on brand questions the documents left open.
 * Forget: anything specific to this campaign (dates, products launched, assets, numbers), anything
 *   the brand documents already say, and every brief-scoped override.
 *
 * Proposals are saved as "proposed" and shown to the user; nothing becomes active silently.
 * Brief overrides are filtered out in code as well as in the prompt, because a launch exception
 * leaking into memory would quietly corrupt every later campaign.
 */
const ProposalSchema = z.object({
  memories: z.array(
    z.object({
      type: z.enum(["preference", "decision", "correction", "fact"]),
      text: z.string().describe("One sentence, phrased as guidance for a future campaign."),
      evidence: z.string().describe("What the marketer said or did that supports it (quote)."),
      applies_to_all_brands: z.boolean().describe("True for personal working preferences, false for brand-specific ones."),
    }),
  ),
});

const RULES = `You decide what a campaign assistant should remember for future campaigns with this marketer.

Remember (only with evidence from the conversation):
- corrections and edits the marketer made that reflect a lasting preference (tone, length, structure, words to avoid)
- preferences they stated about how to work (e.g. fewer questions, always propose an X post)
- decisions they took on brand questions the documents did not settle

Do NOT remember:
- anything specific to this campaign: product launches, dates, asset lists, targets, numbers, audiences of this brief
- rules or statuses that come from this campaign's brief, including any overrides of brand documents
- anything the brand documents already state
- one-off requests ("make this one shorter") unless they repeated it or said "always"
Return an empty list if nothing qualifies. Fewer, sharper memories are better.`;

const OVERRIDE_SIMILARITY = 0.8;

export async function proposeMemories(
  brandHash: string,
  campaignId: string,
  data: CampaignData,
  transcript: string,
  ctx: CallContext,
): Promise<string[]> {
  const existing = listMemories(brandHash, ["active", "proposed"]).map((m) => `- ${m.text}`).join("\n") || "none";
  const overrides = data.brief?.overrides ?? [];
  const res = await llm.json({
    step: "memory:extract",
    tier: "fast",
    effort: "medium",
    system: [{ text: RULES }],
    input: [
      { label: "existing memories", text: `Already remembered (do not repeat):\n${existing}` },
      { label: "campaign overrides", text: `This campaign's brief-scoped overrides (never remember these):\n${overrides.map((o) => `- ${o.subject}: ${o.statement}`).join("\n") || "none"}` },
      { label: "transcript", text: `Conversation:\n${transcript}` },
    ],
    schema: ProposalSchema,
    schemaName: "memories",
    ctx,
  });

  let proposals = res.data.memories;
  if (proposals.length && overrides.length) {
    const vecs = await embed([...proposals.map((p) => p.text), ...overrides.map((o) => `${o.subject}: ${o.statement}`)], "memory:override-filter", ctx);
    const pv = vecs.slice(0, proposals.length);
    const ov = vecs.slice(proposals.length);
    proposals = proposals.filter((_, i) => !ov.some((o) => cosine(pv[i], o) >= OVERRIDE_SIMILARITY));
  }

  return proposals.map((p) =>
    addMemory({ brandHash: p.applies_to_all_brands ? null : brandHash, type: p.type, text: p.text, evidence: p.evidence, sourceCampaignId: campaignId, status: "proposed" }),
  );
}
