# PLAN: Brand-Aware Campaign Agent (Magi take-home)

Started 2026-11-02. Budget: 4 days. Source brief: `Magi Take-Home Brief.pdf`. Sample brand: `wickhold-candidate-package/candidate/`.

> North star: *"We care more about how you think than how much you build."*
> Every feature below exists to show judgment: the right context, the right refusal, the right question, the right cost.

---

## 0. What we are building (one paragraph)

A local chat app. Chat on the left, rendered asset on the right. A marketer pastes a brief. The agent reads the brief against a **compiled brand layer**. It pushes back where the brief breaks brand or legal rules. It asks only questions whose answers change the plan, then proposes an editable asset plan. After approval it writes each asset with its own small context pack, checks every claim, and renders the asset the way it would look in the real world. Edits in chat touch one asset only. Memory carries preferences and decisions across chats, and the user can see and change it. Every LLM call is logged with its exact prompt, tokens, cache hits and cost.

Required asset types only: **social posts (LinkedIn, X), blog posts, landing pages, emails.**

---

## 1. What the sample brand is testing (found while reading the folder)

These are the traps. **None of them get hardcoded.** The system has to find them, and the recording shows it finding them.

| # | Trap | Evidence | Correct behavior |
|---|---|---|---|
| T1 | Onboarding doc points to stale guidelines | `README_start_here.md` (Nov 2025) says follow `Brand_Guidelines_v3_FINAL.md` (2024) and lists product "Tallowatch" | `Brand_Guidelines_2026.md` says it "replaces the 2024 guidelines in full". §11 says file names like FINAL/CURRENT "decide nothing". Tallowatch was renamed Evenburn on 2026-03-02 |
| T2 | Explicit order of authority | `Brand_Guidelines_2026.md` §11 | Legal > 2026 guidelines + addendum > channel playbooks > everything else. A lower source still applies where nothing above it speaks |
| T3 | Brief 3: "Lead with FedRAMP Authorized" | Comes from `sales/sales-deck-notes-q3.md` | `legal/certifications-status.md`: only wording allowed is "Wickhold is pursuing FedRAMP Moderate authorization." Banned phrasings are listed. No FedRAMP badge either (`visuals/categories/legal-and-compliance-imagery.md`) |
| T4 | Brief 3: make Vaskell Health the centerpiece | Draft case study in `case-studies/` | `legal/customer-logo-and-quote-policy.md`: not cleared. No name, quote or result, and "a large health system" is also banned. Confirmed in meeting notes and Slack |
| T5 | Brief 2 is vague | "awareness push, containment, whatever mix" | This brief tests question quality. Ask 2–3 sharp questions, each with a default |
| T6 | Brief 1 is very detailed | 11 assets, dates, constraints | Ask little or nothing. Respect the brief-scoped override (Leashgate GA status only) and every ban: no price, SLA, roadmap, competitors, latency figure, borrowed Lowmoor/Ostler proof, Leashgate console screenshots, or `apiVersion`/install lines |
| T7 | Image restrictions | `images/metadata.json`: deprecated logos, internal-only, events-only, departed employee, early-access pill, Lowmoor quote card limited to some channels | Restrictions are hard filters that beat tags (`visuals/00-visual-rules-common.md`). 13 images have empty descriptions |
| T8 | Rules that depend on time | `legal/approved-claims-2026.md` §5: market stats max 12 months old, **measured at publish date**. Containment Report 2026 is valid through 2027-04-14. Field Reports 2023/2024 are expired | Every check runs against the asset's **publish date**, not today |
| T9 | Third-party stats rules | Same §5: named publisher, source link and date in copy, figure must appear on the linked page, trace vendor-quoting-vendor back to the original | The research tool verifies that the figure appears on the scraped page before it can be used |
| T10 | Quote approvals depend on channel | Quote policy: approvals cover web, email, social, decks. Not paid ads or press | Channel-aware usage checks |

---

## 2. Response to the external critique (Gemini)

| Point | Verdict | What changes |
|---|---|---|
| 1. Governance extraction may fail on an unseen brand | **Agree, partly already planned.** Their fallback has its own flaw: "newer file date wins" is exactly what T1 warns against | Three layers: (a) explicit governance extraction, (b) inferred heuristic with stated confidence, (c) **human confirmation** of the authority order at brand load. Every resolution stores its evidence. Low-confidence conflicts go to the user instead of being decided silently. Details in §4.3 |
| 2. Pushback UX for Brief 3 | **Agree.** Already planned. Make it a concrete UI component | A "Brand Check" card in INTAKE, before the plan. Each item shows the requested text, the rule it breaks, the cited source, the approved alternative, and Accept / Override-with-reason buttons. Overrides are logged and become memory candidates |
| 3. Hard image filters before semantic search | **Agree.** Already planned. Make the schema generic | Restriction free text is parsed **by LLM at ingest** into a generic schema (`allowed_channels`, `blocked_channels`, `deprecated`, `internal_only`, `expires`, `people_unavailable`, `must_not_crop`, `context_only`, `notes`). No Wickhold-specific keys. Unparseable restrictions → image excluded and flagged |
| 4. Use gpt-4o / gpt-4o-mini | **Disagree.** Those are 2024 models. It is Nov 2026 | Pick from the live `/v1/models` list on day 1. Tiers: flagship reasoning model for plan + writing, mini for routing/guard/extraction, nano for bulk tagging. The wrapper hides parameter differences: reasoning vs non-reasoning params, `max_completion_tokens`, structured-output support, retry and fallback chain. Justified with measured cost and quality in DECISIONS.md |

---

## 2b. Review pass 2: bottlenecks and fixes

| # | Bottleneck / risk | Fix |
|---|---|---|
| B1 | **Big-bang risk.** Brand layer first, UI last = maybe no working loop on day 3 | **Vertical slice by end of Day 1**: crude ingest → kernel → chat → plan → one asset rendered. Then deepen each layer. Always have a demoable app |
| B2 | **Prompt-tuning without a safety net.** Changing a prompt to fix Brief 2 silently breaks Brief 3 | **Eval harness** (`npm run eval`): runs briefs headless and asserts behavior. Generic checks (guard clean, no banned phrase from the fact store, ≤3 questions, assets match plan, edit touched one asset) + per-brief expectation files in `evals/` (e.g., brief 3 → Brand Check flags FedRAMP + Vaskell; brief 1 → ≤1 question). Expectations live in tests, never in app code. Same runner feeds `bench`/COSTS.md |
| B3 | **Cold cache on parallel generation.** OpenAI caches a prefix only after a request with it finishes. Firing 11 assets at once = 11 cache misses | **Warm-then-fan-out**: write the first asset alone (fills cache for kernel + campaign block), then the rest in parallel. Group assets by channel so the playbook block is shared too. Measure hit rate in bench |
| B4 | **Ingest time on first run.** Grader runs `npm run dev` and waits minutes with no feedback | Ingest is hash-cached under `data/brand-cache/<brand_hash>/`. First run shows an **ingest progress screen** (files, facts, conflicts, images, $ so far). Ingest steps run in a concurrency pool. Est. one-time cost printed. Re-ingest button in Brand Truths |
| B5 | **Conflict detection is O(n²)** over hundreds of facts | Facts get a **canonical subject key** at extraction (`product.evenburn.name`, `cert.fedramp.status`, `customer.vaskell.clearance`). Bucket by key + embedding clustering inside each `kind`. LLM adjudicates only buckets whose values differ. Linear-ish |
| B6 | **Noisy fact extraction.** Archive and Slack yield hundreds of low-value facts | Extract full facts only from tiers 1–3 + product/messaging/style. Lower tiers (sales, internal, archive) are scanned for **claims that contradict a higher fact** (that is where T3 lives) instead of full extraction |
| B7 | **Free-form chat breaks a rigid state machine.** User asks "why no FedRAMP?" mid-plan or edits the plan during generation | **Turn router** (mini, structured output) on every user message: `{answer_question, adjust_plan, approve, edit_asset, add_asset, regenerate, memory_op, chitchat}` + target ids. State machine decides which actions are legal in which state. Ambiguous target → one clarifying line |
| B8 | **Streaming long assets as JSON** (blog, landing) | Writer outputs a JSON envelope with short structured fields + a Markdown `body`. Stream with a partial-JSON parser so the panel fills live. Schema validation at end, one repair retry |
| B9 | **Edit cost on long assets.** Rewriting a 1,500-word blog for "fix the intro" is wasteful | Assets stored as **addressable blocks** (`hero`, `section[2]`, `cta`, `subject`, `post[1]`). Editor returns a patch on target blocks only. Whole-asset rewrite only when the instruction is global ("make it more technical") |
| B10 | **Capped API keys.** Rate limits / spend cap hit during demo | Global concurrency limiter, 429 backoff, `MAX_USD_PER_RUN` guard, live $ counter in header. Bench uses cached ingest |
| B11 | **Native module pain on grader's machine** (`better-sqlite3` on Windows/mac) | Pin Node 22 LTS (`.nvmrc`, `engines`). better-sqlite3 ships prebuilds for Node 22 on win/mac/linux. Fallback documented. Smoke-test a fresh clone on Day 4 |
| B12 | **Unseen brand formats** (PDF, DOCX, no image metadata, no governance doc) | Loaders for md/txt/pdf/docx/html. No metadata file → vision-caption every image (capped count, cost shown). No governance doc → inferred layer (§4.3) + Brand Truths asks user to confirm. Tested via `fixtures/mini-brand` built with these gaps on purpose |
| B13 | **Over-refusal.** Guard/Brand Check flags things that are fine, e.g., "We are not FedRAMP Authorized" or approved wording that contains a banned word | Guard checks **assertions, not substrings**: deterministic hit → LLM confirms it is asserted and in scope. Approved-wording spans are whitelisted. Precision tracked in eval |
| B14 | **Session continuity.** Page reload loses state | All state (chats, briefs, plans, asset versions, memories, calls) in SQLite. Sidebar lists campaigns. Reload resumes the exact state |
| B15 | **Day 3 overloaded** (renderers + edits + memory + inspector + costs + truths) | Inspector and cost logging start Day 1 (they are also debug tools). Renderers start as one generic card on Day 1, then specialize on Day 3. Schedule rebalanced in §9 |

---

## 3. Stack and repo layout

- **Next.js (App Router) + TypeScript**, one process, `npm run dev`. API routes for agent and SSE streaming.
- **SQLite** via `better-sqlite3` + Drizzle. FTS5 for BM25. Embeddings stored as blobs, cosine computed in memory (~500–800 chunks, so no vector DB needed).
- **OpenAI SDK** (Responses API: structured outputs, `prompt_cache_key`, usage with `cached_tokens`).
- **Firecrawl** for search + scrape in research.
- **Zod** schemas are the single source for structured outputs, DB types and renderer props.
- UI: Tailwind + shadcn (apply the Dialog `sm:max-w-sm` fix), Plus Jakarta Sans / DM Sans for app chrome. Asset previews use the **brand's** extracted tokens.

```
C:\code\magi\                  repo root (git init here; zip + PDF gitignored)
  PLAN.md  README.md  DECISIONS.md  COSTS.md  NOTES.md (build log: where AI tools went wrong)
  .env.example                    OPENAI_API_KEY, FIRECRAWL_API_KEY, BRAND_DIR
  src/
    lib/llm/          client wrapper, model registry, pricing table, call logger
    lib/brand/        ingest, chunker, doc cards, governance, facts, conflicts, kernel, images, retrieval
    lib/agent/        state machine, intake, questions, planner, writer, editor, claim guard, research
    lib/memory/       extractor, store, injector
    lib/db/           schema, migrations
    app/              chat UI, asset panel, inspector, brand truths, memory panel, costs
    components/renderers/   linkedin, x, email, blog, landing
  scripts/
    ingest.ts         build or refresh the brand index (hash-cached; auto-runs on first dev start)
    eval.ts           runs briefs headless, asserts behavior (see B2)
    bench.ts          same runner, writes COSTS.md
  evals/              per-brief expectation files + scripted answers/edits (test data, not app logic)
  fixtures/mini-brand/   tiny second fake brand with gaps on purpose (no governance doc, a PDF, no image metadata)
  data/               SQLite db + brand cache (gitignored)
  logs/               calls.jsonl (gitignored)
```

`BRAND_DIR` defaults to `./wickhold-candidate-package/candidate`. Switching brand means changing one env var and re-ingesting. The brand package itself is **not committed** (it is Magi's material and 30 MB). README says where to put it.

---

## 4. Brand layer: compile the brand once, then retrieve precisely

### 4.1 Ingest (runs once, cached by file content hash)
1. Walk `BRAND_DIR`. Read md/txt/pdf/docx. Split by heading into section chunks with path + heading breadcrumb.
2. **Doc card** per file (nano/mini, structured output): `doc_type`, `topics[]`, `entities[]` (products, people, customers), `audience`, `stated_date`, `status` (current | superseded | draft | internal | archive | unknown), `self_claims` ("replaces X", "FINAL", "start here"), `summary`.
3. Index: FTS5 + `text-embedding-3-small` per chunk.
4. **Images**: load metadata (any JSON/CSV with filenames). A vision model captions images with empty descriptions. Restriction text is parsed into the generic schema (§2.3). Embed caption + title + tags.
5. **Design tokens**: extract colors, fonts, logo files and usage rules from guideline docs, so renderers are brand-driven.

### 4.2 Fact extraction
Pull atomic, citable facts from authoritative docs (legal, guidelines, playbooks, product, messaging, style):

```
Fact { id, subject, predicate, value, kind: approved_wording | banned_phrase | rename | rule | product_fact
       | customer_clearance | channel_limit | stat(with source_date) | token,
       scope: channels[] | audiences[] | products[], valid_from, valid_until,
       source: { file, heading, quote }, authority_tier }
```

### 4.3 Governance: three layers
1. **Explicit.** Search for governance language ("order of authority", "wins", "supersedes", "replaces … in full", "takes precedence", "if this disagrees") and extract a ranked list of doc classes and named docs, with quotes.
2. **Inferred fallback** when (1) finds nothing or only partial ranking: legal/compliance > brand guidelines > channel playbooks > product/messaging > personas/templates > sales/internal notes > archive. Then explicit supersession statements ("X replaces Y"). File date and name words like FINAL/CURRENT only break ties and are never the main signal. Each tier carries a confidence.
3. **Human confirm.** At first load the Brand Truths panel shows the derived order and the top conflicts. The user can reorder or pin. Their choice is stored as a brand-scoped memory and wins over both automatic layers.

### 4.4 Conflict ledger
- Group facts by `subject` (embedding similarity + LLM same-subject check). Where values differ → conflict.
- Resolve by: brief-scoped override (if the active brief speaks) → authority tier → explicit supersession → validity window at the asset's **publish date** → recency as tie-break.
- Store `Resolution { winner, losers[], rule_applied, evidence quotes, confidence }`. Confidence below threshold → `needs_user`, raised as a question only when an asset actually needs that fact.
- **Brief overrides are scoped.** Brief 1 says GA status overrides docs "for these assets" and "on anything else, they stand". Store the override with `scope: campaign_id, subject: leashgate.status`. It never leaks into other campaigns or memory.
- Also produce **owner notes** (governance §11 asks for them): "These two documents disagree on X. I used Y. Can Z be updated?" A nice extra that shows we read the brand's own process.

### 4.5 Brand kernel (always in context, cache prefix)
About 2–3k tokens, compiled from resolved facts: identity, tagline, current product names + first-mention rules, voice in 8 bullets, hard bans, approved compliance wording, cleared vs not-cleared customers, authority order, design tokens. Regenerated only on re-ingest. Byte-stable so prompt caching hits.

### 4.6 Context packs (per step, per asset)
`kernel` → `channel playbook section(s)` → `persona for the asset's audience` → `product facts for the product` → `legal facts matching the asset's subjects + channel` → `2–3 style exemplars from the archive (same channel, stale names flagged, used for tone only)` → `campaign brief + plan line + brief overrides` → `relevant memories`. Retrieval is hybrid: BM25 + embedding, filtered by doc card metadata, reranked by mini. Every pack is logged and visible in the inspector with token count per section.

### 4.7 Claim guard (after every write and edit)
Mini model + deterministic checks:
- Deterministic: banned phrase list (from facts, case-insensitive, punctuation-tolerant), product naming/first-mention rule, numbers present in copy must match a fact or a verified research source, channel length limits, restricted image used.
- LLM: implied claims ("basically authorized"), uncleared customer identifiable by description, roadmap/pricing/SLA mentions if the brief bans them, audience tone (no humor for security leaders).
- Output per issue: span, rule, citation, severity, suggested fix. UI badge: ✅ clean / ⚠ n issues. Optional one-click auto-fix. The fix is a targeted edit, not a regeneration.

### 4.8 Research (Firecrawl)
Planner marks assets `needs_research` with a question. Search → scrape top results → mini extracts candidate stats with publisher + date → **verify the figure string appears in the scraped page** → reject if older than the stat age limit at publish date or if it is a vendor quoting a vendor without the original. Store as a `ResearchSource` usable by the writer, cited in copy as the brand requires.

---

## 5. Campaign agent: explicit state machine

```
INTAKE ─► BRAND_CHECK ─► QUESTIONS? ─► PLAN ─► ADJUST ⟲ ─► APPROVE ─► GENERATE ─► REVIEW/EDIT ⟲
```

- **INTAKE** (mini): brief → `StructuredBrief { goal, kpis(internal), audiences[], product, channels_allowed, assets_requested[], dates, constraints[], overrides[], open_items[] }`.
- **BRAND_CHECK** (mini + facts): every requested claim, proof point, customer, image and stat checked against the ledger. Produces the Brand Check card (§2.2). Runs **before** questions, because a pushback can make a question unnecessary.
- **QUESTIONS** (decision rule, written in DECISIONS.md): ask only if (a) the answer changes the asset list, audience, angle or a claim, **and** (b) it cannot be inferred from the brief, brand docs or memory. Max 3. Each question has a stated default as a chip ("If you don't say, I'll assume X"). The user can say "use defaults". Expected: Brief 1 → 0–1, Brief 2 → 2–3, Brief 3 → pushback + 1–2.
- **PLAN** (flagship): `AssetPlan[] { id, type, channel, audience, sender/byline, publish_date, angle, key_messages[], cta, proof_to_use[], image_candidates[3], needs_research, rationale }` plus a short note on mix (e.g., suggest dropping or adding assets with a reason; Brief 1 invites this). Rendered as an editable plan card.
- **ADJUST**: chat ("drop the X post, add a second email for customers") or inline UI edits → plan diff shown → APPROVE button. Nothing gets written before approval.
- **GENERATE**: assets in parallel (concurrency 3–4), each with its own context pack, Zod schema per type, streamed to the right panel → claim guard → image pick finalized.
- **EDIT**: router (mini) resolves the target ("second post" → by plan order and type, ambiguous → ask) and the edit kind (rewrite span / shorten / tone / swap image / regenerate). Editor gets that asset's cached pack + current version + instruction → new version. Other assets untouched. Version history, diff view, undo. Repeated edit patterns become memory candidates.

---

## 6. Renderers (right panel, "looks like the real thing")

| Type | Render |
|---|---|
| LinkedIn | Post card: avatar/page name, "1d • 🌐", text with "…see more" fold at real cutoff, image, reaction bar. Character counter |
| X | Post card: handle, 280 counter, thread support if the plan uses one, image |
| Email | Inbox row (from, subject, preheader), then opened view: header image, body, CTA button, signature, footer |
| Blog | Article page: hero image, title, byline + date, reading time, headings, code blocks (Plex Mono), pull quotes |
| Landing page | Full page in a browser frame: hero + CTA ("Book a demo") + secondary link, sections, FAQ, footer. Responsive toggle desktop/mobile |

Asset tabs across the top of the right panel with status dots (draft / guard issues / edited). Every asset also has a **"Sources" tab** listing the docs, facts and research used, and a **"Prompt" tab** with the exact prompt.

---

## 7. Memory

**Keep (brand/workspace scope):** user corrections to tone and style; decisions on conflicts and authority order; preferences repeated ≥2 times or stated explicitly ("never use humor for security"); confirmed facts the docs lacked; channel habits (e.g., "LinkedIn under 120 words").
**Forget (campaign scope only):** dates, draft text, one-off asks, brief-scoped overrides, anything an authoritative doc already says.

- **Extractor** (mini) runs when a chat is closed or a campaign is approved: proposes `Memory { text, type: preference | decision | fact | correction, scope, source_chat, evidence quote, confidence, created_at, last_used_at }`. Not saved silently: shown as "Remember these?" with keep/edit/discard.
- **Injector**: relevant memories (by embedding + type) go after the kernel, shown in the chat as "Using 3 memories" with a hover list.
- **Panel**: list, edit, delete, pin, filter by type. "Used in" back-links.
- **Decay**: memories unused for N campaigns get flagged for review, not deleted.
- **Conflict with docs**: memory never overrides legal facts. If a memory contradicts a legal fact, the guard flags it.

---

## 8. Cost, caching and debug

- **One LLM wrapper** for every call: `step` (ingest.card / intake / brand_check / plan / write:{asset} / guard / edit / memory / research), `model`, full `input` messages, schema name, `usage` (input, cached, output, reasoning tokens), $ from a pricing table, latency, campaign_id, asset_id, parent step.
- **Caching**: fixed prefix order (system → kernel → playbook block → campaign brief/plan → variable tail). `prompt_cache_key = brand_hash` (+ asset type). The kernel is padded or grouped to clear the 1024-token cache minimum. Cache hit rate shown per call and per campaign.
- **Inspector drawer**: timeline of calls. Click → exact messages, context pack sections with token counts, response, cost. "Copy as JSON". Also written to `logs/*.jsonl`.
- **Costs view**: per campaign (ingest is one-time and shown separately), per asset, per edit, cache hit %.
- **`npm run bench`**: runs the 3 briefs headless with scripted answers and a scripted edit, writes `COSTS.md` (tokens, $ and cache hit rate per brief, typical edit cost, model per step).

### Model tiers (exact IDs confirmed from `/v1/models` on day 1; wrapper maps tier → model)
| Tier | Used for | Why |
|---|---|---|
| Flagship (reasoning) | plan, asset writing, hard conflict adjudication | Output quality and judgment are what get scored |
| Mini | intake, brand check, questions, routing, claim guard, memory extraction, rerank, vision captions, edits | Fast, cheap, good enough for structured tasks. Edits stay cheap |
| Nano | ingest doc cards, restriction parsing, bulk tagging | One-time bulk work, cost dominated by volume |
| Embedding | `text-embedding-3-small` | Cheap, enough for ~1k chunks |

The wrapper handles: reasoning vs non-reasoning params, structured output → JSON-mode fallback with Zod validation and one repair retry, 429/5xx backoff, a per-tier fallback model, and a hard spend guard (env `MAX_USD_PER_RUN`).

---

## 9. Build schedule

Vertical slice first, then deepen (B1, B15).

| Day | Deliverable | Done when |
|---|---|---|
| **1 (Nov 2)** | Repo, Next scaffold, DB schema, **LLM wrapper + call log + pricing + minimal inspector page**. Crude ingest (chunks, FTS, embeddings, doc cards). First-pass kernel. Chat → intake → plan → **one asset** in a generic card | Paste Brief 1 → plan appears → one asset renders → its exact prompt and cost visible in the inspector |
| **2 (Nov 3)** | Governance 3-layer, fact extraction with subject keys, conflict ledger, Brand Check card, question policy, turn router, plan adjust/approve, context packs, warm-then-fan-out generation, claim guard, image index (captions + restriction schema), **eval harness v1** | `npm run ingest` shows T1/T3/T4 with citations. `npm run eval`: Brief 3 flags FedRAMP + Vaskell, Brief 1 ≤1 question, guard clean |
| **3 (Nov 4)** | 5 real renderers, block-addressed edits + versions + diff, memory extractor/injector/panel, Brand Truths panel, costs view, research with figure verification, ingest progress screen | Full loop in UI. "Shorten the second post" patches one asset. New chat shows "Using n memories" |
| **4 (Nov 5)** | Prompt tuning against eval, mini-brand test, `bench` → COSTS.md, README, DECISIONS.md, fresh-clone smoke test, code cleanup, record video | Fresh clone + `npm i && npm run dev` works. Eval green. Docs complete |

**Cut order if behind:** diff view → research figure verification (keep source+date) → responsive toggle → auto-fix → memory decay.
**Never cut:** inspector/exact prompt, cost logging, Brand Check, single-asset edits, memory panel, eval harness, docs.

---

## 10. Recording script (~8–10 min)

1. Brand load: Brand Truths panel. Authority order with quotes, T1 conflict (v3 FINAL vs 2026, Tallowatch → Evenburn), image exclusions with reasons.
2. **Brief 3 end to end**: Brand Check card (FedRAMP + Vaskell, citations, approved alternatives) → 1–2 questions with defaults → plan → my adjustments → assets rendered → guard badges green.
3. Edit in chat: "shorten the second LinkedIn post" → one asset changes, version diff, edit cost shown.
4. Inspector: exact prompt for one asset, context pack sections with token counts, cache hits.
5. New chat with Brief 2: "Using 3 memories" → memory panel shows what was kept and what was dropped → 2–3 sharp questions.
6. Costs view: campaign cost, per-step breakdown, edit cost, cache rate.
7. (Short) Brief 1: ≤1 question, all bans respected.

---

## 11. Docs to deliver

- **README.md**: prerequisites, `.env`, one command, how to point at another brand, where logs live, how to run bench.
- **DECISIONS.md** (≤3 pages): brand layer (compile + retrieve, why not RAG-only or full dump), governance layers, conflict handling with T1/T3/T4 as examples, question policy, memory keep/forget rules and why, model choices with numbers, what was left out, where AI tools led us wrong (from NOTES.md), next two weeks.
- **COSTS.md**: generated by bench + a short commentary.
- **NOTES.md**: running build log. Write in it every time an AI tool gets something wrong.

## 12. Open items
- [ ] Get OpenAI + Firecrawl keys into `.env` (not committed).
- [ ] Confirm available model IDs and prices from the key.
- [ ] Ask Magi (optional): is the hidden test a different brand folder or only a different brief? Build for both either way.
