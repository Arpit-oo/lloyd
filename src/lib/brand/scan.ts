import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Walks a brand folder and sorts files into documents, images and image metadata.
 * Nothing here knows about any particular brand: folder names are not trusted to mean anything,
 * and the brief files are excluded only if they sit in a folder literally named "briefs".
 */
export interface ScannedDoc {
  id: string; // relative path with forward slashes
  title: string;
  text: string;
  hash: string;
}

export interface ScannedImage {
  id: string;
  filename: string;
  relPath: string;
  hash: string;
}

export interface BrandScan {
  hash: string;
  docs: ScannedDoc[];
  images: ScannedImage[];
  imageMetadata: Record<string, unknown>[];
  skipped: string[];
}

const DOC_EXT = new Set([".md", ".markdown", ".txt", ".html", ".htm"]);
const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const IGNORED_DIRS = new Set(["briefs", "node_modules", ".git"]);

export function scanBrand(brandDir: string): BrandScan {
  if (!fs.existsSync(brandDir)) throw new Error(`Brand folder not found: ${brandDir}. Set BRAND_DIR in .env.`);
  const files = walk(brandDir);
  const docs: ScannedDoc[] = [];
  const images: ScannedImage[] = [];
  const imageMetadata: Record<string, unknown>[] = [];
  const skipped: string[] = [];
  const hasher = crypto.createHash("sha256");

  for (const abs of files) {
    const rel = path.relative(brandDir, abs).split(path.sep).join("/");
    const ext = path.extname(abs).toLowerCase();
    const buf = fs.readFileSync(abs);
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
    hasher.update(`${rel}:${hash}\n`);

    if (DOC_EXT.has(ext)) {
      const raw = buf.toString("utf8");
      const text = ext.startsWith(".htm") ? htmlToText(raw) : raw;
      docs.push({ id: rel, title: firstHeading(text) ?? path.basename(rel, ext), text, hash });
    } else if (IMG_EXT.has(ext)) {
      images.push({ id: path.basename(rel, ext), filename: path.basename(rel), relPath: rel, hash });
    } else if (ext === ".json") {
      const records = tryImageMetadata(buf.toString("utf8"));
      if (records) imageMetadata.push(...records);
      else skipped.push(rel);
    } else if (ext !== ".svg") {
      // SVGs have PNG twins in practice; other formats are reported, not silently dropped.
      skipped.push(rel);
    }
  }

  return { hash: hasher.digest("hex").slice(0, 12), docs, images, imageMetadata, skipped };
}

function walk(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return IGNORED_DIRS.has(e.name.toLowerCase()) || e.name.startsWith(".") ? [] : walk(p);
      return [p];
    });
}

/** A JSON file counts as image metadata if it is an array of records that name a file. */
function tryImageMetadata(raw: string): Record<string, unknown>[] | null {
  try {
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : Array.isArray(data?.images) ? data.images : null;
    if (!arr?.length) return null;
    return arr.every((r: unknown) => typeof r === "object" && r && ("filename" in r || "file" in r || "path" in r)) ? arr : null;
  } catch {
    return null;
  }
}

function firstHeading(text: string): string | null {
  return /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<h([1-4])[^>]*>/gi, (_, l) => `\n${"#".repeat(Number(l))} `)
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n");
}
