import fs from "node:fs";
import path from "node:path";
import { getBrand } from "@/lib/brand";
import { getConfig } from "@/lib/config";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/** Serves a library image by id. Only files registered in the brand index can be served. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getBrand()?.db.prepare("SELECT filename FROM images WHERE id = ?").get(id) as { filename: string } | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  const file = path.join(getConfig().brandDir, row.filename);
  return new Response(fs.readFileSync(file), {
    headers: { "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "max-age=3600" },
  });
}
