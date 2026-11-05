# Decisions

## 1. Brand layer: compile once, retrieve per step

The brand folder (84 docs, ~145k tokens, 122 images) is compiled once into a per-brand SQLite index, keyed by a hash of the folder's contents so a stale index is never used. A shipped seed makes a fresh clone start instantly.

**Why not paste it in, or plain RAG.** Pasting 145k tokens is expensive and hands the model contradictory documents with nothing saying which wins. Plain retrieval has the same blind spot: `Brand_Guidelines_v3_FINAL.md` retrieves as well as the 2026 guidelines, and the sales deck's "We're FedRAMP Authorized" as well as the legal sheet. The hard part is **authority**, so it is computed at ingest and carried into every step.

**Ingest** (`src/lib/brand/`, each step resumable):

1. **Chunk** by headings, keeping the breadcrumb (a rule without its heading loses its scope). BM25 plus embeddings.
2. **Doc cards:** type, status, date, and what the doc claims about its own authority ("replaces X", "FINAL").
3. **Governance**, three layers: the folder's *explicit* rules on which document wins; *inferred* order by document type when there are none (legal > guidelines > playbooks > reference > notes, with dates and "FINAL" only breaking ties, the trap in `README_start_here.md`); and *user* overrides from the Brand panel, which beat both. A doc that loses to one of its own type and wins nothing is treated as superseded.
4. **Facts:** ~2,300 atomic, citable rules and claims, each with source, quote, scope and validity dates.
5. **Conflicts**, found by grouping around high-authority facts plus a *directed audit* pairing every risky low-authority claim with its nearest high-authority facts. The audit exists because grouping missed the sales deck's FedRAMP line. Result: 15 conflicts, each with quotes and the rule applied.
6. **Entities:** current and former names (Tallowatch → Evenburn), which sentence similarity misses. They also drive a deterministic former-name check.
7. **Kernel:** ~2.5k tokens from winning facts only (identity, voice, never-say list, approved wording, usable customers, statistic expiry). First block of every prompt, always cached.
8. **Images and design tokens:** each image gets a vision caption (metadata can be wrong) and its restrictions become hard filters. Colours, fonts and logos are extracted so previews render in the brand's look.

Prompts are layered most-stable-first with a cache breakpoint after each: rules and kernel → campaign → channel playbook → the asset's own facts and image candidates. The Inspector shows every block.

## 2. Conflicting documents

The folder's own order is followed literally, including "a lower source applies where nothing above it speaks". Three cases need more:

- **Brief overrides are scoped.** Brief 1 makes Leashgate GA "for these assets" only. It is stored as a campaign-scoped override and filtered out of memory in code.
- **Time.** Statistics expire 12 months after the source's publication, measured at the asset's publish date.
- **Brief vs. brand.** Before planning, a brand check tests every claim in the brief, and its *lead*, against quoted evidence. On the first run of Brief 3 the agent fixed "FedRAMP Authorized" to the approved "pursuing" line, then still led every asset with it. Now, if the check removes the brief's centerpiece, the agent asks what to lead with.

## 3. Agent behaviour

An explicit state machine (`new → clarifying → plan_review → writing → review`) with a router on every message. Nothing is written before the plan is approved.

- **When to ask:** only when the answer changes the assets, audience, angle or a claim, and nothing (brief, docs, memory) answers it. At most 3 questions, each with a default.
- **Writing:** assets are written in parallel from their own context and stream live. The cache is warmed once per asset type, because the output schema turned out to be part of the cached prefix.
- **Claim check:** deterministic (limits, internal targets, image rules, former names) plus a model check (claims, proof, tone) that must quote the offending text. Blocking problems get one automatic patch-and-recheck. Over-refusal is a bug too: the check first blocked 9 of 11 Brief 1 assets by reading "claims go to Legal" as a ban, so prompts now separate *forbidden* from *process note*.
- **Edits are patches** on named paths. Only the target asset changes; each edit is a new version with a diff and undo.
- **Ask before going off-brand.** "Gen Z slang and monkeys" used to be quietly watered down while the card said "edited". Now a fast check compares each edit with the voice rules and campaign constraints and, on conflict, asks: *do it anyway / only where allowed / cancel*. A confirmed exception is stored on the campaign. Legal rules never bend.

## 4. Assets are structured content

Assets are structured (headline, sections, blocks) and drawn by templates in the brand's tokens, never model-written HTML. That keeps them on-brand, checkable field by field, cheap to patch (~$0.02 an edit) and safe to render. Design changes (colours, fonts, spacing, hero layout) are settings on the template, and off-brand values are flagged. Reference links and images ("like stripe.dev") set the starting design and tone; their claims are never copied. **Free-form design** lets the model write HTML only after a server-enforced "this may hurt your brand" confirmation, sandboxed, with the claim check run on the rendered page.

## 5. Memory

- **Keeps** how this marketer works and writes (corrections, repeated preferences) and decisions on questions the docs left open.
- **Forgets** anything campaign-specific, anything the docs already say, and every brief override.

Memories are *proposed* at the end of a campaign with a justifying quote; none is active until kept, and all are editable in the Memory panel. Saying "remember …" at any point saves it at once (the marketer asked, so there is nothing to approve), and remembered design preferences become the starting design of new web assets and emails. All active memories (capped at 25) go into the campaign block: at that scale this is cheaper and more predictable than retrieval. Campaigns can also be shared on the local network, with one run at a time enforced server-side.

## 6. Models and cost

- **gpt-6.1-sol** writes and reasons (plan, brand check, questions, governance, kernel). Its cache reads cost 0.05× input.
- **gpt-6.1-terra** handles volume: intake, routing, claim and request checks, facts, conflicts, vision, memory.
- **gpt-6-luna** writes doc cards and parses image rules: 10× cheaper but slow, fine for one-time ingest.

One wrapper logs every request with usage (cache writes included), cost and latency, and enforces a per-run spend cap. Numbers are in [COSTS.md](COSTS.md).

## 7. Results

`npm run bench` runs the three briefs end to end, checks behaviour (`evals/*.json`) and writes COSTS.md. Latest full run: **32/33**. The miss was the internal-target check reading the year in "by March 31, 2027" as a secret number; it now ignores dates, has a unit test, and Brief 1 re-ran at 12/12.

| Brief | Questions | Assets | Behaviour checked | Cost |
|---|---|---|---|---|
| 1. Detailed GA launch | 0 | 11 | all eight brief bans held | $0.59 |
| 2. Vague awareness push | 2, with defaults | 4 | asks before planning | $0.16 |
| 3. Trap brief | 1 | 6 | FedRAMP and Vaskell refused with quotes; the corrected FedRAMP line never became a headline | $0.26 |
| Memory | | | "no hashtags on LinkedIn" learned in campaign 1, applied in campaign 2 | |

A typical edit costs about $0.02, and 45–53% of input tokens are read from cache. Extra briefs cover what the samples don't: `fixtures/mock-briefs/` (vague, traps, reference link) and `fixtures/test-briefs/` (messy Slack paste, conflicting stakeholders, breach newsjacking, retired names and expired stats, each with an answer key). A second brand (`fixtures/mini-brand`: no governance doc, images without metadata) refused its own traps with no leakage from Wickhold.

## 8. Left out, and why

Image generation (library images only, as the brief says); OCR for scanned PDFs (reported as unreadable instead); automatic re-resolution after an authority change (an explicit ~$0.50 button); accounts for shared chats (same network only, for a local app).

## 9. Where AI tools led me wrong

- An external review of my plan recommended 2024 gpt-4o models; the key had gpt-6.1. It also suggested "newer file date wins", which is exactly this folder's trap.
- The coding model's first cache design prewarmed without the output schema (found only by reading `cache_write_tokens`), and it once reported "styling applied" when assets had no colour fields. Both were caught by testing the claim, not reading the summary.
- Model judgment failed both ways: it obeyed wording but missed strategy (Brief 3), and it refused documented facts (Brief 1). The eval now checks both.

## 10. With two more weeks

Reviewer routing (each asset to the reviewers its content needs), a bigger eval set with an LLM judge for voice against `good-and-bad-examples.md`, relevance-ranked memory with decay, and accounts and roles for shared chats.
