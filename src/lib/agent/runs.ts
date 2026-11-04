/**
 * Runs in progress, one per campaign. A run keeps going if the browser tab reloads or closes
 * (the agent's work is not tied to the HTTP connection), and stops only when someone presses
 * Stop, which aborts its signal and every model call listening to it.
 *
 * Each run also keeps a small live record (who started it, the steps so far, live asset drafts)
 * so anyone else watching the campaign, a coworker in a shared chat or the same person after a
 * reload, sees the same progress as the person who sent the message.
 */
export interface RunInfo {
  author: string;
  /** Browser tab that sent the message, so that tab knows the run is its own. */
  tab: string;
  startedAt: number;
  steps: { text: string; at: number }[];
  drafts: Record<string, string>;
  /** What the current step's model is writing right now, as readable text. */
  live: string;
}

interface Run {
  ctrl: AbortController;
  info: RunInfo;
}

const g = globalThis as unknown as { __runs?: Map<string, Run> };
const runs = () => (g.__runs ??= new Map());

export function startRun(campaignId: string, author = "", tab = ""): AbortController {
  runs().get(campaignId)?.ctrl.abort();
  const ctrl = new AbortController();
  runs().set(campaignId, { ctrl, info: { author, tab, startedAt: Date.now(), steps: [], drafts: {}, live: "" } });
  return ctrl;
}

export function endRun(campaignId: string, ctrl: AbortController) {
  if (runs().get(campaignId)?.ctrl === ctrl) runs().delete(campaignId);
}

export function stopRun(campaignId: string): boolean {
  const run = runs().get(campaignId);
  if (!run) return false;
  run.ctrl.abort(new Error("Stopped by user"));
  return true;
}

export const isRunning = (campaignId: string) => runs().has(campaignId);

/** Records the progress events watchers need. Drafts are dropped once the asset is saved. */
export function recordRunEvent(campaignId: string, e: { type: string; text?: string; assetId?: string }) {
  const info = runs().get(campaignId)?.info;
  if (!info) return;
  if (e.type === "status" && e.text && info.steps.at(-1)?.text !== e.text) {
    info.steps.push({ text: e.text, at: Date.now() });
    info.live = "";
  }
  if (e.type === "live") info.live = e.text ?? "";
  if (e.type === "draft" && e.assetId) info.drafts[e.assetId] = e.text ?? "";
  if (e.type === "asset" && e.assetId) delete info.drafts[e.assetId];
}

export const runInfo = (campaignId: string): RunInfo | null => runs().get(campaignId)?.info ?? null;

/** Runs in progress across all campaigns (switching brand waits until there are none). */
export const activeRunCount = () => runs().size;
