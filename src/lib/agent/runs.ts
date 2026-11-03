/**
 * Runs in progress, one per campaign. A run keeps going if the browser tab reloads or closes
 * (the agent's work is not tied to the HTTP connection), and stops only when the user presses
 * Stop, which aborts its signal and every model call listening to it.
 */
const g = globalThis as unknown as { __runs?: Map<string, AbortController> };
const runs = () => (g.__runs ??= new Map());

export function startRun(campaignId: string): AbortController {
  runs().get(campaignId)?.abort();
  const ctrl = new AbortController();
  runs().set(campaignId, ctrl);
  return ctrl;
}

export function endRun(campaignId: string, ctrl: AbortController) {
  if (runs().get(campaignId) === ctrl) runs().delete(campaignId);
}

export function stopRun(campaignId: string): boolean {
  const ctrl = runs().get(campaignId);
  if (!ctrl) return false;
  ctrl.abort(new Error("Stopped by user"));
  return true;
}

export const isRunning = (campaignId: string) => runs().has(campaignId);
