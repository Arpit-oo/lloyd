import { db } from "@/lib/db";
import { json } from "@/lib/http/sse";

/** One call with the exact request sent to the model and the raw response. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db().prepare("SELECT * FROM llm_calls WHERE id = ?").get(id) as (Record<string, unknown> & { request_json: string }) | undefined;
  if (!row) return json({ error: "Not found" }, 404);
  const { request_json, ...rest } = row;
  return json({ ...rest, request: JSON.parse(request_json) });
}
