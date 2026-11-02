import type { Brand } from "@/lib/brand";
import { allDocs } from "@/lib/brand/ingest";
import { searchBrand, searchFacts, type ChunkHit } from "@/lib/brand/retrieve";
import type { Block, CallContext } from "@/lib/llm/client";
import type { MemoryForPrompt } from "@/lib/memory/store";
import { ASSET_LABEL, type AssetType } from "./asset-types";
import type { CampaignData, PlanItem } from "./types";

/**
 * Builds prompts as ordered blocks, most stable first, with cache breakpoints after each layer:
 *
 *   [1] agent rules + brand kernel      same for every call on this brand        (cached)
 *   [2] campaign block                  same for every call in this campaign     (cached)
 *   [3] channel block                   same for every asset of this channel     (cached)
 *   [4] asset block                     this asset only: retrieved facts, persona, exemplars, images
 *
 * Each layer is labeled so the inspector can show exactly what went in and how big it was.
 */

const CHANNEL_QUERY: Record<AssetType, string> = {
  linkedin_post: "linkedin post",
  x_post: "x twitter post",
  email: "email",
  blog_post: "blog post",
  landing_page: "landing page",
};

export function brandBlock(brand: Brand, rules: string): Block {
  return { label: "agent rules + brand kernel", cache: true, text: `${rules}\n\n---\n\n${brand.kernel}` };
}

export function campaignBlock(data: CampaignData, memories: MemoryForPrompt[]): Block {
  const b = data.brief;
  const parts: string[] = ["# Campaign"];
  if (b) {
    parts.push(`Title: ${b.title}\nGoal: ${b.goal}\nProducts: ${b.products.join(", ") || "-"}\nPrimary CTA: ${b.primary_cta ?? "-"}`);
    parts.push(`Audiences:\n${b.audiences.map((a) => `- ${a.name}: ${a.notes}`).join("\n")}`);
    parts.push(`Key messages:\n${b.key_messages.map((m) => `- ${m}`).join("\n") || "-"}`);
    parts.push(`Brief constraints (follow all):\n${b.constraints.map((c) => `- ${c}`).join("\n") || "-"}`);
    if (b.internal_targets.length) parts.push(`Internal targets (NEVER put these in copy):\n${b.internal_targets.map((t) => `- ${t}`).join("\n")}`);
    if (b.overrides.length)
      parts.push(`Campaign-scoped overrides (apply to THIS campaign only; brand documents stand on everything else):\n${b.overrides.map((o) => `- ${o.subject}: ${o.statement} ("${o.quote}")`).join("\n")}`);
  }
  if (data.brandCheck?.length)
    parts.push(`Brand check decisions (binding):\n${data.brandCheck.map((c) => `- ${c.requested} -> ${c.verdict.toUpperCase()}: ${c.rule}${c.alternative ? `. Instead: ${c.alternative}` : ""}`).join("\n")}`);
  if (data.answers) parts.push(`Answers from the marketer:\n${data.answers}`);
  if (data.plan) parts.push(`Campaign plan:\n${data.plan.summary}\n${data.plan.items.map((i, n) => `${n + 1}. [${i.id}] ${ASSET_LABEL[i.type]}: ${i.title} (${i.audience})`).join("\n")}`);
  if (memories.length) parts.push(`What the marketer told us in earlier campaigns (follow unless this brief says otherwise):\n${memories.map((m) => `- ${m.text}`).join("\n")}`);
  return { label: "campaign", cache: true, text: parts.join("\n\n") };
}

/** Channel playbook: the docs whose card says they govern this channel, else the best matching chunks. */
export async function channelBlock(brand: Brand, type: AssetType, ctx: CallContext): Promise<{ block: Block; sources: string[] }> {
  const channel = CHANNEL_QUERY[type];
  const playbooks = allDocs(brand.db).filter(
    (d) => d.card.doc_type === "channel_playbook" && d.card.channels.some((c) => channel.split(" ").some((w) => c.toLowerCase().includes(w))),
  );
  let hits: ChunkHit[];
  if (playbooks.length) {
    hits = await searchBrand(brand.db, `${channel} format length structure rules call to action`, { docIds: playbooks.map((p) => p.id), limit: 10 }, ctx);
  } else {
    hits = await searchBrand(brand.db, `${channel} rules format length`, { excludeDocTypes: ["past_content"], limit: 8 }, ctx);
  }
  return {
    block: { label: `${ASSET_LABEL[type]} playbook`, cache: true, text: `# ${ASSET_LABEL[type]} rules from the brand's playbook\n\n${formatHits(hits)}` },
    sources: unique(hits.map((h) => h.docId)),
  };
}

/** Asset-specific context: facts, persona, product detail, exemplars. */
export async function assetBlock(brand: Brand, item: PlanItem, extra: string, ctx: CallContext): Promise<{ block: Block; sources: string[] }> {
  const topic = `${item.angle}. ${item.key_points.join(". ")}`;
  const [facts, persona, product, exemplars, visual] = await Promise.all([
    searchFacts(brand.db, `${topic} ${item.audience}`, 25, ctx),
    searchBrand(brand.db, `${item.audience} priorities objections what they need`, { docTypes: ["persona"], limit: 3 }, ctx),
    searchBrand(brand.db, topic, { docTypes: ["product", "messaging", "legal_claims"], limit: 6 }, ctx),
    searchBrand(brand.db, `${CHANNEL_QUERY[item.type]} ${topic}`, { docTypes: ["past_content"], limit: 2 }, ctx),
    item.image_brief ? searchBrand(brand.db, `${CHANNEL_QUERY[item.type]} image photo rules`, { docTypes: ["visual_rules"], limit: 2 }, ctx) : Promise.resolve([]),
  ]);

  const text = [
    `# This asset\n${JSON.stringify(item, null, 2)}`,
    `# Relevant brand facts (authoritative, cite-able)\n${facts.map((f) => `- [${f.docId}, tier ${f.tier}] ${f.statement}${f.validUntil ? ` (usable until ${f.validUntil})` : ""}`).join("\n")}`,
    `# Audience reference\n${formatHits(persona)}`,
    `# Product and messaging reference\n${formatHits(product)}`,
    exemplars.length ? `# Past examples of this channel (STYLE ONLY: names, claims and numbers in them may be outdated; never copy facts from here)\n${formatHits(exemplars)}` : "",
    visual.length ? `# Image rules\n${formatHits(visual)}` : "",
    extra,
  ].filter(Boolean).join("\n\n");

  return {
    block: { label: "asset context", text },
    sources: unique([...facts, ...persona, ...product, ...exemplars, ...visual].map((h) => h.docId)),
  };
}

function formatHits(hits: ChunkHit[]): string {
  return hits.map((h) => `[${h.docId} | ${h.headingPath} | tier ${h.tier}]\n${h.text}`).join("\n\n---\n\n") || "(nothing found)";
}

const unique = <T,>(xs: T[]) => [...new Set(xs)];
