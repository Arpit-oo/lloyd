import type { Tier } from "./models";
import { modelFor } from "./models";
import { priceOf } from "./pricing";

/**
 * What the model picker offers. A preset sets every tier at once; the writer choice then
 * overrides just the model that plans and writes. Claim checks stay on a capable model in every
 * preset, because a cheap checker that misses a banned claim costs more than it saves.
 */
export type PresetId = "best" | "balanced" | "fast";

export interface ModelSettings {
  preset: PresetId;
  /** Optional override for the writer + reasoner tier. */
  writer?: string;
}

export const DEFAULT_SETTINGS: ModelSettings = { preset: "balanced" };

export const PRESETS: Record<PresetId, { label: string; description: string; tiers: () => Partial<Record<Tier, string>> }> = {
  best: {
    label: "Best",
    description: "Strongest model for every step, checks included. Slowest and about 1.5x the cost.",
    tiers: () => ({ writer: "gpt-6.1-sol", reasoner: "gpt-6.1-sol", fast: "gpt-6.1-sol" }),
  },
  balanced: {
    label: "Balanced",
    description: "Strong model plans and writes; a faster one routes and checks. Recommended.",
    tiers: () => ({ writer: modelFor("writer"), reasoner: modelFor("reasoner"), fast: modelFor("fast") }),
  },
  fast: {
    label: "Fast",
    description: "Faster, cheaper writer. Good for drafts; review claims more carefully.",
    tiers: () => ({ writer: "gpt-6.1-terra", reasoner: "gpt-6.1-terra", fast: "gpt-6.1-terra" }),
  },
};

export const WRITER_OPTIONS = ["gpt-6.1-sol", "gpt-5.5", "gpt-6-sol", "gpt-6.1-terra"] as const;

export function resolveModels(settings: ModelSettings | undefined): Partial<Record<Tier, string>> {
  const s = settings ?? DEFAULT_SETTINGS;
  const tiers = PRESETS[s.preset]?.tiers() ?? PRESETS.balanced.tiers();
  return s.writer ? { ...tiers, writer: s.writer, reasoner: s.writer } : tiers;
}

/** Catalog for the UI: presets and writer models with list prices per 1M tokens. */
export function modelCatalog() {
  return {
    presets: (Object.keys(PRESETS) as PresetId[]).map((id) => ({ id, label: PRESETS[id].label, description: PRESETS[id].description, writer: PRESETS[id].tiers().writer })),
    writers: WRITER_OPTIONS.map((id) => ({ id, price: priceOf(id) })),
    defaults: DEFAULT_SETTINGS,
  };
}
