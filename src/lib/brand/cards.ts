import { z } from "zod";
import { llm, type CallContext } from "@/lib/llm/client";
import type { ScannedDoc } from "./scan";

/**
 * A doc card is a short, structured description of one brand document. Cards let later steps
 * (governance, retrieval filters, the planner) reason about the folder without reading it all.
 */
export const DOC_TYPES = [
  "brand_guidelines", "legal_claims", "channel_playbook", "voice_and_style", "messaging", "product",
  "persona", "case_study", "press_release", "sales_material", "internal_notes", "template",
  "visual_rules", "past_content", "onboarding", "other",
] as const;

export const DocCardSchema = z.object({
  doc_type: z.enum(DOC_TYPES),
  summary: z.string().describe("Two sentences: what this document is and what a marketer would use it for."),
  topics: z.array(z.string()).describe("3-8 short topic tags."),
  products: z.array(z.string()).describe("Product names mentioned, exactly as written."),
  channels: z.array(z.string()).describe("Marketing channels it governs or shows examples of, e.g. email, linkedin, x, blog, landing page."),
  audiences: z.array(z.string()),
  stated_date: z.string().nullable().describe("The most specific date the document states for itself (issued, revised, last checked), ISO if possible."),
  status: z.enum(["current", "superseded", "draft", "internal_only", "historical_example", "unknown"]),
  status_evidence: z.string().nullable().describe("Short quote supporting the status, if any."),
  authority_claims: z.array(z.string()).describe(
    "Verbatim statements the document makes about its own or another document's authority: 'replaces X in full', 'this document wins', 'FINAL', 'start here', 'out of date'. Empty if none.",
  ),
  owner: z.string().nullable(),
});
export type DocCard = z.infer<typeof DocCardSchema>;

const INSTRUCTIONS = `You catalogue documents from a company's marketing/brand folder.
Describe the document as it is. Do not judge whether its claims are true; other steps do that.
Be literal with names and dates. If something is not stated, use null or an empty list.`;

export async function buildDocCard(doc: ScannedDoc, ctx: CallContext): Promise<DocCard> {
  const outline = doc.text.split("\n").filter((l) => /^#{1,3}\s/.test(l)).slice(0, 40).join("\n");
  const head = doc.text.slice(0, 9000);
  const tail = doc.text.length > 11000 ? `\n...\n${doc.text.slice(-2000)}` : doc.text.slice(9000);
  const res = await llm.json({
    step: "ingest:card",
    tier: "bulk",
    system: [{ text: INSTRUCTIONS, label: "card instructions" }],
    input: `Path: ${doc.id}\nTitle: ${doc.title}\n\nOutline:\n${outline}\n\nContent:\n${head}${tail}`,
    schema: DocCardSchema,
    schemaName: "doc_card",
    ctx,
  });
  return res.data;
}
