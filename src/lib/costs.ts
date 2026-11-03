import { db } from "@/lib/db";

/**
 * Cost reporting over the call log. A campaign's cost is split into the initial run
 * (brief to finished assets) and edits, because "what does a campaign cost" and
 * "what does an edit cost" are the two numbers that matter.
 */
export interface StepCost {
  step: string;
  calls: number;
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  costUSD: number;
}

export interface CampaignCost {
  totalUSD: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  cacheHitRate: number;
  byStep: StepCost[];
  editsUSD: number;
  edits: number;
}

export function campaignCost(campaignId: string): CampaignCost {
  const byStep = db()
    .prepare(
      `SELECT step, COUNT(*) calls, SUM(input_tokens) inputTokens, SUM(cached_tokens) cachedTokens, SUM(cache_write_tokens) cacheWriteTokens,
              SUM(output_tokens) outputTokens, SUM(cost_usd) costUSD
       FROM llm_calls WHERE campaign_id = ? GROUP BY step ORDER BY costUSD DESC`,
    )
    .all(campaignId) as StepCost[];
  const sum = (k: keyof Omit<StepCost, "step">) => byStep.reduce((a, s) => a + (s[k] as number), 0);
  const edits = db()
    .prepare(`SELECT COUNT(DISTINCT run_id) n, COALESCE(SUM(cost_usd),0) usd FROM llm_calls WHERE campaign_id = ? AND run_id IN (SELECT DISTINCT run_id FROM llm_calls WHERE campaign_id = ? AND step LIKE 'edit:%')`)
    .get(campaignId, campaignId) as { n: number; usd: number };
  const input = sum("inputTokens");
  return {
    totalUSD: sum("costUSD"),
    inputTokens: input,
    cachedTokens: sum("cachedTokens"),
    outputTokens: sum("outputTokens"),
    cacheHitRate: input ? sum("cachedTokens") / input : 0,
    byStep,
    editsUSD: edits.usd,
    edits: edits.n,
  };
}

/**
 * Rough cost of writing a plan, from what assets of each type actually cost on this machine
 * (write + claim check + any fix), with a conservative fallback before there is history.
 */
const FALLBACK_PER_ASSET: Record<string, number> = { linkedin_post: 0.035, x_post: 0.03, email: 0.04, blog_post: 0.07, landing_page: 0.07 };

export function estimatePlan(types: string[]): { usd: number; minutes: number } {
  const rows = db()
    .prepare(
      `SELECT a.type, AVG(t.usd) avg FROM assets a
       JOIN (SELECT asset_id, SUM(cost_usd) usd FROM llm_calls WHERE asset_id IS NOT NULL AND (step LIKE 'write:%' OR step LIKE 'guard:%' OR step LIKE 'edit:%') GROUP BY asset_id) t
       ON t.asset_id = a.id GROUP BY a.type`,
    )
    .all() as { type: string; avg: number }[];
  const avg = new Map(rows.map((r) => [r.type, r.avg]));
  const usd = types.reduce((sum, t) => sum + (avg.get(t) ?? FALLBACK_PER_ASSET[t] ?? 0.05), 0);
  // Four assets are written at a time, about 40 seconds each including the check.
  const minutes = Math.max(1, Math.round(((Math.ceil(types.length / 4) * 40 + 20) / 60) * 2) / 2);
  return { usd, minutes };
}
