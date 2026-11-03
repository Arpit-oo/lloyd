import { handleMessage } from "@/lib/agent/agent";
import { endRun, isRunning, startRun } from "@/lib/agent/runs";
import type { ModelSettings } from "@/lib/llm/catalog";
import { json, sseResponse } from "@/lib/http/sse";

/**
 * Sends a chat message to the agent and streams its progress back as server-sent events.
 * The run is registered so the Stop button can abort it, and it survives the client leaving.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { text?: string; attachmentIds?: string[]; models?: ModelSettings };
  const text = (body.text ?? "").trim();
  if (!text && !body.attachmentIds?.length) return json({ error: "Message is empty" }, 400);
  if (isRunning(id)) return json({ error: "The agent is still working on this campaign. Stop it first or wait." }, 409);

  const ctrl = startRun(id);
  return sseResponse(async (send) => {
    try {
      await handleMessage(id, text, send, { signal: ctrl.signal, attachmentIds: body.attachmentIds, models: body.models });
    } finally {
      endRun(id, ctrl);
    }
  });
}
