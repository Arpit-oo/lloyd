"use client";

import { Check, ChevronRight } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Bee } from "../brand/bee";

export interface LiveRun {
  steps: { text: string; at: number }[];
  startedAt: number;
  /** Who sent the message being worked on. Empty for this tab's own message. */
  author: string;
  mine: boolean;
}

/**
 * Live progress of an agent run: the current step with a shimmer and a running clock, and a
 * collapsible timeline of every step so far with how long each took. The same view appears for
 * the sender, for a coworker watching a shared chat, and after a page reload.
 */
export function RunSteps({ run: given, bee, fallback }: { run: LiveRun | null; bee: boolean; fallback: string }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const regionId = useId();
  const [mountedAt] = useState(() => Date.now());
  const run = given ?? { steps: [], startedAt: mountedAt, author: "", mine: true };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const current = run.steps.at(-1)?.text ?? fallback;
  const seconds = Math.max(0, Math.round((now - run.startedAt) / 1000));
  const whose = run.mine || !run.author ? null : run.author;
  const done = run.steps.slice(0, -1);

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2.5">
        {bee ? (
          <Bee size={22} mood="fly" />
        ) : (
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </span>
        )}
        <span role="status" aria-live="polite" className="min-w-0 truncate">
          {whose && <span className="text-muted">Working on {whose}&apos;s message · </span>}
          <span className="shimmer font-serif italic">{current}…</span>
        </span>
        <span className="tabular shrink-0 font-mono text-[12px] text-muted" aria-label={`${seconds} seconds so far`}>{fmt(seconds)}</span>
        {done.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen(!open)}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-muted hover:border-line-strong hover:text-ink"
          >
            {done.length} step{done.length > 1 ? "s" : ""} done
            <ChevronRight size={13} className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} aria-hidden />
          </button>
        )}
      </div>
      <div id={regionId} hidden={!open}>
        <ol className="ml-[10px] mt-3 border-l border-line pl-5">
          {run.steps.map((s, i) => {
            const next = run.steps[i + 1]?.at ?? now;
            const active = i === run.steps.length - 1;
            return (
              <li key={`${i}-${s.text}`} className="step-in relative flex min-h-8 items-center gap-3 py-1 text-[13px]">
                <span className="absolute -left-[27px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface">
                  {active ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="In progress" /> : <Check size={12} className="text-ok" aria-label="Done" />}
                </span>
                <span className={active ? "text-ink" : "text-muted"}>{s.text}</span>
                <span className="tabular ml-auto font-mono text-[11.5px] text-muted">{fmt(Math.round((next - s.at) / 1000))}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
