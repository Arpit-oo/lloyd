import { requireBrand, type Brand } from "@/lib/brand";
import { db, newId } from "@/lib/db";
import { llm, type CallContext } from "@/lib/llm/client";
import { proposeMemories } from "@/lib/memory/extract";
import { markUsed, memoriesForPrompt } from "@/lib/memory/store";
import { brandBlock, campaignBlock } from "./context";
import * as store from "./store";
import { checkBrief } from "./steps/brand-check";
import { editAsset } from "./steps/editor";
import { guardAsset, type GuardReport } from "./steps/guard";
import { readBrief } from "./steps/intake";
import { proposePlan, revisePlan } from "./steps/planner";
import { decideQuestions } from "./steps/questions";
import { routeMessage } from "./steps/router";
import { WRITER_RULES, writeAsset } from "./steps/writer";
import type { CampaignData, PlanItem } from "./types";

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
  | { type: "state"; state: string }
  | { type: "done"; costUSD: number };

type Emit = (e: AgentEvent) => void;

export async function handleMessage(campaignId: string, text: string, emit: Emit): Promise<void> {
  const brand = requireBrand();
  const campaign = store.getCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  const runId = newId("run");
  const ctx: CallContext = { runId, campaignId };
  const t = new Turn(campaignId, ctx, emit);

  t.say("user", "text", { text });

  try {
    if (campaign.state === "new") {
      await startFromBrief(brand, t, text);
    } else {
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
    t.reply(`Something went wrong: ${(err as Error).message}`);
    throw err;
  } finally {
    emit({ type: "done", costUSD: t.cost() });
  }
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

  // Write the shared prefix (brand kernel + campaign) to cache once, so the parallel writers all hit it.
  t.status(`Writing ${items.length} asset${items.length > 1 ? "s" : ""}`);
  await llm.prewarm({ step: "write:prewarm", tier: "writer", system: [brandBlock(brand, WRITER_RULES), campaignBlock(data, memories)], cacheKey: `brand:${brand.hash}`, ctx: t.ctx });

  const results = await Promise.allSettled(
    items.map(async (item, i) => {
      const row = rows[i];
      const ctx = { ...t.ctx, assetId: row.id };
      const written = await writeAsset(brand, data, memories, item, ctx);
      const version = store.addVersion(row.id, { content: written.content, sources: written.sources });
      t.emit({ type: "asset", assetId: row.id });
      const guard = await guardAsset(brand, data, item, written.content, ctx);
      store.setVersionGuard(row.id, version, guard);
      t.emit({ type: "asset", assetId: row.id });
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
      const version = store.addVersion(id, { content: edited.content, sources: current.sources, instruction });
      const item = data.plan?.items.find((i) => i.id === asset.plan_item_id);
      const guard = item ? await guardAsset(brand, data, item, edited.content, ctx) : null;
      if (guard) store.setVersionGuard(id, version, guard);
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

