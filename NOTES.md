# Build notes

Running log. Feeds the "where an AI tool led me wrong" section of DECISIONS.md.

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
