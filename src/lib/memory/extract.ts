import { z } from "zod";
import { cosine, embed } from "@/lib/llm/embed";
import { llm, type CallContext } from "@/lib/llm/client";
import type { CampaignData } from "@/lib/agent/types";
import { StyleRequestSchema } from "@/lib/agent/style-schema";
import type { StyleRequest } from "@/lib/agent/design";
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

const REMEMBER_RULES = `The marketer explicitly asked a campaign assistant to remember something for future campaigns.
Turn what they want remembered into 1 to 3 short memories, each phrased as guidance for a future campaign ("Use a sky-blue colour theme for emails", "Keep email buttons short and catchy").
Use the recent conversation to resolve "this", "that" or "it" to the actual preference. Keep their meaning; do not add your own.
Do not drop it because it is a design choice or departs from the brand: they asked for it. Do skip anything that is only a fact about this one campaign (a launch date, a target).
applies_to_all_brands: true only for personal ways of working that would hold for any brand (e.g. "fewer questions"); false for anything about this brand's look, voice or content.`;

/**
 * "Remember this": saves what the marketer asked to keep straight away, as active memories
 * (they asked, so there is nothing to approve), visible and editable in the Memory panel.
 */
export async function rememberNow(brandHash: string, campaignId: string, message: string, recent: string, ctx: CallContext): Promise<string[]> {
  const existing = listMemories(brandHash, ["active", "proposed"]).map((m) => `- ${m.text}`).join("\n") || "none";
  const res = await llm.json({
    step: "memory:remember",
    tier: "fast",
    effort: "low",
    system: [{ text: REMEMBER_RULES }],
    input: [
      { label: "existing memories", text: `Already remembered (do not repeat):\n${existing}` },
      { label: "recent conversation", text: `Recent conversation:\n${recent}` },
      { label: "request", text: `The marketer said: "${message}"` },
    ],
    schema: ProposalSchema,
    schemaName: "memories",
    ctx,
  });
  return res.data.memories.map((p) =>
    addMemory({ brandHash: p.applies_to_all_brands ? null : brandHash, type: p.type, text: p.text, evidence: p.evidence || message, sourceCampaignId: campaignId, status: "active" }),
  );
}

const DESIGN_WORDS = /\b(colou?rs?|palette|theme|blue|green|red|purple|pink|orange|teal|navy|dark|light|font|serif|button|corners?|rounded|pill|spacing|roomy|compact|look|design|style)\b/i;

/**
 * Remembered design preferences ("use a sky-blue theme for emails") as starting design settings
 * for new landing pages, blog posts and emails. Off-brand values are flagged on the asset, as
 * with any design change. Returns null when no memory is about design (no model call then).
 */
export async function styleFromMemories(memories: { text: string }[], ctx: CallContext): Promise<StyleRequest | null> {
  const design = memories.filter((m) => DESIGN_WORDS.test(m.text));
  if (!design.length) return null;
  const res = await llm.json({
    step: "memory:style",
    tier: "fast",
    effort: "low",
    system: [{ text: `Translate a marketer's remembered design preferences into design settings for new assets.
Set only what a preference clearly asks for; leave everything else null. Colours as #rrggbb (pick a faithful hex for named colours, e.g. sky blue #38bdf8 with a pale #e0f2fe background). Preferences about wording (e.g. button text) are not design settings. reset_to_brand is false.` }],
    input: `Remembered preferences:\n${design.map((m) => `- ${m.text}`).join("\n")}`,
    schema: StyleRequestSchema,
    schemaName: "style",
    ctx,
  });
  const s = res.data;
  return Object.entries(s).some(([k, v]) => k !== "reset_to_brand" && v !== null) ? s : null;
}
