/**
 * Smoke test for keys, models and the LLM wrapper. Run: npm run test:keys
 * Checks: each tier answers a strict JSON schema, explicit cache breakpoints + prewarm
 * produce cache hits, embeddings work, Firecrawl search works, vision captioning works.
 */
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { llm } from "@/lib/llm/client";
import { embed } from "@/lib/llm/embed";
import { modelFor, type Tier } from "@/lib/llm/models";

const runId = `test-keys-${Date.now()}`;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => console.log(`  ✗ ${msg}`);

async function tiers() {
  console.log("Tiers (strict JSON schema):");
  const schema = z.object({ answer: z.string() });
  for (const tier of ["writer", "reasoner", "fast", "bulk"] as Tier[]) {
    try {
      const r = await llm.json({ step: "test:tier", tier, system: [{ text: "Answer briefly." }], input: "Capital of France?", schema, schemaName: "a", ctx: { runId } });
      ok(`${tier.padEnd(8)} ${r.model.padEnd(16)} "${r.data.answer}" ${r.latencyMs}ms $${r.costUSD.toFixed(5)}`);
    } catch (e) {
      fail(`${tier} ${modelFor(tier)}: ${String(e).slice(0, 200)}`);
    }
  }
}

async function caching() {
  console.log("Prompt caching (explicit breakpoint + prewarm):");
  // ~3k tokens of stable prefix, unique per run so the first call is a true miss.
  const prefix = `Run ${runId}. Reference material:\n` + Array.from({ length: 300 }, (_, i) => `Rule ${i}: keep sentences short and concrete.`).join("\n");
  const system = [{ text: prefix, cache: true, label: "stable prefix" }];
  await llm.prewarm({ step: "test:cache", tier: "writer", system, cacheKey: runId, ctx: { runId } });
  ok("prewarm sent");
  const calls = await Promise.all(
    [1, 2, 3].map((n) => llm.text({ step: "test:cache", tier: "writer", system, input: `Say the number ${n}.`, cacheKey: runId, ctx: { runId } })),
  );
  for (const c of calls) {
    const hit = c.usage.cachedTokens / Math.max(1, c.usage.inputTokens);
    (hit > 0.5 ? ok : fail)(`in=${c.usage.inputTokens} cached=${c.usage.cachedTokens} write=${c.usage.cacheWriteTokens} hit=${(hit * 100).toFixed(0)}% $${c.costUSD.toFixed(5)}`);
  }
}

async function embeddings() {
  console.log("Embeddings:");
  const [v] = await embed(["containment for kubernetes"], "test:embed", { runId });
  (v.length > 100 ? ok : fail)(`${modelFor("embed")} dim=${v.length}`);
}

async function firecrawl() {
  console.log("Firecrawl:");
  const key = getConfig().FIRECRAWL_API_KEY;
  if (!key) return fail("FIRECRAWL_API_KEY not set");
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "kubernetes security incident statistics 2026", limit: 2 }),
  });
  const body = (await res.json()) as { data?: { web?: { url: string }[] } | { url: string }[] };
  const results = Array.isArray(body.data) ? body.data : body.data?.web ?? [];
  (res.ok && results.length ? ok : fail)(`status ${res.status}, ${results.length} results ${results.map((r) => r.url).join(" ")}`);
}

async function vision() {
  console.log("Vision caption:");
  const dir = path.join(getConfig().brandDir, "images");
  const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => /\.(jpe?g|png)$/i.test(f)) : undefined;
  if (!file) return fail(`no image found in ${dir}`);
  const b64 = fs.readFileSync(path.join(dir, file)).toString("base64");
  const openai = new OpenAI({ apiKey: getConfig().OPENAI_API_KEY });
  const model = modelFor("fast");
  const r = await openai.responses.create({
    model,
    store: false,
    input: [{ role: "user", content: [
      { type: "input_text", text: "Describe this image in one sentence." },
      { type: "input_image", image_url: `data:image/jpeg;base64,${b64}`, detail: "low" },
    ] }],
  });
  ok(`${model} on ${file}: ${r.output_text.slice(0, 120)} (in=${r.usage?.input_tokens})`);
}

async function main() {
  console.log(`Brand dir: ${getConfig().brandDir}\n`);
  for (const step of [tiers, caching, embeddings, firecrawl, vision]) {
    try {
      await step();
    } catch (e) {
      fail(`${step.name}: ${String(e).slice(0, 300)}`);
    }
  }
}

main();
