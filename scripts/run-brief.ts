/**
 * Runs one brief end to end without the UI and prints what the agent did.
 * Usage:
 *   npm run brief -- <brief.md> [--answers "text"] [--plan-change "text"] [--edit "text"]... [--finish [--accept-memories]]
 */
import fs from "node:fs";
import { assetToText, ASSET_LABEL, type AssetContent } from "@/lib/agent/asset-types";
import type { AgentEvent } from "@/lib/agent/agent";
import * as store from "@/lib/agent/store";
import type { GuardReport } from "@/lib/agent/steps/guard";
import type { BrandCheckItem, Plan, Questions } from "@/lib/agent/types";
import { runCampaign } from "@/lib/eval/runner";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const all = (name: string) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));

async function main() {
  const briefFile = args[0];
  if (!briefFile || !fs.existsSync(briefFile)) throw new Error("Usage: npm run brief -- <brief.md> [--answers text] [--plan-change text] [--edit text]... [--finish [--accept-memories]]");

  let label = "";
  const result = await runCampaign(
    { briefFile, answers: arg("--answers"), planChange: arg("--plan-change"), edits: all("--edit"), finish: args.includes("--finish"), acceptMemories: args.includes("--accept-memories") },
    (turn, e: AgentEvent) => {
      if (turn !== label) console.log(`\n━━ ${(label = turn).toUpperCase()} ━━`);
      if (e.type === "status") console.log(`  … ${e.text}`);
      if (e.type === "message" && e.message.role === "assistant") printMessage(e.message.kind, e.message.content as Record<string, unknown>);
    },
  );

  for (const a of store.listAssets(result.campaignId)) {
    const v = store.getVersion(a.id, a.current_version);
    const g = v?.guard as GuardReport | null;
    console.log(`\n### ${a.title} (${ASSET_LABEL[a.type]}, v${a.current_version}) check=${g?.status ?? a.status}`);
    g?.issues.forEach((i) => console.log(`   ! [${i.severity}] "${i.quote.slice(0, 80)}" -> ${i.problem}`));
    if (v) console.log(assetToText(v.content as AssetContent).slice(0, 900).replace(/^/gm, "   | "));
  }
  if (result.acceptedMemories.length) {
    console.log("\n━━ MEMORY ACCEPTED ━━");
    result.acceptedMemories.forEach((m) => console.log(`  + [${m.type}] ${m.text}`));
  }

  const c = result.cost;
  console.log(`\n━━ COST ━━ campaign $${result.initialRunUSD.toFixed(4)} | total $${c.totalUSD.toFixed(4)} | in ${c.inputTokens} (cached ${Math.round(c.cacheHitRate * 100)}%) | out ${c.outputTokens}`);
  result.edits.forEach((e) => console.log(`  edit "${e.instruction.slice(0, 50)}": $${e.costUSD.toFixed(4)}, changed ${e.touched.length} asset(s)`));
  for (const s of c.byStep) console.log(`  ${s.step.padEnd(28)} x${String(s.calls).padEnd(3)} in ${String(s.inputTokens).padStart(7)} cached ${String(s.cachedTokens).padStart(7)} out ${String(s.outputTokens).padStart(6)}  $${s.costUSD.toFixed(4)}`);
}

function printMessage(kind: string, c: Record<string, unknown>) {
  if (kind === "text") console.log(`  agent: ${c.text}`);
  if (kind === "brand_check")
    for (const i of c.items as BrandCheckItem[]) console.log(`  [${i.verdict.toUpperCase()}] ${i.requested}\n      rule: ${i.rule} (${i.source_doc ?? "-"})${i.alternative ? `\n      instead: ${i.alternative}` : ""}`);
  if (kind === "questions") {
    const q = c as unknown as Questions & { memoriesUsed?: number };
    if (q.memoriesUsed) console.log(`  using ${q.memoriesUsed} memories`);
    q.questions.forEach((x) => console.log(`  Q: ${x.question}\n     why: ${x.why}\n     default: ${x.default}`));
    q.assumptions.forEach((a) => console.log(`  assume: ${a}`));
  }
  if (kind === "plan") {
    const p = c.plan as Plan;
    console.log(`  PLAN: ${p.summary}\n  mix: ${p.mix_rationale}`);
    p.items.forEach((i, n) => console.log(`   ${n + 1}. [${i.id}] ${ASSET_LABEL[i.type]} | ${i.title} | ${i.audience} | ${i.publish_date ?? "-"}${i.research_question ? " | research" : ""}`));
  }
  if (kind === "assets") console.log(`  written: ${JSON.stringify(c.guard)}${(c.failed as string[]).length ? ` failed: ${(c.failed as string[]).join("; ")}` : ""}`);
  if (kind === "edit") (c.results as { title: string; summary: string; guard: string }[]).forEach((r) => console.log(`  edited ${r.title}: ${r.summary} [check ${r.guard}]`));
  if (kind === "memory") console.log(`  proposed memories: ${(c.proposedIds as string[]).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
