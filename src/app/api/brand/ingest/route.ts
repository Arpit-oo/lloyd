import { ingestBrand } from "@/lib/brand/ingest";
import { sseResponse } from "@/lib/http/sse";

/** Builds the brand index (or loads it from cache) and streams progress to the first-run screen. */
export async function POST() {
  return sseResponse(async (send) => {
    const summary = await ingestBrand((e) => send({ type: "progress", ...e }));
    send({ type: "done", summary });
  });
}
