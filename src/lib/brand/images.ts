import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { llm, type CallContext } from "@/lib/llm/client";
import type { ScannedImage } from "./scan";

/**
 * Image library indexing.
 * 1. Vision caption for every image, because metadata can be empty or simply wrong.
 * 2. Usage rules parsed from the free-text metadata (restrictions, rights) into generic fields.
 *    Hard filters run on these before any semantic matching. If a restriction can't be parsed,
 *    the image is treated as unusable rather than guessed at.
 */
export const VisionSchema = z.object({
  caption: z.string().describe("One or two sentences: what is in the image, setting, mood."),
  visible_text: z.string().nullable().describe("Any readable text, labels, badges or logos."),
  shows_people: z.boolean(),
  shows_product_ui: z.boolean(),
  matches_metadata: z.boolean().describe("Does the image match the metadata title/description given?"),
  mismatch_note: z.string().nullable(),
});
export type Vision = z.infer<typeof VisionSchema>;

export const ImageRulesSchema = z.object({
  id: z.string(),
  usable_externally: z.boolean().describe("False if internal-only, deprecated, expired, or unclear."),
  allowed_channels: z.array(z.string()).nullable().describe("If use is limited to certain channels/contexts, list them; null = no limit."),
  blocked_contexts: z.array(z.string()).describe("Contexts where it must not be used, e.g. 'paid ads', 'press releases'."),
  deprecated: z.boolean(),
  expired: z.boolean().describe("Tied to a past event or date."),
  people_unavailable: z.array(z.string()).describe("People shown who must not be featured (e.g. left the company)."),
  must_not_crop: z.string().nullable().describe("Element that must stay visible if used."),
  caution: z.string().nullable().describe("Other conditions a designer must respect."),
});
export type ImageRules = z.infer<typeof ImageRulesSchema>;

export async function captionImage(img: ScannedImage, meta: Record<string, unknown> | undefined, ctx: CallContext): Promise<Vision> {
  const file = path.join(getConfig().brandDir, img.relPath);
  const mime = img.filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
  const res = await llm.json({
    step: "ingest:vision",
    tier: "fast",
    effort: "none",
    system: [{ text: "Describe images for a marketer choosing visuals. Note any visible text, logos, badges or UI labels exactly." }],
    input: [{ text: `File: ${img.filename}
Metadata title: ${String(meta?.title ?? "")}
Metadata description: ${String(meta?.description ?? "")}`, image: dataUrl }],
    schema: VisionSchema,
    schemaName: "vision",
    ctx,
  });
  return res.data;
}

const RULES_INSTRUCTIONS = `You turn image-library metadata into usage rules a designer must follow.
Read every field (restrictions, usage rights, tags, description, dates). Restrictions beat tags.

Separate provenance from restriction:
- Statements about who made or owns the image ("internal production", "company owned", "agency shoot") or which paperwork exists ("staff release on file", "site release on file", "event notice posted") are PERMISSIONS / PROVENANCE. They do not limit use. "Internal production, all channels" means made in-house and usable on all channels.
- Only explicit limits restrict use: "internal only", "events only", "deprecated", "do not use", a named person who left, an expired event, channel or context bans, "do not crop".
- "X only" limits use to X: put X in allowed_channels (e.g. "Events only" -> ["events"]).
- An image that must keep a visible label (e.g. a status badge) stays usable, with must_not_crop set and the condition in caution.
If an explicit restriction is ambiguous, set usable_externally = false and explain in caution. Return one entry per id, using the given ids.`;

export async function parseImageRules(records: { id: string; meta: Record<string, unknown> }[], ctx: CallContext): Promise<ImageRules[]> {
  const out: ImageRules[] = [];
  const BATCH = 20;
  const batches = [];
  for (let i = 0; i < records.length; i += BATCH) batches.push(records.slice(i, i + BATCH));
  const results = await Promise.all(
    batches.map((b) =>
      llm.json({
        step: "ingest:image-rules",
        tier: "bulk",
        system: [{ text: RULES_INSTRUCTIONS }],
        input: `Today is ${new Date().toISOString().slice(0, 10)}.\n\n` + b.map((r) => `id=${r.id}\n${JSON.stringify(r.meta)}`).join("\n\n"),
        schema: z.object({ rules: z.array(ImageRulesSchema) }),
        schemaName: "image_rules",
        ctx,
      }),
    ),
  );
  for (const r of results) out.push(...r.data.rules);
  return out;
}

/** Deterministic gate applied before any semantic ranking. */
export function isImageAllowed(rules: ImageRules | null, channel?: string): { ok: boolean; reason?: string } {
  if (!rules) return { ok: false, reason: "No parsed usage rules" };
  if (!rules.usable_externally) return { ok: false, reason: rules.caution ?? "Not for external use" };
  if (rules.deprecated) return { ok: false, reason: "Deprecated" };
  if (rules.expired) return { ok: false, reason: "Expired" };
  if (rules.people_unavailable.length) return { ok: false, reason: `Shows ${rules.people_unavailable.join(", ")}` };
  if (channel && rules.allowed_channels?.length) {
    const allowed = rules.allowed_channels.some((c) => c.toLowerCase().includes(channel.toLowerCase()) || channel.toLowerCase().includes(c.toLowerCase()));
    if (!allowed) return { ok: false, reason: `Limited to ${rules.allowed_channels.join(", ")}` };
  }
  return { ok: true };
}
