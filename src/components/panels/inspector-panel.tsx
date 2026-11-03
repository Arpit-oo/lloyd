"use client";

import { useEffect, useState } from "react";
import { getJSON, usd } from "@/lib/client/api";
import type { CallSummary, CampaignView } from "@/lib/client/types";
import { CallView } from "../inspector/call-view";
import { Modal } from "../ui/modal";

/** Every model call of the campaign with its exact prompt, plus the cost breakdown by step. */
export function InspectorPanel({ view, onClose }: { view: CampaignView; onClose: () => void }) {
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"calls" | "costs">("calls");
  useEffect(() => {
    getJSON<CallSummary[]>(`/api/calls?campaign=${view.campaign.id}`).then((c) => {
      const meaningful = c.filter((x) => !x.step.startsWith("retrieve:"));
      setCalls(meaningful);
      setSelected(meaningful.find((x) => x.step.startsWith("write:") && !x.step.endsWith("prewarm"))?.id ?? meaningful[0]?.id ?? null);
    });
  }, [view.campaign.id]);
  const cost = view.cost;

  return (
    <Modal title="Inspector" subtitle={`${view.campaign.title}: ${calls.length} model calls · ${usd(cost.totalUSD)} total · ${Math.round(cost.cacheHitRate * 100)}% of input tokens read from cache`} onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-lg bg-white p-1 ring-1 ring-line">
        {(["calls", "costs"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-3 py-2 text-sm capitalize ${tab === t ? "bg-ink font-semibold text-white" : "text-muted"}`}>
            {t === "calls" ? "Prompts sent" : "Cost by step"}
          </button>
        ))}
      </div>
      {tab === "calls" ? (
        <div className="grid min-h-0 gap-4 md:grid-cols-[280px_1fr]">
          <ul className="max-h-[66vh] space-y-1 overflow-y-auto">
            {calls.map((c) => (
              <li key={c.id}>
                <button onClick={() => setSelected(c.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs ring-1 ${selected === c.id ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:ring-ink"}`}>
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-semibold">{c.step}</span>
                    <span>{usd(c.cost_usd)}</span>
                  </div>
                  <div className={selected === c.id ? "text-white/70" : "text-muted"}>
                    {c.model} · {c.input_tokens.toLocaleString()} in ({c.input_tokens ? Math.round((c.cached_tokens / c.input_tokens) * 100) : 0}% cached) · {c.output_tokens.toLocaleString()} out
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">{selected ? <CallView key={selected} id={selected} /> : null}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Campaign total", usd(cost.totalUSD)],
              ["Edits", `${cost.edits} · ${usd(cost.editsUSD)}`],
              ["Tokens in / out", `${cost.inputTokens.toLocaleString()} / ${cost.outputTokens.toLocaleString()}`],
              ["Cache hit rate", `${Math.round(cost.cacheHitRate * 100)}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white p-4 ring-1 ring-line">
                <div className="text-xs text-muted">{k}</div>
                <div className="mt-1 text-xl font-bold">{v}</div>
              </div>
            ))}
          </div>
          <table className="w-full overflow-hidden rounded-xl bg-white text-sm ring-1 ring-line">
            <thead className="bg-panel text-left text-xs text-muted">
              <tr>{["Step", "Calls", "Input", "Cached", "Cache writes", "Output", "Cost"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cost.byStep.map((s) => (
                <tr key={s.step}>
                  <td className="px-4 py-2 font-mono text-xs">{s.step}</td>
                  <td className="px-4 py-2">{s.calls}</td>
                  <td className="px-4 py-2">{s.inputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2">{s.cachedTokens.toLocaleString()}</td>
                  <td className="px-4 py-2">{s.cacheWriteTokens.toLocaleString()}</td>
                  <td className="px-4 py-2">{s.outputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2 font-semibold">{usd(s.costUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
