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
- [9. Code map](#9-code-map)

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

## 9. Code map

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
