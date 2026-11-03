/**
 * Behavioural evals: runs briefs end to end and checks what the agent did against expectations
 * kept in evals/*.json (test data, never read by the app).
 *
 *   npm run eval                       all specs in evals/
 *   npm run eval -- brief-3            one spec
 *   npm run bench                      all specs, then writes COSTS.md from the same runs
 *
 * A memory spec runs two campaigns in a row and checks that what was learned in the first
 * shows up in the second.
 */
import fs from "node:fs";
import path from "node:path";
import { requireBrand } from "@/lib/brand";
import type { IngestStepCost, IngestSummary } from "@/lib/brand/ingest";
import { getMeta } from "@/lib/brand/store";
import { runCampaign, type RunResult, type RunSpec } from "@/lib/eval/runner";
import { modelFor, type Tier } from "@/lib/llm/models";

interface Pattern {
  pattern: string;
  why: string;
}

interface Expect {
  questions?: { min?: number; max?: number };
  planItems?: { min?: number; max?: number };
  maxBlockedAssets?: number;
  editTouches?: number;
  brandCheckFlags?: Pattern[];
  assetsMustNotContain?: Pattern[];
  subjectsMustNotStartWith?: Pattern[];
  memoriesUsed?: { min: number };
  memoriesAccepted?: { min: number };
}

interface Spec {
  name: string;
  why: string;
  run?: RunSpec;
  expect?: Expect;
  /** Memory specs: campaigns run in order; each step has its own expectations. */
  sequence?: { run: RunSpec; expect: Expect }[];
}

interface Check {
  ok: boolean;
  label: string;
  detail?: string;
}

const re = (p: string) => (p.startsWith("(?i)") ? new RegExp(p.slice(4), "i") : new RegExp(p));
const within = (n: number, r?: { min?: number; max?: number }) => (r?.min === undefined || n >= r.min) && (r?.max === undefined || n <= r.max);

function check(result: RunResult, e: Expect): Check[] {
  const checks: Check[] = [];
  const nq = result.questions?.questions.length ?? 0;
  if (e.questions) checks.push({ ok: within(nq, e.questions), label: `asks ${e.questions.min ?? 0}-${e.questions.max ?? "∞"} questions`, detail: `asked ${nq}` });
  const np = result.plan?.items.length ?? 0;
  if (e.planItems) checks.push({ ok: within(np, e.planItems), label: `plans ${e.planItems.min}-${e.planItems.max} assets`, detail: `planned ${np}` });
  if (e.maxBlockedAssets !== undefined) {
    const blocked = result.assets.filter((a) => a.guard?.status === "block");
    checks.push({ ok: blocked.length <= e.maxBlockedAssets, label: `at most ${e.maxBlockedAssets} assets blocked by the claim check`, detail: blocked.map((a) => a.title).join(", ") || "none" });
  }
  if (e.editTouches !== undefined)
    for (const ed of result.edits) checks.push({ ok: ed.touched.length === e.editTouches, label: `edit "${ed.instruction}" changes exactly ${e.editTouches} asset`, detail: `changed ${ed.touched.length}` });
  for (const f of e.brandCheckFlags ?? []) {
    const hit = result.brandCheck.find((b) => b.verdict !== "ok" && re(f.pattern).test(`${b.requested} ${b.rule}`));
    checks.push({ ok: !!hit, label: `brand check flags ${f.pattern.replace("(?i)", "")}`, detail: hit ? hit.rule.slice(0, 120) : f.why });
  }
  for (const f of e.assetsMustNotContain ?? []) {
    const bad = result.assets.filter((a) => re(f.pattern).test(a.text));
    checks.push({ ok: !bad.length, label: `no asset matches /${f.pattern.replace("(?i)", "")}/ (${f.why})`, detail: bad.map((a) => a.title).join(", ") || undefined });
  }
  for (const f of e.subjectsMustNotStartWith ?? []) {
    const bad = result.assets.filter((a) => {
      const d = JSON.parse(a.text || "{}");
      const head = d.subject ?? d.hero?.headline ?? d.title ?? (d.text ?? "").split("\n")[0];
      return head && re(f.pattern).test(String(head).trim());
    });
    checks.push({ ok: !bad.length, label: f.why, detail: bad.map((a) => a.title).join(", ") || undefined });
  }
  if (e.memoriesUsed) checks.push({ ok: result.memoriesUsed >= e.memoriesUsed.min, label: `uses at least ${e.memoriesUsed.min} remembered item`, detail: `used ${result.memoriesUsed}` });
  if (e.memoriesAccepted) checks.push({ ok: result.acceptedMemories.length >= e.memoriesAccepted.min, label: `proposes at least ${e.memoriesAccepted.min} memory`, detail: result.acceptedMemories.map((m) => m.text).join(" | ") || "none" });
  return checks;
}

async function runSpec(file: string): Promise<{ spec: Spec; results: RunResult[]; checks: Check[] }> {
  const spec = JSON.parse(fs.readFileSync(file, "utf8")) as Spec;
  const steps = spec.sequence ?? [{ run: spec.run!, expect: spec.expect ?? {} }];
  const results: RunResult[] = [];
  const checks: Check[] = [];
  for (const [i, step] of steps.entries()) {
    const r = await runCampaign(step.run);
    results.push(r);
    checks.push(...check(r, step.expect).map((c) => (steps.length > 1 ? { ...c, label: `[campaign ${i + 1}] ${c.label}` } : c)));
  }
  return { spec, results, checks };
}

async function main() {
  const filter = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const writeCosts = process.argv.includes("--write-costs");
  const files = fs
    .readdirSync("evals")
    .filter((f) => f.endsWith(".json") && (!filter.length || filter.some((x) => f.includes(x))))
    .map((f) => path.join("evals", f));

  console.log(`Running ${files.length} eval(s): ${files.join(", ")}\n`);
  const outcomes = await Promise.all(files.map(runSpec));

  let failed = 0;
  const report: string[] = [`# Eval report\n\nRun ${new Date().toISOString()}\n`];
  for (const o of outcomes) {
    const passed = o.checks.filter((c) => c.ok).length;
    console.log(`\n■ ${o.spec.name}: ${passed}/${o.checks.length}`);
    report.push(`## ${o.spec.name}: ${passed}/${o.checks.length}\n\n${o.spec.why}\n`);
    for (const c of o.checks) {
      console.log(`  ${c.ok ? "✓" : "✗"} ${c.label}${c.detail ? `  (${c.detail})` : ""}`);
      report.push(`- ${c.ok ? "✅" : "❌"} ${c.label}${c.detail ? ` (${c.detail})` : ""}`);
      if (!c.ok) failed++;
    }
    report.push("");
  }
  fs.mkdirSync("logs", { recursive: true });
  fs.writeFileSync("logs/eval-report.md", report.join("\n"));
  if (writeCosts) writeCostsMd(outcomes);
  console.log(`\n${failed ? `${failed} check(s) failed` : "All checks passed"}. Report: logs/eval-report.md${writeCosts ? ", COSTS.md" : ""}`);
  process.exit(failed ? 1 : 0);
}

function writeCostsMd(outcomes: { spec: Spec; results: RunResult[] }[]) {
  const brand = requireBrand();
  const ingest = getMeta<IngestSummary>(brand.db, "ingest:summary");
  const f = (n: number) => `$${n.toFixed(3)}`;
  const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0}%`;

  const rows = outcomes.flatMap((o) =>
    o.results.map((r, i) => {
      const editUSD = r.edits.reduce((a, e) => a + e.costUSD, 0);
      const editAvg = r.edits.length ? editUSD / r.edits.length : 0;
      const label = o.results.length > 1 ? `${o.spec.name} (campaign ${i + 1})` : o.spec.name;
      return `| ${label} | ${r.assets.length} | ${r.cost.inputTokens.toLocaleString("en-US")} | ${r.cost.cachedTokens.toLocaleString("en-US")} | ${pct(r.cost.cachedTokens, r.cost.inputTokens)} | ${r.cost.outputTokens.toLocaleString("en-US")} | ${f(r.initialRunUSD)} | ${r.edits.length ? f(editAvg) : "–"} |`;
    }),
  );

  const first = outcomes[0]?.results[0];
  const steps = first
    ? first.cost.byStep.filter((s) => s.costUSD > 0.00005).map((s) => `| ${s.step} | ${s.calls} | ${s.inputTokens.toLocaleString("en-US")} | ${s.cachedTokens.toLocaleString("en-US")} | ${s.cacheWriteTokens.toLocaleString("en-US")} | ${s.outputTokens.toLocaleString("en-US")} | ${f(s.costUSD)} |`)
    : [];

  const ingestSteps = getMeta<IngestStepCost[]>(brand.db, "ingest:steps") ?? [];

  const tiers: Tier[] = ["writer", "reasoner", "fast", "bulk"];
  const md = `# Costs

Generated by \`npm run bench\` on ${new Date().toISOString().slice(0, 10)} from real runs against the OpenAI API (prices in \`src/lib/llm/pricing.ts\`). Every number below comes from the call log (\`llm_calls\` table / \`logs/calls.jsonl\`), which records the exact usage the API returned for each call, including cached and cache-write tokens.

## Per brief

"Campaign" = brief in, through questions (answered with the agent's defaults), plan, approval, all assets written, claim-checked and auto-fixed. "Edit" = one chat edit to one asset, including its re-check.

| Brief | Assets | Input tokens | Cached | Cache hit rate | Output tokens | Campaign cost | Typical edit |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## One-time brand ingest

Paid once per brand folder (cached by content hash; a seed of this index ships in \`seed/\`, so a fresh clone pays nothing). Total: **${f(ingest?.costUSD ?? 0)}** for ${ingest?.docs} documents, ${ingest?.images} images.

| Step | Calls | Input | Output | Cost |
|---|---|---|---|---|
${ingestSteps.map((s) => `| ${s.step} | ${s.calls} | ${s.inputTokens.toLocaleString("en-US")} | ${s.outputTokens.toLocaleString("en-US")} | ${f(s.costUSD)} |`).join("\n")}

## Where the money goes (${outcomes[0]?.spec.name ?? "-"})

| Step | Calls | Input | Cached | Cache writes | Output | Cost |
|---|---|---|---|---|---|---|
${steps.join("\n")}

## Models

| Tier | Model | Used for |
|---|---|---|
${tiers.map((t) => `| ${t} | ${modelFor(t)} | ${{ writer: "asset writing, edits", reasoner: "plan, brand check, questions, governance, kernel", fast: "intake, routing, claim check, facts, conflicts, vision, memory", bulk: "doc cards, image rule parsing" }[t]} |`).join("\n")}
| embed | ${modelFor("embed")} | retrieval |

## Caching

- Every prompt is ordered most-stable first: agent rules + brand kernel, then the campaign block, then the channel playbook, then the asset's own context. Each layer ends with an explicit cache breakpoint.
- The structured-output schema is part of the cached prefix, so before writing, the agent prewarms the cache once per asset type with that type's schema. Parallel writers then read the shared prefix instead of each writing it.
- Claim checks share one schema and one prefix per campaign, so most of their input is read from cache.
`;
  fs.writeFileSync("COSTS.md", md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
