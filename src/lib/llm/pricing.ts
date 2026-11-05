/**
 * USD per 1M tokens, standard tier, short context.
 * Source: https://developers.openai.com/api/docs/pricing (checked 2026-11-02).
 * cacheWrite is the 30-minute write rate; models without explicit caching bill writes as plain input.
 */
interface Price {
  input: number;
  cachedInput: number;
  output: number;
  cacheWrite?: number;
}

const PRICES: Record<string, Price> = {
  "gpt-6.1-sol": { input: 2.0, cachedInput: 0.1, output: 10.0, cacheWrite: 2.5 },
  "gpt-6.1-terra": { input: 1.0, cachedInput: 0.05, output: 5.0, cacheWrite: 1.25 },
  "gpt-6-sol": { input: 2.0, cachedInput: 0.2, output: 10.0, cacheWrite: 2.5 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5, cacheWrite: 0.125 },
  "gpt-6-astra": { input: 10.0, cachedInput: 1.0, output: 50.0, cacheWrite: 12.5 },
  "gpt-5.6-sol": { input: 4.0, cachedInput: 0.4, output: 20.0, cacheWrite: 5.0 },
  "gpt-5.6-terra": { input: 2.0, cachedInput: 0.2, output: 12.0, cacheWrite: 2.5 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2, cacheWrite: 0.25 },
  "gpt-5.5": { input: 5.0, cachedInput: 0.5, output: 30.0 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15.0 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "text-embedding-3-small": { input: 0.02, cachedInput: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, cachedInput: 0.13, output: 0 },
};

export interface TokenUsage {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

/** List price per 1M tokens (input / cached input / output), or null for an unknown model. */
export function priceOf(model: string): { input: number; cachedInput: number; output: number } | null {
  const p = lookup(model);
  return p ? { input: p.input, cachedInput: p.cachedInput, output: p.output } : null;
}

/** Cost in USD. Unknown models return 0 and are flagged by the caller. */
export function costUSD(model: string, u: TokenUsage): number {
  const p = lookup(model);
  if (!p) return 0;
  const uncached = Math.max(0, u.inputTokens - u.cachedTokens - u.cacheWriteTokens);
  const writeRate = p.cacheWrite ?? p.input;
  // Reasoning tokens are already included in outputTokens.
  return (
    (uncached * p.input + u.cachedTokens * p.cachedInput + u.cacheWriteTokens * writeRate + u.outputTokens * p.output) /
    1_000_000
  );
}

function lookup(model: string): Price | undefined {
  if (PRICES[model]) return PRICES[model];
  // Dated snapshots ("gpt-5.4-mini-2026-03-17") price like their base model.
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return PRICES[base];
}
