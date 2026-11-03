import { saveAttachment } from "@/lib/agent/attachments";
import { json } from "@/lib/http/sse";

/** Chat attachments: multipart upload, text extracted immediately so errors show before sending. */
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return json({ error: "No files" }, 400);
  const results = await Promise.all(
    files.map(async (f) => {
      try {
        return { ok: true as const, ...(await saveAttachment(f.name, Buffer.from(await f.arrayBuffer()))) };
      } catch (err) {
        return { ok: false as const, name: f.name, error: (err as Error).message };
      }
    }),
  );
  return json(results);
}
