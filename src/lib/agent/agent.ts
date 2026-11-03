import { requireBrand, type Brand } from "@/lib/brand";
import { db, newId } from "@/lib/db";
import { resolveModels, type ModelSettings } from "@/lib/llm/catalog";
import { llm, type CallContext } from "@/lib/llm/client";
import { proposeMemories } from "@/lib/memory/extract";
import { markUsed, memoriesForPrompt } from "@/lib/memory/store";
import { getAttachments, linkAttachments, renderAttachments } from "./attachments";
import * as store from "./store";
import { checkBrief } from "./steps/brand-check";
import { editAsset } from "./steps/editor";
import { guardAsset, type GuardReport } from "./steps/guard";
import { readBrief } from "./steps/intake";
import { proposePlan, revisePlan } from "./steps/planner";
import { decideQuestions } from "./steps/questions";
import { routeMessage } from "./steps/router";
import { writeAsset, writerPrefix } from "./steps/writer";
import { ASSET_SCHEMAS, type AssetContent } from "./asset-types";
import type { CampaignData, PlanItem } from "./types";
import { draftText } from "@/lib/text/partial-json";

/**
 * The campaign agent. One entry point per user message; it runs the step the current state
 * allows, persists everything, and streams progress events to the UI.
 *
 * Every turn gets its own run id, so the UI can show what each answer cost.
 */
export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "message"; message: store.MessageRow }
  | { type: "asset"; assetId: string }
  /** Live text of an asset while it is being written (readable copy, not JSON). */
  | { type: "draft"; assetId: string; text: string }
  | { type: "state"; state: string }
  | { type: "done"; costUSD: number };

type Emit = (e: AgentEvent) => void;

export interface MessageOptions {
  /** Aborted when the user presses Stop. */
  signal?: AbortSignal;
  /** Files attached to this message (already uploaded and text-extracted). */
  attachmentIds?: string[];
  /** Model picker choice; saved on the campaign and used from this turn on. */
  models?: ModelSettings;
}

export async function handleMessage(campaignId: string, text: string, emit: Emit, opts: MessageOptions = {}): Promise<void> {
  const brand = requireBrand();
  const campaign = store.getCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (opts.models) store.updateCampaign(campaignId, { data: { models: opts.models } });
  const runId = newId("run");
  const ctx: CallContext = { runId, campaignId, signal: opts.signal, models: resolveModels(opts.models ?? campaign.data.models) };
  const t = new Turn(campaignId, ctx, emit);

  const files = getAttachments(opts.attachmentIds ?? []);
  if (files.length) linkAttachments(files.map((f) => f.id), campaignId);
  t.say("user", "text", { text, attachments: files.map((f) => ({ id: f.id, name: f.name, size: f.size })) });

  try {
    if (campaign.state === "new") {
      // An attached file can be the brief, or add to a typed one.
      const brief = [text, renderAttachments(files)].filter((s) => s.trim()).join("\n\n");
      await startFromBrief(brand, t, brief);
    } else {
      if (files.length) {
        const refs = [...(campaign.data.references ?? []), ...files.map((f) => ({ name: f.name, text: f.text }))];
        store.updateCampaign(campaignId, { data: { references: refs } });
      }
      const route = await routeMessage(
        { state: campaign.state, message: text, plan: campaign.data.plan, assets: store.listAssets(campaignId), recent: recentTranscript(campaignId, 8) },
        ctx,
      );
      if (route.needs_clarification) t.reply(route.needs_clarification);
      else
        switch (route.action) {
          case "answer_questions":
            await planFromAnswers(brand, t, text);
            break;
          case "use_defaults":
            await planFromAnswers(brand, t, defaultsText(t.data()));
            break;
          case "revise_plan":
            await revise(brand, t, route.instruction ?? text);
            break;
          case "approve_plan":
            await writeAll(brand, t);
            break;
          case "edit_assets":
            await edit(brand, t, route.asset_ids, route.instruction ?? text);
            break;
          case "undo_edit":
            undo(t, route.asset_ids);
            break;
          case "finish_campaign":
            await finish(brand, t);
            break;
          case "chat":
            t.reply(route.reply ?? "Got it.");
            break;
        }
    }
  } catch (err) {
    if (opts.signal?.aborted) {
      // A deliberate stop is not an error: say what was kept and leave the campaign usable.
      settleAfterStop(campaignId);
      t.reply("Stopped. Anything already written is kept; send a message to continue.");
      return;
    }
    t.reply(`Something went wrong: ${(err as Error).message}. Your work so far is saved; try again, or rephrase.`);
    throw err;
  } finally {
    emit({ type: "done", costUSD: t.cost() });
  }
}

/** After a stop mid-writing, unfinished assets are marked failed and the campaign returns to review. */
function settleAfterStop(campaignId: string) {
  const assets = store.listAssets(campaignId);
  assets.filter((a) => a.status === "writing").forEach((a) => store.setAssetStatus(a.id, a.current_version ? "ready" : "error"));
  const c = store.getCampaign(campaignId)!;
  if (c.state === "writing") store.updateCampaign(campaignId, { state: assets.length ? "review" : "plan_review" });
}

// ---------- flows ----------

async function startFromBrief(brand: Brand, t: Turn, briefText: string) {
  const today = new Date().toISOString().slice(0, 10);
  t.status("Reading the brief");
  const brief = await readBrief(brand, briefText, today, t.ctx);
  const memories = memoriesForPrompt(brand.hash);
  markUsed(memories.map((m) => m.id));
  store.updateCampaign(t.campaignId, { title: brief.title, data: { briefText, brief, memoryIds: memories.map((m) => m.id) } });

  t.status("Checking the brief against brand and legal rules");
  const brandCheck = await checkBrief(brand, brief, t.ctx);
  store.updateCampaign(t.campaignId, { data: { brandCheck } });
  if (brandCheck.length) t.say("assistant", "brand_check", { items: brandCheck });

  t.status("Deciding whether I need to ask anything");
  const questions = await decideQuestions(brand, t.data(), memories, t.ctx);
  store.updateCampaign(t.campaignId, { data: { questions } });

  if (questions.questions.length) {
    t.say("assistant", "questions", { ...questions, memoriesUsed: memories.length });
    t.setState("clarifying");
  } else {
    if (questions.assumptions.length || memories.length) t.say("assistant", "questions", { ...questions, memoriesUsed: memories.length });
    await plan(brand, t);
  }
}

async function planFromAnswers(brand: Brand, t: Turn, answers: string) {
  store.updateCampaign(t.campaignId, { data: { answers } });
  await plan(brand, t);
}

async function plan(brand: Brand, t: Turn) {
  t.status("Planning the assets");
  const p = await proposePlan(brand, t.data(), memoriesForPrompt(brand.hash), t.ctx);
  store.updateCampaign(t.campaignId, { data: { plan: p } });
  t.say("assistant", "plan", { plan: p });
  t.setState("plan_review");
}

async function revise(brand: Brand, t: Turn, request: string) {
  const before = t.data().plan;
  t.status("Updating the plan");
  const p = await revisePlan(brand, t.data(), memoriesForPrompt(brand.hash), request, t.ctx);
  store.updateCampaign(t.campaignId, { data: { plan: p } });
  t.say("assistant", "plan", { plan: p, revisedFrom: before?.items.map((i) => i.id) ?? [] });

  // After writing has happened, a plan change only writes the new items and drops removed ones.
  if (store.getCampaign(t.campaignId)!.state === "review") {
    const existing = store.listAssets(t.campaignId);
    const keep = new Set(p.items.map((i) => i.id));
    for (const a of existing) if (!keep.has(a.plan_item_id)) db().prepare("DELETE FROM assets WHERE id = ?").run(a.id);
    const added = p.items.filter((i) => !existing.some((a) => a.plan_item_id === i.id));
    if (added.length) await writeItems(brand, t, added);
  }
}

async function writeAll(brand: Brand, t: Turn) {
  const p = t.data().plan;
  if (!p) return t.reply("There's no plan to approve yet.");
  t.setState("writing");
  await writeItems(brand, t, p.items);
  t.setState("review");
}

async function writeItems(brand: Brand, t: Turn, items: PlanItem[]) {
  const data = t.data();
  const memories = memoriesForPrompt(brand.hash);
  const offset = store.listAssets(t.campaignId).length;
  const rows = items.map((item, i) => store.createAsset(t.campaignId, item.id, offset + i, item.type, item.title));
  rows.forEach((r) => t.emit({ type: "asset", assetId: r.id }));

  // Warm the cache once per asset type (kernel + campaign + playbook, with that type's output
  // schema, which is part of the cached prefix), so the parallel writers all read from it.
  t.status(`Writing ${items.length} asset${items.length > 1 ? "s" : ""}`);
  // A type with one asset gains nothing from a prewarm (it would write the same prefix itself).
  const repeated = [...new Set(items.map((i) => i.type))].filter((type) => items.filter((i) => i.type === type).length > 1);
  await Promise.all(
    repeated.map(async (type) => {
      const { system, channel } = await writerPrefix(brand, data, memories, type, t.ctx);
      await llm.prewarm({ step: `write:${type}:prewarm`, tier: "writer", system, input: [channel.block], schema: ASSET_SCHEMAS[type], schemaName: type, cacheKey: `brand:${brand.hash}`, ctx: t.ctx });
    }),
  );

  const results = await Promise.allSettled(
    items.map(async (item, i) => {
      const row = rows[i];
      const ctx = { ...t.ctx, assetId: row.id };
      const written = await writeAsset(brand, data, memories, item, ctx, throttle(250, (raw) => t.emit({ type: "draft", assetId: row.id, text: draftText(raw) })));
      const version = store.addVersion(row.id, { content: written.content, sources: written.sources });
      t.emit({ type: "asset", assetId: row.id });
      let guard = await guardAsset(brand, data, item, written.content, ctx);
      store.setVersionGuard(row.id, version, guard);
      t.emit({ type: "asset", assetId: row.id });
      if (guard.status === "block") guard = await autoFix(brand, data, memories, item, row.id, written.content, written.sources, guard, ctx, t);
      t.status(`Done: ${item.title}`);
      return guard;
    }),
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      store.setAssetStatus(rows[i].id, "error");
      t.emit({ type: "asset", assetId: rows[i].id });
    }
  });
  const guards = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  t.say("assistant", "assets", {
    count: items.length,
    failed: results.filter((r) => r.status === "rejected").map((r, i) => `${items[i].title}: ${(r as PromiseRejectedResult).reason}`),
    guard: summarizeGuards(guards),
    assetIds: rows.map((r) => r.id),
  });
}

/**
 * One targeted repair pass for blocking guard issues. The fix is a patch edit, so one bad
 * sentence does not cost a full rewrite; the result is checked again and kept as a new version.
 */
async function autoFix(
  brand: Brand,
  data: CampaignData,
  memories: ReturnType<typeof memoriesForPrompt>,
  item: PlanItem,
  assetId: string,
  content: AssetContent,
  sources: unknown,
  guard: GuardReport,
  ctx: CallContext,
  t: Turn,
): Promise<GuardReport> {
  const blocking = guard.issues.filter((i) => i.severity === "block");
  const list = blocking.map((i) => `- "${i.quote}": ${i.problem}. Rule: ${i.rule}. Fix: ${i.fix}`).join("\n");
  t.status(`Fixing ${blocking.length} issue${blocking.length > 1 ? "s" : ""} in ${item.title}`);
  try {
    const fixed = await editAsset(brand, data, memories, content, `Fix these problems found by the brand check, changing as little as possible:\n${list}`, ctx);
    const version = store.addVersion(assetId, { content: fixed.content, sources, instruction: `Automatic fix: ${blocking.map((i) => i.problem).join("; ")}` });
    const next = await guardAsset(brand, data, item, fixed.content, ctx);
    store.setVersionGuard(assetId, version, next);
    t.emit({ type: "asset", assetId });
    return next;
  } catch {
    return guard;
  }
}

async function edit(brand: Brand, t: Turn, assetIds: string[], instruction: string) {
  if (!assetIds.length) return t.reply("Which asset should I change?");
  const data = t.data();
  const memories = memoriesForPrompt(brand.hash);
  const results = await Promise.all(
    assetIds.map(async (id) => {
      const asset = store.getAsset(id);
      const current = asset && store.getVersion(id, asset.current_version);
      if (!asset || !current) return null;
      const ctx = { ...t.ctx, assetId: id };
      t.status(`Editing ${asset.title}`);
      const edited = await editAsset(brand, data, memories, current.content, instruction, ctx);
      let version = store.addVersion(id, { content: edited.content, sources: current.sources, instruction });
      const item = data.plan?.items.find((i) => i.id === asset.plan_item_id);
      let guard = item ? await guardAsset(brand, data, item, edited.content, ctx) : null;
      if (guard) store.setVersionGuard(id, version, guard);
      // An edit can introduce a problem (e.g. a punchier subject that overclaims); repair it the same way.
      if (item && guard?.status === "block") {
        guard = await autoFix(brand, data, memories, item, id, edited.content, current.sources, guard, ctx, t);
        version = store.getAsset(id)!.current_version;
      }
      t.emit({ type: "asset", assetId: id });
      return { assetId: id, title: asset.title, summary: edited.summary, version, guard: guard?.status ?? null };
    }),
  );
  t.say("assistant", "edit", { instruction, results: results.filter(Boolean) });
}

function undo(t: Turn, assetIds: string[]) {
  for (const id of assetIds) {
    const a = store.getAsset(id);
    if (a && a.current_version > 1) {
      store.setCurrentVersion(id, a.current_version - 1);
      t.emit({ type: "asset", assetId: id });
    }
  }
  t.reply(assetIds.length ? "Reverted to the previous version." : "Which asset should I revert?");
}

async function finish(brand: Brand, t: Turn) {
  t.status("Looking for things worth remembering");
  const ids = await proposeMemories(brand.hash, t.campaignId, t.data(), recentTranscript(t.campaignId, 200), t.ctx);
  t.say("assistant", "memory", { proposedIds: ids });
}

// ---------- helpers ----------

class Turn {
  constructor(
    readonly campaignId: string,
    readonly ctx: CallContext,
    readonly emit: Emit,
  ) {}

  data(): CampaignData {
    return store.getCampaign(this.campaignId)!.data;
  }
  status(text: string) {
    this.emit({ type: "status", text });
  }
  say(role: "user" | "assistant", kind: string, content: unknown) {
    const message = store.addMessage(this.campaignId, role, kind, role === "assistant" ? { ...(content as object), runId: this.ctx.runId } : content);
    this.emit({ type: "message", message });
  }
  reply(text: string) {
    this.say("assistant", "text", { text });
  }
  setState(state: "clarifying" | "plan_review" | "writing" | "review") {
    store.updateCampaign(this.campaignId, { state });
    this.emit({ type: "state", state });
  }
  cost(): number {
    return (db().prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM llm_calls WHERE run_id = ?").get(this.ctx.runId) as { c: number }).c;
  }
}

/** Calls `fn` at most every `ms`, always delivering the latest value (so the last frame is not lost). */
function throttle<T>(ms: number, fn: (v: T) => void): (v: T) => void {
  let last = 0;
  let pending: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (v: T) => {
    pending = v;
    const wait = ms - (Date.now() - last);
    if (wait <= 0) {
      last = Date.now();
      fn(v);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = undefined;
        last = Date.now();
        fn(pending as T);
      }, wait);
    }
  };
}

function defaultsText(data: CampaignData): string {
  return (data.questions?.questions ?? []).map((q) => `${q.question} -> ${q.default}`).join("\n") || "Use your defaults.";
}

function summarizeGuards(guards: GuardReport[]) {
  return {
    pass: guards.filter((g) => g.status === "pass").length,
    warn: guards.filter((g) => g.status === "warn").length,
    block: guards.filter((g) => g.status === "block").length,
  };
}

/** Compact transcript for the router and memory extractor. */
function recentTranscript(campaignId: string, n: number): string {
  return store
    .listMessages(campaignId)
    .slice(-n)
    .map((m) => {
      const c = m.content as Record<string, unknown>;
      if (m.kind === "text") return `${m.role}: ${String(c.text)}`;
      if (m.kind === "plan") return `assistant: [plan with ${(c.plan as { items: unknown[] }).items.length} assets]`;
      if (m.kind === "edit") return `assistant: [edited assets: ${(c.results as { title: string; summary: string }[]).map((r) => `${r.title}: ${r.summary}`).join("; ")}]`;
      if (m.kind === "questions") return `assistant: [asked: ${((c.questions as { question: string }[]) ?? []).map((q) => q.question).join(" | ")}]`;
      return `${m.role}: [${m.kind}]`;
    })
    .join("\n");
}

