import { z } from "zod";
import { ASSET_TYPES } from "./asset-types";
import type { StyleRequest } from "./design";

/**
 * Campaign lifecycle. The agent is an explicit state machine: each user message is routed to an
 * action, and only actions legal in the current state run. Nothing is written before the plan
 * is approved.
 *
 *  new -> clarifying -> plan_review -> writing -> review
 *              ^             |  ^                  |
 *              └── answers ──┘  └── plan edits     └── asset edits (stay in review)
 */
export type CampaignState = "new" | "clarifying" | "plan_review" | "writing" | "review";

// ---------- intake ----------

export const StructuredBriefSchema = z.object({
  title: z.string().describe("Short campaign name."),
  requester: z.string().nullable(),
  products: z.array(z.string()),
  goal: z.string(),
  internal_targets: z.array(z.string()).describe("KPIs or numbers that are internal and must not appear in copy."),
  audiences: z.array(z.object({ name: z.string(), notes: z.string() })),
  requested_assets: z.array(
    z.object({
      type: z.enum([...ASSET_TYPES, "other"]),
      description: z.string(),
      audience: z.string().nullable(),
      sender_or_byline: z.string().nullable(),
      publish_date: z.string().nullable(),
    }),
  ).describe("Assets the brief explicitly lists. Empty if the brief leaves the mix open."),
  mix_is_open: z.boolean().describe("True if the brief asks the team to propose the asset mix."),
  key_messages: z.array(z.string()),
  dates: z.object({ start: z.string().nullable(), end: z.string().nullable(), notes: z.string().nullable() }),
  constraints: z.array(z.string()).describe("Every do/don't in the brief, one per item, close to verbatim."),
  overrides: z.array(
    z.object({ subject: z.string(), statement: z.string(), quote: z.string() }),
  ).describe("Places where the brief explicitly says it overrides brand documents for this campaign. Verbatim quote required."),
  requested_claims: z.array(
    z.object({
      text: z.string().describe("The claim, proof point, customer reference, certification or statistic the brief asks to use."),
      kind: z.enum(["certification", "customer_reference", "statistic", "product_claim", "company_claim", "other"]),
      brief_quote: z.string(),
    }),
  ),
  primary_cta: z.string().nullable(),
  lead_angle: z.string().nullable().describe("What the brief says the campaign should lead with or center on (headline idea, centerpiece story), close to verbatim. Null if not stated."),
  unclear: z.array(z.string()).describe("Things a planner would need that the brief does not say."),
});
export type StructuredBrief = z.infer<typeof StructuredBriefSchema>;

// ---------- brand check ----------

export const BrandCheckItemSchema = z.object({
  requested: z.string().describe("What the brief asked for."),
  verdict: z.enum(["ok", "conflict", "needs_change"]),
  rule: z.string().describe("The brand/legal rule that applies, in plain words."),
  source_doc: z.string().nullable(),
  source_quote: z.string().nullable().describe("Verbatim quote from the source."),
  alternative: z.string().nullable().describe("What the campaign will do instead, using approved wording where it exists."),
});
export const BrandCheckSchema = z.object({ items: z.array(BrandCheckItemSchema) });
export type BrandCheckItem = z.infer<typeof BrandCheckItemSchema>;

// ---------- questions ----------

export const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      why: z.string().describe("What in the plan changes depending on the answer."),
      options: z.array(z.string()).describe("2-4 short answer options."),
      multi_select: z.boolean().describe("True when several options can sensibly be picked together (e.g. channels, asset types, audiences to cover); false when they are alternatives."),
      default: z.string().describe("The answer the agent will assume if the user says use defaults. Must be one of the options."),
    }),
  ),
  assumptions: z.array(z.string()).describe("Things the agent decided without asking, stated so the user can correct them."),
});
export type Questions = z.infer<typeof QuestionsSchema>;

// ---------- plan ----------

export const PlanItemSchema = z.object({
  id: z.string().describe("Stable id like a1, a2..."),
  type: z.enum(ASSET_TYPES),
  title: z.string().describe("Short label, e.g. 'Launch email to customers'."),
  audience: z.string(),
  sender_or_byline: z.string().nullable(),
  publish_date: z.string().nullable(),
  angle: z.string().describe("The one idea this asset carries."),
  key_points: z.array(z.string()),
  cta: z.string().nullable(),
  proof: z.array(z.string()).describe("Approved proof, statistics or quotes it may use. Empty if none."),
  research_question: z.string().nullable().describe("A specific question for web research if a fresh third-party fact would help, else null."),
  image_brief: z.string().nullable().describe("What image would suit it, or null for no image."),
  notes: z.string().nullable(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const PlanSchema = z.object({
  summary: z.string().describe("Two or three sentences on the campaign idea."),
  mix_rationale: z.string().describe("Why this set of assets; mention anything added to or dropped from the brief's list."),
  items: z.array(PlanItemSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

// ---------- campaign data blob ----------

export interface CampaignData {
  briefText?: string;
  brief?: StructuredBrief;
  brandCheck?: BrandCheckItem[];
  questions?: Questions;
  answers?: string;
  plan?: Plan;
  /** Memory ids injected into this campaign, for the "using n memories" display. */
  memoryIds?: string[];
  /** Model picker choice for this campaign. */
  models?: import("@/lib/llm/catalog").ModelSettings;
  /** Files the marketer attached after the brief, used as reference material. */
  /** Documents, images and links the marketer sent as references (see references.ts). */
  references?: { name: string; text: string; kind?: "document" | "image" | "link"; style?: StyleRequest }[];
  /** Design suggested by the latest image or link reference; new web assets and emails start from it. */
  referenceStyle?: StyleRequest;
  /** Asset types picked with the chips when starting; the first plan uses only these. */
  assetTypes?: import("./asset-types").AssetType[];
  /** An edit waiting for the marketer to confirm, because it goes against the brand (see confirm.ts). */
  pendingEdit?: import("./confirm").PendingEdit | null;
  /** The router asked a clarifying question; the next message answers it and must not be asked again. */
  pendingClarify?: { request: string; question: string } | null;
  /** Design from remembered preferences (e.g. "sky-blue theme"); new web assets and emails start from it when no reference sets one. */
  memoryStyle?: StyleRequest;
  /** Documents attached to a new campaign with a question about them; used as the brief once the marketer says go. */
  draftDocs?: string;
  /** The same documents one by one, so the marketer can pick one when several separate briefs were attached. */
  draftFiles?: { name: string; text: string }[];
  /** Brand voice/style exceptions the marketer confirmed for this campaign. Legal rules are never overridden. */
  voiceOverrides?: string[];
}
