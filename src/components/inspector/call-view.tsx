"use client";

import { useEffect, useState } from "react";
import { getJSON, usd } from "@/lib/client/api";
import type { CallDetail, CallSummary } from "@/lib/client/types";

/**
 * Shows one model call exactly as sent: every prompt block in order, with its label, size and
 * whether a cache breakpoint follows it, then the raw response and the token/cost breakdown.
 */
export function CallView({ id }: { id: string }) {
  const [call, setCall] = useState<CallDetail | null>(null);
  useEffect(() => {
    getJSON<CallDetail>(`/api/calls/${id}`).then(setCall).catch(() => setCall(null));
  }, [id]);
  if (!call) return <div className="p-4 text-sm text-muted">Loading call…</div>;

  const labels = call.request._labels ?? [];
  let n = 0;
  return (
    <div className="space-y-4">
      <CallStats call={call} />
      <div className="space-y-3">
        {(call.request.input ?? []).map((msg, i) => (
          <div key={i} className="space-y-2">
            {msg.content.map((c, j) => {
              const meta = labels[n++];
              return (
                <div key={j} className="overflow-hidden rounded-lg border border-line bg-white">
                  <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5 text-xs">
                    <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase text-white">{msg.role}</span>
                    <span className="font-semibold">{meta?.label ?? (c.type === "input_image" ? "image" : "content")}</span>
                    <span className="text-muted">~{Math.round((c.text?.length ?? 0) / 4).toLocaleString()} tokens</span>
                    {c.prompt_cache_breakpoint ? <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">cache breakpoint</span> : null}
                  </div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11.5px] leading-relaxed text-ink/90">{c.text ?? c.image_url}</pre>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <details className="rounded-lg border border-line bg-white">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">Request parameters (model, schema, cache options)</summary>
        <pre className="max-h-80 overflow-auto p-3 font-mono text-[11px]">
          {JSON.stringify({ ...call.request, input: `[${call.request.input?.length ?? 0} messages shown above]`, _labels: undefined }, null, 2)}
        </pre>
      </details>
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="border-b border-line bg-panel px-3 py-1.5 text-xs font-semibold">Response</div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11.5px]">{call.error ?? prettyJson(call.response_text)}</pre>
      </div>
    </div>
  );
}

export function CallStats({ call }: { call: CallSummary }) {
  const uncached = Math.max(0, call.input_tokens - call.cached_tokens - call.cache_write_tokens);
  const hit = call.input_tokens ? Math.round((call.cached_tokens / call.input_tokens) * 100) : 0;
  return (
    <div className="grid grid-cols-3 gap-2 text-xs md:grid-cols-7">
      {[
        ["Step", call.step],
        ["Model", call.model],
        ["Input", `${call.input_tokens.toLocaleString()}`],
        ["Cached", `${call.cached_tokens.toLocaleString()} (${hit}%)`],
        ["Cache write / plain", `${call.cache_write_tokens.toLocaleString()} / ${uncached.toLocaleString()}`],
        ["Output", `${call.output_tokens.toLocaleString()}${call.reasoning_tokens ? ` (${call.reasoning_tokens} reasoning)` : ""}`],
        ["Cost · time", `${usd(call.cost_usd)} · ${(call.latency_ms / 1000).toFixed(1)}s`],
      ].map(([k, v]) => (
        <div key={k} className="rounded-md border border-line bg-white px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted">{k}</div>
          <div className="truncate font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}

function prettyJson(t: string | null) {
  if (!t) return "";
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return t;
  }
}
