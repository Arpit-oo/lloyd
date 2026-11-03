import { getCampaign, getVersion, listAssets, listMessages } from "@/lib/agent/store";
import { campaignCost } from "@/lib/costs";
import { db } from "@/lib/db";
import { json } from "@/lib/http/sse";

/** Everything the campaign screen needs in one request: state, chat, assets with current content, cost. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) return json({ error: "Not found" }, 404);
  const assets = listAssets(id).map((a) => ({ ...a, current: a.current_version ? getVersion(a.id, a.current_version) : null }));
  const turns = db().prepare("SELECT run_id, SUM(cost_usd) usd FROM llm_calls WHERE campaign_id = ? GROUP BY run_id").all(id) as { run_id: string; usd: number }[];
  return json({ campaign, messages: listMessages(id), assets, cost: campaignCost(id), turnCost: Object.fromEntries(turns.map((t) => [t.run_id, t.usd])) });
}
