import { getAsset, getVersion, listVersions, setCurrentVersion } from "@/lib/agent/store";
import { db } from "@/lib/db";
import { json } from "@/lib/http/sse";

/** One asset: a version (current by default), its version list, and the model calls that produced it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) return json({ error: "Not found" }, 404);
  const v = Number(new URL(req.url).searchParams.get("version")) || asset.current_version;
  const calls = db()
    .prepare("SELECT id, step, model, input_tokens, cached_tokens, cache_write_tokens, output_tokens, cost_usd, latency_ms, created_at FROM llm_calls WHERE asset_id = ? ORDER BY created_at")
    .all(id);
  return json({ asset, version: v ? getVersion(id, v) : null, versions: listVersions(id), calls });
}

/** Switch the current version (version picker / undo). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { version } = (await req.json()) as { version: number };
  if (!getVersion(id, version)) return json({ error: "No such version" }, 400);
  setCurrentVersion(id, version);
  return json({ ok: true });
}
