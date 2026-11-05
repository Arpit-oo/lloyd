"use client";

import { useState } from "react";

/** Sample of what each asset type looks like in the app (illustrative copy, no real brand). */
const TABS = [
  {
    id: "linkedin",
    label: "LinkedIn post",
    note: "Rendered like the real feed: author line, fold, hashtags.",
    body: (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-full bg-ink/10" />
          <div>
            <div className="text-[14px] font-semibold">Your Company</div>
            <div className="text-[12px] text-muted">12,400 followers · Promoted</div>
          </div>
        </div>
        <p className="text-[14px] leading-relaxed">
          Release notes nobody reads are a tax on your customers. This quarter we rebuilt ours around one question: what changed for <em>you</em>?
        </p>
        <p className="text-[14px] leading-relaxed text-muted">…see more</p>
        <div className="h-40 rounded-lg bg-gradient-to-br from-accent/25 via-accent/5 to-transparent" />
      </div>
    ),
  },
  {
    id: "email",
    label: "Email",
    note: "Subject, preview text, body and one clear call to action.",
    body: (
      <div className="space-y-3">
        <div className="space-y-1 border-b border-line pb-3 text-[13px]">
          <div><span className="text-muted">Subject</span> · The changelog, rewritten for humans</div>
          <div><span className="text-muted">Preview</span> · Three changes worth your five minutes</div>
        </div>
        <p className="text-[14px] leading-relaxed">Hi Sam,</p>
        <p className="text-[14px] leading-relaxed">We cut the jargon from our release notes and kept the parts that change your week. Here are the three that matter most.</p>
        <span className="inline-block rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-on-ink">Read what changed</span>
      </div>
    ),
  },
  {
    id: "landing",
    label: "Landing page",
    note: "Hero, proof, features and CTA, in the brand's own colours and fonts.",
    body: (
      <div className="space-y-4">
        <div className="rounded-xl bg-ink p-6 text-on-ink">
          <div className="text-[11px] uppercase tracking-[0.18em] opacity-60">New</div>
          <div className="mt-2 text-[22px] font-semibold leading-tight">Know what shipped, without the archaeology.</div>
          <span className="mt-4 inline-block rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent">Book a walkthrough</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-line bg-panel" />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "x",
    label: "X post",
    note: "Character-counted, thread-aware.",
    body: (
      <div className="space-y-2">
        <div className="text-[14px]"><span className="font-semibold">Your Company</span> <span className="text-muted">@yourco · 2h</span></div>
        <p className="text-[15px] leading-relaxed">We rewrote our changelog so you can read it in the time it takes your coffee to cool. 3 changes, zero jargon. ↓</p>
        <div className="text-[12px] text-muted">142 / 280</div>
      </div>
    ),
  },
  {
    id: "blog",
    label: "Blog post",
    note: "Headline, standfirst, sections, sources for every statistic.",
    body: (
      <div className="space-y-3">
        <div className="text-[22px] font-semibold leading-tight">Why we stopped writing release notes for ourselves</div>
        <p className="text-[14px] leading-relaxed text-muted">A short history of a long changelog, and what replaced it.</p>
        {[90, 100, 75].map((w, i) => (
          <div key={i} className="h-2.5 rounded-full bg-ink/10" style={{ width: `${w}%` }} />
        ))}
      </div>
    ),
  },
];

export function AssetTabs() {
  const [tab, setTab] = useState(TABS[0].id);
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <div>
      <div role="tablist" aria-label="Asset types" className="flex flex-wrap justify-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-2 text-[14px] transition-colors ${t.id === tab ? "border-ink bg-ink text-on-ink" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={`panel-${current.id}`} role="tabpanel" className="mx-auto mt-10 grid max-w-5xl items-center gap-10 md:grid-cols-[1fr_1.3fr]">
        <div>
          <h3 className="text-[26px] font-semibold tracking-tight">{current.label}</h3>
          <p className="mt-3 text-[16px] leading-relaxed text-muted">{current.note}</p>
          <p className="mt-3 text-[16px] leading-relaxed text-muted">Edit it in chat. Only this asset changes; the rest of the campaign stays exactly as it was.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.25)]">{current.body}</div>
      </div>
    </div>
  );
}
