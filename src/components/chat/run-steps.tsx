"use client";

import { Check, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Bee } from "../brand/bee";

export interface LiveRun {
  steps: { text: string; at: number }[];
  startedAt: number;
  /** Who sent the message being worked on. Empty for this tab's own message. */
  author: string;
  mine: boolean;
  /** What the current step's model is writing right now (token by token). */
  live?: string;
}

const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

/**
 * Live progress of a run as a checklist: every step so far with a check and how long it took,
 * the current one pulsing with the model's output streaming in underneath, and a running clock.
 * Open while the run works (it can be folded); the same view appears for the sender, a coworker
 * watching a shared chat, and after a reload.
 */
export function RunSteps({ run: given, bee, fallback }: { run: LiveRun | null; bee: boolean; fallback: string }) {
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const regionId = useId();
  const [mountedAt] = useState(() => Date.now());
  const run = given ?? { steps: [], startedAt: mountedAt, author: "", mine: true };
  const liveBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Keep the newest streamed words in view.
  useEffect(() => {
    const el = liveBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run.live]);

  const current = run.steps.at(-1)?.text ?? fallback;
  const seconds = Math.max(0, Math.round((now - run.startedAt) / 1000));
  const whose = run.mine || !run.author ? null : run.author;
  const steps = run.steps.length ? run.steps : [{ text: fallback, at: run.startedAt }];

  return (
    <div className="text-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-lg py-0.5 text-left"
      >
        {bee ? <Bee size={22} mood="fly" /> : <Sparkles size={15} className="shrink-0 text-accent" aria-hidden />}
        <span role="status" aria-live="polite" className="min-w-0 truncate">
          {whose && <span className="text-muted">Working on {whose}&apos;s message · </span>}
          <span className="shimmer font-medium">{current}…</span>
        </span>
        <span className="tabular ml-auto shrink-0 font-mono text-[12px] text-muted" aria-label={`${seconds} seconds so far`}>{fmt(seconds)}</span>
        <ChevronRight size={14} className={`shrink-0 text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      <div id={regionId} hidden={!open}>
        <StepList steps={steps} now={now} active live={run.live} liveRef={liveBox} />
      </div>
    </div>
  );
}

/** The checklist itself: shared by the live view and the "Worked for" summary of a finished turn. */
function StepList({ steps, now, active, live, liveRef }: { steps: { text: string; at: number }[]; now: number; active: boolean; live?: string; liveRef?: React.Ref<HTMLDivElement> }) {
  return (
    <ol className="ml-[10px] mt-2.5 border-l border-line pl-5">
      {steps.map((s, i) => {
        const isCurrent = active && i === steps.length - 1;
        const end = steps[i + 1]?.at ?? now;
        return (
          <li key={`${i}-${s.text}`} className="step-in relative py-1.5 text-[13px]">
            <span className="absolute -left-[27px] top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface ring-2 ring-surface">
              {isCurrent ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-label="In progress" />
              ) : (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ok text-surface" aria-label="Done">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </span>
            <div className="flex items-center gap-3">
              <span className={isCurrent ? "font-medium text-ink" : "text-muted"}>{s.text}</span>
              <span className="tabular ml-auto font-mono text-[11.5px] text-muted">{fmt(Math.max(0, Math.round((end - s.at) / 1000)))}</span>
            </div>
            {isCurrent && live?.trim() && (
              <div ref={liveRef} aria-live="off" className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-panel px-3 py-2 text-[13px] leading-relaxed text-ink/80">
                {live}
                <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 animate-pulse rounded-full bg-accent" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** After a turn: "Worked for 42s · 6 steps", folded; opens the same checklist with every step done. */
export function RunLog({ log }: { log: { steps: { text: string; at: number }[]; startedAt: number; endedAt: number } }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const secs = Math.max(1, Math.round((log.endedAt - log.startedAt) / 1000));
  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-muted hover:border-line-strong hover:text-ink"
      >
        <Sparkles size={12} aria-hidden />
        Worked for {fmt(secs)} · {log.steps.length} step{log.steps.length === 1 ? "" : "s"}
        <ChevronRight size={13} className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      <div id={id} hidden={!open}>
        <StepList steps={log.steps} now={log.endedAt} active={false} />
      </div>
    </div>
  );
}
