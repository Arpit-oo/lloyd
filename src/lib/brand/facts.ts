import { z } from "zod";
import { llm, type CallContext } from "@/lib/llm/client";
import type { DocCard } from "./cards";
import type { ScannedDoc } from "./scan";

/**
 * Pulls atomic, citable facts and rules out of one document.
 * Facts are what the rest of the system reasons over: conflicts are found between facts,
 * the brand kernel is compiled from winning facts, and the claim guard checks copy against them.
 */
export const FACT_KINDS = [
  "approved_wording", "banned_claim", "naming_rule", "product_fact", "customer_reference", "certification",
  "statistic", "channel_rule", "voice_rule", "visual_rule", "process_rule", "company_fact", "status_or_date",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const ExtractedFactSchema = z.object({
  kind: z.enum(FACT_KINDS),
  subject: z.string().describe("What the fact is about, as a short noun phrase a different document would also use, e.g. 'certification status', 'name of the main product', 'LinkedIn post length'."),
  statement: z.string().describe("The fact or rule restated as one plain sentence."),
  quote: z.string().describe("Verbatim supporting text from the document, max ~300 characters."),
  heading: z.string().nullable().describe("The section heading it came from."),
  channels: z.array(z.string()).describe("Channels it is limited to; empty = all."),
  audiences: z.array(z.string()).describe("Audiences it is limited to; empty = all."),
  products: z.array(z.string()),
  valid_from: z.string().nullable().describe("ISO date the fact starts to apply, if stated."),
  valid_until: z.string().nullable().describe("ISO date it stops applying, if stated or computable (e.g. a statistic usable for 12 months from publication)."),
});
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

const FactListSchema = z.object({ facts: z.array(ExtractedFactSchema) });

const RULE_DOC_INSTRUCTIONS = `You extract facts and rules from a brand document so a marketing writer can follow them without reading the whole folder.

Extract what would change what a marketer writes or publishes:
- approved wording that must be used exactly; banned words and claims
- product names, renames, how names are written and introduced
- product capabilities and limits; company facts (names, taglines, founding, funding, counts)
- customers: who may be named or quoted, where, and with which results
- certifications and compliance status; statistics with their source and date
- channel rules (length, format, cadence, CTA), voice and tone rules, visual and image rules, review/process rules

Rules:
- One fact per item. Keep the document's exact names, numbers and dates.
- "quote" must be copied verbatim from the document.
- Prefer hard rules and specific facts over general advice. At most 45 items; skip filler.
- Record what THIS document says, even if you suspect another document disagrees.`;

const PAST_CONTENT_INSTRUCTIONS = `You scan an old or informal document (past post, email, deck notes, chat log, meeting notes) for statements that could be reused in new marketing and might be outdated or unapproved.

Extract only:
- claims about the company, products, product names, customers, certifications, compliance, statistics, prices and dates
- decisions recorded in notes (e.g. "X is not cleared", "we will stop saying Y")
Do not extract style or opinion. "quote" must be verbatim. At most 30 items.`;

const LOW_TRUST_TYPES = new Set<DocCard["doc_type"]>(["past_content", "sales_material", "internal_notes", "press_release", "onboarding"]);

export async function extractFacts(doc: ScannedDoc, card: DocCard, ctx: CallContext): Promise<ExtractedFact[]> {
  const lowTrust = LOW_TRUST_TYPES.has(card.doc_type) || card.status === "superseded" || card.status === "historical_example";
  const res = await llm.json({
    step: "ingest:facts",
    tier: "fast",
    system: [{ text: lowTrust ? PAST_CONTENT_INSTRUCTIONS : RULE_DOC_INSTRUCTIONS, label: "fact instructions" }],
    input: `Document: ${doc.id}\nType: ${card.doc_type}\nStated date: ${card.stated_date ?? "unknown"}\n\n${doc.text.slice(0, 60_000)}`,
    schema: FactListSchema,
    schemaName: "facts",
    maxOutputTokens: 16_000,
    ctx,
  });
  return res.data.facts;
}
