# How Lloyd works, start to finish

This document explains Lloyd from the inside: what it does, how it's built, how the pieces talk to each other, what every model prompt says, and what JSON goes back and forth. Read it top to bottom once and you'll understand the whole system.

- Using the app and testing it: [GUIDE.md](GUIDE.md)
- Why each decision was made: [DECISIONS.md](../DECISIONS.md)
- Diagrams of each subsystem: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. What Lloyd does, in one paragraph

A marketer gives Lloyd a campaign brief. Lloyd turns the brief into structured data, checks every claim in it against the brand's documents, asks questions only if the answers would change the plan, and proposes a plan of assets (LinkedIn posts, X posts, emails, blog posts, landing pages). Nothing is written until the marketer approves the plan. Then each asset is written in parallel with its own small, relevant slice of the brand, checked for forbidden claims, fixed automatically if needed, and shown on the right looking like the real thing. The marketer edits by chatting; only the asset they name changes. At the end, Lloyd proposes what to remember for next time. Every model call is logged with its exact prompt, tokens, cache hits and cost.

The hard problem it solves: the brand folder is ~145k tokens across 84 documents that **contradict each other** (an old sales deck says "FedRAMP Authorized", the legal sheet says never say that). Lloyd works out which document wins once, at ingest, and only feeds winning rules to the writer.

---

## 2. The big picture

```
                        ┌──────────────────────── Browser (React 19) ─────────────────────────┐
                        │  Sidebar          Chat (left)                 Asset panel (right)    │
                        │  campaigns,       messages + cards             previews: LinkedIn, X, │
                        │  brand, memory,   (brand check, questions,     email, blog, landing   │
                        │  inspector        plan, edits, memory)         + Checks/Sources/Prompt│
                        └───────────────┬───────────────────────────────────────▲─────────────┘
                                        │ POST /api/campaigns/:id/messages      │ Server-Sent Events
                                        ▼                                       │ (status, live, draft,
                        ┌──────────────────────── Next.js server (Node) ────────┴─────────────┐
                        │  API routes  ──►  Agent (state machine, src/lib/agent/agent.ts)       │
                        │                    │ router → intake → brand check → questions →       │
                        │                    │ plan → write ×N (parallel) → guard → auto-fix     │
                        │                    │ edit → request check → patch → guard              │
                        │                    ▼                                                   │
                        │  Brand layer (src/lib/brand)       LLM client (src/lib/llm/client.ts)  │
                        │  retrieval over the brand index    the ONLY door to OpenAI: caching,   │
                        │  (BM25 + embeddings, by tier)      spend cap, validation, logging      │
                        └──────┬───────────────────┬──────────────────────┬──────────────┬─────┘
                               ▼                   ▼                      ▼              ▼
                     data/brands/<hash>.db    data/app.db           OpenAI API      Firecrawl
                     brand index: docs,       campaigns, messages,  (Responses API)  (web research,
                     chunks, facts,           assets + versions,                     reference links)
                     conflicts, images        memories, llm_calls   logs/calls.jsonl
```

**Two databases on purpose.** The brand index is built once per brand folder and never changes during a campaign. The app database holds everything a user creates. Switching brands swaps the first; the second keeps each brand's campaigns apart by brand hash.

### Tech stack and why

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router, Turbopack), React 19, TypeScript | One process serves the UI and the API; `npm run dev` is the one command |
| Styling | Tailwind CSS v4 with CSS variables | Themes are just variable sets; dark mode and the Magi theme swap variables |
| Storage | SQLite via better-sqlite3 | Local, zero setup, fast, inspectable; FTS5 gives BM25 search for free |
| Models | OpenAI Responses API (`openai` SDK v7) | Brief requires OpenAI; explicit prompt-cache breakpoints and structured outputs |
| Validation | zod | One schema gives the model's JSON Schema, runtime validation and TypeScript types |
| Web | Firecrawl | Web search with page content for research and reference links |
| Tests | Vitest, ESLint, `npm run eval` | Unit tests plus end-to-end behaviour checks on real briefs |

### Folder map

```
src/app/                 pages and API routes (Next.js App Router)
  page.tsx               the landing page (/)
  app/page.tsx           the app (/app)
  api/                   campaigns, messages (SSE), assets, brand, brands, memories, calls, share, uploads
src/lib/brand/           brand layer: scan, chunk, cards, governance, facts, conflicts, entities, kernel, images, retrieve
src/lib/agent/           agent: state machine, prompt context, store, asset types, design settings, references
src/lib/agent/steps/     one file per model step: intake, brand-check, questions, planner, writer, editor,
                         request-check, guard, router, images, research, freeform
src/lib/llm/             client (the only door to OpenAI), models per tier, pricing, embeddings, concurrency
src/lib/memory/          memory store and end-of-campaign extraction
src/components/          chat, asset renderers, panels (brand, memory, inspector, settings, share), themes, landing
scripts/                 ingest, brief (terminal run), eval/bench, seed, key test
evals/  fixtures/        expected behaviour per brief; mock briefs, messy test briefs, a second brand
```

---

## 3. The brand layer: what happens at ingest

Ingest runs once per brand folder (`src/lib/brand/ingest.ts`). The result is keyed by a hash of the folder's contents, so if any file changes, a fresh index is built; an old one is never used by mistake. The sample brand ships pre-built in `seed/`, so a fresh clone starts instantly. Every step is resumable.

| # | Step | What it does | Model | Stored as |
|---|---|---|---|---|
| 1 | **Scan and load** | Reads Markdown, text, PDF, Word, PowerPoint, HTML; finds images and their metadata | none | `docs` |
| 2 | **Chunk** | Splits by headings, keeping the heading path ("Legal > Banned claims > FedRAMP"), because a rule without its heading loses its scope | none | `chunks` + FTS5 index + embeddings |
| 3 | **Doc cards** | For each doc: type (legal, guidelines, playbook, persona, past content…), status, stated date, channels it governs, and what it claims about its own authority ("replaces X", "FINAL") | luna | `docs.card_json` |
| 4 | **Governance** | Decides the authority order: explicit rules in the folder first, then document type, with dates and "FINAL" only breaking ties. Every doc gets a tier (1 = highest) | sol | `meta` + `docs.tier` |
| 5 | **Facts** | Pulls ~2,300 atomic rules and claims out of the documents, each with its verbatim quote, scope and validity dates | terra | `facts` (+ embeddings) |
| 6 | **Conflicts** | Groups facts about the same thing from different docs (seeded from high-authority facts), plus a directed audit of risky low-authority claims. Settles each group with the governance rules | terra | `conflicts` |
| 7 | **Entities** | Current and former names (Tallowatch → Evenburn). Drives a hard, code-level check for retired names | sol | `meta` |
| 8 | **Kernel** | A ~2.5k-token summary built only from winning facts: identity, voice, never-say list, approved wording, usable customers, statistic expiry, settled conflicts | sol | `meta` |
| 9 | **Images** | Vision caption per image (metadata can be wrong) and usage rules parsed into hard filters (allowed channels, expiry, "do not use") | terra, luna | `images` |
| 10 | **Design tokens** | Brand colours, fonts and logos, so previews render in the brand's look | terra | `meta` |

Cost of the sample brand's ingest: **$2.39**, once (breakdown in [COSTS.md](../COSTS.md)).

### Retrieval at write time

`src/lib/brand/retrieve.ts` does **hybrid search**: BM25 (exact names, numbers, rule words) fused with embedding similarity (paraphrases) by reciprocal rank fusion. Filters use the doc cards and tiers, so the writer can ask for "email channel rules" without pulling in old campaign emails, or ask the brand check for evidence from tier 1–2 only.

---

## 4. The agent: a state machine

Each campaign is in one state. Every chat message goes through the **router**, which picks one action, and only actions allowed in the current state can run.

```
   new ──brief──► clarifying ──answers / "use defaults"──► plan_review ──approve──► writing ──► review
                                                            ▲      │                              │
                                                            └─revise┘          edits, undo, revise, finish
```

| State | Allowed actions |
|---|---|
| `new` | chat (a brief starts the campaign; greetings get an instant reply with no model call) |
| `clarifying` | answer_questions, use_defaults, chat |
| `plan_review` | revise_plan, approve_plan, chat |
| `writing` | chat |
| `review` | edit_assets, undo_edit, revise_plan, finish_campaign, chat |

### The life of a brief (first message)

`handleMessage()` → `startFromBrief()` in `src/lib/agent/agent.ts`:

1. **Intake** (terra): the brief text → `StructuredBrief` JSON (§7.1). Pure reading, no judgments.
2. **Memories** for this brand are loaded and counted as used.
3. **Brand check** (sol): every requested claim, the brief's lead angle and any non-allowed asset type is checked. For each item, evidence is retrieved first (top facts + top passages from tier 1–2), and the model must quote it. → `BrandCheck` JSON, shown as the *Brand check* card.
4. **Questions** (sol): asks only if the answer changes assets, audience, angle or a claim and nothing answers it already. Always asks if the brand check removed the brief's centerpiece. → `Questions` JSON. If there are questions, state becomes `clarifying` and Lloyd waits.
5. **Plan** (sol) → `Plan` JSON, shown as the *Plan* card with a cost estimate. State `plan_review`.
6. On **approve**: state `writing`. For each asset type in the plan, the shared prompt prefix is **prewarmed** into the cache once, then every asset is written **in parallel**: image candidates and web research are fetched, the asset's context block is assembled, and the writer returns the asset JSON (§7.5). Text streams to the browser as it's generated.
7. **Guard** on each asset: deterministic checks in code (length limits, internal targets leaking into copy, retired names, disallowed images) plus a model check (terra) that must quote the offending text. If anything is `block`, **one automatic fix** runs (an edit with the issues as the instruction) and the guard runs again.
8. State `review`. Assets, versions and guard reports are saved.

### An edit

`edit()` in `agent.ts`:

1. **Router** resolves "the second LinkedIn post" to an asset id; if it's ambiguous, it asks instead of guessing.
2. **Request check** (terra): does the edit go against the brand's voice, a campaign constraint, or is it unusual (slang, memes, mascots)? If yes, a *confirm* card asks first (*do it anyway / only where allowed / cancel*). A "do it anyway" is stored on the campaign as a voice exception; legal rules never bend.
3. **Editor** (sol) returns **patch operations** on named paths, not a rewritten asset (§7.7). The patched JSON is re-validated against the asset's schema, saved as a new version, and re-guarded. Other assets are never touched.

### Finishing

"We're done" → **memory extraction** (terra) proposes memories with a quote as evidence (§7.9). Anything resembling a brief override is removed **in code** by embedding similarity, not only by asking the model. Nothing becomes active until the marketer clicks *Keep*.

---

## 5. How a prompt is put together

Every writing prompt is built from **ordered blocks, most stable first**, with an explicit cache breakpoint after each stable layer (`src/lib/agent/context.ts`):

| # | Block | Role | Changes when | Cached |
|---|---|---|---|---|
| 1 | **Agent rules + brand kernel** | developer | never, for this brand | ✅ breakpoint |
| 2 | **Campaign block**: structured brief, brief constraints, internal targets ("NEVER put these in copy"), scoped overrides, brand check decisions ("binding"), answers, references, plan, memories | developer | once per campaign | ✅ breakpoint |
| 3 | **Channel playbook**: the brand's rules for this channel, retrieved from docs whose card says they govern it | user | once per asset type | ✅ breakpoint |
| 4 | **Asset context**: the plan item as JSON, ~25 relevant facts with doc and tier, audience persona, product and messaging passages, past examples marked *STYLE ONLY*, image rules, image candidates, verified web research | user | every asset | ❌ |
| 5 | **Task**: "Write the LinkedIn post "…" (plan item a3) now." | user | every asset | ❌ |

Because blocks 1–3 are identical for every asset of a type, parallel writers read them from cache. Cached input costs a fraction of normal input (0.05× for gpt-6.1-sol).

### The real request JSON sent to OpenAI

This is an actual `write:linkedin_post` call from `logs/calls.jsonl`. Long texts are cut short here; the log has them in full, and the Inspector shows them block by block.

```json
{
  "model": "gpt-6.1-sol",
  "store": false,
  "reasoning": { "effort": "medium" },
  "prompt_cache_key": "brand:9ab97012c486",
  "prompt_cache_options": { "mode": "explicit" },
  "max_output_tokens": 20000,
  "text": {
    "format": { "type": "json_schema", "name": "linkedin_post", "strict": true, "schema": "<JSON Schema generated from LinkedInSchema>" }
  },
  "input": [
    {
      "role": "developer",
      "content": [
        { "type": "input_text", "text": "You write marketing assets that a senior marketer at this brand would publish as-is. … ---  # Brand kernel: Wickhold …  [13,194 chars]",
          "prompt_cache_breakpoint": { "mode": "explicit" } },
        { "type": "input_text", "text": "# Campaign\n\nTitle: Leashgate changelog launch\nGoal: … [9,048 chars]",
          "prompt_cache_breakpoint": { "mode": "explicit" } }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "# LinkedIn post rules from the brand's playbook\n\n[brand/channels/linkedin-playbook.md | … | tier 3] … [9,327 chars]",
          "prompt_cache_breakpoint": { "mode": "explicit" } },
        { "type": "input_text", "text": "# This asset\n{ \"id\": \"a3\", \"type\": \"linkedin_post\", … }\n\n# Relevant brand facts (authoritative, cite-able)\n- [brand/legal/approved-claims-2026.md, tier 1] … [21,773 chars]" },
        { "type": "input_text", "text": "Write the LinkedIn post \"Changelog launch for Wickhold Leashgate (early access)\" (plan item a3) now." }
      ]
    }
  ]
}
```

What came back, already valid against the schema:

```json
{
  "author": "Wickhold",
  "author_kind": "company",
  "text": "February 15, 2027\nThe changelog for Wickhold Leashgate (early access) is live.\n\nThe first entry covers the existing blast radius report, which reads Secret mounts as well as RBAC. …\n\nRead the first changelog entry.",
  "hashtags": [],
  "image": { "image_id": "ui-leashgate-blast-radius", "alt": "Wickhold Leashgate (early access) blast radius report showing …" },
  "link": null
}
```

Usage the API reported: 12,377 input tokens (7,183 written to cache for the next asset), 432 output tokens (261 of them reasoning), **$0.033**, 9.3 s.

Key request fields:

| Field | Meaning |
|---|---|
| `role: "developer"` | The system-level instructions (the Responses API name for a system prompt) |
| `prompt_cache_breakpoint` | "Cache everything up to here." Placed after each stable block |
| `prompt_cache_key` | Groups calls that share a prefix (one per brand) so they hit the same cache |
| `prompt_cache_options.prewarm` | Used once per asset type before the parallel writes: writes the cache without generating output |
| `text.format` | Structured output: the model must return JSON matching the schema exactly |
| `store: false` | OpenAI does not keep the conversation |
| `reasoning.effort` | low / medium per step; reasoning tokens are billed as output |

### What the LLM client adds to every call (`src/lib/llm/client.ts`)

- **Tier → model.** Steps ask for a tier (`writer`, `reasoner`, `fast`, `bulk`); the campaign's model picker can override it.
- **Spend cap.** Before each call, the run's spend so far is checked against `MAX_USD_PER_RUN` ($5 by default).
- **Concurrency limit.** A semaphore keeps parallel calls under `LLM_CONCURRENCY`.
- **Validation and one repair.** Output is parsed with the zod schema; on failure, the model is shown its error once and asked again.
- **Streaming.** When the UI is watching, the same request is streamed and text is forwarded token by token.
- **Stop.** An abort signal cancels in-flight calls when the user presses Stop.
- **Logging.** Every call (success or error) goes to the `llm_calls` table and `logs/calls.jsonl`: full request, response, input/cached/cache-write/output/reasoning tokens, cost, latency. Images are replaced by a size marker so logs stay readable.

### Models per step

| Tier | Model | Used for | Why |
|---|---|---|---|
| writer | gpt-6.1-sol | writing assets, edits, free-form pages | Best writing quality; cheap cache reads (0.05×) |
| reasoner | gpt-6.1-sol | brand check, questions, plan, governance, entities, kernel | Judgment-heavy steps where a mistake costs a re-plan |
| fast | gpt-6.1-terra | intake, router, request check, guard, facts, conflicts, vision, memory | High volume, structured, needs to be quick |
| bulk | gpt-6-luna | doc cards, image rule parsing | 10× cheaper; slow is fine for one-time ingest |
| embed | text-embedding-3-small | retrieval | Cheap and good enough with BM25 alongside |

---

## 6. Browser ↔ server

### Sending a message

`POST /api/campaigns/:id/messages` with a body like:

```json
{ "text": "Shorten the email", "attachmentIds": [], "models": { "writer": "gpt-6.1-sol" }, "author": "Arpit", "tab": "t1", "assetTypes": ["email"] }
```

(files are uploaded first with `POST /api/uploads`, which returns their ids). If another run is going on this campaign the answer is `409` with "Lloyd is still working on …". Otherwise the response is a **Server-Sent Events** stream of `AgentEvent`s:

| Event | Payload | What the UI does |
|---|---|---|
| `status` | `{ text: "Checking the brief against brand and legal rules" }` | Adds a step to the live checklist |
| `live` | `{ text }` | Streams what the current step's model is writing |
| `draft` | `{ assetId, text }` | Fills an asset preview while it's written |
| `message` | `{ message: { id, role, kind, content } }` | Adds a chat message or card |
| `asset` | `{ assetId }` | Reloads that asset |
| `state` | `{ state: "plan_review" }` | Updates the campaign state |
| `done` | `{ costUSD }` | Ends the turn; shows its cost |

Runs live on the server, not the request: if the page reloads mid-run, the run keeps going. `GET /api/campaigns/:id/pulse` is a cheap poll returning a signature that changes when the chat or assets change, the live run's steps and who is viewing (it doubles as the presence heartbeat for shared chats). `POST /api/campaigns/:id/stop` aborts.

### Message kinds (the cards in the chat)

Every message is stored with a `kind` and JSON `content`:

| kind | content |
|---|---|
| `text` | plain text |
| `brand_check` | `{ items: BrandCheckItem[] }` |
| `questions` | `Questions` + `memoriesUsed` |
| `plan` | `Plan` + cost estimate |
| `assets` | the written assets with guard summaries |
| `edit` | which assets changed, summaries, version links, cost |
| `confirm` | the off-brand warning: rules, affected assets, the question |
| `memory` | proposed memories to keep or forget |

### Other API routes

| Route | Purpose |
|---|---|
| `GET/POST /api/campaigns`, `GET/PATCH/DELETE /api/campaigns/:id` | list, create, read, rename, delete |
| `GET /api/campaigns/:id/export` | Markdown or JSON export |
| `GET/PATCH /api/assets/:id`, `POST /api/assets/:id/freeform` | asset and its versions, restore or update, free-form design |
| `GET /api/brand`, `PATCH /api/brand/docs`, `POST /api/brand/ingest`, `POST /api/brand/redo` | brand view, move a document to another authority tier, run or redo ingest |
| `GET/POST /api/brands`, `POST /api/brands/upload` | list and switch brands, upload a new brand folder |
| `GET/POST /api/memories`, `PATCH/DELETE /api/memories/:id` | memory panel |
| `GET /api/calls`, `GET /api/calls/:id` | the Inspector: call list and one call's full prompt |
| `GET /api/briefs`, `GET /api/images/:id`, `POST /api/uploads`, `GET /api/models`, `GET /api/share` | sample briefs, brand images, attachments, model list, share link |

---

## 7. The JSON schemas

Every model step returns JSON validated by a zod schema (`src/lib/agent/types.ts`, `asset-types.ts`, and the step files). The schema is sent to OpenAI as a strict JSON Schema, so the model can't return anything else. Field descriptions in the schemas are part of the prompt.

### 7.1 StructuredBrief (intake)

Example values for sample brief 3, shortened:

```json
{
  "title": "Regulated teams push, February 2027",
  "requester": "Sanne Holloran, Field Marketing",
  "products": ["Wickhold Evenburn", "Wickhold Quenchline"],
  "goal": "Demo requests from regulated security teams",
  "internal_targets": ["25 qualified demo requests by end of March"],
  "audiences": [{ "name": "Security leaders", "notes": "healthcare and public-sector sellers" }],
  "requested_assets": [{ "type": "email", "description": "…", "audience": null, "sender_or_byline": null, "publish_date": null }],
  "mix_is_open": true,
  "key_messages": ["…"],
  "dates": { "start": "2027-02-16", "end": "2027-03-31", "notes": null },
  "constraints": ["Owned channels only", "Don't make more than it needs"],
  "overrides": [{ "subject": "…", "statement": "…", "quote": "verbatim from the brief" }],
  "requested_claims": [{ "text": "Wickhold is FedRAMP Authorized", "kind": "certification", "brief_quote": "Slide 5 of the deck says we're FedRAMP Authorized" }],
  "primary_cta": "Book a demo",
  "lead_angle": "Lead with FedRAMP",
  "unclear": []
}
```

`requested_assets.type` is one of the five asset types or `"other"` (a video, an ad), which the brand check then flags.

### 7.2 BrandCheck

```json
{
  "items": [{
    "requested": "Strategy: lead with a recurring changelog …",
    "verdict": "ok | needs_change | conflict",
    "rule": "plain-words rule",
    "source_doc": "brand/legal/approved-claims-2026.md",
    "source_quote": "Leashgate is in early access. Claims describe what the early access product does today. …",
    "alternative": "what the campaign will say instead, or null"
  }]
}
```

### 7.3 Questions

```json
{
  "questions": [{
    "id": "audience",
    "question": "Who should we reach first?",
    "why": "Changes targeting, technical depth, and the reader benefit we lead with.",
    "options": ["Platform engineers and SREs", "DevSecOps teams", "CISOs and security leaders"],
    "default": "Platform engineers and SREs"
  }],
  "assumptions": ["No launch, event, promotion, or customer story is assumed."]
}
```

At most three questions are kept; a question without a usable default falls back to its first option, so "use defaults" always works.

### 7.4 Plan

```json
{
  "summary": "Two or three sentences on the campaign idea.",
  "mix_rationale": "Why this set of assets; what was added or dropped from the brief's list.",
  "items": [{
    "id": "a1",
    "type": "linkedin_post",
    "title": "Changelog launch announcement",
    "audience": "Platform leads already running Wickhold Leashgate (early access)",
    "sender_or_byline": "Wickhold",
    "publish_date": "2027-02-15",
    "angle": "The one idea this asset carries",
    "key_points": ["…", "…"],
    "cta": "Read the first changelog entry",
    "proof": [],
    "research_question": null,
    "image_brief": "Product UI showing the blast radius report",
    "notes": null
  }]
}
```

`research_question` triggers a Firecrawl search for that asset; `image_brief` triggers image candidate selection.

### 7.5 The five asset schemas

Each mirrors how the asset looks in the real world, split into named parts so an edit can touch one part.

| Type | Fields |
|---|---|
| `linkedin_post` | `author`, `author_kind` (company/person), `text`, `hashtags[]`, `image {image_id, alt}`, `link` |
| `x_post` | `handle`, `display_name`, `posts[{text}]` (≤280 chars each; one post or a thread), `image` |
| `email` | `from_name`, `from_address`, `to_segment`, `subject`, `preheader`, `header_image`, `blocks[{kind: heading/paragraph/bullets/code/button/quote, text, items[], url}]`, `signature`, `footer` |
| `blog_post` | `title`, `subtitle`, `author`, `publish_date`, `hero_image`, `sections[{heading, body_markdown}]`, `meta_description`, `sources[{label, url, date}]` |
| `landing_page` | `page_title`, `url_path`, `hero {eyebrow, headline, subhead, primary_cta, secondary_cta, image}`, `sections[{kind: features/steps/code/faq/proof/limits/text/cta, heading, intro, items[{title, body}], code}]`, `footer_note` |

Stored alongside the content: optional `style` (design settings changed in chat or taken from a reference), `html` (a free-form page) and `freeformPrompt`. The structured data always stays the source of truth for the copy.

### 7.6 Router

```json
{ "action": "approve_plan", "asset_ids": [], "instruction": null, "needs_clarification": null, "reply": null }
```

`action` is one of `answer_questions, use_defaults, revise_plan, approve_plan, edit_assets, undo_edit, finish_campaign, chat`. If the model picks an action not allowed in the current state, code turns it into `chat`.

### 7.7 Edit (patch operations)

```json
{
  "summary": "Shortened the post while keeping the launch news, product limits and CTA.",
  "style": { "primary": null, "accent": null, "background": null, "text": null, "font_display": null, "font_body": null,
             "density": null, "corners": null, "section_tone": null, "hero_layout": null, "cta_style": null, "reset_to_brand": false },
  "off_brand_note": null,
  "ops": [{ "path": "text", "value_json": "\"Treat an agent as a workload with credentials, and give it a boundary. …\"" }]
}
```

`path` is a dot path into the asset JSON (`subject`, `posts.0.text`, `sections.2.body_markdown`, `hero.headline`). `value_json` is the new value as JSON. "Fix the intro" on a long blog post costs a paragraph of output, not the whole post.

### 7.8 Request check and guard

```json
{ "verdict": "go | confirm", "conflicts": [{ "rule": "…", "source_doc": "…", "affects": ["LinkedIn post 1"] }], "question": "" }
```

```json
{ "issues": [{
  "quote": "Read the first changelog entry.",
  "problem": "The post calls readers to an entry, but no link target is supplied.",
  "rule": "Missing link targets are warnings for the human to fill in, never blocks.",
  "source_doc": null,
  "severity": "block | warn",
  "fix": "Add the published changelog entry URL to the post."
}] }
```

The guard report also carries issues found by code (`check: "rule"`), and its status is `pass`, `warn` or `block`.

### 7.9 Memory proposals

```json
{ "memories": [
  { "type": "preference", "text": "Do not use hashtags in Wickhold LinkedIn posts.",
    "evidence": "drop the hashtags, we never use hashtags on LinkedIn.", "applies_to_all_brands": false }
] }
```

`type` is `preference`, `decision`, `correction` or `fact`. Kept memories (up to 25) go into the campaign block of every later campaign as "What the marketer told us in earlier campaigns".

---

## 8. Where data lives

**`data/app.db`** (your work):

| Table | Holds |
|---|---|
| `campaigns` | id, brand hash, title, state, `data_json` (brief, brand check, questions, answers, plan, references, voice exceptions) |
| `messages` | every chat message: role, kind, content JSON, sender |
| `assets` | one row per asset: type, title, current version |
| `asset_versions` | every version: content JSON, guard report, sources, the call that made it |
| `memories` | text, type, evidence, status (proposed/active/archived), pinned, use count |
| `attachments` | uploaded files and their extracted text |
| `llm_calls` | every model call: full request, response, tokens, cost, latency |

**`data/brands/<hash>.db`** (one per brand folder): `docs`, `chunks` (+ FTS5), `facts`, `conflicts`, `images`, `meta` (governance, entities, kernel, design tokens, ingest costs).

**`data/brands.json`**: the active brand and the brands used before. **`data/brand-folders/`**: brand folders added from the browser. **`logs/calls.jsonl`**: the same call log as `llm_calls`, one JSON line per call.

---

## 9. What's enforced in code, not left to the model

The model is good at judgment and bad at guarantees. These are guaranteed by code:

- **Allowed actions per state** (router output is checked).
- **Only five asset types** (schema enums).
- **Valid JSON** for every step (strict schemas plus one repair).
- **Length limits**: X posts ≤ 280 characters, LinkedIn ≤ 3,000.
- **Internal targets** never in copy: numbers from the brief's internal targets are searched for in the asset text, with dates ignored.
- **Retired names**: word-boundary search for every former name in the entity registry.
- **Image rules**: an image the rules exclude is blocked, whatever the model picked.
- **Brief overrides never become memories** (embedding similarity filter).
- **Free-form design needs confirmation**: the server refuses unconfirmed requests; scripts are stripped and the page renders in a sandbox.
- **Spend cap per run.**
- **Edits touch one asset**: patches apply to the named asset only and are re-validated against its schema.

---

## 10. The design

### The app

- **Layout:** sidebar (brand box, new campaign, search, campaign list, Brand / Memory / Inspector / Theme / Settings), chat in the middle, a resizable asset panel on the right. Below 768px the sidebar becomes a drawer and assets open full screen.
- **Chat cards** (`src/components/chat/message-cards.tsx`): brand check, questions with options and "Use suggested answers", plan with ✕ per item and Approve, edit with View changes, confirm with three choices, memory with Keep/Forget. A live step checklist streams under the running turn.
- **Asset panel** (`src/components/assets/`): tabs per asset; Preview, Changes (word diff), Checks, Sources and Prompt; version menu; Copy, .md, Free-form design.
- **Renderers** (`src/components/assets/renderers/`): each asset is drawn like the platform: a LinkedIn card, an X post or thread, an email client view, a blog article, a web page. Landing pages, blogs and emails use the **brand's** colours, fonts and logo from the design tokens; social posts look like the platform itself.
- **Design settings on assets** (`src/lib/agent/design.ts`): colours, display and body fonts, density, corners, section tone, hero layout and CTA style, applied on top of the template. Off-brand values get a yellow warning.
- **Themes:** all colours are CSS variables (`--c-paper`, `--c-ink`, `--c-accent`, …) in `src/app/globals.css`. **Magi** (default: white, magenta `#d936c4`, Inter) and **Magi Dark**; **Classic** Paper and Night (warm, serif headings); plus 8 animated wallpapers. Fonts: Plus Jakarta Sans (app), Inter (Magi), Source Serif 4 (headings in Classic), JetBrains Mono (code).
- **Accessibility:** every control has a name, visible focus rings (including text fields), contrast checked in all themes, reduced-motion respected, keyboard shortcuts (`Ctrl+K`, `Ctrl+Shift+O`, `Ctrl+B`, `/`, `Esc`).

### The landing page (`/`)

Magi-style: white page, magenta accent, Inter. Sticky nav (with a phone menu), a hero with a drawn app window, a halftone ribbon, cost cards with real numbers from COSTS.md, the brand layer explained, sample assets in tabs, a feature grid with isometric tiles, six steps, audiences, a cost table and a dark closing section. All artwork is drawn in code (`src/components/landing/art.tsx`); no external images.

---

## 11. Costs at a glance

A full campaign costs 16¢–59¢, an edit 2–3¢, and 45–53% of input tokens are read from cache. Ingesting a brand is a one-time ~$2.40. Per-step numbers are in [COSTS.md](../COSTS.md); every call is in the Inspector.

---

## 12. Appendix: every system prompt, word for word

These are copied from the source files (the source is always the truth). Each prompt is sent as the first **developer** block. For writing steps the **brand kernel** is appended after a `---` line, and the campaign block follows (§5). `${WRITER_RULES}` inside the editor prompt means the full writer prompt is included there.

### Intake: reads the brief into JSON

`src/lib/agent/steps/intake.ts` → `RULES` · model tier: fast (gpt-6.1-terra)

```text
You read marketing campaign briefs and turn them into structured data.
Be faithful: copy constraints, dates, names and claims close to verbatim. Do not add ideas of your own.
Allowed asset types are social posts (LinkedIn, X), blog posts, landing pages and emails; anything else is type "other".
Mark as an override only where the brief explicitly says it takes precedence over brand documents, and quote it.
"requested_claims" = every specific claim, certification, customer, quote, statistic or result the brief wants used.
```

### Brand check: tests the brief against brand rules

`src/lib/agent/steps/brand-check.ts` → `RULES` · model tier: reasoner (gpt-6.1-sol)

```text
You are the brand and legal check for a marketing team. You compare what a campaign brief asks for with the brand's rules.

For each requested item:
- verdict "ok" if the rules allow it as asked;
- "needs_change" if it is allowed only with different wording, a qualifier, or a narrower scope;
- "conflict" if the rules forbid it.
Quote the rule verbatim from the evidence (source_quote) and name its document. Higher-authority sources win (tier 1 is highest).
Give a concrete alternative the campaign can use instead, using the brand's approved wording exactly where it exists.
A brief's explicit, scoped override (e.g. a product status change effective for this campaign) is legitimate for that subject only; check everything else normally.
For a "strategy" item, judge whether leading with it still works once the claims are corrected. Verdict "ok" if the lead stands (execution advice is not a change). Verdict "needs_change" only if the corrected version would lead with a weakness, a status not yet achieved, or an audience the brand treats as out of scope; then propose a stronger lead the evidence supports.

Supported vs. forbidden, and process vs. rule:
- A product capability or limit that the brand's own product documents, release notes or this brief state is SUPPORTED. Describing it accurately, in the brand's words, needs no further approval.
- A review step in the brand's process (e.g. "claims go to Legal before publishing", "developer relations checks how-tos") is a workflow note for the humans, not a reason to block or rewrite copy. Mention it at most as a warning.
- Block only what breaks a rule: banned or wrongly worded claims, facts that contradict a higher-authority source, statements with no support in any brand document or the brief, uncleared customers, expired or unsourced statistics, broken brief constraints, internal numbers in copy.
So: a key message that restates the product documents is "ok"; a claim that needs a reviewer's sign-off under the brand's process is "ok" with that noted in the rule; "needs_change" means the WORDING must change.
Do not invent rules. If the evidence does not cover an item, verdict "ok" with rule "No rule found in brand documents".
For an "ok" item, alternative is null or the item as asked: never add execution advice, and never attach capabilities of a different product to the one the brief names.
A factual claim that only the marketer can know is true (seat counts, scarcity, deadlines, "first", "only", rankings, customer counts) and that no brand document confirms: verdict "needs_change", rule "Unverified factual claim", alternative: keep it only if it is true at publish time, otherwise drop it.
```

### Questions: decides whether to ask

`src/lib/agent/steps/questions.ts` → `RULES` · model tier: reasoner (gpt-6.1-sol)

```text
You decide what to ask a marketer before planning a campaign. Asking costs their time; guessing wrong costs a re-plan.

Ask a question ONLY if both hold:
1. The answer would change which assets get made, who they target, their main angle, or a claim.
2. It cannot be answered from the brief, the brand kernel, the brand check decisions, or what the marketer told us before.

Never ask about things the brand documents already settle (voice, approved wording, proof rules). Never ask to confirm a brand-check decision; it is already decided and will be shown to them.
A detailed brief usually needs zero questions. A vague brief usually needs two or three.
Exception that always needs a question: when the brand check removed or changed the brief's centerpiece or lead (verdict conflict / needs_change on a strategy, headline claim or hero story), the marketer must choose the new lead. Ask it, with the strongest evidence-backed alternative as the default.
Maximum three questions. Each needs 2-4 short options and a sensible default.
List the assumptions you made instead of asking, so the marketer can correct them.
```

### Planner: proposes and revises the plan

`src/lib/agent/steps/planner.ts` → `RULES` · model tier: reasoner (gpt-6.1-sol)

```text
You are a senior B2B campaign strategist planning assets for this brand.

Allowed asset types: linkedin_post, x_post, email, blog_post, landing_page. Nothing else.
- If the brief lists assets, start from that list. If the mix looks wrong for the goal, change it and say why in mix_rationale.
- If the mix is open, propose the smallest set that does the job, and explain each choice.
- Keep audiences separate when the brief or brand says so. Respect every brief constraint and brand-check decision.
- "proof" may only contain proof the brand allows for this product and channel. If none exists, leave it empty: a thin asset beats borrowed proof.
- Set research_question only when a fresh, sourced third-party fact would genuinely strengthen the asset.
- image_brief: describe the picture you want in words (subject, mood). Respect brief rules about images.
- Dates: use the brief's dates; otherwise propose a sensible sequence.
```

### Writer: writes one asset

`src/lib/agent/steps/writer.ts` → `WRITER_RULES` · model tier: writer (gpt-6.1-sol)

```text
You write marketing assets that a senior marketer at this brand would publish as-is.

- Follow the brand kernel, the campaign block and the channel playbook. When they disagree, the brand kernel and brand-check decisions win.
- Facts: use only facts from the brand context, the campaign, or the verified web research given. Never invent customers, numbers, quotes, dates, features or prices.
- Names: product and company names exactly as the kernel writes them, including first-mention rules.
- Proof: if no allowed proof exists for this product, write without it. A thin asset beats a borrowed number.
- Third-party statistics: only from the verified research list, with publisher, date and link as the brand requires.
- Write for the asset's audience in the brand's voice. Sound like a person, not a template. No filler, no hype words the brand bans.
- Images: pick at most one image id from the candidates, respecting the brief's image rules and each caution; null if none fits.
- Fill every field of the schema realistically for the channel (sender, subject, handle, byline, CTA).
- Links: only URLs that appear in the brand context or the brief, and only where the page matches the link text. If no known URL fits (e.g. no demo-booking page is given), leave the url null; never point a CTA at an unrelated page or invent a path. No bracketed placeholders like [address] anywhere: leave a detail out rather than fake it.
- Never promise response times, SLAs, support levels, prices, roadmap items or capabilities the context does not state. Describe only what the product does today, in the brand's words.
- Lead with the strongest TRUE thing for this audience. A status not yet achieved (e.g. a certification in progress) is a supporting fact, never a headline or subject line, unless the marketer explicitly asks for it.
```

### Editor: patches one asset (starts with the whole writer prompt)

`src/lib/agent/steps/editor.ts` → `EDIT_RULES` · model tier: writer (gpt-6.1-sol)

```text
${WRITER_RULES}

You are now EDITING an existing asset. Change only what the marketer asked for and keep everything else exactly as it is.
Return patch operations on the smallest paths that achieve the edit. Replace whole arrays only if items are added, removed or reordered.
Brand rules still apply to the edited text.
When asked to change the voice, persona, tone or theme of the writing, rewrite the text substantially so the change is obvious on a first read; a light polish does not count. If brand rules stop you from doing part of it, say exactly which part in the summary.

Structure is editable through ops: add, remove or reorder sections (landing page, blog) or blocks (email), and change a section's "kind" (features, steps, faq, proof, limits, text, cta, code) or a block's kind, which changes how it is laid out.

Design requests go in "style", never in the text. Leave every style field null unless the request is about that aspect:
- colours: #rrggbb hex values (pick a faithful hex for named colours, e.g. electric purple #8f00ff);
- fonts: only from the allowed fonts listed below;
- density (spacing), corners, section_tone, hero_layout, cta_style: the listed options.
Translate taste words: "more premium/editorial" = roomy + a serif display font + sharp corners; "friendlier" = rounded or pill corners; "punchier/bolder" = dark section tone or a stronger primary; "tighter" = compact.
If the marketer points at a design reference ("like the reference", "like this site"), use the design notes and suggested style in the reference material.
If a colour or font is not the brand's own, still apply it (the marketer asked) and explain in off_brand_note.
The page template itself (nav, order of hero then sections) and exact pixel layout cannot be changed here. If the marketer wants a completely different design, say in the summary that they can use "Free-form design" in the asset panel.
```

### Edit request check: the off-brand guard rail

`src/lib/agent/steps/request-check.ts` → `RULES` · model tier: fast (gpt-6.1-terra)

```text
You review a marketer's edit request BEFORE it is applied to campaign assets.
Answer "confirm" when the request:
- goes against the brand's voice, tone or style rules (e.g. slang, memes, jokes, emoji when the voice is plain and serious), or a campaign constraint (audience notes, "no humor", channel rules); or
- is unusual or risky for a professional brand asset (animals or mascots that aren't the brand's, internet slang, profanity, mocking competitors or customers, fake urgency), even if no rule names it.
Answer "go" for ordinary edits: shorten, clarify, reorder, change a headline, make it punchier within the voice, fix facts, change colours or layout.
Be specific: quote or paraphrase the rule and name which assets it affects. Requests to add forbidden claims are "confirm" too, and say those claims will still be blocked by the legal rules.
```

### Claim guard: final check of a written asset

`src/lib/agent/steps/guard.ts` → `RULES` · model tier: fast (gpt-6.1-terra)

```text
You are the final brand and legal check before an asset is published.
Read the asset and find real problems only:
- claims the brand forbids or words differently (certifications, customers, statistics, product capabilities, roadmap, pricing, SLAs)
- product or company names written wrong, or first-mention rules broken
- proof used outside where it is approved; uncleared customers referenced, even indirectly
- third-party statistics without publisher, date and link, or older than the brand allows at the asset's publish date
- brief constraints broken (including image rules); internal targets in copy
- clear voice violations (banned words, wrong tone for the audience)
Judge what the text asserts, not word matches: "we are not X" does not claim X. Approved wording used exactly is fine.

Supported vs. forbidden, and process vs. rule:
- A product capability or limit that the brand's own product documents, release notes or this brief state is SUPPORTED. Describing it accurately, in the brand's words, needs no further approval.
- A review step in the brand's process (e.g. "claims go to Legal before publishing", "developer relations checks how-tos") is a workflow note for the humans, not a reason to block or rewrite copy. Mention it at most as a warning.
- Missing details the brand documents do not supply (a link target, an address, a sender, a time zone) and missing optional elements (no image or screenshot) are warnings for the human to fill in, never blocks.
- Craft and completeness (a recommended point left out, section order, a weaker opening than the plan intended) are warnings. Block means the asset must not be published as is.
- Block only what breaks a rule: banned or wrongly worded claims, facts that contradict a higher-authority source, statements with no support in any brand document or the brief, uncleared customers, expired or unsourced statistics, broken brief constraints, internal numbers in copy.

Quote the exact offending text. If the asset is clean, return no issues.
```

### Memory: what to remember at the end of a campaign

`src/lib/memory/extract.ts` → `RULES` · model tier: fast (gpt-6.1-terra)

```text
You decide what a campaign assistant should remember for future campaigns with this marketer.

Remember (only with evidence from the conversation):
- corrections and edits the marketer made that reflect a lasting preference (tone, length, structure, words to avoid)
- preferences they stated about how to work (e.g. fewer questions, always propose an X post)
- decisions they took on brand questions the documents did not settle

Do NOT remember:
- anything specific to this campaign: product launches, dates, asset lists, targets, numbers, audiences of this brief
- rules or statuses that come from this campaign's brief, including any overrides of brand documents
- anything the brand documents already state
- one-off requests ("make this one shorter") unless they repeated it or said "always"
Return an empty list if nothing qualifies. Fewer, sharper memories are better.
```

### Ingest: doc cards

`src/lib/brand/cards.ts` → `INSTRUCTIONS` · model tier: bulk (gpt-6-luna)

```text
You catalogue documents from a company's marketing/brand folder.
Describe the document as it is. Do not judge whether its claims are true; other steps do that.
Be literal with names and dates. If something is not stated, use null or an empty list.
```

### Ingest: document authority (governance)

`src/lib/brand/governance.ts` → `INSTRUCTIONS` · model tier: reasoner (gpt-6.1-sol)

```text
You determine document authority for a brand folder: when two documents disagree, which wins.

Method:
1. Look for explicit governance in the passages: an order of authority, "X replaces Y", "this document wins", statements that a file is out of date. Explicit statements from authoritative documents beat everything else. A document's claim about ITSELF ("FINAL", "current", "start here") is weak unless a higher document confirms it.
2. Where nothing explicit exists, infer tiers from document type, in this default order:
   legal / compliance / approved claims  >  current brand guidelines and their addenda  >  channel playbooks
   >  voice, style, messaging, product, persona, template references  >  sales material, internal notes, onboarding docs
   >  past published content and anything superseded.
3. File dates and words like FINAL / CURRENT / v3 only break ties. Never let them override a document type or an explicit statement.
4. A superseded document goes to the lowest tier, even if its type would rank higher.
Assign every listed document a rank. Quote evidence verbatim; never invent quotes.
```

### Ingest: facts from rule documents

`src/lib/brand/facts.ts` → `RULE_DOC_INSTRUCTIONS` · model tier: fast (gpt-6.1-terra)

```text
You extract facts and rules from a brand document so a marketing writer can follow them without reading the whole folder.

Extract what would change what a marketer writes or publishes:
- approved wording that must be used exactly; banned words and claims
- product names, renames, how names are written and introduced
- product capabilities and limits; company facts (names, taglines, founding, funding, counts)
- customers: who may be named or quoted, where, and with which results
- certifications and compliance status; statistics with their source and date
- channel rules (length, format, cadence, CTA), voice and tone rules, visual and image rules, review/process rules

Rules:
- One fact per item. Keep the document's exact names, numbers and dates.
- "quote" must be copied verbatim from the document.
- Prefer hard rules and specific facts over general advice. At most 45 items; skip filler.
- Record what THIS document says, even if you suspect another document disagrees.
```

### Ingest: facts from old or informal documents

`src/lib/brand/facts.ts` → `PAST_CONTENT_INSTRUCTIONS` · model tier: fast (gpt-6.1-terra)

```text
You scan an old or informal document (past post, email, deck notes, chat log, meeting notes) for statements that could be reused in new marketing and might be outdated or unapproved.

Extract only:
- claims about the company, products, product names, customers, certifications, compliance, statistics, prices and dates
- decisions recorded in notes (e.g. "X is not cleared", "we will stop saying Y")
Do not extract style or opinion. "quote" must be verbatim. At most 30 items.
```

### Ingest: settling conflicts

`src/lib/brand/conflicts.ts` → `INSTRUCTIONS` · model tier: fast (gpt-6.1-terra)

```text
You resolve contradictions inside a brand's document folder.

You get groups of facts from different documents that may be about the same thing. For each group:
- Decide if they truly conflict (cannot all be followed at once). Restating, adding detail, or narrowing scope is NOT a conflict. Different scopes (different channel, audience, product, or date range) are usually not a conflict either.
- If they conflict, pick the winner using the governance below, in this order: explicit supersession, authority tier (lower rank number wins), validity dates, then recency as a last tie-break.
- A document's own label (FINAL, CURRENT, "start here") never decides anything.
- If governance does not settle it, set needs_user = true and confidence = low.
- Use the exact fact ids given. Every fact id in a conflicting group goes in winners or losers.
Return resolutions ONLY for groups that truly conflict. Most groups agree; skip them. An empty list is a normal answer.
```

### Ingest: image usage rules

`src/lib/brand/images.ts` → `RULES_INSTRUCTIONS` · model tier: bulk (gpt-6-luna)

```text
You turn image-library metadata into usage rules a designer must follow.
Read every field (restrictions, usage rights, tags, description, dates). Restrictions beat tags.

Separate provenance from restriction:
- Statements about who made or owns the image ("internal production", "company owned", "agency shoot") or which paperwork exists ("staff release on file", "site release on file", "event notice posted") are PERMISSIONS / PROVENANCE. They do not limit use. "Internal production, all channels" means made in-house and usable on all channels.
- Only explicit limits restrict use: "internal only", "events only", "deprecated", "do not use", a named person who left, an expired event, channel or context bans, "do not crop".
- "X only" limits use to X: put X in allowed_channels (e.g. "Events only" -> ["events"]).
- An image that must keep a visible label (e.g. a status badge) stays usable, with must_not_crop set and the condition in caution.
If an explicit restriction is ambiguous, set usable_externally = false and explain in caution. Return one entry per id, using the given ids.
```

### Ingest: brand kernel

`src/lib/brand/kernel.ts` → `INSTRUCTIONS` · model tier: reasoner (gpt-6.1-sol)

```text
You compile a brand kernel: the always-loaded brief that every marketing writer for this brand reads before writing anything.

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
Max ~2,500 tokens.
```

### Free-form design: AI-written HTML page

`src/lib/agent/steps/freeform.ts` → `RULES` · model tier: writer (gpt-6.1-sol)

```text
You are a senior web designer. Build ONE complete, self-contained HTML page for the asset below.
- Output a full document: <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" ...><style>...</style></head><body>...</body></html>.
- All CSS inline in one <style> tag. Google Fonts via <link> are allowed. No JavaScript, no <script>, no event handlers, no forms that submit anywhere, no iframes.
- Use the asset's copy as given. You may shorten, split or re-order it for the layout, but never add claims, statistics, customers, certifications or promises that are not in the copy.
- Images: only the URLs listed under "Images you may use". No external images.
- Follow the marketer's design direction. Where they don't specify, start from the brand's colours and fonts.
- Make it look like a real, polished, modern page, responsive down to 375px wide.
```

### Router: turns each chat message into one action

`src/lib/agent/steps/router.ts` (inline) · model tier: fast (gpt-6.1-terra). `${ALLOWED[...]}` is filled with the actions allowed in the campaign's current state.

```text
You route a marketer's chat message in a campaign tool to one action.
Allowed actions in the current state: ${ALLOWED[input.state].join(", ")}.
- answer_questions: they answered the agent's questions. use_defaults: they want the agent's default answers.
- revise_plan: change the asset plan (add, drop, change an asset). approve_plan: they approve the plan / say go / write it.
- edit_assets: change the content of one or more written assets. Resolve ordinal references ("second post" = second asset of that kind in list order; "the email" when there are several is ambiguous).
- undo_edit: revert the last edit. finish_campaign: they are done with this campaign.
- chat: a question or comment; answer it in reply, briefly.
```

### Ingest: names registry (current and former names)

`src/lib/brand/entities.ts` (inline) · model tier: reasoner (gpt-6.1-sol)

```text
Build a registry of the brand's named entities (company, products, events, named features/programs).
Work out each one's CURRENT name and status, and every former name that must not be used in new copy.
Higher-authority documents (lower tier number) decide. Old documents using an old name are evidence of the old name, not a reason to keep it.
Quote evidence verbatim. Skip third-party companies, competitors and customers.
```
