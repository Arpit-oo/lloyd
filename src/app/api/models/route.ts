import { modelCatalog } from "@/lib/llm/catalog";
import { json } from "@/lib/http/sse";

/** Presets and writer models offered by the model picker, with list prices. */
export async function GET() {
  return json(modelCatalog());
}
