import { llm, type CallContext } from "@/lib/llm/client";

/**
 * The brand kernel is a short (~2-3k token) compiled summary of what every writing call must know.
 * It is the first block of every agent prompt, never changes between calls for the same brand,
 * and carries a cache breakpoint, so after the first call it costs a tenth of normal input or less.
 * Everything else (playbooks, personas, product detail) is retrieved per asset.
 */
const INSTRUCTIONS = `You compile a brand kernel: the always-loaded brief that every marketing writer for this brand reads before writing anything.

Use ONLY the facts provided. Where facts conflict, the provided resolutions decide. Never include a fact listed as a loser.
Copy approved wording, names and banned phrases exactly. Be dense and specific; no generic marketing advice.

Output Markdown with exactly these sections:
# Brand kernel: <company name>
## Identity: company name and how it is written, one-line description, tagline, products with current names, status and naming/first-mention rules, and former names that must not be used.
## Voice: 6-10 bullets of concrete voice rules, with a short do/don't example where the facts give one.
## Never: banned words, claims and phrases (exact strings).
## Approved wording: sentences that must be used word for word, and when.
## Customers and proof: who may be named or quoted, where (channels), with which results; who may NOT be referenced at all.
## Statistics: usable figures with source and the date they stop being usable (use the 'usable until' dates given; if a rule defines an age limit, compute the date).
## Settled conflicts: one line each, "Use X, not Y (source wins over source)".
## Authority: one line with the order of authority.
Max ~2,500 tokens.`;

export async function compileKernel(input: { governance: string; entities: string; facts: string; conflicts: string }, ctx: CallContext): Promise<string> {
  const res = await llm.text({
    step: "ingest:kernel",
    tier: "reasoner",
    effort: "medium",
    system: [{ text: INSTRUCTIONS, label: "kernel instructions" }],
    input: [
      { text: input.governance, label: "governance" },
      { text: `Entity registry (current names, status, former names):\n${input.entities}`, label: "entities" },
      { text: `Resolved conflicts:\n${input.conflicts}`, label: "conflicts" },
      { text: `Facts (highest authority first):\n${input.facts}`, label: "facts" },
    ],
    maxOutputTokens: 12_000,
    ctx,
  });
  return res.data.trim();
}
