import type { Brand } from "@/lib/brand";
import { isImageAllowed, type ImageRules, type Vision } from "@/lib/brand/images";
import { fromBlob } from "@/lib/brand/store";
import { cosine, embed } from "@/lib/llm/embed";
import type { CallContext } from "@/lib/llm/client";
import type { AssetType } from "../asset-types";

/**
 * Image candidates for one asset. Hard filters first (usage rules, channel limits), then
 * semantic ranking against the planner's image brief. The writer picks from the shortlist and
 * sees each image's caveats; the claim guard re-checks the pick against the brief's rules.
 */
export interface ImageCandidate {
  id: string;
  file: string;
  title: string;
  type: string;
  caption: string;
  visibleText: string | null;
  caution: string | null;
  score: number;
}

const CHANNEL_WORD: Record<AssetType, string> = { linkedin_post: "linkedin", x_post: "x", email: "email", blog_post: "blog", landing_page: "web" };

export async function imageCandidates(brand: Brand, type: AssetType, imageBrief: string, ctx: CallContext, limit = 8): Promise<ImageCandidate[]> {
  const rows = brand.db.prepare("SELECT id, filename, meta_json, caption, rules_json, embedding FROM images WHERE usable = 1 AND embedding IS NOT NULL").all() as {
    id: string; filename: string; meta_json: string; caption: string | null; rules_json: string | null; embedding: Buffer;
  }[];
  const [qv] = await embed([imageBrief], "retrieve:images", ctx);
  return rows
    .map((r) => ({ r, rules: r.rules_json ? (JSON.parse(r.rules_json) as ImageRules) : null }))
    .filter(({ rules }) => isImageAllowed(rules, CHANNEL_WORD[type]).ok)
    .map(({ r, rules }) => {
      const meta = JSON.parse(r.meta_json) as Record<string, unknown>;
      const vision = r.caption ? (JSON.parse(r.caption) as Vision) : null;
      return {
        id: r.id,
        file: r.filename,
        title: String(meta.title ?? r.id),
        type: String(meta.type ?? "image"),
        caption: vision?.caption ?? String(meta.description ?? ""),
        visibleText: vision?.visible_text ?? null,
        caution: [rules?.caution, rules?.must_not_crop ? `Do not crop: ${rules.must_not_crop}` : null, rules?.blocked_contexts.length ? `Not for: ${rules.blocked_contexts.join(", ")}` : null]
          .filter(Boolean).join(" ") || null,
        score: cosine(qv, fromBlob(r.embedding)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function renderCandidates(c: ImageCandidate[]): string {
  if (!c.length) return "# Image candidates\nNone usable. Set image_id to null.";
  return `# Image candidates (pick one id or null; obey the brief's image rules and each caution)\n${c
    .map((i) => `- id=${i.id} | ${i.type} | "${i.title}" | ${i.caption}${i.visibleText ? ` | visible text: ${i.visibleText}` : ""}${i.caution ? ` | CAUTION: ${i.caution}` : ""}`)
    .join("\n")}`;
}
