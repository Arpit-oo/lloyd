# Build notes

Running log of what was tried, measured and changed, day by day. The short version is in DECISIONS.md.

## Where AI tools led us wrong

- 2026-11-02: An external AI review of the plan suggested gpt-4o / gpt-4o-mini. Those are 2024 models; we pick from the live `/v1/models` list instead.
- 2026-11-02: The same review suggested "newer file date wins" as the governance fallback. The sample brand's own governance section says dates and words like FINAL "decide nothing" on their own, and its stale `README_start_here.md` is exactly that trap. Date is now a tie-breaker only.

## Decisions log

- 2026-11-02: Vertical slice first (chat → plan → one asset → inspector) before deepening the brand layer.

## Phase 0 findings (2026-11-02)

- Key works. All of gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.5, gpt-5.4-mini, gpt-5.4-nano answered a strict `json_schema` call on the Responses API.
- Pricing (per 1M, standard, short context), from developers.openai.com/api/docs/pricing:
  - gpt-6.1-sol $2.00 in / $0.10 cached / $10.00 out (30m cache write $2.50)
  - gpt-6.1-terra $1.00 / $0.05 / $5.00 (write $1.25)
  - gpt-6-luna $0.10 / $0.01 / $0.50 (write $0.125)
  - gpt-5.5 $5.00 / $0.50 / $30.00 (implicit cache only)
  - text-embedding-3-small $0.02
- Prompt caching on 5.6+: `prompt_cache_options.mode` implicit|explicit, `prompt_cache_breakpoint` on a content block, `ttl` 30m|12h, `prewarm: true` writes cache without output. Min 1,024 visible tokens. Usage reports `cached_tokens` and `cache_write_tokens` separately; writes cost 1.25x input (30m).
  - Consequence: B3 (cold cache on fan-out) is solved by an explicit breakpoint after the brand kernel + a prewarm call, instead of writing the first asset alone.
  - Consequence: cost math must count cache writes, not just reads.
- My mistake: first probe hung 2 min because a stray `cat > file` with no heredoc waited on stdin. Not an API issue.
- Phase 1 smoke test (`npm run test:keys`): all tiers pass strict JSON; prewarm + explicit breakpoint gave 100% cache hits (3017/3030 tokens) on three parallel calls, cost $0.00038 each vs ~$0.006 uncached.
- Image metadata can be wrong, not just empty: `bg-plate-paper.jpg` is typed "abstract_graphic, Plate paper", vision sees "an empty wooden table in a warmly lit room". Decision: caption every image at ingest (~120 x 225 input tokens on the fast tier, about $0.03), and flag metadata/vision disagreements.
- External critique #2 estimated ingest at "several dollars" and suggested captioning only blank images. Measured costs say otherwise; see above. Agreed with its other points: ship a seed cache for the sample brand, check the cache before any network call, and keep campaign-scoped overrides out of memory by construction (excluded by id), not only by prompt wording.
- First full ingest (2026-11-02): $1.71, 12 min, 2,292 facts. Governance came out explicit/high-confidence. Gaps found and fixed in code (not yet re-run): similarity grouping missed the sales-deck "FedRAMP Authorized" claim (cosine < 0.8 to the legal fact) -> added directed stale-claim audit; renames (Tallowatch -> Evenburn) missed -> added entity registry; kernel said stats had no expiry -> pass valid_until; image-rules parser read "Internal production, all channels" as internal-only (15 good images excluded) -> prompt separates provenance from restriction.
- My mistake, twice: a stray `cat > file` with no heredoc blocked a shell on stdin. Also a Python patch turned "\n" into a real newline inside JS strings.

## Day 2 (2026-11-03)

- Brief 3 run 1: brand check caught FedRAMP + Vaskell (quote, result, and the anonymised variant) with sources. But the agent fixed the wording and kept the strategy: every asset led with the corrected FedRAMP sentence (email subject = that sentence), and it asked zero questions although its centerpiece was removed. Fix: intake records the lead angle; brand check judges the lead against ICP/persona/positioning; questions must ask when the centerpiece is removed.
- Guard caught writer invention (HIPAA control mapping feature, a response-time SLA, a [postal address] placeholder). Added a one-round automatic fix (patch edit + re-check) and stricter writer rules.
- Cache finding: the structured-output schema is part of the cached prefix. A prewarm without the schema is never read by schema calls. Now prewarm once per asset type with that type's schema and playbook. Run 1 hit rate was 25%.
- Run 1 cost: $0.30 for six assets end to end, $0.022 for an edit.
- Tool note: the shell wrapper mis-parses apostrophes inside heredocs; write scripts with the file tool instead.
- Brief 1 run 1 (detailed GA launch): opposite failure, over-refusal. 9/11 assets blocked because the guard read the brand's process rule (new claims go to Legal) as a ban on describing documented product behavior, and the strategy check returned needs_change while agreeing with the lead, which triggered a needless question and an unrequested plan change. Fix: both prompts now separate supported vs forbidden and process notes vs rules. Run cost $0.82 (9 auto-fix rounds).
- Brief 2 run 1: 2 good questions, 5-asset plan, memory proposed exactly the two lasting preferences (no hashtags; short, plain, not salesy). A user edit introduced a blocking issue, so auto-fix now runs after edits too. Prewarm is skipped for types with one asset.
- Mini brand (fixtures/mini-brand, no governance doc): inferred authority (medium confidence), caught the FDA trap and the FerroWell rename for $0.06. Weak spot: the stale FINAL doc landed tier 3 instead of last.
- Mini brand brief: zero leakage of the sample brand; refused FDA certified + uncleared Harlow fuel story with sources, re-led, asked 1 question. Guard blocked an email whose button had no URL (the brand supplies none); missing details are now warnings.
- Fresh clone from GitHub + npm install: brand index loads from the gzipped seed in 0.6s, no API calls.
- Bench run 1: 30/33. Brief 1 now 0 questions, 1 blocked (was 9). Failures: (a) Brief 2 eval asked to edit 'the email' but the plan had no email; the agent correctly asked which asset was meant, so the spec was wrong, not the agent. (b) My own writer rule 'use the closest brand URL' made Book-a-demo buttons link to the Containment Report, which the guard rightly blocked; now the url stays null when no fitting URL is known. (c) Guard escalated craft issues (missing a recommended point) to blocks; those are now warnings.
- UI rebuilt chat-first (centered conversation, serif replies, rounded composer, sample briefs on the welcome screen, assets in a side panel). Full browser click-through of Brief 3: brand check, answer chips, dropping a plan item, approve, live writing with auto-fix, chat edit, word diff, finish. Zero console errors. Fixed after the run: panel now jumps to the edited asset; recents update when the brief is read; landing pages without a hero image use one column.
- Built what was listed as left out: PDF/DOCX loading (mini brand now has a PDF), supersession inferred from conflict outcomes (fixes the stale FINAL doc ranking), user-editable authority tiers with a re-resolve button, version diff.
- Impeccable critique of the chat UI: 21/40 (dual-agent). Fixed in one pass: tokens with light/dark themes and AA-passing secondary text, accessible dialogs (role, focus trap/restore), focus-visible rings, ARIA tabs, reduced motion; responsive drawer + asset sheet; Stop (server-side abort through every model call; runs survive reloads), Copy/Retry, asset Copy/.md export, campaign rename/delete/search/date groups; sample briefs fill the composer instead of sending; Approve shows a cost and time estimate; collapsible brand check with markdown quotes; stuck-run state; attachments (PDF/DOCX/MD/TXT, text extracted on upload); model picker with presets and writer choice.
- Bug found while testing: TaskStop on the npm dev process left the Next server (child) listening on :3000, so a restart silently failed and requests hit the old code. Kill the PID on the port before restarting.
- Bench run 3 (with live streaming of asset text): 31/33. Brief 2 asked 1 question instead of 2-3, Brief 1 left one asset blocked after its auto-fix. Both passed in run 2; this is run-to-run model variance, worth a second fix round (e.g. two auto-fix rounds) later.
- Named the platform Lloyd, with a pixel-art bee mascot (logo, favicon, start screen, thinking indicator, perched by the composer on wallpaper themes) and a Settings panel (name for the greeting, mascot on/off, Enter vs Ctrl+Enter, appearance, default models, shortcuts, about).
- Bug (reported by Arpit): 'Run the brief again' had invisible text on wallpaper themes. Cause: wallpapers set the paper token to transparent, and every ink button used text-paper for its text. Fix: a dedicated on-ink token. A one-off contrast sweep (a Playwright script) checked every visible text element for 10 themes x 2 views; it went from ~150 failures to 0 after the token fix, brighter secondary text on dark wallpapers, deeper skies on Lagoon/Paper Boats/Koi Pond, and glass header/footer bands. Also: the dev server missed a globals.css edit until restarted with .next cleared.

## Days 3 and 4 (2026-11-04 to 11-05)

- Shared chats on the local network with live sync (server-sent events and a pulse endpoint), one run at a time enforced server-side (a second message gets a 409), export to Markdown and JSON.
- Edits became patches that can restructure an asset (add or drop sections), and no-change edits stopped creating versions. Design settings (colours, fonts, density, hero layout) are fields on the template, not model-written HTML; free-form HTML exists behind a server-enforced "this may hurt your brand" confirmation, sandboxed and claim-checked.
- Ask before going off-brand: "Gen Z slang and monkeys" used to be watered down while the card said "edited". A fast request check now compares each edit with the voice rules and asks first. The same guard rail covers plan changes.
- The router learned the cases a real chat throws at it: "hi, what can you do?" is small talk, a document attached with a question is a question about the document, a brief sent after small talk is still a brief, several attached briefs get a "which one?" question.
- Questions card: multi-select, un-pick, your own answer, one send button. Brand-check refusals are asked about ("do you still need any of them?") instead of silently applied.
- Em dashes: models lean on them and they read as machine-written. Removed deterministically after every write and edit (`src/lib/text/punctuation.ts`), with ranges, list markers, code and links left alone; the writer rules also ban notes to the marketer and myth-style metaphors.
- Unique brand names, sender names on shared-chat messages, and a real reply to small talk after a campaign is done (it used to answer everything with "how can I help with your campaign?").

## Day 5 (2026-11-06): briefs Lloyd had never seen

Four new briefs (`fixtures/test-briefs/t6` to `t9`), shaped like the samples, run end to end from the terminal. Every trap held (lab qualifiers, no Lowmoor multiple, no combined customer results, expired statistic flagged, banned SOC 2 / GDPR / ROI / "helps prevent" wording, invented quote refused). What they found:

- **The claim check refused true facts.** "It ranks changes that close the most exposure paths for the least work" is verbatim from the Evenburn product doc, and the check blocked it as unsupported, so the auto-fix stripped the email to almost nothing. Cause: its evidence was one embedding of the whole asset, which retrieved facts about the asset's general topic and none of its specific claims. Now it retrieves facts and product passages per paragraph (one batched embedding call), and the same email keeps its detail. It still caught the one thing the writer did invent (a "freshness timestamp").
- **The internal-target check matched digits, not meaning.** "30 minutes by default" was blocked because a goal said "30 customers". It now flags a number only when it counts the same thing as the target.
- **Out-of-scope channels.** The brand check judged "a 30-second TikTok video" against brand rules and found none forbidding it, so it said "ok". Which asset types Lloyd makes is an app rule, so it is now answered in code.
- **Caution cascades.** With no link to the docs, Lloyd asked for one (the brief said "no questions unless you really need one"), and the planner told the writer "do not invent ranking logic", so a product doc's real detail went unused. Missing links are now assumptions, not questions, and plan notes only restrict what a rule restricts.
- **Rules leaking into copy.** A sales email said "A grocery-sector example, not healthcare peer proof". The writer now follows the rules silently.
- **A runaway answer.** The bench caught a questions call that started its JSON correctly, then emitted blank lines until it hit 128,000 output tokens, twice (the repair attempt did the same): about $2.50 and a crashed run. Every call now has an output cap (16k unless the step sets its own), and a streamed answer that ends in 400 whitespace characters is stopped at once and retried.
