import { currentBrandHash } from "@/lib/brand";
import { ingestBrand, REDOABLE, resetSteps, type RedoStep } from "@/lib/brand/ingest";
import { sseResponse } from "@/lib/http/sse";

/**
 * Re-runs selected ingest steps (default: conflict resolution, names and kernel), e.g. after
 * the user changed the authority order. Streams progress like the first-run ingest.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { steps?: RedoStep[] };
  const steps = (body.steps ?? ["conflicts", "entities", "kernel"]).filter((s) => REDOABLE.includes(s));
  return sseResponse(async (send) => {
    resetSteps(currentBrandHash(), steps);
    const summary = await ingestBrand((e) => send({ type: "progress", ...e }));
    send({ type: "done", summary });
  });
}
