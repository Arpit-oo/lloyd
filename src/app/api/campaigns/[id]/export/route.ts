import { campaignMarkdown, slugify } from "@/lib/agent/export";
import { getCampaign, getVersion, listAssets, listMessages } from "@/lib/agent/store";
import { campaignCost } from "@/lib/costs";
import { json } from "@/lib/http/sse";

/**
 * Downloads a campaign: `?format=md` (default) is a readable document with the conversation and
 * the current version of every asset; `?format=json` is the raw data, for archiving or tooling.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) return json({ error: "Not found" }, 404);
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "md";
  const messages = listMessages(id);
  const assets = listAssets(id).map((a) => ({ ...a, current: a.current_version ? getVersion(a.id, a.current_version) : null }));
  const cost = campaignCost(id);
  const slug = slugify(campaign.title);

  const body =
    format === "json"
      ? JSON.stringify({ exportedAt: new Date().toISOString(), campaign, messages, assets, cost }, null, 2)
      : campaignMarkdown(id)!.markdown;
  return new Response(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.${format}"`,
    },
  });
}

