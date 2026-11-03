import { currentBrandHash } from "@/lib/brand";
import { json } from "@/lib/http/sse";
import { addMemory, listMemories, type MemoryType } from "@/lib/memory/store";

export async function GET() {
  return json(listMemories(currentBrandHash(), ["active", "proposed", "archived"]));
}

/** A memory written by the user in the panel is active immediately. */
export async function POST(req: Request) {
  const { text, type, allBrands } = (await req.json()) as { text: string; type: MemoryType; allBrands?: boolean };
  const id = addMemory({ brandHash: allBrands ? null : currentBrandHash(), type, text, status: "active", evidence: "Added by the user" });
  return json({ id }, 201);
}
