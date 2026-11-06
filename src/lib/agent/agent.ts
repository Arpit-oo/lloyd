import { z } from "zod";
import { requireBrand, type Brand } from "@/lib/brand";
import { db, newId } from "@/lib/db";
import { resolveModels, type ModelSettings } from "@/lib/llm/catalog";
import { llm, type CallContext } from "@/lib/llm/client";
import { proposeMemories, rememberNow, styleFromMemories } from "@/lib/memory/extract";
import { markUsed, memoriesForPrompt } from "@/lib/memory/store";
import { draftText } from "@/lib/text/partial-json";
import { humanizeContent } from "@/lib/text/punctuation";
import { ASSET_LABEL, ASSET_SCHEMAS, ASSET_TYPES, type AssetContent, type AssetType } from "./asset-types";
import { getAttachments, linkAttachments, renderAttachments, toReferences } from "./attachments";
import { CONFIRM_REPLIES } from "./confirm";
import { mergeStyle } from "./design";
import { readNewLinks, referenceUrls, type Reference } from "./references";
import { checkBrief, OUT_OF_SCOPE_RULE } from "./steps/brand-check";
import { brandLook, editAsset } from "./steps/editor";
import { generateFreeform } from "./steps/freeform";
import { guardAsset, type GuardReport } from "./steps/guard";
import { readBrief } from "./steps/intake";
import { proposePlan, revisePlan } from "./steps/planner";
import { decideQuestions } from "./steps/questions";
import { checkEditRequest } from "./steps/request-check";
import { routeMessage } from "./steps/router";
import { writeAsset, writerPrefix } from "./steps/writer";
import * as store from "./store";
import type { BrandCheckItem, CampaignData, PlanItem, Questions } from "./types";

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
  /** What the current step is writing, token by token (readable text, not JSON). */
  | { type: "live"; text: string }
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
  /** The sender's browser id, so shared chats can label whose message is whose. */
  authorId?: string;
  /** Asset types picked with the chips under the message box; the first plan uses only these. */
  assetTypes?: AssetType[];
}

export async function handleMessage(campaignId: string, text: string, emit: Emit, opts: MessageOptions = {}): Promise<void> {
  const brand = requireBrand();
  const campaign = store.getCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (opts.models) store.updateCampaign(campaignId, { data: { models: opts.models } });
  const runId = newId("run");
  const ctx: CallContext = { runId, campaignId, signal: opts.signal, models: resolveModels(opts.models ?? campaign.data.models), onText: liveText(emit) };
  const t = new Turn(campaignId, ctx, emit);
  if (opts.assetTypes?.length) store.updateCampaign(campaignId, { data: { assetTypes: opts.assetTypes.filter((x) => (ASSET_TYPES as readonly string[]).includes(x)) } });

  const files = getAttachments(opts.attachmentIds ?? []);
  if (files.length) linkAttachments(files.map((f) => f.id), campaignId);
  t.say("user", "text", { text, attachments: files.map((f) => ({ id: f.id, name: f.name, size: f.size })), ...(opts.author ? { author: opts.author } : {}), ...(opts.authorId ? { authorId: opts.authorId } : {}) });

  try {
    // References: images and links always; documents too once the brief is in (before that, a
    // document is the brief). Links are read now, so every later step can use them.
    const docs = files.filter((f) => f.kind !== "image");
    // A document sent with a question about it is read, not kept as a reference.
    const docQuestion = docs.length > 0 && isDocQuestion(text);
    // Documents sent before any plan, when what's on file isn't a real brief ("hi, what can you
    // do?" from an older chat): they are the brief, not references.
    const weakBrief = (s = "") => isSmallTalk(s) || s.trim().split(/\s+/).filter(Boolean).length < 8;
    const briefNow = (campaign.state === "clarifying" || campaign.state === "plan_review") && docs.length > 0 && !docQuestion && weakBrief(campaign.data.briefText);
    const refs: Reference[] = toReferences(campaign.state === "new" || docQuestion || briefNow ? files.filter((f) => f.kind === "image") : files);
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
      await handleNew(brand, t, text, docs, { draftFiles: campaign.data.draftFiles, draftDocs: campaign.data.draftDocs, hasRefs: refs.length > 0, author: opts.author });
    } else {
      // A question about a document attached just now (any state): answer from it.
      if (docs.length && isDocQuestion(text)) {
        t.status("Reading the document");
        t.reply(await explainDocument(brand, text, renderAttachments(docs), ctx, false));
        return;
      }
      if (briefNow) {
        // A short real brief ("webinar post for the new product") is kept and the documents added to it; a greeting is dropped.
        const old = campaign.data.briefText ?? "";
        await restartFromBrief(brand, t, [isSmallTalk(old) ? "" : old, text].filter((s) => s.trim()).join("\n\n"), docs, opts.author);
        return;
      }
      // A reply to "this goes against the brand, are you sure?"
      const pending = campaign.data.pendingEdit;
      if (pending) {
        store.updateCampaign(campaignId, { data: { pendingEdit: null } });
        const reply = confirmIntent(text);
        if (pending.kind === "plan" && reply) {
          if (reply === "no") {
            t.reply("OK, I left the plan as it was.");
            return;
          }
          if (reply === "yes")
            store.updateCampaign(campaignId, { data: { voiceOverrides: [...(campaign.data.voiceOverrides ?? []), `"${pending.instruction}" (for the plan and the assets written from it; overrides: ${pending.conflicts.map((c) => c.rule).join("; ")})`] } });
          const note =
            reply === "yes"
              ? "The marketer was warned this goes against the brand and confirmed. Make the change fully in the plan. Only legal rules, forbidden claims, names and facts still limit it."
              : "Apply this only where the brand's rules and the campaign constraints allow. Where they don't, leave that part out and say so in mix_rationale.";
          await revise(brand, t, `${pending.instruction}\n\n${note}`, { confirmed: true });
          return;
        }
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
      // A reply to the router's own clarifying question: route the original request with the answer, and never ask twice.
      const clarify = campaign.data.pendingClarify;
      if (clarify) store.updateCampaign(campaignId, { data: { pendingClarify: null } });
      const routed = clarify
        ? `${clarify.request}\n\n(You asked: "${clarify.question}" They answered: "${text}". Act now. If the answer doesn't settle it, e.g. "yes" to an either/or question, pick the option that fits the brief best and say which in the instruction.)`
        : text;
      const route = await routeMessage(
        { state: campaign.state, message: routed, plan: campaign.data.plan, assets: store.listAssets(campaignId), recent: recentTranscript(campaignId, 8), brief: campaign.data.briefText, attachments: docs.map((d) => ({ name: d.name, text: d.text })) },
        ctx,
      );
      if (route.needs_clarification && !clarify) {
        store.updateCampaign(campaignId, { data: { pendingClarify: { request: text, question: route.needs_clarification } } });
        t.reply(route.needs_clarification);
      } else
        switch (route.action) {
          case "answer_questions":
            await planFromAnswers(brand, t, text);
            break;
          case "use_defaults":
            await planFromAnswers(brand, t, defaultsText(t.data()));
            break;
          case "revise_plan":
            await revise(brand, t, route.instruction ?? routed);
            break;
          case "approve_plan":
            await writeAll(brand, t);
            break;
          case "edit_assets":
            await edit(brand, t, route.asset_ids, route.instruction ?? routed);
            break;
          case "undo_edit":
            undo(t, route.asset_ids);
            break;
          case "finish_campaign":
            await finish(brand, t);
            break;
          case "remember": {
            t.status("Saving to memory");
            const ids = await rememberNow(brand.hash, campaignId, text, recentTranscript(campaignId, 8), ctx);
            t.say("assistant", "memory", { proposedIds: ids, saved: true });
            break;
          }
          case "new_brief": {
            // The attached documents are the brief, not references to keep.
            const names = new Set(docs.map((d) => d.name));
            if (docs.length) store.updateCampaign(campaignId, { data: { references: (t.data().references ?? []).filter((r) => r.kind === "image" || !names.has(r.name)) } });
            await restartFromBrief(brand, t, text, docs, opts.author);
            break;
          }
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

/** A greeting, thanks or "what can you do" on its own: short and nothing like a brief. */
export function isSmallTalk(text: string): boolean {
  // Punctuation becomes spaces so "Hi, what can you do?" is a run of small-talk phrases.
  const t = text.trim().toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > 15) return false;
  const PHRASE =
    "(hi+|hey+|hello+|yo+|hiya|howdy|sup|gm|good (morning|afternoon|evening)|thanks?|thank you|ty|ok(ay)?|cool|test(ing)?|ping|help|so|and|please" +
    "|what can you (do|help( me)? with)|what do you do|how can you help( me)?|can you help( me)?|who are you|what are you|what is this|what's this" +
    "|how does this work|how do i (start|use (this|you|it))|where do i start|what should i do( first)?)" +
    "( (there|lloyd|team|all|everyone|again|mate|buddy))?";
  return new RegExp(`^${PHRASE}( ${PHRASE})*$`).test(t);
}

/**
 * A question about attached documents rather than a request to plan from them: "what does this
 * say?", "summarize it", "tell me about this". Anything that asks for work (plan, write, make, go)
 * is not, so the brief pipeline runs as before.
 */
export function isDocQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.split(/\s+/).length > 25) return false;
  if (/\b(plan|write|draft|create|make|produce|generate|run|start|go ahead|launch it|use (it|this|that) as|campaign for)\b/.test(t)) return false;
  return (
    t.includes("?") ||
    /^(what|whats|what's|who|which|how|why|when|does|is|are|tell me|explain|summari[sz]e|summary|describe|read|walk me through|give me (a|the) (summary|gist|rundown))\b/.test(t) ||
    /\b(about (this|it|that|the (file|doc|document|brief|attachment))|what (it|this|that) says|what does (it|this|that) say)\b/.test(t)
  );
}

const DOC_QUESTION_RULES = `A marketer attached a document to a campaign tool and asked a question about it.
Answer their question plainly and briefly, from the document only. Use short paragraphs or a few bullets; quote the document where it helps.
Do not judge it against brand rules and do not start planning.`;
/** Only in a new campaign: once a campaign is under way, the next step is already on screen. */
const OFFER_PLAN = `If the document reads like a campaign brief, end with one line saying you can check it against the brand and propose a plan whenever they say "go".`;

async function explainDocument(brand: Brand, question: string, docText: string, ctx: CallContext, offerPlan = true): Promise<string> {
  const res = await llm.text({
    step: "doc:explain",
    tier: "fast",
    effort: "low",
    system: [{ label: "doc question rules", text: `${DOC_QUESTION_RULES}${offerPlan ? `\n${OFFER_PLAN}` : ""}\nBrand: ${brand.tokens?.brand_name ?? "unknown"}.` }],
    input: [{ label: "document", text: docText.slice(0, 40_000) }, { label: "question", text: `Question: ${question}` }],
    maxOutputTokens: 1_500,
    ctx,
  });
  return res.data.trim();
}

// ---------- flows ----------

async function startFromBrief(brand: Brand, t: Turn, briefText: string) {
  const today = new Date().toISOString().slice(0, 10);
  t.status("Reading the brief");
  const memories = memoriesForPrompt(brand.hash);
  const [brief, memoryStyle] = await Promise.all([readBrief(brand, briefText, today, t.ctx), styleFromMemories(memories, t.ctx)]);
  markUsed(memories.map((m) => m.id));
  store.updateCampaign(t.campaignId, { title: brief.title, data: { briefText, brief, memoryIds: memories.map((m) => m.id), ...(memoryStyle ? { memoryStyle } : {}) } });

  t.status("Checking the brief against brand and legal rules");
  const brandCheck = await checkBrief(brand, brief, t.ctx);
  store.updateCampaign(t.campaignId, { data: { brandCheck } });
  if (brandCheck.length) t.say("assistant", "brand_check", { items: brandCheck });

  t.status("Deciding whether I need to ask anything");
  const questions = await decideQuestions(brand, t.data(), memories, t.ctx);
  // Anything the brand check changed or refused is the marketer's call too: ask before planning.
  const flagged = brandCheck.filter((i) => i.verdict !== "ok" && i.rule !== OUT_OF_SCOPE_RULE);
  if (flagged.length) questions.questions.push(brandCheckQuestion(flagged));
  // The card marks the suggested option itself; drop "(default)" / "Default:" the model sometimes writes into the text.
  const tidy = (o: string) => o.replace(/\s*\((default|suggested)\)\s*$/i, "").replace(/^(default|suggested):\s*/i, "").trim();
  questions.questions = questions.questions.map((x) => ({ ...x, options: x.options.map(tidy), default: tidy(x.default) }));
  store.updateCampaign(t.campaignId, { data: { questions } });

  if (questions.questions.length) {
    t.say("assistant", "questions", { ...questions, memoriesUsed: memories.length, memoryList: memories.map(({ type, text }) => ({ type, text })) });
    t.setState("clarifying");
  } else {
    if (questions.assumptions.length || memories.length) t.say("assistant", "questions", { ...questions, memoriesUsed: memories.length, memoryList: memories.map(({ type, text }) => ({ type, text })) });
    await plan(brand, t);
  }
}

type DraftFile = { name: string; text: string };

/**
 * A new campaign's message: the brief (typed, attached, or both), a question about an attached
 * document, "remember …", or small talk. Several documents at once may be separate briefs, so
 * the agent asks which one this campaign is for unless the message says they belong together.
 */
async function handleNew(
  brand: Brand,
  t: Turn,
  text: string,
  docs: DraftFile[],
  o: { draftFiles?: DraftFile[]; draftDocs?: string; hasRefs: boolean; author?: string },
) {
  // Documents sent earlier in this new campaign (with a question, or before picking one) are kept
  // and used once the marketer says go.
  const newDocs = docs.map((d) => ({ name: d.name, text: d.text }));
  const pool = newDocs.length ? newDocs : (o.draftFiles ?? []);
  const docText = pool.length ? renderAttachments(pool) : (o.draftDocs ?? "");
  if (newDocs.length) store.updateCampaign(t.campaignId, { data: { draftDocs: docText, draftFiles: newDocs } });
  if (docText && isDocQuestion(text)) {
    // "what does this say?": answer about the document instead of running it as a brief.
    t.status("Reading the document");
    t.reply(await explainDocument(brand, text, docText, t.ctx));
    return;
  }
  // "Remember …" before any brief: save it, don't treat it as a brief.
  if (!docText && /^(please\s+)?(remember|from now on|always use|keep in mind)\b/i.test(text.trim())) {
    t.status("Saving to memory");
    const ids = await rememberNow(brand.hash, t.campaignId, text, "", t.ctx);
    t.say("assistant", "memory", { proposedIds: ids, saved: true });
    return;
  }
  if (!docText && !o.hasRefs && isSmallTalk(text)) {
    // "hi", "thanks", "what can you do?": not a brief, so don't run the brief pipeline on it.
    t.reply(
      `Hi${o.author ? ` ${o.author}` : ""}! I write on-brand campaign assets for ${brand.tokens?.brand_name || "your brand"}: LinkedIn and X posts, blog posts, landing pages and emails, checked against the brand's rules.\n\nTo start, paste or attach a brief (PDF, Word, PowerPoint, Markdown), or tell me what you're launching, for whom, and which assets you need. You can also pick a sample brief below.`,
    );
    return;
  }
  // A short message with no document may still be chat ("before that, how are you?"), not a brief.
  if (!docText && !o.hasRefs && text.trim().split(/\s+/).length <= 40) {
    const opening = await classifyOpening(brand, text, t.ctx);
    if (opening.kind === "chat") {
      t.reply(`${opening.reply.trim()}\n\nWhen you're ready, paste or attach a brief, or tell me what you're launching, for whom, and which assets you need.`);
      return;
    }
  }
  let briefDocs = docText;
  let picked: DraftFile[] = [];
  if (pool.length >= 2 && !COMBINE.test(text)) {
    picked = pickFiles(pool, text);
    if (picked.length) briefDocs = renderAttachments(picked);
    else if (newDocs.length) {
      t.reply(
        `You sent ${pool.length} documents: ${pool.map((f) => f.name).join(", ")}.\n\nIf they are separate briefs, each works best as its own campaign: tell me which one to start with here (e.g. "use ${pool[0].name.replace(/\.[a-z0-9]+$/i, "")}" or "the first one") and start the others in new chats. If they belong to one campaign, say "one campaign".`,
      );
      return;
    }
  }
  // A message that only picks a file ("use mock-1", "the first one") isn't part of the brief.
  const brief = [picked.length && isPickOnly(text) ? "" : text, briefDocs].filter((s) => s.trim()).join("\n\n");
  if (!brief.trim()) {
    // Only images: keep them as references and ask for the brief itself.
    t.reply("Got your reference. Now tell me about the campaign: paste or attach the brief, or describe what you're launching, for whom, and which assets you need.");
    return;
  }
  store.updateCampaign(t.campaignId, { data: { draftFiles: undefined, draftDocs: undefined } });
  await startFromBrief(brand, t, brief);
}

const OpeningSchema = z.object({
  kind: z.enum(["brief", "chat"]),
  reply: z.string().describe("If chat: a short, friendly answer (one or two sentences). Empty if brief."),
});

/** Is the first message of a campaign a brief (however vague) or just chat? Briefs go to the brief pipeline. */
async function classifyOpening(brand: Brand, text: string, ctx: CallContext): Promise<z.infer<typeof OpeningSchema>> {
  const res = await llm.json({
    step: "intake:opening",
    tier: "fast",
    effort: "low",
    system: [{ text: `You are Lloyd, a campaign assistant that writes on-brand marketing assets (LinkedIn and X posts, blog posts, landing pages, emails) for ${brand.tokens?.brand_name || "the brand"}.
Decide whether the marketer's message is a campaign brief or request for marketing work, however short or vague ("awareness push for the new product", "LinkedIn posts about the launch", "something for the webinar") = "brief";
or chat that asks for no marketing work: greetings, how are you, questions about you or how this works, thanks, jokes, off-topic remarks = "chat". When unsure, "brief".
For chat, answer it briefly and warmly, as Lloyd. Don't ask for a brief; that is added after your reply.` }],
    input: text,
    schema: OpeningSchema,
    schemaName: "opening",
    ctx,
  });
  return res.data;
}

const COMBINE =/\b(together|combine[d]?|one campaign|single campaign|same campaign|all (of )?(them|these|the (docs|documents|files|briefs)))\b/i;
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];
const GENERIC_WORDS = new Set(["brief", "briefs", "mock", "campaign", "final", "draft", "copy", "file", "docs", "document", "the", "and", "for", "new", "v1", "v2", "v3"]);

/** Which of several attached files the message names: by ordinal ("the second one", "#2"), or a distinctive word of its file name. */
export function pickFiles<T extends { name: string }>(files: T[], text: string): T[] {
  const t = text.toLowerCase();
  return files.filter((f, i) => {
    if (new RegExp(`\\b${ORDINALS[i]}\\b`).test(t) || new RegExp(`(^|[^0-9.])#?${i + 1}(?![0-9.])`).test(t.replace(/[-_]/g, " "))) return true;
    const words = f.name.toLowerCase().replace(/\.[a-z0-9]+$/, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
    return words.some((w) => new RegExp(`\\b${w}\\b`).test(t));
  });
}

/** "use mock-1", "the first one", "go with the webinar one": picks a file and says nothing else. */
function isPickOnly(text: string): boolean {
  return text.trim().split(/\s+/).length <= 8 && /^(ok(ay)?[, ]+)?(use|pick|take|start with|go with|let's do|lets do|do|the)\b/i.test(text.trim());
}

/** A new or replacement brief before any asset is written: drop the old questions and plan, and start as a new campaign would. */
async function restartFromBrief(brand: Brand, t: Turn, text: string, docs: DraftFile[], author?: string) {
  store.updateCampaign(t.campaignId, { state: "new", data: { questions: undefined, answers: undefined, plan: undefined, brandCheck: undefined, pendingEdit: null, pendingClarify: null, draftDocs: undefined, draftFiles: undefined } });
  t.emit({ type: "state", state: "new" });
  await handleNew(brand, t, text, docs, { hasRefs: false, author });
}

export const BRAND_CHECK_QUESTION_ID = "brand_check";
export const BRAND_CHECK_NONE = "No, the alternatives are fine";
const shortLabel = (s: string) => {
  // "certification: Acme is ISO 27001 certified" -> "Acme is ISO 27001 certified"
  const plain = s.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().replace(/^[a-z_ ]{3,24}:\s+/i, "");
  return plain.length <= 90 ? plain : `${plain.slice(0, 87).replace(/\s+\S*$/, "")}…`;
};

/** One multi-select question listing what the brand check won't do as written; the default keeps the alternatives. */
function brandCheckQuestion(flagged: BrandCheckItem[]): Questions["questions"][number] {
  const n = flagged.length;
  return {
    id: BRAND_CHECK_QUESTION_ID,
    // Asset types Lloyd doesn't make are on the card too but aren't offered here, so no count.
    question: n === 1 ? "One claim or idea in the brief I won't use as written (see above). Do you still need it?" : "Some claims or ideas in the brief I won't use as written (see above). Do you still need any of them?",
    why: "Pick any you need and I'll find the closest way the brand and legal rules allow. Otherwise I'll use the alternatives shown above.",
    options: [BRAND_CHECK_NONE, ...flagged.map((i) => shortLabel(i.requested))],
    multi_select: true,
    default: BRAND_CHECK_NONE,
  };
}

const BRAND_CHECK_NOTE = `Brand check items the marketer still needs (if any are named in the answers above): keep each one in the plan in the closest form the brand and legal rules allow (approved wording, a scoped or softened claim, a different channel), and say in mix_rationale what you kept and how. A forbidden claim, a customer that can't be named, or an internal number still never appears as written.`;

async function planFromAnswers(brand: Brand, t: Turn, answers: string) {
  if (t.data().questions?.questions.some((q) => q.id === BRAND_CHECK_QUESTION_ID)) answers = `${answers}\n\n${BRAND_CHECK_NOTE}`;
  store.updateCampaign(t.campaignId, { data: { answers } });
  await plan(brand, t);
}

async function plan(brand: Brand, t: Turn) {
  t.status("Planning the assets");
  const proposed = await proposePlan(brand, t.data(), memoriesForPrompt(brand.hash), t.ctx);
  // Asset types the marketer picked are binding for the first plan (later chat changes can add others).
  const types = t.data().assetTypes;
  const kept = types?.length ? proposed.items.filter((i) => types.includes(i.type)) : proposed.items;
  const p = kept.length && kept.length < proposed.items.length ? { ...proposed, items: kept, mix_rationale: `${proposed.mix_rationale} Limited to the asset types you picked: ${types!.map((x) => ASSET_LABEL[x]).join(", ")}.` } : proposed;
  store.updateCampaign(t.campaignId, { data: { plan: p } });
  t.say("assistant", "plan", { plan: p });
  t.setState("plan_review");
}

async function revise(brand: Brand, t: Turn, request: string, opts: { confirmed?: boolean } = {}) {
  const before = t.data().plan;
  // Same guard rail as edits: a plan change that goes against the brand ("add emojis") asks first.
  if (!opts.confirmed) {
    t.status("Checking the request against the brand's rules");
    const check = await checkEditRequest(brand, t.data(), request, (before?.items ?? []).map((i) => ({ title: i.title, type: i.type })), t.ctx);
    if (check.verdict === "confirm") {
      store.updateCampaign(t.campaignId, { data: { pendingEdit: { kind: "plan", instruction: request, assetIds: [], conflicts: check.conflicts } } });
      t.say("assistant", "confirm", { question: check.question, conflicts: check.conflicts, instruction: request });
      return;
    }
  }
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
      // Starting design: a design reference sent in this campaign, else remembered design preferences.
      const startStyle = data.referenceStyle ?? data.memoryStyle;
      const refStyle = startStyle && WEB_TYPES.has(item.type) ? mergeStyle(undefined, startStyle, brandLook(brand), { anyFont: true }) : undefined;
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
      // Compared with dashes cleaned on both sides, so plain punctuation alone never counts as a change.
      if (JSON.stringify(edited.content) === JSON.stringify({ ...current.content, data: humanizeContent(current.content.data) })) {
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

const HUMANIZE_KINDS = new Set(["text", "plan", "questions"]);

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
    // Lloyd's own words read like a person: no em dashes. Brand-check quotes stay verbatim.
    const said = role === "assistant" && HUMANIZE_KINDS.has(kind) ? humanizeContent(content) : content;
    const message = store.addMessage(this.campaignId, role, kind, role === "assistant" ? { ...(said as object), runId: this.ctx.runId } : said);
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
  opts: { direction: string; reset: boolean; author?: string; authorId?: string },
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  const brand = requireBrand();
  const campaign = store.getCampaign(campaignId);
  const asset = store.getAsset(assetId);
  const current = asset && store.getVersion(assetId, asset.current_version);
  if (!campaign || !asset || !current) throw new Error("Asset not found");
  const runId = newId("run");
  const ctx: CallContext = { runId, campaignId, assetId, signal, models: resolveModels(campaign.data.models), onText: liveText(emit) };
  const t = new Turn(campaignId, ctx, emit);
  const instruction = opts.reset ? "Back to the brand template" : `Free-form design: ${opts.direction}`;
  t.say("user", "text", { text: opts.reset ? `Put ${asset.title} back on the brand template.` : `Free-form design for ${asset.title}: ${opts.direction}`, attachments: [], ...(opts.author ? { author: opts.author } : {}), ...(opts.authorId ? { authorId: opts.authorId } : {}) });

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

/**
 * Streams what the sequential steps write (brief reading, brand check, questions, plan, routing,
 * edits) as readable text. Parallel writers and checks are left out: assets have their own live
 * drafts, and several checks at once would only flicker. For routing, only the reply is shown.
 */
const LIVE_STEPS = /^(intake|brand-check|questions|plan|plan:revise|route|edit:|memory)/;
function liveText(emit: Emit): (step: string, soFar: string) => void {
  let last = 0;
  return (step, soFar) => {
    if (!LIVE_STEPS.test(step) || step.startsWith("edit:request")) return;
    const now = Date.now();
    if (now - last < 120) return;
    last = now;
    const text = step === "route" ? (/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(soFar)?.[1] ?? "").replace(/\\n/g, "\n").replace(/\\"/g, '"') : draftText(soFar);
    if (text.trim()) emit({ type: "live", text: text.length > 1500 ? `…${text.slice(-1500)}` : text });
  };
}
