import fs from "node:fs";
import { handleMessage, type AgentEvent } from "@/lib/agent/agent";
import * as store from "@/lib/agent/store";
import type { GuardReport } from "@/lib/agent/steps/guard";
import type { BrandCheckItem, Plan, Questions } from "@/lib/agent/types";
import { requireBrand } from "@/lib/brand";
import { campaignCost, type CampaignCost } from "@/lib/costs";
import { db } from "@/lib/db";
import { listMemories, updateMemory, type Memory } from "@/lib/memory/store";

/**
 * Drives one campaign end to end exactly as a user would in chat, with no UI.
 * Shared by `npm run brief` (prints), `npm run eval` (asserts) and `npm run bench` (writes COSTS.md).
 */
export interface RunSpec {
  briefFile: string;
  /** Reply to the agent's questions; omitted = "Go with your defaults." */
  answers?: string;
  planChange?: string;
  edits?: string[];
  finish?: boolean;
  acceptMemories?: boolean;
}

export interface TurnLog {
  label: string;
  text: string;
  seconds: number;
  costUSD: number;
  runId: string | null;
}

export interface RunResult {
  campaignId: string;
  brandCheck: BrandCheckItem[];
  questions: Questions | null;
  memoriesUsed: number;
  plan: Plan | null;
  assets: { id: string; title: string; type: string; versions: number; guard: GuardReport | null; text: string }[];
  edits: { instruction: string; touched: string[]; costUSD: number }[];
  acceptedMemories: Memory[];
  turns: TurnLog[];
  cost: CampaignCost;
  initialRunUSD: number;
}

export async function runCampaign(spec: RunSpec, onEvent?: (label: string, e: AgentEvent) => void): Promise<RunResult> {
  const brand = requireBrand();
  const campaign = store.createCampaign(brand.hash, "New campaign");
  const turns: TurnLog[] = [];

  const turn = async (label: string, text: string) => {
    const started = Date.now();
    let cost = 0;
    await handleMessage(campaign.id, text, (e) => {
      if (e.type === "done") cost = e.costUSD;
      onEvent?.(label, e);
    });
    const runId = (db().prepare("SELECT run_id FROM llm_calls WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1").get(campaign.id) as { run_id: string } | undefined)?.run_id ?? null;
    turns.push({ label, text, seconds: (Date.now() - started) / 1000, costUSD: cost, runId });
  };
  const state = () => store.getCampaign(campaign.id)!.state;

  await turn("brief", fs.readFileSync(spec.briefFile, "utf8"));
  if (state() === "clarifying") await turn("answers", spec.answers ?? "Go with your defaults.");
  if (spec.planChange && state() === "plan_review") await turn("plan change", spec.planChange);
  if (state() === "plan_review") await turn("approve", "Looks good. Write it.");
  const initialRunUSD = campaignCost(campaign.id).totalUSD;

  const edits: RunResult["edits"] = [];
  for (const instruction of spec.edits ?? []) {
    const before = new Map(store.listAssets(campaign.id).map((a) => [a.id, a.current_version]));
    await turn("edit", instruction);
    const touched = store.listAssets(campaign.id).filter((a) => before.get(a.id) !== a.current_version).map((a) => a.id);
    edits.push({ instruction, touched, costUSD: turns[turns.length - 1].costUSD });
  }

  let acceptedMemories: Memory[] = [];
  if (spec.finish) {
    await turn("finish", "We're done with this campaign.");
    if (spec.acceptMemories) {
      acceptedMemories = listMemories(brand.hash, ["proposed"]).filter((m) => m.source_campaign_id === campaign.id);
      acceptedMemories.forEach((m) => updateMemory(m.id, { status: "active" }));
    }
  }

  const data = store.getCampaign(campaign.id)!.data;
  const qMsg = store.listMessages(campaign.id).find((m) => m.kind === "questions");
  return {
    campaignId: campaign.id,
    brandCheck: data.brandCheck ?? [],
    questions: data.questions ?? null,
    memoriesUsed: (qMsg?.content as { memoriesUsed?: number } | undefined)?.memoriesUsed ?? data.memoryIds?.length ?? 0,
    plan: data.plan ?? null,
    assets: store.listAssets(campaign.id).map((a) => {
      const v = a.current_version ? store.getVersion(a.id, a.current_version) : null;
      return { id: a.id, title: a.title, type: a.type, versions: a.current_version, guard: (v?.guard as GuardReport | null) ?? null, text: v ? JSON.stringify(v.content.data) : "" };
    }),
    edits,
    acceptedMemories,
    turns,
    cost: campaignCost(campaign.id),
    initialRunUSD,
  };
}
