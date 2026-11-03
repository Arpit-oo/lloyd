import { db, newId } from "@/lib/db";
import { extractBuffer } from "@/lib/brand/loaders";
import type { StyleRequest } from "./design";
import { analyzeDesign } from "./references";

/**
 * Files the marketer attaches in chat. Text is extracted once on upload and stored; the agent
 * reads the text, never the file. On a new campaign an attached file can be the brief itself;
 * later it becomes reference material in the campaign block.
 */
export interface Attachment {
  id: string;
  campaign_id: string | null;
  name: string;
  size: number;
  text: string;
  /** document: text was extracted. image: a design reference, described by a vision model. */
  kind: "document" | "image";
  style_json: string | null;
  created_at: string;
}

const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
export const isImageName = (name: string) => Object.keys(IMAGE_MIME).some((ext) => name.toLowerCase().endsWith(ext));

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Per-file text kept for prompts (~8k tokens); longer files are truncated with a note. */
const MAX_CHARS = 32_000;

export async function saveAttachment(name: string, buf: Buffer): Promise<Omit<Attachment, "text" | "style_json"> & { chars: number; truncated: boolean }> {
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) throw new Error(`${name} is larger than 10 MB`);
  if (isImageName(name)) {
    // An image is a design reference: describe it once, on upload.
    const ext = Object.keys(IMAGE_MIME).find((e) => name.toLowerCase().endsWith(e))!;
    const ref = await analyzeDesign(name, `data:${IMAGE_MIME[ext]};base64,${buf.toString("base64")}`, "Image the marketer attached as a reference", {});
    const id = newId("att");
    db().prepare("INSERT INTO attachments (id, name, size, text, kind, style_json) VALUES (?,?,?,?,?,?)").run(id, name, buf.byteLength, ref.text, "image", JSON.stringify(ref.style ?? null));
    return { id, campaign_id: null, name, size: buf.byteLength, kind: "image", created_at: new Date().toISOString(), chars: ref.text.length, truncated: false };
  }
  const full = (await extractBuffer(name, buf)).trim();
  if (!full) throw new Error(`${name} has no readable text (a scanned PDF?)`);
  const truncated = full.length > MAX_CHARS;
  const text = truncated ? `${full.slice(0, MAX_CHARS)}\n\n[Truncated: the file continues beyond this point.]` : full;
  const id = newId("att");
  db().prepare("INSERT INTO attachments (id, name, size, text) VALUES (?,?,?,?)").run(id, name, buf.byteLength, text);
  return { id, campaign_id: null, name, size: buf.byteLength, kind: "document", created_at: new Date().toISOString(), chars: full.length, truncated };
}

export function getAttachments(ids: string[]): Attachment[] {
  if (!ids.length) return [];
  return db().prepare(`SELECT * FROM attachments WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as Attachment[];
}

export function linkAttachments(ids: string[], campaignId: string) {
  const stmt = db().prepare("UPDATE attachments SET campaign_id = ? WHERE id = ?");
  db().transaction(() => ids.forEach((id) => stmt.run(campaignId, id)))();
}

/** Attachments as campaign references (images carry the design they suggest). */
export function toReferences(files: Attachment[]): { name: string; kind: "document" | "image"; text: string; style?: StyleRequest }[] {
  return files.map((f) => ({ name: f.name, kind: f.kind ?? "document", text: f.text, ...(f.style_json && f.style_json !== "null" ? { style: JSON.parse(f.style_json) as StyleRequest } : {}) }));
}

export function renderAttachments(files: Pick<Attachment, "name" | "text">[]): string {
  return files.map((f) => `--- Attached file: ${f.name} ---\n${f.text}`).join("\n\n");
}
