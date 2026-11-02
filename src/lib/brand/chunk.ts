/**
 * Splits a markdown document into section chunks that follow its heading structure.
 * Each chunk keeps its heading breadcrumb ("Approved claims > 4. Certification status"),
 * because a rule read without its heading often loses its scope.
 * Oversized sections are split on paragraph boundaries; tables are never split mid-row.
 */
export interface Chunk {
  ord: number;
  headingPath: string;
  text: string;
  tokens: number;
}

const MAX_TOKENS = 700;
const MIN_TOKENS = 40;

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export function chunkMarkdown(markdown: string, docTitle: string): Chunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: { path: string[]; body: string[] }[] = [];
  const stack: string[] = [];
  let current = { path: [docTitle], body: [] as string[] };
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      if (current.body.join("").trim()) sections.push(current);
      const level = m[1].length;
      stack.length = level - 1;
      stack[level - 1] = m[2].trim();
      current = { path: [docTitle, ...stack.filter(Boolean)].filter((v, i, a) => a.indexOf(v) === i), body: [line] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join("").trim()) sections.push(current);

  const chunks: Chunk[] = [];
  let pending: { path: string; text: string } | null = null;
  const push = (path: string, text: string) => {
    const t = text.trim();
    if (t) chunks.push({ ord: chunks.length, headingPath: path, text: t, tokens: estimateTokens(t) });
  };

  for (const s of sections) {
    const path = s.path.join(" > ");
    const text = s.body.join("\n").trim();
    // A tiny section (a heading with one line) is folded forward into the next one.
    // The next section's breadcrumb is kept because it is the more specific one;
    // the tiny section's heading line survives inside the text.
    if (pending && estimateTokens(pending.text) < MIN_TOKENS) {
      pending = { path, text: `${pending.text}\n\n${text}` };
      continue;
    }
    if (pending) push(pending.path, pending.text);
    pending = { path, text };
  }
  if (pending) push(pending.path, pending.text);

  return chunks.flatMap((c) => (c.tokens > MAX_TOKENS ? splitLarge(c) : [c])).map((c, i) => ({ ...c, ord: i }));
}

function splitLarge(c: Chunk): Chunk[] {
  // Paragraph blocks; consecutive table rows stay together as one block.
  const blocks = c.text.split(/\n{2,}/);
  const out: Chunk[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join("\n\n");
    out.push({ ord: 0, headingPath: c.headingPath, text, tokens: estimateTokens(text) });
    buf = [];
  };
  for (const b of blocks) {
    if (estimateTokens([...buf, b].join("\n\n")) > MAX_TOKENS && buf.length) flush();
    buf.push(b);
  }
  flush();
  // Repeat the heading line on continuation chunks so each stands alone.
  return out.map((o, i) => (i === 0 ? o : { ...o, text: `(${c.headingPath}, continued)\n\n${o.text}` }));
}
