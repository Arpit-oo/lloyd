import { heartbeat, viewers } from "@/lib/agent/presence";
import { runInfo } from "@/lib/agent/runs";
import { db } from "@/lib/db";
import { json } from "@/lib/http/sse";

/**
 * Cheap poll for an open campaign: a signature that changes whenever the chat, the assets or
 * the campaign change, plus the live run and who is here. The UI fetches the full campaign
 * only when the signature moves. Doubles as the presence heartbeat.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  heartbeat(id, q.get("viewer") ?? "", q.get("name") ?? "");
  const row = db()
    .prepare(
      `SELECT c.updated_at u,
        (SELECT COUNT(*) FROM messages WHERE campaign_id = c.id) m,
        (SELECT COALESCE(GROUP_CONCAT(id || ':' || current_version || ':' || status), '') FROM assets WHERE campaign_id = c.id) a
       FROM campaigns c WHERE c.id = ?`,
    )
    .get(id) as { u: string; m: number; a: string } | undefined;
  if (!row) return json({ error: "Not found" }, 404);
  const run = runInfo(id);
  return json({ sig: `${row.u}|${row.m}|${row.a}`, running: !!run, run, viewers: viewers(id).map((v) => ({ id: v.id, name: v.name })) });
}
