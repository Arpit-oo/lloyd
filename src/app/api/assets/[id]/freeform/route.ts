import { applyFreeform } from "@/lib/agent/agent";
import { endRun, isRunning, recordRunEvent, runInfo, startRun } from "@/lib/agent/runs";
import { FREEFORM_TYPES } from "@/lib/agent/asset-types";
import { attachRunLog, getAsset } from "@/lib/agent/store";
import { json } from "@/lib/http/sse";

/**
 * Free-form design for one asset, or back to the template. The UI asks the marketer to confirm
 * first, because a free-form page does not follow the brand's look; the server requires that
 * confirmation too. Runs as a registered run, so Stop works and watchers see the progress.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { direction?: string; reset?: boolean; confirmed?: boolean; author?: string; authorId?: string; tab?: string };
  const asset = getAsset(id);
  if (!asset) return json({ error: "Not found" }, 404);
  const reset = !!body.reset;
  const direction = (body.direction ?? "").trim().slice(0, 2000);
  if (!reset && !body.confirmed) return json({ error: "Free-form design needs confirmation: it may not follow the brand's look." }, 400);
  if (!reset && !direction) return json({ error: "Describe the design you want." }, 400);
  if (!FREEFORM_TYPES.includes(asset.type)) return json({ error: "Free-form design is available for landing pages, blog posts and emails." }, 400);
  if (isRunning(asset.campaign_id)) {
    const who = runInfo(asset.campaign_id)?.author;
    return json({ error: `Lloyd is still working on ${who ? `${who}'s` : "the last"} message. Wait for it to finish, or stop it first.` }, 409);
  }

  const author = (body.author ?? "").trim().slice(0, 40);
  const ctrl = startRun(asset.campaign_id, author, (body.tab ?? "").slice(0, 20));
  try {
    await applyFreeform(asset.campaign_id, id, { direction, reset, author, authorId: typeof body.authorId === "string" ? body.authorId.slice(0, 24) : undefined }, (e) => recordRunEvent(asset.campaign_id, e as { type: string; text?: string; assetId?: string }), ctrl.signal);
    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  } finally {
    const info = runInfo(asset.campaign_id);
    if (info) attachRunLog(asset.campaign_id, info.startedAt, { steps: info.steps, startedAt: info.startedAt, endedAt: Date.now() });
    endRun(asset.campaign_id, ctrl);
  }
}
