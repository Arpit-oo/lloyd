# Brand-Aware Campaign Agent

A local chat app where a marketer and an AI agent plan and write a campaign for any brand, using a compiled brand layer instead of dumping the brand folder into the prompt.

> Work in progress. See [PLAN.md](PLAN.md) for the design and build schedule.

## Run (target)

```bash
cp .env.example .env   # add your OpenAI + Firecrawl keys
npm install
npm run dev            # first run ingests the brand folder, then opens the app
```

Requires Node 22 (see `.nvmrc`). Point `BRAND_DIR` at any brand folder.

Docs: [DECISIONS.md](DECISIONS.md) · [COSTS.md](COSTS.md)
