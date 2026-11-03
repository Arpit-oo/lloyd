import type { AssetContent } from "@/lib/agent/asset-types";
import type { AssetRow, AssetVersionRow, CampaignRow, MessageRow } from "@/lib/agent/store";
import type { DesignTokens } from "@/lib/brand/design-tokens";
import type { Entity } from "@/lib/brand/entities";
import type { Governance } from "@/lib/brand/governance";
import type { ImageRules, Vision } from "@/lib/brand/images";
import type { IngestSummary } from "@/lib/brand/ingest";
import type { CampaignCost } from "@/lib/costs";

/** Response shapes of the API routes, shared by UI components. */
export interface CampaignView {
  campaign: CampaignRow;
  messages: MessageRow[];
  assets: (AssetRow & { current: AssetVersionRow | null })[];
  cost: CampaignCost;
}

export interface CampaignListItem {
  id: string;
  title: string;
  state: string;
  updated_at: string;
}

export interface BrandView {
  ready: boolean;
  hash?: string;
  summary?: IngestSummary;
  governance?: Governance;
  docs?: { id: string; title: string; tier: number; reason: string; card: { doc_type: string; summary: string; status: string } }[];
  conflicts?: {
    id: string;
    topic: string;
    needsUser: boolean;
    resolution: { explanation: string; rule_applied: string; confidence: string; winner_fact_ids: string[]; loser_fact_ids: string[]; owner_note: string | null };
    facts: { id: string; doc_id: string; statement: string; quote: string; tier: number }[];
  }[];
  entities?: Entity[];
  images?: { id: string; usable: boolean; meta: Record<string, unknown>; vision: Vision | null; rules: ImageRules | null }[];
  kernel?: string;
  tokens?: DesignTokens | null;
}

export interface CallSummary {
  id: string;
  run_id: string | null;
  campaign_id: string | null;
  asset_id: string | null;
  step: string;
  model: string;
  status: string;
  input_tokens: number;
  cached_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  latency_ms: number;
  created_at: string;
}

export interface CallDetail extends CallSummary {
  request: {
    model: string;
    input: { role: string; content: { type: string; text?: string; image_url?: string; prompt_cache_breakpoint?: unknown }[] }[];
    _labels?: { role: string; label?: string; cache: boolean; chars: number }[];
    [k: string]: unknown;
  };
  response_text: string | null;
  error: string | null;
}

export type { AssetContent, MessageRow };
