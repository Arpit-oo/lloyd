import { getConfig } from "@/lib/config";

/**
 * Model tiers. Code asks for a tier, never a model id, so a model can be swapped
 * in one place (or per run through MODEL_* env vars) without touching call sites.
 *
 * Why these defaults (prices per 1M tokens, Nov 2026; see docs/BUILD-LOG.md and DECISIONS.md):
 *  - writer   gpt-6.1-sol    $2.00 in / $0.10 cached / $10 out. Best prose + judgment; cheap cache reads
 *                            (0.05x) make the shared brand prefix nearly free after the first asset.
 *  - reasoner gpt-6.1-sol    planning, conflict adjudication, brand checks: the calls where a wrong
 *                            decision is expensive downstream.
 *  - fast     gpt-6.1-terra  $1.00 / $0.05 / $5. Routing, claim guard, edits, memory extraction.
 *  - bulk     gpt-6-luna     $0.10 / $0.01 / $0.50. One-time ingest tagging and parsing at volume.
 *  - embed    text-embedding-3-small $0.02. Enough for a few thousand chunks.
 */
export type Tier = "writer" | "reasoner" | "fast" | "bulk";

const DEFAULTS: Record<Tier | "embed", string> = {
  writer: "gpt-6.1-sol",
  reasoner: "gpt-6.1-sol",
  fast: "gpt-6.1-terra",
  bulk: "gpt-6-luna",
  embed: "text-embedding-3-small",
};

export function modelFor(tier: Tier | "embed"): string {
  const c = getConfig();
  const override = {
    writer: c.MODEL_WRITER,
    reasoner: c.MODEL_REASONER,
    fast: c.MODEL_FAST,
    bulk: c.MODEL_BULK,
    embed: c.MODEL_EMBED,
  }[tier];
  return override || DEFAULTS[tier];
}

export interface ModelCaps {
  /** Accepts `reasoning: { effort }`. */
  reasoning: boolean;
  /** Supports `prompt_cache_options` + explicit `prompt_cache_breakpoint` (GPT-5.6 and later). */
  explicitCache: boolean;
}

/** Capabilities by model family. Unknown models get the conservative profile. */
export function capsFor(model: string): ModelCaps {
  const m = model.toLowerCase();
  const family = m.match(/^gpt-(\d+)(?:\.(\d+))?/);
  const major = family ? Number(family[1]) : 0;
  const minor = family?.[2] ? Number(family[2]) : 0;
  const isNewGen = major > 5 || (major === 5 && minor >= 6);
  const isReasoningFamily = major >= 5 || /^o\d/.test(m);
  // "luna" variants are non-reasoning small models.
  const reasoning = isReasoningFamily && !m.includes("luna") && !m.includes("chat");
  return { reasoning, explicitCache: isNewGen };
}
