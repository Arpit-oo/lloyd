import { json } from "@/lib/http/sse";
import { deleteMemory, updateMemory, type Memory } from "@/lib/memory/store";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  updateMemory(id, (await req.json()) as Partial<Pick<Memory, "text" | "type" | "status" | "pinned">>);
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteMemory(id);
  return json({ ok: true });
}
