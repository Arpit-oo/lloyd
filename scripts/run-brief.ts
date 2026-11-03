/**
 * Runs one brief end to end without the UI, exactly as a user would in chat.
 * Usage:
 *   npm run brief -- <brief.md> [--answers "text" | --defaults] [--plan-change "text"] [--edit "text"] [--finish]
 * Prints the agent's turns, the plan, each asset's guard result, and cost per step.
 */
import fs from "node:fs";
import { requireBrand } from "@/lib/brand";
import { handleMessage, type AgentEvent } from "@/lib/agent/agent";
import * as store from "@/lib/agent/store";
import { assetToText, ASSET_LABEL } from "@/lib/agent/asset-types";
import type { GuardReport } from "@/lib/agent/steps/guard";
import type { Plan, Questions, BrandCheckItem } from "@/lib/agent/types";
import { db } from "@/lib/db";

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error("Usage: npm run brief -- <brief.md> [--defaults|--answers text] [--plan-change text] [--edit text] [--finish]");
  const brand = requireBrand();
  const campaign = store.createCampaign(brand.hash, "New campaign");
  console.log(`Campaign ${campaign.id}\n`);

  await turn(campaign.id, fs.readFileSync(file, "utf8"), "BRIEF");

  if (store.getCampaign(campaign.id)!.state === "clarifying") {
    await turn(campaign.id, arg("--answers") ?? "Go with your defaults.", "ANSWERS");
  }
  if (arg("--plan-change")) await turn(campaign.id, arg("--plan-change")!, "PLAN CHANGE");
  if (store.getCampaign(campaign.id)!.state === "plan_review") await turn(campaign.id, "Looks good, write it.", "APPROVE");

  printAssets(campaign.id);
  if (arg("--edit")) {
    await turn(campaign.id, arg("--edit")!, "EDIT");
    printAssets(campaign.id, true);
  }
  if (process.argv.includes("--finish")) await turn(campaign.id, "We're done with this campaign.", "FINISH");

  printCosts(campaign.id);
}

async function turn(campaignId: string, text: string, label: string) {
  console.log(`\n━━ ${label} ━━`);
  const started = Date.now();
  let cost = 0;
  await handleMessage(campaignId, text, (e: AgentEvent) => {
    if (e.type === "status") console.log(`  … ${e.text}`);
    if (e.type === "message" && e.message.role === "assistant") printMessage(e.message.kind, e.message.content as Record<string, unknown>);
    if (e.type === "done") cost = e.costUSD;
  });
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s, $${cost.toFixed(4)})`);
}

function printMessage(kind: string, c: Record<string, unknown>) {
  if (kind === "text") console.log(`  agent: ${c.text}`);
  if (kind === "brand_check")
    for (const i of c.items as BrandCheckItem[]) console.log(`  [${i.verdict.toUpperCase()}] ${i.requested}\n      rule: ${i.rule} (${i.source_doc ?? "-"})${i.alternative ? `\n      instead: ${i.alternative}` : ""}`);
  if (kind === "questions") {
    const q = c as unknown as Questions & { memoriesUsed: number };
    q.questions.forEach((x) => console.log(`  Q: ${x.question}\n     why: ${x.why}\n     default: ${x.default}`));
    q.assumptions.forEach((a) => console.log(`  assume: ${a}`));
    if (q.memoriesUsed) console.log(`  using ${q.memoriesUsed} memories`);
  }
  if (kind === "plan") {
    const p = c.plan as Plan;
    console.log(`  PLAN: ${p.summary}\n  mix: ${p.mix_rationale}`);
    p.items.forEach((i, n) => console.log(`   ${n + 1}. [${i.id}] ${ASSET_LABEL[i.type]} | ${i.title} | ${i.audience} | ${i.publish_date ?? "-"}${i.research_question ? " | research" : ""}`));
  }
  if (kind === "assets") console.log(`  assets: ${JSON.stringify(c.guard)}${(c.failed as string[]).length ? ` failed: ${(c.failed as string[]).join("; ")}` : ""}`);
  if (kind === "edit") (c.results as { title: string; summary: string; guard: string }[]).forEach((r) => console.log(`  edited ${r.title}: ${r.summary} [guard ${r.guard}]`));
  if (kind === "memory") console.log(`  proposed memories: ${(c.proposedIds as string[]).length}`);
}

function printAssets(campaignId: string, onlyEdited = false) {
  for (const a of store.listAssets(campaignId)) {
    if (onlyEdited && a.current_version < 2) continue;
    const v = store.getVersion(a.id, a.current_version);
    if (!v) {
      console.log(`\n### ${a.title}: ${a.status}`);
      continue;
    }
    const g = v.guard as GuardReport | null;
    console.log(`\n### ${a.title} (${ASSET_LABEL[a.type]}, v${v.version}) guard=${g?.status ?? "?"}`);
    g?.issues.forEach((i) => console.log(`   ! [${i.severity}] "${i.quote.slice(0, 80)}" -> ${i.problem}`));
    console.log(assetToText(v.content).slice(0, 1200).replace(/^/gm, "   | "));
  }
}

function printCosts(campaignId: string) {
  const rows = db()
    .prepare(
      `SELECT step, COUNT(*) n, SUM(input_tokens) i, SUM(cached_tokens) c, SUM(cache_write_tokens) w, SUM(output_tokens) o, SUM(cost_usd) usd
       FROM llm_calls WHERE campaign_id = ? GROUP BY step ORDER BY usd DESC`,
    )
    .all(campaignId) as { step: string; n: number; i: number; c: number; w: number; o: number; usd: number }[];
  const tot = rows.reduce((a, r) => ({ i: a.i + r.i, c: a.c + r.c, o: a.o + r.o, usd: a.usd + r.usd }), { i: 0, c: 0, o: 0, usd: 0 });
  console.log(`\n━━ COST ━━  total $${tot.usd.toFixed(4)} | in ${tot.i} (cached ${tot.c}, ${((tot.c / Math.max(1, tot.i)) * 100).toFixed(0)}%) | out ${tot.o}`);
  for (const r of rows) console.log(`  ${r.step.padEnd(24)} x${String(r.n).padEnd(3)} in ${String(r.i).padStart(7)} cached ${String(r.c).padStart(7)} out ${String(r.o).padStart(6)}  $${r.usd.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
