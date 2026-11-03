/**
 * Readable text from a structured-output stream that is still being written, e.g.
 *   {"subject":"Contain first","blocks":[{"kind":"paragraph","text":"Most teams can se
 * becomes "Contain first\n\nMost teams can se". Only the copy is kept: string values of fields
 * that carry text, in order, including the last unterminated one. Ids, urls, kinds and alt text
 * are skipped so the live draft reads like the asset, not like JSON.
 */
const SKIP_KEYS = new Set(["kind", "image_id", "url", "alt", "author_kind", "from_address", "url_path", "handle", "date", "publish_date", "label"]);

export function draftText(raw: string): string {
  const out: string[] = [];
  const re = /"([a-zA-Z_]+)"\s*:\s*"((?:[^"\\]|\\.)*)("?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const [, key, value] = m;
    if (SKIP_KEYS.has(key) || !value.trim()) continue;
    out.push(unescape(value));
  }
  return out.join("\n\n");
}

function unescape(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "  ")
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, "$1");
}
