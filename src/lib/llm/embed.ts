import OpenAI from "openai";
import { getConfig } from "@/lib/config";
import { db, newId } from "@/lib/db";
import { modelFor } from "./models";
import { costUSD } from "./pricing";
import type { CallContext } from "./client";

const BATCH = 256;

/** Embeds texts in batches. Logged as one llm_calls row per batch (no request body: it is just the texts). */
export async function embed(texts: string[], step: string, ctx: CallContext = {}): Promise<Float32Array[]> {
  const model = modelFor("embed");
  const openai = new OpenAI({ apiKey: getConfig().OPENAI_API_KEY, maxRetries: 3 });
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.slice(0, 24_000) || " ");
    const started = Date.now();
    const res = await openai.embeddings.create({ model, input: batch });
    const tokens = res.usage.prompt_tokens;
    const cost = costUSD(model, { inputTokens: tokens, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 });
    db()
      .prepare(
        `INSERT INTO llm_calls (id, run_id, campaign_id, step, model, request_json, status, input_tokens, cost_usd, latency_ms)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(newId("call"), ctx.runId ?? null, ctx.campaignId ?? null, step, model, JSON.stringify({ model, inputs: batch.length }), "ok", tokens, cost, Date.now() - started);
    for (const d of res.data) out.push(Float32Array.from(d.embedding));
  }
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
