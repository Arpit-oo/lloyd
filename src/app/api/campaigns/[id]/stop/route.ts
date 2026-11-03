import { stopRun } from "@/lib/agent/runs";
import { json } from "@/lib/http/sse";

/** Stop button: aborts the campaign's running turn and its in-flight model calls. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return json({ stopped: stopRun(id) });
}
