import { handleMessage } from "@/lib/agent/agent";
import { endRun, isRunning, recordRunEvent, runInfo, startRun } from "@/lib/agent/runs";
import type { AssetType } from "@/lib/agent/asset-types";
import { attachRunLog } from "@/lib/agent/store";
import type { ModelSettings } from "@/lib/llm/catalog";
import { json, sseResponse } from "@/lib/http/sse";

/**
 * Sends a chat message to the agent and streams its progress back as server-sent events.
 * The run is registered so the Stop button can abort it, and it survives the client leaving.
 *
 * In a shared chat only one message runs at a time: a second sender gets 409 with the name of
 * the person whose message is being worked on, and can send once it finishes.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { text?: string; attachmentIds?: string[]; models?: ModelSettings; author?: string; tab?: string; assetTypes?: AssetType[] };
  const text = (body.text ?? "").trim();
  const author = (body.author ?? "").trim().slice(0, 40);
  if (!text && !body.attachmentIds?.length) return json({ error: "Message is empty" }, 400);
  if (isRunning(id)) {
    const who = runInfo(id)?.author;
    return json({ error: `Lloyd is still working on ${who ? `${who}'s` : "the last"} message. Wait for it to finish, or stop it first.` }, 409);
  }

  const ctrl = startRun(id, author, (body.tab ?? "").slice(0, 20));
  return sseResponse(async (send) => {
    try {
      await handleMessage(
        id,
        text,
        (e) => {
          recordRunEvent(id, e as { type: string; text?: string; assetId?: string });
          send(e);
        },
        { signal: ctrl.signal, attachmentIds: body.attachmentIds, models: body.models, author, assetTypes: body.assetTypes },
      );
    } finally {
      const info = runInfo(id);
      if (info) attachRunLog(id, info.startedAt, { steps: info.steps, startedAt: info.startedAt, endedAt: Date.now() });
      endRun(id, ctrl);
    }
  });
}
