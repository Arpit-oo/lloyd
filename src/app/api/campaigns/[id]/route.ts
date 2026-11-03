import { heartbeat, viewers } from "@/lib/agent/presence";
import { runInfo, stopRun } from "@/lib/agent/runs";
import { deleteCampaign, getCampaign, getVersion, listAssets, listMessages, updateCampaign } from "@/lib/agent/store";
import { campaignCost, estimatePlan } from "@/lib/costs";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/llm/catalog";
import { json } from "@/lib/http/sse";

/**
 * Everything the campaign screen needs in one request: state, chat, assets, cost, estimate, and
 * the live run (who started it, its steps, drafts). `?viewer=<tab id>&name=<name>` doubles as a
 * presence heartbeat, so the reply also lists who else has this campaign open.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  heartbeat(id, q.get("viewer") ?? "", q.get("name") ?? "");
  const campaign = getCampaign(id);
  if (!campaign) return json({ error: "Not found" }, 404);
  const assets = listAssets(id).map((a) => ({ ...a, current: a.current_version ? getVersion(a.id, a.current_version) : null }));
  const turns = db().prepare("SELECT run_id, SUM(cost_usd) usd FROM llm_calls WHERE campaign_id = ? GROUP BY run_id").all(id) as { run_id: string; usd: number }[];
  return json({
    campaign,
    messages: listMessages(id),
    assets,
    cost: campaignCost(id),
    turnCost: Object.fromEntries(turns.map((t) => [t.run_id, t.usd])),
    running: !!runInfo(id),
    run: runInfo(id),
    viewers: viewers(id).map((v) => ({ id: v.id, name: v.name })),
    models: campaign.data.models ?? DEFAULT_SETTINGS,
    estimate: campaign.data.plan ? estimatePlan(campaign.data.plan.items.map((i) => i.type)) : null,
  });
}

/** Rename. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title } = (await req.json()) as { title?: string };
  if (!title?.trim()) return json({ error: "Title is required" }, 400);
  updateCampaign(id, { title: title.trim().slice(0, 120) });
  return json({ ok: true });
}

/** Delete the campaign, its chat and assets. The call log is kept for cost history. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  stopRun(id);
  deleteCampaign(id);
  return json({ ok: true });
}
