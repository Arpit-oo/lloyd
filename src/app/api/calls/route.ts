import { db } from "@/lib/db";
import { json } from "@/lib/http/sse";

/** Call log for the inspector, newest first. Filter by campaign or asset. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const asset = q.get("asset");
  const campaign = q.get("campaign");
  const [where, args] = asset ? ["asset_id = ?", [asset]] : campaign ? ["campaign_id = ?", [campaign]] : ["1=1", []];
  return json(
    db()
      .prepare(
        `SELECT id, run_id, campaign_id, asset_id, step, model, status, input_tokens, cached_tokens, cache_write_tokens, output_tokens,
                reasoning_tokens, cost_usd, latency_ms, created_at
         FROM llm_calls WHERE ${where} ORDER BY created_at DESC LIMIT 500`,
      )
      .all(...args),
  );
}
