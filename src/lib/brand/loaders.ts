import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { ScannedDoc } from "./scan";

/**
 * Text extraction for binary brand documents. DOCX goes through HTML so its headings survive
 * as Markdown headings (chunking follows headings); PDF pages become "## Page n" sections.
 * A file that fails to extract is reported, not silently dropped.
 */
export interface BinaryDoc {
  id: string;
  abs: string;
  hash: string;
}

export async function loadBinaryDocs(files: BinaryDoc[]): Promise<{ docs: ScannedDoc[]; failed: string[] }> {
  const docs: ScannedDoc[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      const text = await extract(f.abs);
      if (!text.trim()) throw new Error("no text (scanned image PDF?)");
      docs.push({ id: f.id, title: /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? path.basename(f.id, path.extname(f.id)), text, hash: f.hash });
    } catch (err) {
      failed.push(`${f.id}: ${(err as Error).message}`);
    }
  }
  return { docs, failed };
}

async function extract(file: string): Promise<string> {
  return extractBuffer(path.basename(file), fs.readFileSync(file));
}

const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".csv", ".json", ".yaml", ".yml"]);

/**
 * Text from an in-memory file (brand ingest and chat attachments share this). Supports PDF, DOCX,
 * HTML and plain-text formats; anything else throws with the reason.
 */
export async function extractBuffer(name: string, buf: Buffer): Promise<string> {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext);
  if (ext === ".pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = text.map((t, i) => `## Page ${i + 1}\n\n${t.trim()}`);
    return `# ${base}\n\n${pages.join("\n\n")}`;
  }
  if (ext === ".docx") {
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return htmlToMarkdownish(value);
  }
  if (ext === ".html" || ext === ".htm") return htmlToMarkdownish(buf.toString("utf8"));
  if (TEXT_EXT.has(ext)) return buf.toString("utf8");
  throw new Error(`unsupported file type ${ext || "(none)"}`);
}

/** Minimal HTML → Markdown that keeps headings, list items and paragraphs. */
export function htmlToMarkdownish(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<h([1-4])[^>]*>/gi, (_, l) => `\n\n${"#".repeat(Number(l))} `)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h\d|tr|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
