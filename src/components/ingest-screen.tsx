"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import { useState } from "react";

const STEPS = ["scan", "cards", "chunk embeddings", "governance", "facts", "conflicts", "entities", "kernel", "images", "design tokens", "done"];

/** First run on a new brand folder: builds the index with visible progress. Cached afterwards. */
export function IngestScreen({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string>("");
  const [detail, setDetail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setRunning(true);
    setError(null);
    const res = await fetch("/api/brand/ingest", { method: "POST" });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const p of parts) {
        if (!p.startsWith("data: ")) continue;
        const e = JSON.parse(p.slice(6));
        if (e.type === "progress") {
          setStep(e.step);
          setDetail(e.total ? `${e.done}/${e.total} ${e.message ?? ""}` : e.message ?? "");
        }
        if (e.type === "error") setError(e.text);
        if (e.type === "done") onDone();
      }
    }
    setRunning(false);
  };

  const idx = STEPS.indexOf(step);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-line">
        <h1 className="text-xl font-bold">Index the brand folder</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          First run on this brand folder. I read every document once, work out which ones win when they disagree, pull out the rules and facts, check every image, and compile a short brand kernel. This takes a few minutes and costs about $1–3, once. After that it loads instantly.
        </p>
        {!running && !step && (
          <button onClick={start} className="mt-6 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-on-ink">Start indexing</button>
        )}
        {(running || step) && (
          <ol className="mt-6 space-y-1.5 text-sm">
            {STEPS.slice(0, -1).map((s, i) => (
              <li key={s} className={`flex items-center gap-2 ${i < idx ? "text-ink" : i === idx ? "font-semibold" : "text-muted"}`}>
                {i < idx ? <Check size={14} className="text-ok" /> : i === idx ? <Loader2 size={14} className="animate-spin" /> : <Circle size={12} className="text-line-strong" />} {s}
                {i === idx && <span className="truncate text-xs font-normal text-muted">{detail}</span>}
              </li>
            ))}
          </ol>
        )}
        {error && <div className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</div>}
      </div>
    </div>
  );
}
