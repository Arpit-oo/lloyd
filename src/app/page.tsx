import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileSearch, ShieldCheck, Users } from "lucide-react";
import { Bee } from "@/components/brand/bee";
import { HalftoneRibbon, HeroBanner, OverlapMark } from "@/components/landing/art";
import { LayerStack } from "@/components/landing/layer-stack";
import { WatchingBee } from "@/components/landing/watching-bee";
import { AssetTabs } from "@/components/landing/asset-tabs";
import { MobileNav } from "@/components/landing/mobile-nav";

export const metadata: Metadata = {
  title: "Lloyd · The brand-aware campaign agent",
  description: "Lloyd plans and writes campaigns that follow your brand's rules, from documents far too big for a prompt.",
};

/**
 * Lloyd's marketing page, at /. The app lives at /app. Uses the app's Lloyd tokens (white, magenta accent, Inter).
 * Every number on it comes from COSTS.md (the benchmark run), nothing is made up.
 */
const NAV = [
  ["How it works", "#how"],
  ["Brand layer", "#brand"],
  ["Assets", "#assets"],
  ["Costs", "#costs"],
] as const;

const OUTCOMES = [
  { metric: "$0.26–$0.61", label: "for a whole campaign", detail: "Brief in, questions, plan, 5–11 assets written, fact-checked and fixed." },
  { metric: "≈3¢", label: "per chat edit", detail: "One asset rewritten and re-checked. The rest of the campaign isn't touched." },
  { metric: "34–44%", label: "prompt cache hit rate", detail: "The brand's rules sit at the front of every prompt, so they're cached and reused." },
];

const STEPS = [
  ["Read the brief", "Typed, pasted, or attached as a PDF, Word file, deck or Markdown."],
  ["Check it against the brand", "Flags claims legal won't allow and names that changed, before a word is written."],
  ["Ask, only if needed", "Questions with sensible defaults you can accept in one reply."],
  ["Propose a plan", "Which assets, for whom, saying what. Change it in plain words until it's right."],
  ["Write, with research", "Each asset gets only the brand sections it needs, plus web research with sources checked."],
  ["Check and fix", "A final pass against the brand's facts and rules, then it's yours to edit in chat."],
];

const AUDIENCES = [
  { icon: Users, title: "Marketers", text: "Go from brief to a full, on-brand campaign in minutes." },
  { icon: BookOpenCheck, title: "Brand leads", text: "One source of truth applied the same way, every time." },
  { icon: ShieldCheck, title: "Legal & compliance", text: "Forbidden claims are caught before review, not after." },
  { icon: FileSearch, title: "Teams", text: "Share a chat on your network and take turns with coworkers." },
];

const COSTS = [
  ["write:blog_post", "24,348", "46%", "$0.073"],
  ["write:email", "33,795", "55%", "$0.059"],
  ["write:linkedin_post", "36,300", "51%", "$0.056"],
  ["plan", "7,213", "42%", "$0.055"],
  ["brand-check", "18,450", "17%", "$0.049"],
  ["edit:linkedin_post", "9,135", "46%", "$0.016"],
];

const Eyebrow = ({ children }: { children: React.ReactNode }) => <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-accent-ink">{children}</p>;

export default function LloydLanding() {
  return (
    <div className="h-full overflow-y-auto overflow-x-clip bg-paper text-ink [font-family:var(--font-lloyd-sans)]">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/80 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Bee size={24} />
            <span className="text-[18px] font-semibold tracking-tight">Lloyd</span>
          </Link>
          <ul className="hidden items-center gap-8 text-[14px] text-muted md:flex">
            {NAV.map(([label, href]) => (
              <li key={href}><a href={href} className="block py-2 hover:text-ink">{label}</a></li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <MobileNav links={NAV} />
            <Link href="/app" className="hidden py-2 text-[14px] text-muted hover:text-ink sm:block">Open the app</Link>
            <Link href="/app" className="rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-on-ink hover:opacity-90">Start a campaign</Link>
          </div>
        </nav>
      </header>

      <main>
      <HeroBanner className="block h-[140px] w-full md:h-[216px]" />

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-14 text-center md:pt-20">
        <WatchingBee size={112} className="mx-auto mb-6" />
        <Eyebrow>The brand-aware campaign agent</Eyebrow>
        <h1 className="mx-auto mt-5 max-w-4xl text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[72px]">
          Campaigns that sound like your brand. <span className="text-accent">Every time.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-muted">
          Give Lloyd a brief. It reads your whole brand folder, works out which rules win, and writes posts, emails and pages your legal team would sign off.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/app" className="flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-on-ink hover:opacity-90">
            Start a campaign <ArrowRight size={16} />
          </Link>
          <a href="#how" className="rounded-full border border-line-strong px-6 py-3 text-[15px] font-semibold hover:bg-ink/5">See how it works</a>
        </div>

        {/* Product banner: chat left, asset right */}
        <div className="relative mx-auto mt-16 max-w-6xl">
          <div aria-hidden className="absolute inset-x-0 -top-10 bottom-0 -z-10 rounded-[48px] bg-[radial-gradient(ellipse_at_top,var(--c-accent-soft),transparent_70%)]" />
          <div className="overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-[0_40px_100px_-40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-1.5 border-b border-line bg-panel px-4 py-3">
              {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-line-strong" />)}
              <span className="ml-3 text-[12px] text-muted">Lloyd · Changelog launch</span>
            </div>
            <div className="grid md:grid-cols-[1fr_1.15fr]">
              <div className="space-y-4 border-line p-6 md:border-r">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-bubble px-4 py-2.5 text-[14px]">Launch the new changelog to existing customers. LinkedIn, X and an email.</div>
                <div className="text-[14px] leading-relaxed">
                  One thing first: the brief says &ldquo;real-time&rdquo;, but your product guide only allows &ldquo;within minutes&rdquo;. I&apos;ll use that.
                </div>
                <div className="space-y-2 rounded-xl border border-line p-4 text-[13px]">
                  {["Checked the brief against brand rules", "Planned 3 assets", "Writing the email"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2.5">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${i < 2 ? "bg-ok text-surface" : "animate-pulse bg-accent"}`}>{i < 2 ? "✓" : ""}</span>
                      <span className={i < 2 ? "text-muted" : "font-medium"}>{s}</span>
                    </div>
                  ))}
                </div>
                <div className="ml-auto w-fit rounded-2xl bg-bubble px-4 py-2.5 text-[14px]">Shorten the LinkedIn post</div>
              </div>
              <div className="bg-panel p-6">
                <div className="mb-3 flex gap-2 text-[12px]">
                  {["LinkedIn", "X", "Email"].map((t, i) => (
                    <span key={t} className={`rounded-full px-3 py-1 ${i === 0 ? "bg-ink text-on-ink" : "border border-line text-muted"}`}>{t}</span>
                  ))}
                </div>
                <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-accent/20" />
                    <div>
                      <div className="text-[13px] font-semibold">Your Company</div>
                      <div className="text-[11px] text-muted">Promoted</div>
                    </div>
                  </div>
                  <p className="text-[13.5px] leading-relaxed">What changed this month, in plain words. Three updates, each one minute to read.</p>
                  <div className="h-28 rounded-lg bg-gradient-to-br from-accent/30 via-accent/10 to-transparent" />
                  <div className="flex items-center gap-2 text-[11px] text-ok"><ShieldCheck size={13} /> Every claim checked against the brand</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HalftoneRibbon className="block h-16 w-full md:h-24" />

      {/* Reads */}
      <section className="border-y border-line bg-panel">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-6 py-8 text-[14px] font-semibold text-muted">
          <span className="font-normal">Reads your brand as it is:</span>
          {["PDF", "Word", "PowerPoint", "Markdown", "HTML", "Images", "Links"].map((f) => <span key={f}>{f}</span>)}
        </div>
      </section>

      {/* Outcomes */}
      <section id="costs" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-24">
        <div className="max-w-2xl">
          <Eyebrow>Measured, not promised</Eyebrow>
          <h2 className="mt-4 text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">A full campaign costs less than a coffee.</h2>
          <p className="mt-4 text-[17px] text-muted">From our benchmark of three briefs plus a memory run. Every cost is tracked per step.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {OUTCOMES.map((o) => (
            <div key={o.label} className="flex flex-col justify-between rounded-2xl bg-[#111113] p-7 text-white">
              <div className="-mx-7 -mt-7 h-32 rounded-t-2xl bg-[radial-gradient(120%_100%_at_20%_0%,rgba(217,54,196,0.5),rgba(217,54,196,0.12)_45%,transparent_75%)]" aria-hidden />
              <div className="mt-8">
                <div className="text-[44px] font-semibold tracking-tight">{o.metric}</div>
                <div className="text-[15px] font-medium text-white/80">{o.label}</div>
                <p className="mt-3 text-[14px] leading-relaxed text-white/60">{o.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Two halves */}
      <section id="brand" className="mx-auto max-w-7xl scroll-mt-20 px-6 pb-24">
        <div className="max-w-2xl">
          <Eyebrow>Two parts, one job</Eyebrow>
          <h2 className="mt-4 text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">A brand layer that knows. An agent that writes.</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {[
            {
              title: "The brand layer",
              text: "Reads 100k+ tokens of guidelines, product docs and old content once. Ranks every document by authority, settles conflicts with quotes, tracks renamed products, and vets the image library. Each prompt gets only what it needs.",
              art: (
                <div className="space-y-2">
                  {[["Legal guide", "wins", 100], ["Product guide", "", 78], ["Old sales deck", "outdated", 40]].map(([n, tag, w]) => (
                    <div key={n as string} className="flex items-center gap-3 text-[13px]">
                      <span className="w-32 shrink-0 text-muted">{n}</span>
                      <span className="h-2 rounded-full bg-accent" style={{ width: `${w}%`, opacity: Number(w) / 100 }} />
                      {tag && <span className="shrink-0 rounded-full border border-line px-2 text-[11px] text-muted">{tag}</span>}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              title: "The campaign agent",
              text: "Turns a brief into a plan you can change in plain words, writes each asset with the right brand context and checked research, and edits one asset at a time without touching the rest.",
              art: (
                <div className="space-y-2 text-[13px]">
                  <div className="ml-auto w-fit rounded-xl bg-bubble px-3 py-1.5">Drop the blog post, add an email</div>
                  <div className="w-fit rounded-xl border border-line px-3 py-1.5">Plan updated: 2 LinkedIn, 1 X, 1 email</div>
                </div>
              ),
            },
          ].map((c) => (
            <div key={c.title} className="flex flex-col rounded-2xl border border-line bg-surface p-8">
              <div className="rounded-xl bg-panel p-6">{c.art}</div>
              <h3 className="mt-8 text-[24px] font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-3 flex-1 text-[15.5px] leading-relaxed text-muted">{c.text}</p>
              <a href="#how" className="mt-4 flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-accent-ink hover:gap-2.5">Learn more <ArrowRight size={15} /></a>
            </div>
          ))}
        </div>
      </section>

      {/* Assets */}
      <section id="assets" className="scroll-mt-20 border-t border-line bg-panel px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>What it makes</Eyebrow>
          <h2 className="mt-4 text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">Five formats. Each looks the real thing.</h2>
        </div>
        <div className="mt-12">
          <AssetTabs />
        </div>
      </section>

      {/* The stack */}
      <section className="bg-[#111113] px-6 py-24 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#f28ee6]">Built in layers</p>
          <h2 className="mt-4 text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">Everything a careful marketer would do, done every time.</h2>
          <p className="mt-4 text-[17px] text-white/60">Five layers between your brief and a finished campaign. Point at one to see what it does.</p>
        </div>
        <div className="mt-16">
          <LayerStack />
        </div>
      </section>

      {/* Steps */}
      <section id="how" className="scroll-mt-20 border-t border-line px-6 py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">Six steps from brief to publish-ready.</h2>
            <p className="mt-4 text-[17px] text-muted">You watch each one tick off live, with the model&apos;s words streaming in as it writes.</p>
          </div>
          <ol className="space-y-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-6 rounded-2xl border border-line bg-surface p-6">
                <span className="font-mono text-[14px] font-semibold text-accent-ink">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-[18px] font-semibold">{title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Audiences */}
      <section className="border-t border-line bg-panel px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className="mt-4 text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">One brand, everyone on the same page.</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a, i) => (
              <div key={a.title} className="rounded-2xl border border-line bg-surface p-6">
                <OverlapMark variant={i as 0 | 1 | 2 | 3} />
                <h3 className="mt-5 text-[17px] font-semibold">{a.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Inspector */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Inspector</Eyebrow>
          <h2 className="mt-4 text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">Every prompt. Every token. Every cent.</h2>
          <p className="mt-4 text-[17px] text-muted">Open any step and read the exact prompt sent, block by block, with cache breakpoints marked.</p>
        </div>
        <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_40px_100px_-50px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between border-b border-line bg-panel px-6 py-3 text-[13px]">
            <span className="font-semibold">Detailed launch brief · 11 assets</span>
            <span className="text-muted">Total $0.605 · cache hit 42%</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[14px]">
            <thead className="text-[12px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Step</th>
                <th className="px-6 py-3 font-medium">Input tokens</th>
                <th className="px-6 py-3 font-medium">Cached</th>
                <th className="px-6 py-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {COSTS.map(([step, tokens, cached, cost]) => (
                <tr key={step} className="border-t border-line">
                  <td className="px-6 py-3 font-mono text-[13px]">{step}</td>
                  <td className="px-6 py-3 tabular-nums">{tokens}</td>
                  <td className="px-6 py-3">
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line"><span className="block h-full bg-accent" style={{ width: cached }} /></span>
                      {cached}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{cost}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-[#111113] pb-20 text-center text-white">
          <HalftoneRibbon className="mb-16 block h-28 w-full" />
          <div className="px-6">
          <h2 className="mx-auto max-w-3xl text-[36px] font-semibold leading-tight tracking-[-0.02em] md:text-[56px]">Bring a brief. Leave with a campaign.</h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px] text-white/65">Runs on your machine with one command. Your brand folder never leaves it, apart from the prompts sent to the model.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/app" className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-[#111113] hover:opacity-90">
              Start a campaign <ArrowRight size={16} />
            </Link>
            <a href="#how" className="rounded-full border border-white/25 px-6 py-3 text-[15px] font-semibold hover:bg-white/10">How it works</a>
          </div>
          </div>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2"><Bee size={22} /><span className="text-[17px] font-semibold">Lloyd</span></div>
            <p className="mt-3 max-w-xs text-[14px] text-muted">The brand-aware campaign agent.</p>
          </div>
          {[
            ["Product", [["Start a campaign", "/app"], ["How it works", "#how"], ["Assets", "#assets"]]],
            ["Inside", [["Brand layer", "#brand"], ["Costs", "#costs"], ["Inspector", "/app"]]],
            ["Run it", [["npm run dev", "#"], ["docker compose up", "#"]]],
          ].map(([head, links]) => (
            <div key={head as string}>
              <h3 className="text-[13px] font-semibold">{head as string}</h3>
              <ul className="mt-2 text-[14px] text-muted">
                {(links as string[][]).map(([l, h]) => (
                  <li key={l}>{h === "#" ? <code className="flex min-h-11 items-center font-mono text-[13px]">{l}</code> : <a href={h} className="flex min-h-11 items-center hover:text-ink">{l}</a>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <div className="mx-auto max-w-7xl px-6 py-6 text-[13px] text-muted">Lloyd · built with OpenAI models · numbers from the benchmark in COSTS.md</div>
        </div>
      </footer>
    </div>
  );
}
