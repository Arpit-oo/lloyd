# Decisions

## 1. Brand layer: compile once, retrieve per step

**What it is.** The brand folder (84 docs, ~145k tokens, 122 images) is compiled once into a per-brand SQLite index. The index is keyed by a hash of the folder's contents, so a stale index can't be used by accident. A shipped seed makes a fresh clone start instantly. At runtime nothing reads the folder.

**Why not paste it in, or plain RAG.** Pasting the folder in is expensive, and it hands the model 145k tokens of documents that contradict each other, with nothing saying which one wins. Plain chunk retrieval has the same blind spot: the stale `Brand_Guidelines_v3_FINAL.md` retrieves just as well as the 2026 guidelines, and the sales deck's "We're FedRAMP Authorized" retrieves just as well as the legal sheet. The hard part of this brief is **authority**, so authority is computed at ingest and carried into every step.

**Ingest steps** (`src/lib/brand/`, each step resumable and individually redoable):

1. **Chunk** by headings, keeping the breadcrumb ("Approved claims > 4. Certification status"), because a rule read without its heading loses its scope. Index with FTS5 (BM25) and embeddings.
2. **Doc cards**: type, status, stated date, and what the doc claims about its own authority ("replaces X in full", "FINAL").
3. **Governance**, three layers:
   - *Explicit*: find the folder's own rules on which document wins.
   - *Inferred*: if there are none, rank by document type (legal > guidelines > playbooks > reference > notes > past content). Dates and words like FINAL only break ties. That is exactly the trap in `README_start_here.md`.
   - *User*: the Brand panel shows the result with quotes for a person to check.

   On Wickhold it found the brand's own order of authority (explicit, high confidence). On the mini fixture brand, which has no governance doc, it fell back to the inferred order (medium confidence).
4. **Facts**: about 2,300 atomic, citable rules and claims, each with source, heading, quote, scope and validity dates.
5. **Conflicts**, found two ways:
   - *Grouping*: similar facts are grouped around high-authority seeds (linear cost; no chaining).
   - *Directed audit*: every risky claim in a low-authority doc is paired with its nearest high-authority facts. The audit exists because grouping missed the sales deck's FedRAMP line (similarity < 0.8 to the legal fact).

   A fast model settles each group in batches, with the governance rules in a cached prefix. Duplicates are merged on their most authoritative winner. Result: 15 settled conflicts, each with quotes, the rule applied and a note to the losing doc's owner.
6. **Entity registry**: current names, status and former names (Tallowatch → Evenburn, Field Report → Containment Report, Wickhold Security → Wickhold). Renames are entity facts that sentence similarity misses. The registry also powers a deterministic check for former names in copy.
7. **Brand kernel**: about 2.5k tokens compiled from winning facts only: identity, voice, never-say list, approved wording, customers who may or may not be used, statistics with the date they stop being usable, settled conflicts. It is the first block of every prompt and always cached.
8. **Images**: every image gets a vision caption, because metadata can be empty or simply wrong (`bg-plate-paper.jpg` is typed as an abstract graphic but shows a wooden table). Free-text restrictions are parsed into generic fields (allowed or blocked channels, deprecated, expired, people unavailable, must-not-crop). Hard filters run before any semantic ranking.
9. **Design tokens** (colors, fonts, logo files) are extracted from the guidelines, so the previews render in the brand's look with nothing hard-coded.

**Per step, each prompt is built in layers, most stable first, each ending with a cache breakpoint:**
- agent rules + kernel
- the campaign: brief, constraints, brand-check decisions, plan, memories
- the channel playbook
- the asset's own context: the most relevant non-losing facts, the persona, product passages, two past examples marked "style only", and filtered image candidates

The Inspector shows every block with its size.

## 2. Conflicting documents

The order is the folder's own (legal → 2026 guidelines → playbooks → everything else), followed literally. That includes its rule that "a lower source applies where nothing above it speaks", so lower docs stay usable for what only they cover. Three cases need more than that:

- **Brief overrides are scoped.** Brief 1 makes Leashgate generally available "for these assets" only. Intake records that as a campaign-scoped override. It goes into that campaign's prompts and is never written to memory: it is filtered out in code (embedding match against the campaign's overrides), not only by asking the model.
- **Time.** Market statistics expire 12 months after the *source's* publication, measured at the *asset's* publish date. Facts carry validity dates, and the kernel lists "usable until 2027-04-14".
- **Brief vs. brand.** Before planning, a brand check tests every claim in the brief against the evidence (quotes required), and also tests the brief's *lead*. The first run of Brief 3 taught me why: the agent fixed "FedRAMP Authorized" to the approved "pursuing" sentence, then still led every asset with it, so the email subject announced a gap. Now the check asks whether the lead still works once the claims are corrected. If the brand check removes the brief's centerpiece, the agent must ask what to lead with, offering its recommendation as the default.

## 3. Agent behavior

An explicit state machine (`new → clarifying → plan_review → writing → review`) with a router on every message. Nothing is written before the plan is approved. The design choices:

- **When to ask.** Only when the answer would change the asset list, audience, angle or a claim, and the brief, the brand docs and memory can't answer it. At most 3 questions, each with a default; "use defaults" works. Assumptions are listed instead of asked.
- **Writing.** Assets are written in parallel, each from its own context. The cache is warmed once per asset type, because the output schema turned out to be part of the cached prefix.
- **Claim check.** Every asset is checked two ways:
  - deterministic: length limits, internal targets leaking into copy, image rules, former names
  - model: claims, proof, tone, brief constraints. It has to quote the offending text, and it judges what the text asserts, not substrings.

  Blocking problems get one automatic patch-and-recheck round, after writing and after user edits.
- **Edits are patches** on named paths (`subject`, `sections.2.body_markdown`). Only the target asset changes, and each edit is a new version.
- **Over-refusal is a bug too.** On Brief 1 the check first blocked 9 of 11 assets for describing documented product behavior. It had read "claims go to Legal before publishing" as a ban. The prompts now separate *supported vs. forbidden* from *process note vs. rule*.

## 4. Memory

- **Keep:** how this marketer works and writes (corrections they made, preferences they stated or repeated), and decisions on questions the docs left open.
- **Forget:** anything campaign-specific (dates, products, asset lists, targets), anything the brand docs already say, and every brief override.

At the end of a campaign the agent *proposes* memories, with the quote that justifies each one, and nothing becomes active until the user keeps it. All active memories (capped at 25) go into the campaign block of every later prompt. With tens of memories this is cheaper and more predictable than retrieving them. A memory can't override legal rules, because the kernel and claim check still apply.

## 5. Models and cost

Tiers are picked per task. The prices behind these choices are in COSTS.md.

- **gpt-6.1-sol** writes and reasons: plan, brand check, questions, governance, kernel. This is where judgment is scored, and its cache reads cost 0.05× input.
- **gpt-6.1-terra** handles volume: intake, routing, claim check, facts, conflicts, vision, memory.
- **gpt-6-luna** does doc cards and image-rule parsing. It is 10× cheaper but slow, which is fine for one-time ingest.

Every call goes through one wrapper that logs the exact request, usage including cache writes, cost and latency, and enforces a per-run spend cap.

## 6. Results

`npm run bench` runs every brief end to end and checks behavior (`evals/*.json`; last report in `evals/last-report.md`). Latest run: **33/33 checks passed**.

- **Brief 1** (detailed): 0 questions, 11 assets, all eight brief bans held (no price, SLA, latency figure, roadmap, apiVersion, borrowed customer proof, early-access screenshots), and an edit touched one asset. $0.54 per campaign.
- **Brief 2** (vague): 2 questions, each with a default, then a 6-asset plan. $0.26.
- **Brief 3** (trap): refused FedRAMP Authorized and every form of Vaskell with quotes, re-led the campaign and asked what to lead with, and the corrected FedRAMP line never became a headline. $0.27.
- **Memory:** campaign 1 proposed "no hashtags on LinkedIn" from the marketer's correction, and campaign 2 used it and produced no hashtags.
- **Second brand** (`fixtures/mini-brand`: different industry, no governance doc, images without metadata): refused its own FDA and customer traps, with no leakage from the sample brand. $0.06 to ingest.

A typical edit costs about $0.02, and 40–47% of input tokens are read from cache. Full numbers are in COSTS.md.

## 7. Left out, and why

- **PDF/DOCX loaders.** The sample is all Markdown. Unsupported files are listed in the ingest report, not silently dropped.
- **Editing the authority order in the UI.** The order is shown and explained, but not editable.
- **Streaming asset text token by token.** Assets appear whole, with status updates while they are written.
- **Image generation.** Only the library is used, as the brief says.
- **A diff view between versions.** There is a version picker instead.

## 8. Where AI tools led me wrong

- An external AI review of my plan recommended gpt-4o / gpt-4o-mini, models from 2024. The live model list on the key had gpt-6.1.
- The same review suggested "newer file date wins" as the governance fallback, which is exactly the trap in this folder.
- The model I used to build this repeatedly wrote shell commands that hung (a stray `cat >` waiting on stdin) or corrupted code (`\n` escapes turned into real newlines inside JS strings). Its first cache design prewarmed without the output schema, so the prewarm was never read; I only found that by reading `cache_write_tokens` per call.
- Model judgment failed in both directions, as described in sections 2 and 3: on Brief 3 it obeyed the wording rules but missed the strategy, and on Brief 1 it refused documented facts. The eval harness (`npm run eval`) now checks both.

## 9. With two more weeks

- **Reviewer routing.** Turn the brand's review table into routing: each asset gets the reviewers its content needs (Legal for new claims, devrel for how-tos), with notes for them pre-filled.
- **Editable authority order** in the Brand panel, saved as a brand decision. A decision log the brand owner can export, as the guidelines ask.
- **Bigger eval set.** Adversarial briefs, a second real-format brand (PDF/DOCX), and scoring of voice quality against `good-and-bad-examples.md` with an LLM judge.
- **Smarter memory.** Relevance-ranked memory once there are hundreds, plus decay for memories unused across N campaigns.
- **Smarter edits.** Partial regeneration when a plan change affects written assets, and diff and compare views.
