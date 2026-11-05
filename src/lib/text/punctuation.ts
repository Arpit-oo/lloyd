/**
 * Plain, human punctuation for published copy. Models lean on em dashes ("a clear destination—not
 * vague promises"), which reads as machine-written; marketers asked for none. Replaced
 * deterministically after every write and edit, so no prompt has to be trusted with it.
 * Only the dashes change: the text around them (abbreviations, code, line breaks) is left alone.
 */
export function humanizePunctuation(s: string): string {
  if (!/[—–]/.test(s)) return s;
  return (
    s
      // Ranges keep a plain hyphen: "2–3 weeks", "9am—5pm", "Q3–Q4", "2024–present".
      .replace(/(\d(?:am|pm)?)[ \t]*[–—][ \t]*(\d)/gi, "$1-$2")
      .replace(/(\S)–(\S)/g, "$1-$2")
      // A dash at the start of a line is a list marker.
      .replace(/^([ \t]*)[—–]+[ \t]*/gm, "$1- ")
      // A dash at the end of a line, or next to other punctuation, is dropped.
      .replace(/[ \t]*[—–]+[ \t]*$/gm, "")
      .replace(/[ \t]*[—–]+[ \t]*(?=[.,;:!?)"”’])/g, "")
      .replace(/([.,;:!?(“"])[ \t]*[—–]+[ \t]*/g, "$1 ")
      // Any other em or en dash used as punctuation becomes a comma.
      .replace(/[ \t]*[—–]+[ \t]*/g, ", ")
  );
}

/** Keys whose values are identifiers, links, addresses, code or whole pages, never copy. */
const SKIP_KEYS = new Set(["url", "href", "src", "link", "url_path", "image_id", "id", "handle", "from_address", "code", "html", "freeformPrompt"]);

/** Applies humanizePunctuation to every copy string in a JSON value. */
export function humanizeContent<T>(value: T): T {
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === "string") return key && SKIP_KEYS.has(key) ? v : humanizePunctuation(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, key && SKIP_KEYS.has(key) ? x : walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}
