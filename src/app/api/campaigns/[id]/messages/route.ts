import { handleMessage } from "@/lib/agent/agent";
import { sseResponse } from "@/lib/http/sse";

/** Sends a chat message to the agent and streams its progress back as server-sent events. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = (await req.json()) as { text: string };
  return sseResponse((send) => handleMessage(id, text, send));
}
