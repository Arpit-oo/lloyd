import { requireBrand, type Brand } from "@/lib/brand";
import { db, newId } from "@/lib/db";
import { resolveModels, type ModelSettings } from "@/lib/llm/catalog";
import { llm, type CallContext } from "@/lib/llm/client";
import { proposeMemories } from "@/lib/memory/extract";
import { markUsed, memoriesForPrompt } from "@/lib/memory/store";
import { getAttachments, linkAttachments, renderAttachments, toReferences } from "./attachments";
import { mergeStyle } from "./design";
import { readNewLinks, referenceUrls, type Reference } from "./references";
import { brandLook } from "./steps/editor";
import * as store from "./store";
import { checkBrief } from "./steps/brand-check";
import { CONFIRM_REPLIES } from "./confirm";
import { editAsset } from "./steps/editor";
import { checkEditRequest } from "./steps/request-check";
import { generateFreeform } from "./steps/freeform";
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
  /** Display name of the person who sent it (shared chats show who said what). */
  author?: string;
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
  t.say("user", "text", { text, attachments: files.map((f) => ({ id: f.id, name: f.name, size: f.size })), ...(opts.author ? { author: opts.author } : {}) });

  try {
    // References: images and links always; documents too once the brief is in (before that, a
    // document is the brief). Links are read now, so every later step can use them.
    const docs = files.filter((f) => f.kind !== "image");
    const refs: Reference[] = toReferences(campaign.state === "new" ? files.filter((f) => f.kind === "image") : files);
    const urls = referenceUrls(text);
    if (urls.length) {
      t.status(`Reading ${urls.length > 1 ? `${urls.length} reference links` : "the reference link"}`);
      const { pages, failed } = await readNewLinks(urls, campaign.data.references ?? [], ctx);
      refs.push(...pages);
      if (failed.length) t.reply(`I couldn't open ${failed.join(", ")}, so I'll work without ${failed.length > 1 ? "them" : "it"}.`);
    }
    if (refs.length) {
      const designed = [...refs].reverse().find((r) => r.style);
      store.updateCampaign(campaignId, {
        data: { references: [...(campaign.data.references ?? []), ...refs], ...(designed ? { referenceStyle: designed.style } : {}) },
      });
      t.status(`Using ${refs.length} reference${refs.length > 1 ? "s" : ""}: ${refs.map((r) => r.name).join(", ").slice(0, 120)}`);
    }

    if (campaign.state === "new") {
      // An attached document can be the brief, or add to a typed one.
      const brief = [text, renderAttachments(docs)].filter((s) => s.trim()).join("\n\n");
      if (!brief.trim()) {
        // Only images: keep them as references and ask for the brief itself.
        t.reply("Got your reference. Now tell me about the campaign: paste or attach the brief, or describe what you're launching, for whom, and which assets you need.");
        return;
      }
      await startFromBrief(brand, t, brief);
    } else {
      // A reply to "this goes against the brand, are you sure?"
      const pending = campaign.data.pendingEdit;
      if (pending) {
        store.updateCampaign(campaignId, { data: { pendingEdit: null } });
        const reply = confirmIntent(text);
        if (reply === "yes") {
          const titles = pending.assetIds.map((id) => store.getAsset(id)?.title).filter(Boolean).join(", ");
          store.updateCampaign(campaignId, { data: { voiceOverrides: [...(campaign.data.voiceOverrides ?? []), `"${pending.instruction}" (for: ${titles}; overrides: ${pending.conflicts.map((c) => c.rule).join("; ")})`] } });
          await edit(brand, t, pending.assetIds, `${pending.instruction}\n\nThe marketer was warned this goes against the brand and confirmed. Apply it fully and visibly in this asset: rewrite as much as needed so the change is obvious. Only legal rules, forbidden claims, names and facts still limit it.`, { confirmed: true, label: `${pending.instruction} (confirmed against brand voice)` });
          return;
        }
        if (reply === "partial") {
          await edit(brand, t, pending.assetIds, `${pending.instruction}\n\nApply this only where the brand's rules and the campaign constraints allow. Where they don't, leave that part out and say so plainly in the summary.`, { confirmed: true, label: `${pending.instruction} (only where the brand allows)` });
          return;
        }
        if (reply === "no") {
          t.reply("OK, I left the assets as they were.");
          return;
        }
        // Anything else: drop the question and treat it as a new message.
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

const WEB_TYPES = new Set(["landing_page", "blog_post", "email"]);

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
      // Web pages and emails start from the design of the marketer's reference, if they sent one.
      const refStyle = data.referenceStyle && WEB_TYPES.has(item.type) ? mergeStyle(undefined, data.referenceStyle, brandLook(brand)) : undefined;
      if (refStyle) written.content = { ...written.content, style: refStyle };
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

async function edit(brand: Brand, t: Turn, assetIds: string[], instruction: string, opts: { confirmed?: boolean; label?: string } = {}) {
  // What the version history and chat show: the marketer's request, not internal instructions.
  const label = opts.label ?? instruction;
  if (!assetIds.length) return t.reply("Which asset should I change?");
  // Guard rail: ask before anything that goes against the brand or is unusual for it.
  if (!opts.confirmed) {
    t.status("Checking the request against the brand's rules");
    const assets = assetIds.map((id) => store.getAsset(id)).filter((a): a is NonNullable<typeof a> => !!a);
    const check = await checkEditRequest(brand, t.data(), instruction, assets.map((a) => ({ title: a.title, type: a.type })), t.ctx);
    if (check.verdict === "confirm") {
      store.updateCampaign(t.campaignId, { data: { pendingEdit: { instruction, assetIds, conflicts: check.conflicts } } });
      t.say("assistant", "confirm", { question: check.question, conflicts: check.conflicts, instruction });
      return;
    }
  }
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
      // A free-form page is its own HTML: template design settings don't apply to it, so every
      // chat edit (copy or design) redraws the page with that change and the latest copy.
      if (current.content.html) {
        t.status(`Redrawing the free-form design of ${asset.title}`);
        const { style: _ignored, ...keep } = edited.content;
        void _ignored;
        const redraw = await generateFreeform(brand, t.data(), keep as AssetContent, current.content.freeformPrompt ?? "", ctx, { html: current.content.html, change: instruction });
        edited.content = { ...keep, html: redraw.html, ...(current.content.style ? { style: current.content.style } : {}) } as AssetContent;
        edited.summary = `${redraw.summary} (Free-form design: the brand's look is not enforced.)`;
      }
      // Nothing changed (e.g. the request didn't apply): say so without making an identical version.
      if (JSON.stringify(edited.content) === JSON.stringify(current.content)) {
        return { assetId: id, title: asset.title, summary: edited.summary, version: asset.current_version, guard: (current.guard as { status?: string } | null)?.status ?? null };
      }
      let version = store.addVersion(id, { content: edited.content, sources: current.sources, instruction: label });
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
  t.say("assistant", "edit", { instruction: label, results: results.filter(Boolean) });
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
      if (m.kind === "confirm") return `assistant: [asked to confirm an off-brand edit: ${String(c.question ?? "")}]`;
      if (m.kind === "questions") return `assistant: [asked: ${((c.questions as { question: string }[]) ?? []).map((q) => q.question).join(" | ")}]`;
      return `${m.role}: [${m.kind}]`;
    })
    .join("\n");
}

/**
 * Free-form design for one asset (opted into past a warning in the UI), or back to the template
 * (`reset`). Runs as a normal turn: progress streams to watchers, the result is a new version
 * that the guard checks as displayed, and the chat records what happened.
 */
export async function applyFreeform(
  campaignId: string,
  assetId: string,
  opts: { direction: string; reset: boolean; author?: string },
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  const brand = requireBrand();
  const campaign = store.getCampaign(campaignId);
  const asset = store.getAsset(assetId);
  const current = asset && store.getVersion(assetId, asset.current_version);
  if (!campaign || !asset || !current) throw new Error("Asset not found");
  const runId = newId("run");
  const ctx: CallContext = { runId, campaignId, assetId, signal, models: resolveModels(campaign.data.models) };
  const t = new Turn(campaignId, ctx, emit);
  const instruction = opts.reset ? "Back to the brand template" : `Free-form design: ${opts.direction}`;
  t.say("user", "text", { text: opts.reset ? `Put ${asset.title} back on the brand template.` : `Free-form design for ${asset.title}: ${opts.direction}`, attachments: [], ...(opts.author ? { author: opts.author } : {}) });

  let content: AssetContent;
  let summary: string;
  if (opts.reset) {
    const { html: _h, freeformPrompt: _p, ...rest } = current.content;
    void _h;
    void _p;
    content = rest as AssetContent;
    summary = "Back on the brand template; the free-form design was removed (earlier versions keep it).";
  } else {
    try {
      // A site named in the direction ("like stripe.dev") is read as a reference first.
      const urls = referenceUrls(opts.direction.match(/\b(like|look|style)\b/i) ? opts.direction : `like ${opts.direction}`);
      let data = campaign.data;
      if (urls.length) {
        t.status(`Reading ${urls.join(", ")}`);
        const { pages } = await readNewLinks(urls, data.references ?? [], ctx);
        if (pages.length) {
          store.updateCampaign(campaignId, { data: { references: [...(data.references ?? []), ...pages] } });
          data = store.getCampaign(campaignId)!.data;
        }
      }
      t.status(`Designing ${asset.title} from scratch`);
      const res = await generateFreeform(brand, data, current.content, opts.direction, ctx);
      content = { ...current.content, html: res.html, freeformPrompt: opts.direction };
      summary = `${res.summary} The brand's look is not enforced on this design; the copy was checked again.`;
    } catch (err) {
      // Same as a chat turn: a stop or failure is answered in the chat, not left hanging.
      t.reply(signal?.aborted ? "Stopped. The asset is unchanged." : `Something went wrong with the free-form design: ${(err as Error).message}. The asset is unchanged.`);
      t.emit({ type: "done", costUSD: t.cost() });
      if (signal?.aborted) return;
      throw err;
    }
  }
  const version = store.addVersion(assetId, { content, sources: current.sources, instruction });
  t.emit({ type: "asset", assetId });
  const item = campaign.data.plan?.items.find((i) => i.id === asset.plan_item_id);
  let guard: GuardReport | null = null;
  if (item) {
    t.status("Checking the page against brand and legal rules");
    guard = await guardAsset(brand, campaign.data, item, content, ctx);
    store.setVersionGuard(assetId, version, guard);
    t.emit({ type: "asset", assetId });
  }
  t.say("assistant", "edit", { instruction, results: [{ assetId, title: asset.title, summary, version, guard: guard?.status ?? null }] });
  t.emit({ type: "done", costUSD: t.cost() });
}

/** Reads a reply to the off-brand question: the buttons' exact texts, or a typed yes / no / partly. */
function confirmIntent(text: string): "yes" | "no" | "partial" | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (t === CONFIRM_REPLIES.yes.toLowerCase()) return "yes";
  if (t === CONFIRM_REPLIES.partial.toLowerCase()) return "partial";
  if (t === CONFIRM_REPLIES.no.toLowerCase()) return "no";
  if (/^(only where|partly|partially|where (it's|it is) allowed)/.test(t)) return "partial";
  if (/^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|y|confirm|proceed)\b/.test(t) && t.length < 60) return "yes";
  if (/^(no|nope|nah|cancel|stop|don'?t|leave it|n)\b/.test(t) && t.length < 60) return "no";
  return null;
}
