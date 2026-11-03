import { currentBrandHash } from "@/lib/brand";
import { setUserTier } from "@/lib/brand/ingest";
import { json } from "@/lib/http/sse";

/** Move a document to another authority tier. Takes effect for conflicts after "Re-resolve". */
export async function PATCH(req: Request) {
  const { docId, tier } = (await req.json()) as { docId: string; tier: number };
  if (!docId || !Number.isInteger(tier) || tier < 1) return json({ error: "docId and a positive integer tier are required" }, 400);
  setUserTier(currentBrandHash(), docId, tier);
  return json({ ok: true });
}
