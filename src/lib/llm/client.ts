import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseCreateParamsNonStreaming, ResponseInputItem } from "openai/resources/responses/responses";
import type { z } from "zod";
import { getConfig } from "@/lib/config";
import { db, newId } from "@/lib/db";
import { capsFor, modelFor, type Tier } from "./models";
import { costUSD, type TokenUsage } from "./pricing";
import { Semaphore } from "./semaphore";

/**
 * The only door to the model. Every call goes through `llm.json` / `llm.text`, which:
 *  - resolves a tier to a model and adapts params to that model's capabilities
 *  - places explicit prompt-cache breakpoints after stable blocks (brand kernel, playbooks)
 *  - enforces a per-run spend cap and a global concurrency limit
 *  - validates structured output with zod and repairs once on failure
 *  - logs the exact request, response, tokens, cache hits and cost (SQLite + logs/calls.jsonl)
 */

/** A piece of prompt text. `cache: true` puts a cache breakpoint right after it. */
export interface Block {
  text: string;
  cache?: boolean;
  /** Label shown in the inspector ("brand kernel", "linkedin playbook"...). */
  label?: string;
}

export interface CallContext {
  runId?: string;
  campaignId?: string;
  assetId?: string;
}

export type Effort = "none" | "low" | "medium" | "high";

interface BaseRequest {
  /** Pipeline step name, used for cost breakdowns ("plan", "write:linkedin", "guard"...). */
  step: string;
  tier: Tier;
  /** Developer instructions. Put stable content first so it can be cached. */
  system: Block[];
  /** Per-call content (the user turn). */
  input: Block[] | string;
  effort?: Effort;
  maxOutputTokens?: number;
  /** Groups requests that share a prefix, for cache routing and accounting. */
  cacheKey?: string;
  ctx?: CallContext;
}

export interface LLMResult<T> {
  data: T;
  callId: string;
  model: string;
  usage: TokenUsage;
  costUSD: number;
  latencyMs: number;
}

export class BudgetExceededError extends Error {}

const globalForLlm = globalThis as unknown as {
  __openai?: OpenAI;
  __llmSem?: Semaphore;
  __runSpend?: Map<string, number>;
};

function client(): OpenAI {
  globalForLlm.__openai ??= new OpenAI({ apiKey: getConfig().OPENAI_API_KEY, maxRetries: 3, timeout: 180_000 });
  return globalForLlm.__openai;
}

function semaphore(): Semaphore {
  globalForLlm.__llmSem ??= new Semaphore(getConfig().LLM_CONCURRENCY);
  return globalForLlm.__llmSem;
}

function runSpend(): Map<string, number> {
  globalForLlm.__runSpend ??= new Map();
  return globalForLlm.__runSpend;
}

export function spentInRun(runId: string): number {
  return runSpend().get(runId) ?? 0;
}

// ---------- request building ----------

function toContent(blocks: Block[], explicitCache: boolean) {
  return blocks.map((b) => ({
    type: "input_text" as const,
    text: b.text,
    ...(explicitCache && b.cache ? { prompt_cache_breakpoint: { mode: "explicit" as const } } : {}),
  }));
}

function buildParams(req: BaseRequest, model: string, extra: Partial<ResponseCreateParamsNonStreaming> = {}) {
  const caps = capsFor(model);
  const userBlocks: Block[] = typeof req.input === "string" ? [{ text: req.input }] : req.input;
  const anyBreakpoint = [...req.system, ...userBlocks].some((b) => b.cache);

  const input: ResponseInputItem[] = [];
  if (req.system.length) input.push({ role: "developer", content: toContent(req.system, caps.explicitCache) });
  input.push({ role: "user", content: toContent(userBlocks, caps.explicitCache) });

  const params: ResponseCreateParamsNonStreaming = {
    model,
    input,
    store: false,
    ...(req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {}),
    ...(caps.reasoning ? { reasoning: { effort: req.effort ?? "low" } } : {}),
    ...(req.cacheKey ? { prompt_cache_key: req.cacheKey } : {}),
    // Explicit mode only when the caller marked stable blocks; otherwise the default implicit mode.
    ...(caps.explicitCache && anyBreakpoint ? { prompt_cache_options: { mode: "explicit" } } : {}),
    ...extra,
  };
  return params;
}

// ---------- public API ----------

/** Structured call: the response is validated against `schema`. */
async function json<S extends z.ZodType>(
  req: BaseRequest & { schema: S; schemaName: string },
): Promise<LLMResult<z.infer<S>>> {
  const model = modelFor(req.tier);
  const format = zodTextFormat(req.schema, req.schemaName);
  const params = buildParams(req, model, { text: { format } });

  try {
    return await execute(req, model, params, (text) => req.schema.parse(JSON.parse(text)));
  } catch (err) {
    if (err instanceof BudgetExceededError || !isParseError(err)) throw err;
    // One repair attempt: show the model its own output and the validation error.
    const repair = buildParams(
      { ...req, step: `${req.step}:repair`, input: [...asBlocks(req.input), { text: `Your previous output failed validation: ${String(err).slice(0, 800)}. Return valid JSON for the schema.` }] },
      model,
      { text: { format } },
    );
    return execute({ ...req, step: `${req.step}:repair` }, model, repair, (text) => req.schema.parse(JSON.parse(text)));
  }
}

/** Free-text call. */
async function text(req: BaseRequest): Promise<LLMResult<string>> {
  const model = modelFor(req.tier);
  return execute(req, model, buildParams(req, model), (t) => t);
}

/**
 * Writes the cache for a shared prefix without generating output (GPT-5.6+), so a
 * following fan-out of parallel calls all read from cache instead of all missing.
 * No-op on models without explicit caching.
 */
async function prewarm(req: Omit<BaseRequest, "input"> & { input?: Block[] | string }): Promise<void> {
  const model = modelFor(req.tier);
  if (!capsFor(model).explicitCache) return;
  const params = buildParams({ ...req, step: `${req.step}:prewarm`, input: req.input ?? "." }, model, {
    prompt_cache_options: { mode: "explicit", prewarm: true },
  });
  await execute({ ...req, step: `${req.step}:prewarm`, input: req.input ?? "." }, model, params, (t) => t);
}

export const llm = { json, text, prewarm };

// ---------- execution + logging ----------

async function execute<T>(
  req: BaseRequest,
  model: string,
  params: ResponseCreateParamsNonStreaming,
  parse: (text: string) => T,
): Promise<LLMResult<T>> {
  const { MAX_USD_PER_RUN } = getConfig();
  const runId = req.ctx?.runId;
  if (runId && spentInRun(runId) >= MAX_USD_PER_RUN) {
    throw new BudgetExceededError(`Run ${runId} hit the $${MAX_USD_PER_RUN} cap (MAX_USD_PER_RUN).`);
  }

  const callId = newId("call");
  const started = Date.now();
  let responseText: string | null = null;
  let usage: TokenUsage = { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };

  try {
    const res = await semaphore().run(() => client().responses.create(params));
    responseText = res.output_text ?? "";
    usage = readUsage(res.usage);
    if (res.status === "incomplete") {
      throw new Error(`Response incomplete: ${res.incomplete_details?.reason ?? "unknown"} (raise maxOutputTokens?)`);
    }
    const data = parse(responseText);
    const cost = costUSD(model, usage);
    log({ callId, req, model, params, responseText, usage, cost, started, status: "ok" });
    return { data, callId, model, usage, costUSD: cost, latencyMs: Date.now() - started };
  } catch (err) {
    log({ callId, req, model, params, responseText, usage, cost: costUSD(model, usage), started, status: "error", error: String(err) });
    throw err;
  }
}

function readUsage(u: OpenAI.Responses.ResponseUsage | undefined): TokenUsage {
  const details = u?.input_tokens_details as { cached_tokens?: number; cache_write_tokens?: number } | undefined;
  return {
    inputTokens: u?.input_tokens ?? 0,
    cachedTokens: details?.cached_tokens ?? 0,
    cacheWriteTokens: details?.cache_write_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    reasoningTokens: u?.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

function log(e: {
  callId: string;
  req: BaseRequest;
  model: string;
  params: ResponseCreateParamsNonStreaming;
  responseText: string | null;
  usage: TokenUsage;
  cost: number;
  started: number;
  status: "ok" | "error";
  error?: string;
}) {
  const ctx = e.req.ctx ?? {};
  if (ctx.runId) runSpend().set(ctx.runId, spentInRun(ctx.runId) + e.cost);
  const latency = Date.now() - e.started;
  const request = { ...e.params, _labels: blockLabels(e.req) };

  db()
    .prepare(
      `INSERT INTO llm_calls (id, run_id, campaign_id, asset_id, step, model, request_json, response_text, status, error,
        input_tokens, cached_tokens, cache_write_tokens, output_tokens, reasoning_tokens, cost_usd, latency_ms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      e.callId, ctx.runId ?? null, ctx.campaignId ?? null, ctx.assetId ?? null, e.req.step, e.model,
      JSON.stringify(request), e.responseText, e.status, e.error ?? null,
      e.usage.inputTokens, e.usage.cachedTokens, e.usage.cacheWriteTokens, e.usage.outputTokens, e.usage.reasoningTokens,
      e.cost, latency,
    );

  const { logsDir } = getConfig();
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(
    path.join(logsDir, "calls.jsonl"),
    JSON.stringify({ id: e.callId, at: new Date().toISOString(), step: e.req.step, model: e.model, ...ctx, status: e.status, error: e.error, usage: e.usage, costUSD: e.cost, latencyMs: latency, request, response: e.responseText }) + "\n",
  );
}

/** Labels of the blocks, in prompt order, so the inspector can show which part is which. */
function blockLabels(req: BaseRequest) {
  return [...req.system.map((b) => ({ role: "developer", label: b.label, cache: !!b.cache, chars: b.text.length })),
    ...asBlocks(req.input).map((b) => ({ role: "user", label: b.label, cache: !!b.cache, chars: b.text.length }))];
}

function asBlocks(input: Block[] | string): Block[] {
  return typeof input === "string" ? [{ text: input }] : input;
}

function isParseError(err: unknown): boolean {
  const name = (err as Error)?.name;
  return err instanceof SyntaxError || name === "ZodError" || /incomplete/i.test(String(err));
}
