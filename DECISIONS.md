# Decisions

## 1. Brand layer: compile once, retrieve per step

The brand folder (84 docs, ~145k tokens, 122 images) is compiled once into a per-brand SQLite index, keyed by a hash of the folder's contents, so a stale index is never used. A shipped seed makes a fresh clone start instantly; at runtime nothing reads the folder.

**Why not paste it in, or plain RAG.** Pasting 145k tokens is expensive and hands the model documents that contradict each other with nothing saying which wins. Plain retrieval has the same blind spot: `Brand_Guidelines_v3_FINAL.md` retrieves as well as the 2026 guidelines, and the sales deck's "We're FedRAMP Authorized" as well as the legal sheet. The hard part is **authority**, so it is computed at ingest and carried into every step.

**Ingest** (`src/lib/brand/`, every step resumable and redoable):

1. **Chunk** by headings, keeping the breadcrumb, because a rule without its heading loses its scope. FTS5 (BM25) plus embeddings.
2. **Doc cards:** type, status, stated date, and what the doc claims about its own authority ("replaces X in full", "FINAL").
3. **Governance, three layers.**
   - *Explicit:* the folder's own rules on which document wins.
   - *Inferred* when there are none: by document type (legal > guidelines > playbooks > reference > notes). Dates and words like FINAL only break ties, which is the trap in `README_start_here.md`.
   - *User:* the Brand panel shows the order with quotes, and moving a doc to another tier is stored as a decision that beats both automatic layers.

   Conflict outcomes are evidence too: a doc that loses to one of its own type and wins nothing is treated as superseded. That is how the mini brand's `brand-book-2023-FINAL.md` lands below its 2025 replacement without any document saying so.
4. **Facts:** about 2,300 atomic, citable rules and claims, each with source, quote, scope and validity dates.
5. **Conflicts**, found two ways.
   - *Grouping* around high-authority seeds.
   - A *directed audit* that pairs every risky low-authority claim with its nearest high-authority facts. The audit exists because grouping missed the sales deck's FedRAMP line (similarity < 0.8).

   Groups are settled in batches with the governance rules cached. Result: 15 conflicts, each with quotes, the rule applied and a note to the losing doc's owner.
6. **Entities:** current and former names (Tallowatch → Evenburn). Renames are facts that sentence similarity misses. They also drive a deterministic former-name check.
7. **Kernel:** ~2.5k tokens built from winning facts only (identity, voice, never-say list, approved wording, usable customers, statistic expiry dates). It is the first block of every prompt and always cached.
8. **Images and design tokens:** each image gets a vision caption (metadata can be wrong) and its restrictions are parsed into hard filters. Colours, fonts and logos are extracted so previews render in the brand's look.

Prompts are layered most-stable-first with a cache breakpoint after each: rules and kernel → campaign → channel playbook → the asset's own facts and image candidates. The Inspector shows every block.

## 2. Conflicting documents

The folder's own order is followed literally, including "a lower source applies where nothing above it speaks". Three cases need more than that:

- **Brief overrides are scoped.** Brief 1 makes Leashgate GA "for these assets" only. It is recorded as a campaign-scoped override and is filtered out of memory in code, not only by asking the model.
- **Time.** Statistics expire 12 months after the source's publication, measured at the asset's publish date.
- **Brief vs. brand.** Before planning, a brand check tests every claim in the brief against quoted evidence, and also tests the brief's *lead*. On the first run of Brief 3 the agent fixed "FedRAMP Authorized" to the approved "pursuing" line, then still led every asset with it. Now, if the check removes the brief's centerpiece, the agent asks what to lead with. Claims only the marketer can verify ("only 20 seats left") are flagged too.

## 3. Agent behaviour

The agent is an explicit state machine (`new → clarifying → plan_review → writing → review`) with a router on every message. Nothing is written before the plan is approved.

- **When to ask.** Only when the answer would change the assets, audience, angle or a claim, and nothing (brief, docs, memory) can answer it. At most 3 questions, each with a default.
- **Writing.** Assets are written in parallel, each from its own context, and text streams in live. The cache is warmed once per asset type, because the output schema turned out to be part of the cached prefix.
- **Claim check.** Each asset is checked two ways:
  - deterministic: limits, internal targets, image rules, former names;
  - model: claims, proof, tone, constraints. It must quote the offending text.

  Blocking problems get one automatic patch-and-recheck. Over-refusal is a bug too: on Brief 1 the check first blocked 9 of 11 assets because it read "claims go to Legal" as a ban. The prompts now separate *supported vs. forbidden* from *process note vs. rule*, and a missing link or image is a warning, never a block.
- **Edits are patches** on named paths. Only the target asset changes, and each edit is a new version with a diff and undo.
- **Ask before going off-brand.** A request like "Gen Z slang and monkeys in every post" used to be quietly watered down while the card said "edited". Now a fast check compares each edit request with the voice rules, the campaign constraints and what is unusual for a brand. If it conflicts, it asks: *do it anyway / only where allowed / cancel*. A confirmed exception is stored on the campaign, so the writer, editor and claim check all honour it. Legal rules never bend.

## 4. Design: structured content first, free-form behind a warning

Assets are structured content (headline, sections, blocks) drawn by templates in the brand's tokens, never model-written HTML. That keeps every asset on-brand, checkable field by field, cheap to patch (about $0.02 an edit) and safe to render.

Design changes are settings on top of the template:
- colours;
- fonts (the brand's own or a short list);
- spacing, corners and section tone;
- hero layout and call-to-action style.

Taste words map to settings ("premium" = roomy, a serif headline, sharp corners), and anything off-brand is flagged. **References** follow the same path. A link the marketer wants to resemble ("like stripe.dev") is scraped with a screenshot, and an image is described by vision. The design they suggest becomes the starting design for new web assets, and their text guides tone and structure. Their claims are never copied.

When a template isn't enough, **Free-form design** lets the model write the page's HTML. It only runs after a "this may hurt your brand's image" confirmation, which the server enforces too. Scripts are stripped, the page renders in a sandbox, and the claim check reads the page as displayed.

## 5. Memory and collaboration

- **Memory keeps** how this marketer works and writes (corrections, repeated preferences) and decisions on questions the docs left open.
- **Memory forgets** anything campaign-specific, anything the docs already say, and every brief override.

Memories are *proposed* at the end of a campaign with a justifying quote, and none is active until kept. All active memories (capped at 25) go into later campaign blocks; at that scale this is cheaper and more predictable than retrieval.

A campaign can be **shared on the local network**. Messages carry the sender's name, progress and drafts stream to every viewer, and one run at a time is enforced server-side. There are no accounts, so the Share panel says plainly that anyone on the network can use the key.

## 6. Models and cost

- **gpt-6.1-sol** writes and reasons (plan, brand check, questions, governance, kernel). Its cache reads cost 0.05× input.
- **gpt-6.1-terra** handles volume: intake, routing, claim and request checks, facts, conflicts, vision, memory.
- **gpt-6-luna** writes doc cards and parses image rules. It is 10× cheaper but slow, which is fine for one-time ingest.

One wrapper logs every request with usage (cache writes included), cost and latency, and enforces a per-run spend cap. Numbers are in COSTS.md.

## 7. Results

`npm run bench` runs the three briefs end to end and checks behaviour (`evals/*.json`, report in `evals/last-report.md`). It also writes COSTS.md. Latest full run: **32/33**. The one miss was a false positive in the deterministic internal-target check: it read the year in "60 demo requests by March 31, 2027" as a secret number and blocked a launch-date mention. It now ignores dates, has a unit test, and Brief 1 re-ran at **12/12**.

| Brief | Questions | Assets | Behaviour checked | Cost |
|---|---|---|---|---|
| 1. Detailed GA launch | 0 | 11 | all eight brief bans held | $0.59 |
| 2. Vague awareness push | 2, each with a default | 4 | asks before planning | $0.16 |
| 3. Trap brief | 1 | 6 | FedRAMP and every form of Vaskell refused with quotes; the corrected FedRAMP line never became a headline | $0.26 |
| Memory | | | "no hashtags on LinkedIn" learned in campaign 1 and applied in campaign 2 | |

A typical edit costs about $0.02, and 45–48% of input tokens are read from cache.

Three extra mock briefs (`fixtures/mock-briefs/`) cover what the samples don't:
- **Vague brief:** got 3 sharp questions.
- **Trap brief:** FedRAMP refused, "SOC 2 certified" reworded, the uncleared customer refused, the competitor comparison removed, scarcity flagged; the off-brand edit was asked about first.
- **Reference brief:** a Linear-style changelog, with the "early access" label kept because that brief has no GA override.

A second brand (`fixtures/mini-brand`: no governance doc, images without metadata) refused its own FDA and customer traps, with no leakage from Wickhold.

## 8. Left out, and why

Image generation (library images only, as the brief says); OCR for scanned PDFs (reported as unreadable instead); automatic re-resolution after an authority change (an explicit ~$0.50 button); accounts for shared chats (same network only, for a local app).

## 9. Where AI tools led me wrong

- An external review of my plan recommended gpt-4o models from 2024; the key had gpt-6.1. It also suggested "newer file date wins", which is exactly this folder's trap.
- The coding model's first cache design prewarmed without the output schema (found only by reading `cache_write_tokens`), and later it reported "styling applied" when assets had no colour fields. Both were caught by testing the claim, not reading the summary.
- Model judgment failed both ways: it obeyed wording but missed strategy (Brief 3), and it refused documented facts (Brief 1). The eval now checks both.

## 10. With two more weeks

Reviewer routing (each asset to the reviewers its content needs), a bigger eval set with an LLM judge for voice against `good-and-bad-examples.md`, relevance-ranked memory with decay, and accounts and roles for shared chats.
