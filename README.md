# Lloyd: the brand-aware campaign agent

A local chat app where a marketer and an AI agent plan and write a campaign for a brand. It works from a large, messy brand folder by compiling it once into a **brand layer** (authority order, settled conflicts, names, rules, image rules, a short brand kernel). It then pulls in only the parts each step needs.

Chat on the left, assets on the right: LinkedIn and X posts, emails, blog posts and landing pages, rendered the way they'd look when published, in the brand's own colors and fonts. Every model call is logged with its exact prompt, tokens, cache hits and cost.

- How it works and why: [DECISIONS.md](DECISIONS.md)
- What it costs: [COSTS.md](COSTS.md)
- Build log, including where AI tools led me wrong: [NOTES.md](NOTES.md)

## Run it

Requires **Node 22+** (see `.nvmrc`).

```bash
cp .env.example .env        # add OPENAI_API_KEY and FIRECRAWL_API_KEY
npm install
npm run dev                 # http://localhost:3000
```

Put the brand folder at `./wickhold-candidate-package/candidate` (the default), or point `BRAND_DIR` in `.env` at any other brand folder.

**First run on a brand.** If the brand folder matches a shipped seed (the sample brand does), the index loads instantly from `seed/brands/`. For any other brand folder, the app opens an indexing screen first. Indexing takes a few minutes and costs roughly $1–3 for a 100k-token folder, once. It is cached by a hash of the folder's contents, so changing any file triggers a fresh index.

## The chat

It works like the chat apps you know: a sidebar of campaigns (searchable, grouped by date, rename and delete from the ⋯ menu), a composer that takes **attached files** (PDF, Word, Markdown, text; drag, paste or the paperclip), a **model menu** (Best / Balanced / Fast presets, or pick the writing model), **Stop** while it works, Copy and Retry under replies, and **light / dark / system** themes. Shortcuts: `Ctrl+Shift+O` new campaign, `Ctrl+B` sidebar, `/` focus the message box. A run keeps going if you reload the page, and Stop aborts it for real (in-flight model calls included). On small screens the sidebar becomes a drawer and assets open as a full-screen sheet.

## Using it

1. **New campaign**, then paste a brief, attach a brief file, or click a sample brief (it loads into the box so you can read it before sending).
2. The agent checks the brief against the brand's rules and shows a **Brand check** card. It lists what it won't do as written, quotes the rule and its source, and gives the alternative.
3. It asks questions **only** if the answers change the plan, each with a default. "Use defaults" works.
4. It proposes a **plan** with a cost and time estimate. Approve it, remove items, or ask for changes in chat. Nothing is written before approval.
5. Assets are written in parallel, each with its own context, then checked against brand and legal rules. Blocking problems get one automatic fix.
6. Edit in chat ("shorten the second LinkedIn post"). Only that asset changes, and it gets a new version (version picker, undo).
7. Say "we're done" to finish. The agent proposes what to **remember**; you keep or forget each item. New campaigns use what you kept.

**Header buttons:**
- **Brand**: which document wins and why, the settled conflicts with quotes, current and former names, excluded images, and the brand kernel.
- **Memory**: view, add, edit, pin and forget memories.
- **Inspector**: every call's exact prompt, block by block with cache breakpoints, and the cost by step.

Each asset also has **Checks**, **Sources** and **Prompt** tabs.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | The app |
| `npm run ingest` | Build or load the brand index and print what it found. `-- --redo conflicts,kernel` redoes only those steps; `-- --force` rebuilds everything |
| `npm run brief -- <brief.md> [--answers "…"] [--edit "…"] [--finish --accept-memories]` | Run a brief end to end in the terminal |
| `npm run eval` | Behavioral checks per brief (`evals/*.json`): questions asked, traps refused, banned content absent, edits touch one asset, memory carries over |
| `npm run bench` | Same runs, then writes `COSTS.md` |
| `npm run seed` | Pack the current brand index into `seed/` |
| `npm run test:keys` | Smoke-test the API keys, models, caching, Firecrawl and vision |
| `npm test` | Unit tests |

## Where things are

```
src/lib/llm/      the only door to the model: tiers, caching, spend cap, logging, pricing
src/lib/brand/    ingest: scan, chunk, doc cards, governance, facts, conflicts, entities, kernel, images, retrieval
src/lib/agent/    state machine + steps: intake, brand check, questions, plan, write, guard, edit, research, router
src/lib/memory/   memory store and end-of-campaign extraction
src/components/   chat, asset renderers, inspector and panels
evals/            per-brief expectations (test data only; the app never reads them)
fixtures/mini-brand/  a tiny second brand with no governance doc, used to check nothing is brand-specific
```

Logs: `logs/calls.jsonl` (every call, with full request and response) and the `llm_calls` table in `data/app.db`.

## Models

All OpenAI, chosen per task (`src/lib/llm/models.ts`, override with `MODEL_*` env vars). Reasons are in DECISIONS.md.

| Tier | Default | Used for |
|---|---|---|
| writer | gpt-6.1-sol | asset writing and edits |
| reasoner | gpt-6.1-sol | plan, brand check, questions, governance, kernel |
| fast | gpt-6.1-terra | intake, routing, claim check, fact extraction, conflicts, vision, memory |
| bulk | gpt-6-luna | doc cards, image-rule parsing |
| embed | text-embedding-3-small | retrieval |
