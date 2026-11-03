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
