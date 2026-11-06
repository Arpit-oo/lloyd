# Architecture

Lloyd is one Next.js process: React UI, API routes, and an agent library in the same TypeScript codebase, with two SQLite databases on disk. All diagrams below are Mermaid, so GitHub renders them inline.

- [1. System overview](#1-system-overview)
- [2. Brand layer: ingest pipeline](#2-brand-layer-ingest-pipeline)
- [3. Campaign state machine](#3-campaign-state-machine)
- [4. One chat turn](#4-one-chat-turn)
- [5. Editing an asset](#5-editing-an-asset)
- [6. Prompt layers and caching](#6-prompt-layers-and-caching)
- [7. Data model](#7-data-model)
- [8. Shared chats: live sync](#8-shared-chats-live-sync)
- [9. Which document wins](#9-which-document-wins)
- [10. Retrieval at write time](#10-retrieval-at-write-time)
- [11. Writing and the claim check](#11-writing-and-the-claim-check)
- [12. Routing a chat message](#12-routing-a-chat-message)
- [13. Memory lifecycle](#13-memory-lifecycle)
- [14. Models per step](#14-models-per-step)
- [15. Code map](#15-code-map)

## 1. System overview

```mermaid
flowchart LR
  subgraph Browser["Browser (one per person)"]
    UI["Chat · Asset previews · Panels<br/>(React 19)"]
  end

  subgraph Next["Next.js server (npm run dev / Docker)"]
    API["API routes<br/>src/app/api"]
    Agent["Campaign agent<br/>src/lib/agent"]
    Brand["Brand layer<br/>src/lib/brand"]
    Mem["Memory<br/>src/lib/memory"]
    LLM["LLM gateway<br/>src/lib/llm<br/>tiers · caching · spend cap · logging"]
    Runs["Run registry + presence<br/>(in memory)"]
  end

  subgraph Disk["Disk"]
    AppDB[("data/app.db<br/>campaigns · messages · assets<br/>memories · attachments · llm_calls")]
    BrandDB[("data/brands/&lt;hash&gt;.db<br/>docs · chunks + FTS5 · facts<br/>conflicts · images · meta")]
    Folder[["Brand folder<br/>BRAND_DIR"]]
    Logs[["logs/calls.jsonl"]]
  end

  OpenAI(("OpenAI<br/>Responses API"))
  Firecrawl(("Firecrawl<br/>search · scrape"))

  UI -- "fetch / SSE stream" --> API
  API --> Agent
  API --> Runs
  Agent --> Brand
  Agent --> Mem
  Agent --> LLM
  Brand --> LLM
  Agent -- "research · reference links" --> Firecrawl
  LLM --> OpenAI
  LLM --> Logs
  LLM --> AppDB
  Agent --> AppDB
  Mem --> AppDB
  Brand --> BrandDB
  Folder -. "read once at ingest" .-> Brand
```

Every model call goes through `src/lib/llm/client.ts`, which picks the model for a tier, places cache breakpoints, enforces the per-run spend cap, honours Stop (AbortSignal), and logs the exact request, tokens, cache hits and cost.

## 2. Brand layer: ingest pipeline

Runs once per brand folder, keyed by a hash of the folder's contents. Each step is resumable and can be redone on its own (`npm run ingest -- --redo conflicts,kernel`).

```mermaid
flowchart TD
  F[["Brand folder<br/>md · txt · pdf · docx · images + metadata"]] --> S[Scan + hash]
  S -->|hash matches a seed| Seed[("Copy shipped seed<br/>seed/brands/*.db.gz")]
  S -->|new brand| C["1 · Chunk by heading<br/>(keep breadcrumbs) → FTS5 + embeddings"]
  C --> D["2 · Doc cards<br/>type · status · date · self-claims"]
  D --> G{"3 · Governance"}
  G -->|explicit order found| GE[Brand's own order of authority]
  G -->|none| GI[Inferred by doc type<br/>dates only break ties]
  GE --> GU[User overrides<br/>from the Brand panel win]
  GI --> GU
  GU --> Fa["4 · Facts<br/>~2,300 atomic, quoted, dated"]
  Fa --> Co["5 · Conflicts<br/>seed grouping + directed audit<br/>→ settled by authority, validity, supersession"]
  Co --> Sup[Supersession inferred<br/>from conflict outcomes]
  Sup --> E["6 · Entities<br/>current + former names"]
  E --> K["7 · Kernel<br/>~2.5k tokens of winning facts"]
  F --> I["8 · Images<br/>vision captions + parsed usage rules"]
  F --> T["9 · Design tokens<br/>colours · fonts · logos"]
  K --> DB[("Brand DB")]
  I --> DB
  T --> DB
  Seed --> DB
```

## 3. Campaign state machine

Every message goes through a router that may only pick actions allowed in the current state. Nothing is written before the plan is approved.

```mermaid
stateDiagram-v2
  [*] --> new
  new --> clarifying: brief read · brand check · questions needed
  new --> plan_review: brief read · brand check · no questions
  clarifying --> plan_review: answers, or "use defaults"
  plan_review --> plan_review: revise plan
  plan_review --> writing: approve
  writing --> review: assets written + checked
  review --> review: edit · undo · free-form · revise plan
  review --> [*]: finish → memory proposals
  writing --> review: Stop (written assets kept)
```

## 4. One chat turn

```mermaid
sequenceDiagram
  autonumber
  participant U as Browser
  participant R as POST /api/campaigns/:id/messages
  participant Reg as Run registry
  participant A as Agent (handleMessage)
  participant L as LLM gateway

  U->>R: text, attachments, models, author, tab
  R->>Reg: startRun (one per campaign, else 409)
  R-->>U: SSE stream opens
  A->>A: save user message
  opt links to resemble / images attached
    A->>A: read references (Firecrawl text + screenshot, vision)
  end
  alt state = new
    A->>L: intake → brand check → questions or plan
  else
    A->>L: route (fast tier)
    A->>A: run the allowed action
  end
  loop progress
    A-->>U: status · draft text · message · asset · state
    A-->>Reg: steps + drafts (for watchers)
  end
  A-->>U: done (turn cost)
  R->>Reg: endRun
```

A run keeps going if the browser reloads or closes; Stop aborts its signal and every in-flight model call.

## 5. Editing an asset

```mermaid
flowchart TD
  M["Edit request<br/>'make the posts Gen Z with monkeys'"] --> RC{"Request check<br/>(voice rules · campaign constraints · unusual for a brand?)"}
  RC -->|go| Ed
  RC -->|conflicts| Q["Ask: Do it anyway / Only where allowed / Cancel"]
  Q -->|Do it anyway| Ex["Store confirmed exception on the campaign<br/>(writer, editor and guard all see it)"] --> Ed
  Q -->|Only where allowed| Ed
  Q -->|Cancel| Stop([Unchanged])
  Ed["Editor<br/>patch ops on named paths + design settings"] --> FF{"Free-form page?"}
  FF -->|yes| Redraw["Redraw the HTML with the change"] --> V
  FF -->|no| V{"Anything changed?"}
  V -->|no| Say([Say so · no new version])
  V -->|yes| Ver["New version<br/>(diff · undo · version picker)"]
  Ver --> G{"Guard<br/>deterministic + model"}
  G -->|block| Fix["One automatic fix + re-check"]
  G -->|pass / warn| Done([Edit card · View changes])
  Fix --> Done
```

## 6. Prompt layers and caching

Each prompt is built from blocks, most stable first, with a cache breakpoint after each, so parallel writers and later edits read the shared prefix from cache.

```mermaid
flowchart LR
  B1["Rules + brand kernel<br/>(per brand · always cached)"] --> B2["Campaign block<br/>brief · brand-check decisions · plan<br/>memories · references · confirmed exceptions"]
  B2 --> B3["Channel playbook<br/>(per asset type)"]
  B3 --> B4["Asset context<br/>facts · persona · examples · image candidates"]
  B4 --> B5["Instruction<br/>(variable tail)"]
```

The writer's output schema is part of the cached prefix, so the cache is warmed once per asset type before parallel writing. Cache writes are priced; the Inspector shows every block and its cache status.

## 7. Data model

```mermaid
erDiagram
  campaigns ||--o{ messages : has
  campaigns ||--o{ assets : has
  assets ||--o{ asset_versions : "versioned as"
  campaigns ||--o{ attachments : "references"
  campaigns ||--o{ llm_calls : "costs"
  assets ||--o{ llm_calls : "costs"
  memories }o--o| campaigns : "proposed from"

  campaigns {
    text id PK
    text brand_hash
    text title
    text state "new · clarifying · plan_review · writing · review"
    json data "brief · plan · references · exceptions · models"
  }
  messages {
    text id PK
    text role "user · assistant"
    text kind "text · brand_check · questions · plan · assets · edit · confirm · memory"
    json content "incl. author in shared chats"
  }
  assets {
    text id PK
    text type "linkedin_post · x_post · email · blog_post · landing_page"
    int current_version
    text status
  }
  asset_versions {
    int version
    json content "data · style · html (free-form)"
    json guard
    json sources
    text instruction
  }
  memories {
    text id PK
    text type "preference · decision · fact · correction"
    text status "proposed · active · archived"
  }
  llm_calls {
    text step
    text model
    int cached_tokens
    real cost_usd
  }
```

The brand database (`data/brands/<hash>.db`) is separate and read-only at runtime: `docs`, `chunks` + `chunks_fts`, `facts`, `conflicts`, `images`, and `meta` (governance, kernel, entities, design tokens).

## 8. Shared chats: live sync

```mermaid
sequenceDiagram
  participant A as Arpit's tab
  participant S as Server
  participant B as Coworker's tab

  A->>S: send message (author, tab id)
  S->>S: startRun — a second sender now gets 409
  S-->>A: SSE: steps · drafts · messages
  loop every 2.5 s while visible
    B->>S: GET /pulse (heartbeat: tab id + name)
    S-->>B: change signature · live run (steps, drafts) · who is here
    alt signature changed
      B->>S: GET /api/campaigns/:id (full view)
    end
  end
  Note over B: shows "Working on Arpit's message",<br/>live steps and asset drafts
  S-->>A: done
  B->>B: send enabled again (one at a time)
```

There are no accounts: anyone who can reach the machine on the network can open the link and use the API key. The Share panel says so.

## 9. Which document wins

Brand folders contradict themselves. Ingest decides once which document outranks which, then settles every contradiction with that order. A file called `FINAL` or a newer date only breaks ties.

```mermaid
flowchart TD
  D[["84 documents"]] --> C["Doc cards<br/>type · status · date · channels<br/>what it claims about itself ('replaces X', 'FINAL')"]
  C --> G{"Governance"}
  G -->|1. explicit rules in the folder| T["Tier per document<br/>1 = legal · 2 = guidelines · … · 4 = sales notes"]
  G -->|2. document type| T
  G -->|3. date / 'FINAL' only as tie-break| T
  T --> F["Facts<br/>~2,300 atomic claims, each with its quote"]
  F --> Grp["Group facts about the same thing<br/>from different documents"]
  F --> Aud["Audit risky low-tier claims<br/>(e.g. 'FedRAMP Authorized' in sales notes)"]
  Grp --> S{"Settle by tier"}
  Aud --> S
  S -->|winner| K["Kernel + brand check<br/>'use' with the quote"]
  S -->|loser| X["Never-say list<br/>'ignore' with the quote"]
  E["Entities<br/>Tallowatch → Evenburn"] --> R["Retired-name check<br/>in code, word boundaries"]
```

## 10. Retrieval at write time

The kernel is always in the prompt; everything else is looked up per asset. Two searches are fused so exact names and paraphrases both hit, and filters keep old campaign copy from posing as rules.

```mermaid
flowchart LR
  Q["Query<br/>(plan item · claim · paragraph)"] --> B["BM25 · SQLite FTS5<br/>exact names, numbers, rule words"]
  Q --> V["Embeddings<br/>paraphrases"]
  B --> RRF["Reciprocal rank fusion"]
  V --> RRF
  Flt["Filters from doc cards<br/>doc type · channel · tier 1–2 only"] --> RRF
  RRF --> W["Writer context<br/>~25 facts · playbook · persona<br/>past examples marked STYLE ONLY"]
  RRF --> CC["Claim check evidence<br/>one query per paragraph<br/>round-robin so no paragraph starves"]
```

## 11. Writing and the claim check

Every asset is written in parallel from a shared, pre-warmed cache prefix, then checked twice: hard rules in code, judgment by a model that must quote both the copy and the rule. A blocking issue gets one automatic fix and a re-check; anything left is shown, never hidden.

```mermaid
flowchart TD
  P["Approved plan"] --> PW["Prewarm cache<br/>one per asset type with 2+ assets"]
  PW --> W1["Writer · asset 1"] & W2["Writer · asset 2"] & W3["Writer · asset n"]
  W1 & W2 & W3 --> G
  subgraph G["Claim check, per asset"]
    direction TB
    Code["In code<br/>X ≤ 280 chars · LinkedIn ≤ 3,000<br/>internal target numbers · retired names<br/>image usage rules"]
    Model["Model<br/>claims · proof · names · tone<br/>evidence retrieved per paragraph"]
  end
  G -->|pass / warn| Done["Shown with Checks + Sources tabs"]
  G -->|block| Fix["Automatic fix<br/>smallest edit, new version"]
  Fix --> G2["Re-check once"]
  G2 --> Done
```

## 12. Routing a chat message

After the first brief, every message is routed to one action the current state allows. Two loops are closed in code: a reply to "are you sure?" is matched before routing, and a reply to the router's own clarifying question is routed together with the original request, so the same question is never asked twice.

```mermaid
flowchart TD
  M["New message"] --> PE{"Pending<br/>'are you sure?'"}
  PE -->|"yes / only where allowed"| Run
  PE -->|cancel| Keep["Leave as is"]
  PE -->|"none, or another message"| PC{"Pending<br/>clarifying question?"}
  PC -->|"yes, and not a button click"| Join["Original request<br/>+ question + this answer<br/>(must act now)"]
  PC -->|no| R
  Join --> R["Router (fast tier)<br/>action · asset ids · instruction"]
  R --> Allowed{"Action allowed<br/>in this state?"}
  Allowed -->|no| Chat["Chat reply"]
  Allowed -->|yes| Amb{"Needs clarification<br/>and not already asked?"}
  Amb -->|yes| Ask["Ask once<br/>store pendingClarify"]
  Amb -->|no| Act["answer_questions · use_defaults · revise_plan<br/>approve_plan · edit_assets · undo_edit<br/>finish_campaign · remember · new_brief · chat"]
  Act -->|revise_plan / edit_assets| RC{"Request check<br/>against brand rules"}
  RC -->|go| Run["Apply"]
  RC -->|confirm| Sure["Ask 'are you sure?'<br/>store pendingEdit"]
```

## 13. Memory lifecycle

Memory is small and visible. Nothing becomes active without the marketer, except what they explicitly asked to remember. Campaign-only exceptions never become memories.

```mermaid
stateDiagram-v2
  [*] --> proposed: "we're done" → extractor proposes<br/>(style · truth · choice · fix)
  [*] --> active: "remember this" → saved at once
  proposed --> active: Keep
  proposed --> archived: Forget
  active --> archived: Forget
  archived --> active: Keep
  active --> [*]: Delete
  archived --> [*]: Delete
  note right of active
    All active memories for the brand go into
    every new campaign, pinned first, capped.
    The questions card lists the ones used.
  end note
  note left of proposed
    Brief overrides are filtered out
    in code (embedding similarity)
    as well as in the prompt.
  end note
```

## 14. Models per step

Steps ask for a tier, not a model, so the campaign's model picker can swap models without touching the steps. Every call is priced and logged, which is what the Inspector's *Cost by step* shows.

```mermaid
flowchart LR
  subgraph writer["writer · gpt-6.1-sol"]
    w1[assets] --- w2[edits] --- w3[free-form pages]
  end
  subgraph reasoner["reasoner · gpt-6.1-sol"]
    r1[brand check] --- r2[questions] --- r3[plan] --- r4[governance · kernel]
  end
  subgraph fast["fast · gpt-6.1-terra"]
    f1[intake] --- f2[router] --- f3[request check] --- f4[claim check] --- f5[memory]
  end
  subgraph bulk["bulk · gpt-6-luna"]
    b1[doc cards] --- b2[image rules]
  end
  writer & reasoner & fast & bulk --> GW["LLM gateway<br/>cache breakpoints · spend cap · Stop · log"]
  GW --> L[("llm_calls<br/>tokens · cache hits · cost per step")]
  L --> I["Inspector → Cost by step"]
```

## 15. Code map

| Path | What lives there |
|---|---|
| `src/app/api/` | Route handlers: campaigns, messages (SSE), pulse, export, share, assets (+ free-form), brand, memories, uploads, calls, models, images |
| `src/lib/llm/` | The only door to the model: tiers, catalog, pricing, caching, budget, logging, embeddings |
| `src/lib/brand/` | Ingest: scan, loaders, chunk, cards, governance, facts, conflicts, entities, kernel, images, design tokens, retrieval |
| `src/lib/agent/` | State machine and steps: intake, brand check, questions, planner, writer, guard, editor, request check, free-form, research, references, router; runs, presence, design settings |
| `src/lib/memory/` | Memory store and end-of-campaign extraction |
| `src/components/` | Chat, composer, message cards, run steps; asset panel and renderers; brand, memory, inspector, settings and share panels; themes |
| `scripts/` | `ingest`, `brief`, `eval` / `bench`, `seed`, `test-keys`, contrast sweep |
| `evals/` · `fixtures/` | Eval specs per brief; a second mini brand; mock briefs |
| `docs/` | Guide, decisions, costs, notes, plan, recording script, this file |
