"use client";

import { CONFIRM_REPLIES } from "@/lib/agent/confirm";
import { Brain, Check, CheckCircle2, ChevronRight, FileText, Pencil, ShieldAlert, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ASSET_LABEL } from "@/lib/agent/asset-types";
import type { BrandCheckItem, Plan, Questions } from "@/lib/agent/types";
import { formatBytes, getJSON, sendJSON, usdShort } from "@/lib/client/api";
import type { MessageRow } from "@/lib/client/types";
import type { Memory } from "@/lib/memory/store";

/** One renderer per agent message kind. Cards that ask for input call `onReply` with chat text. */
export function MessageCard({ m, me = "", onReply, onOpenAsset, live, estimate }: {
  m: MessageRow;
  /** This person's display name; messages from anyone else in a shared chat are labelled. */
  me?: string;
  onReply: (text: string) => void;
  onOpenAsset: (id: string, tab?: "changes") => void;
  live: boolean;
  estimate: { usd: number; minutes: number } | null;
}) {
  const c = m.content as Record<string, unknown>;
  if (m.role === "user") {
    const author = typeof c.author === "string" ? c.author : "";
    return <UserMessage text={String(c.text ?? "")} author={author && author !== me.trim() ? author : ""} attachments={(c.attachments as { id: string; name: string; size: number }[] | undefined) ?? []} />;
  }
  switch (m.kind) {
    case "brand_check":
      return <BrandCheckCard items={c.items as BrandCheckItem[]} />;
    case "questions":
      return <QuestionsCard q={c as unknown as Questions & { memoriesUsed?: number }} onReply={onReply} live={live} />;
    case "plan":
      return <PlanCard plan={c.plan as Plan} onReply={onReply} live={live} estimate={estimate} />;
    case "assets":
      return <AssetsCard c={c as { count: number; guard: { pass: number; warn: number; block: number }; failed: string[]; assetIds: string[] }} onOpenAsset={onOpenAsset} />;
    case "edit":
      return <EditCard results={c.results as { assetId: string; title: string; summary: string; version: number; guard: string | null }[]} onOpenAsset={onOpenAsset} />;
    case "confirm":
      return <ConfirmCard c={c as { question: string; conflicts: { rule: string; source_doc: string | null; affects: string[] }[] }} live={live} onReply={onReply} />;
    case "memory":
      return <MemoryCard ids={c.proposedIds as string[]} />;
    default:
      return <AgentText>{String(c.text ?? "")}</AgentText>;
  }
}

function UserMessage({ text, author, attachments }: { text: string; author: string; attachments: { id: string; name: string; size: number }[] }) {
  const [open, setOpen] = useState(false);
  const isBrief = text.length > 600;
  const firstLine = text.split("\n").find((l) => l.trim())?.replace(/^[#*\s]+/, "").replace(/\*\*/g, "") ?? "";
  return (
    <div className="flex flex-col items-end gap-2">
      {author && (
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <Avatar name={author} size={18} /> {author}
        </span>
      )}
      {attachments.length > 0 && (
        <ul className="flex flex-wrap justify-end gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
              <FileText size={15} className="text-muted" />
              <span className="max-w-[220px] truncate font-medium">{a.name}</span>
              <span className="text-[12px] text-muted">{formatBytes(a.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {text && (
        <div className="max-w-[85%] rounded-2xl bg-bubble px-4 py-2.5 text-[15px] leading-6 text-ink">
          {isBrief ? (
            <div>
              <div className="text-[12px] font-medium text-muted">Brief · {text.split(/\s+/).length} words</div>
              <div className="font-medium">{firstLine}</div>
              {open && <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink/85">{text}</div>}
              <button onClick={() => setOpen(!open)} className="mt-1 text-[13px] text-muted underline underline-offset-2 hover:text-ink">
                {open ? "Hide brief" : "Show full brief"}
              </button>
            </div>
          ) : (
            <span className="whitespace-pre-wrap">{text}</span>
          )}
        </div>
      )}
    </div>
  );
}

function AgentText({ children }: { children: React.ReactNode }) {
  return <div className="whitespace-pre-wrap font-serif text-[16.5px] leading-7 text-ink">{children}</div>;
}

/** Card frame: one level only. Content inside is rows and dividers, never nested cards. */
function Card({ icon, title, children, tone = "default" }: { icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode; tone?: "default" | "warn" }) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-surface ${tone === "warn" ? "border-warn/35" : "border-line"}`}>
      <header className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold ${tone === "warn" ? "bg-warn-soft" : ""}`}>
        {icon}
        <span>{title}</span>
      </header>
      <div className="border-t border-line px-4 py-3.5 text-[14px]">{children}</div>
    </section>
  );
}

const inlineMd = (text: string) => <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{text}</ReactMarkdown>;

/** Verdict first; each flagged item expands to the rule, the quoted source and the alternative. */
function BrandCheckCard({ items }: { items: BrandCheckItem[] }) {
  const flagged = items.filter((i) => i.verdict !== "ok");
  const ok = items.filter((i) => i.verdict === "ok");
  const [open, setOpen] = useState<number | null>(flagged.length === 1 ? 0 : null);
  return (
    <Card
      tone={flagged.length ? "warn" : "default"}
      icon={flagged.length ? <ShieldAlert size={17} className="text-warn" /> : <ShieldCheck size={17} className="text-ok" />}
      title={flagged.length ? `${flagged.length} thing${flagged.length > 1 ? "s" : ""} in the brief I won't do as written` : "Everything the brief asks for is allowed"}
    >
      {flagged.length > 0 && (
        <ul className="-mx-4 -my-1 divide-y divide-line">
          {flagged.map((i, k) => (
            <li key={k}>
              <button onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-ink/[0.03]">
                <ChevronRight size={16} className={`mt-0.5 shrink-0 text-muted transition-transform ${open === k ? "rotate-90" : ""}`} />
                <span className="min-w-0">
                  <span className="block font-medium">{inlineMd(i.requested)}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{i.alternative ? `Instead: ${i.alternative}` : i.rule}</span>
                </span>
              </button>
              {open === k && (
                <div className="space-y-2 px-4 pb-3.5 pl-10 text-[13.5px]">
                  <p className="leading-relaxed">{inlineMd(i.rule)}</p>
                  {i.source_quote && (
                    <figure className="rounded-lg bg-panel px-3 py-2.5">
                      <blockquote className="font-serif text-[14px] italic leading-relaxed text-ink/85">“{inlineMd(i.source_quote)}”</blockquote>
                      <figcaption className="mt-1.5 font-mono text-[12px] text-muted">{i.source_doc}</figcaption>
                    </figure>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {ok.length > 0 && (
        <details className={`text-[13px] text-muted ${flagged.length ? "mt-3 border-t border-line pt-3" : ""}`}>
          <summary className="cursor-pointer select-none">
            <Check size={14} className="mr-1 inline text-ok" />
            {ok.length} requested item{ok.length > 1 ? "s" : ""} checked and allowed
          </summary>
          <ul className="mt-2 space-y-1 pl-5">{ok.map((i, k) => <li key={k} className="list-disc">{inlineMd(i.requested)}</li>)}</ul>
        </details>
      )}
    </Card>
  );
}

function QuestionsCard({ q, onReply, live }: { q: Questions & { memoriesUsed?: number }; onReply: (t: string) => void; live: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const done = q.questions.length > 0 && q.questions.every((x) => answers[x.id]);
  const n = q.questions.length;
  return (
    <Card icon={<Sparkles size={17} className="text-accent" />} title={n ? `Before I plan: ${n} question${n > 1 ? "s" : ""}` : "I have what I need. Here is what I assumed"}>
      {q.memoriesUsed ? (
        <div className="mb-3 flex items-center gap-1.5 text-[13px] text-accent-ink">
          <Brain size={14} /> Using {q.memoriesUsed} thing{q.memoriesUsed > 1 ? "s" : ""} you told me in earlier campaigns
        </div>
      ) : null}
      <div className="space-y-5">
        {q.questions.map((x) => (
          <fieldset key={x.id}>
            <legend className="font-medium">{x.question}</legend>
            <p className="mt-0.5 text-[13px] text-muted">{x.why}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {x.options.map((o) => (
                <button
                  key={o}
                  disabled={!live}
                  aria-pressed={answers[x.id] === o}
                  onClick={() => setAnswers({ ...answers, [x.id]: o })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:cursor-default ${answers[x.id] === o ? "border-ink bg-ink text-on-ink" : "border-line bg-surface hover:border-line-strong"}`}
                >
                  {answers[x.id] === o && <Check size={13} className="-ml-0.5 mr-1 inline" />}
                  {o}
                  {o === x.default && <span className={`ml-1.5 text-[12px] ${answers[x.id] === o ? "text-on-ink/75" : "text-muted"}`}>suggested</span>}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {q.assumptions.length > 0 && (
        <details className="mt-4 text-[13px] text-muted" open={!n}>
          <summary className="cursor-pointer select-none font-medium">What I assumed ({q.assumptions.length})</summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">{q.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
      {live && n > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={!done} onClick={() => onReply(q.questions.map((x) => `${x.question.replace(/\?$/, "")}: ${answers[x.id]}`).join("\n"))} className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-on-ink disabled:opacity-40">
            Send answers
          </button>
          <button onClick={() => onReply("Go with your suggested answers.")} className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold hover:border-line-strong">Use suggested answers</button>
        </div>
      )}
    </Card>
  );
}

function PlanCard({ plan, onReply, live, estimate }: { plan: Plan; onReply: (t: string) => void; live: boolean; estimate: { usd: number; minutes: number } | null }) {
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setDrop((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  return (
    <Card icon={<Pencil size={17} className="text-accent" />} title={`Proposed plan · ${plan.items.length} asset${plan.items.length === 1 ? "" : "s"}`}>
      <p className="leading-relaxed">{plan.summary}</p>
      <details className="mt-2 text-[13px] text-muted">
        <summary className="cursor-pointer select-none font-medium">Why this mix</summary>
        <p className="mt-1 leading-relaxed">{plan.mix_rationale}</p>
      </details>
      <ol className="-mx-4 mt-3 divide-y divide-line border-y border-line">
        {plan.items.map((i, n) => (
          <li key={i.id} className={`flex gap-3 px-4 py-3 ${drop.has(i.id) ? "opacity-45" : ""}`}>
            <span className="tabular w-5 shrink-0 pt-0.5 text-[13px] text-muted">{n + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[12px] font-medium text-accent-ink">{ASSET_LABEL[i.type]}</span>
                <span className={`font-medium ${drop.has(i.id) ? "line-through" : ""}`}>{i.title}</span>
              </div>
              <div className="mt-0.5 text-[13px] text-muted">{[i.audience, i.publish_date, i.sender_or_byline].filter(Boolean).join(" · ")}</div>
              <div className="mt-1 text-[13.5px] leading-relaxed">{i.angle}</div>
              {i.research_question && <div className="mt-1 text-[12.5px] text-accent-ink">Will research: {i.research_question}</div>}
            </div>
            {live && (
              <button onClick={() => toggle(i.id)} aria-pressed={drop.has(i.id)} aria-label={drop.has(i.id) ? `Keep ${i.title}` : `Remove ${i.title} from the plan`} title={drop.has(i.id) ? "Keep" : "Remove from plan"} className="h-7 shrink-0 rounded-md p-1 text-muted hover:bg-ink/5 hover:text-ink">
                <X size={15} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {live && (
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          {drop.size > 0 ? (
            <button onClick={() => onReply(`Remove these from the plan: ${plan.items.filter((i) => drop.has(i.id)).map((i) => i.title).join("; ")}`)} className="rounded-lg bg-ink px-4 py-2 text-[14px] font-semibold text-on-ink">
              Update plan ({drop.size} removed)
            </button>
          ) : (
            <button onClick={() => onReply("Looks good. Write it.")} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent hover:brightness-95">
              <CheckCircle2 size={16} /> Approve and write {plan.items.length} asset{plan.items.length === 1 ? "" : "s"}
            </button>
          )}
          {estimate && drop.size === 0 && (
            <span className="tabular text-[13px] text-muted">
              About {usdShort(estimate.usd)} and ~{estimate.minutes} min. You can stop at any time.
            </span>
          )}
          {drop.size === 0 && !estimate && <span className="text-[13px] text-muted">or describe changes in the chat</span>}
        </div>
      )}
    </Card>
  );
}

function AssetsCard({ c, onOpenAsset }: { c: { count: number; guard: { pass: number; warn: number; block: number }; failed: string[]; assetIds: string[] }; onOpenAsset: (id: string, tab?: "changes") => void }) {
  return (
    <Card icon={<CheckCircle2 size={17} className="text-ok" />} title={`${c.count} asset${c.count > 1 ? "s" : ""} written`}>
      <div className="flex flex-wrap gap-2 text-[13px]">
        <span className="rounded-full bg-ok-soft px-2.5 py-1 text-ok">{c.guard.pass} passed the brand check</span>
        {c.guard.warn > 0 && <span className="rounded-full bg-warn-soft px-2.5 py-1 text-warn">{c.guard.warn} with notes to review</span>}
        {c.guard.block > 0 && <span className="rounded-full bg-bad-soft px-2.5 py-1 text-bad">{c.guard.block} need a fix before publishing</span>}
      </div>
      {c.failed.length > 0 && <div className="mt-2 text-[13px] text-bad">{c.failed.join("; ")}</div>}
      <div className="mt-3 text-[13px] text-muted">
        They are open on the right. Ask for changes in plain words, like “shorten the second LinkedIn post”.{" "}
        {c.assetIds[0] && <button className="font-medium text-ink underline underline-offset-2" onClick={() => onOpenAsset(c.assetIds[0])}>Show the first</button>}
      </div>
    </Card>
  );
}

const CHECK_WORDS: Record<string, string> = { pass: "passes the brand check", warn: "has notes to review", block: "needs a fix" };

function EditCard({ results, onOpenAsset }: { results: { assetId: string; title: string; summary: string; version: number; guard: string | null }[]; onOpenAsset: (id: string, tab?: "changes") => void }) {
  return (
    <Card icon={<Pencil size={17} className="text-accent" />} title={`Edited ${results.length} asset${results.length > 1 ? "s" : ""}. Nothing else changed`}>
      <ul className="space-y-2.5">
        {results.map((r) => (
          <li key={r.assetId}>
            <button onClick={() => onOpenAsset(r.assetId)} className="text-left font-medium underline-offset-2 hover:underline">{r.title}</button>
            <span className="ml-2 text-[13px] text-muted">version {r.version}{r.guard ? `, ${CHECK_WORDS[r.guard] ?? r.guard}` : ""}</span>
            <div className="text-[13.5px] leading-relaxed">{r.summary}</div>
            {r.version > 1 && (
              <button onClick={() => onOpenAsset(r.assetId, "changes")} className="mt-1 text-[13px] font-medium text-accent-ink underline underline-offset-2">
                View changes
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** "This goes against the brand. Do it anyway?" Shown before an edit that conflicts with the rules. */
function ConfirmCard({ c, live, onReply }: { c: { question: string; conflicts: { rule: string; source_doc: string | null; affects: string[] }[] }; live: boolean; onReply: (text: string) => void }) {
  return (
    <Card icon={<ShieldAlert size={17} className="text-warn" />} title="Before I change this: it goes against the brand">
      <div className="space-y-4">
        <p className="text-[14.5px] leading-relaxed">{c.question}</p>
        {c.conflicts.length > 0 && (
          <ul className="space-y-2">
            {c.conflicts.map((x, i) => (
              <li key={i} className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13.5px]">
                <span className="font-medium">{x.rule}</span>
                {x.source_doc && <span className="text-muted"> · {x.source_doc}</span>}
                {x.affects.length > 0 && <div className="mt-0.5 text-[12.5px] text-muted">Affects: {x.affects.join(", ")}</div>}
              </li>
            ))}
          </ul>
        )}
        {live ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onReply(CONFIRM_REPLIES.yes)} className="rounded-lg bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-on-ink">{CONFIRM_REPLIES.yes}</button>
            <button onClick={() => onReply(CONFIRM_REPLIES.partial)} className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[13.5px] hover:border-line-strong">{CONFIRM_REPLIES.partial}</button>
            <button onClick={() => onReply(CONFIRM_REPLIES.no)} className="rounded-lg px-3.5 py-2 text-[13.5px] text-muted hover:bg-ink/5 hover:text-ink">{CONFIRM_REPLIES.no}</button>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">Answered.</p>
        )}
        <p className="text-[12.5px] text-muted">&ldquo;Do it anyway&rdquo; overrides voice and style rules for these assets only. Legal rules and forbidden claims still apply.</p>
      </div>
    </Card>
  );
}

function MemoryCard({ ids }: { ids: string[] }) {
  const [mems, setMems] = useState<Memory[]>([]);
  const key = ids.join();
  useEffect(() => {
    if (!key) return;
    getJSON<Memory[]>("/api/memories").then((all) => setMems(all.filter((m) => key.split(",").includes(m.id))));
  }, [key]);
  const set = async (id: string, status: "active" | "archived") => {
    await sendJSON(`/api/memories/${id}`, "PATCH", { status });
    setMems((cur) => cur.map((m) => (m.id === id ? { ...m, status } : m)));
  };
  if (!ids.length) return <AgentText>Nothing from this campaign seems worth remembering beyond what the brand documents already say.</AgentText>;
  return (
    <Card icon={<Brain size={17} className="text-accent" />} title="Remember these for next time?">
      <ul className="space-y-3">
        {mems.map((m) => (
          <li key={m.id} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className={m.status === "archived" ? "text-muted line-through" : ""}>{m.text}</div>
              {m.evidence && <div className="mt-0.5 text-[13px] text-muted">Because you said: “{m.evidence}”</div>}
            </div>
            {m.status === "proposed" ? (
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => set(m.id, "active")} className="rounded-md bg-ink px-2.5 py-1 text-[13px] text-on-ink">Keep</button>
                <button onClick={() => set(m.id, "archived")} className="rounded-md border border-line px-2.5 py-1 text-[13px]">Forget</button>
              </div>
            ) : (
              <span className="shrink-0 text-[13px] text-muted">{m.status === "active" ? "Kept" : "Forgotten"}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A person's initial in a circle. The tint comes from the name, so each person keeps one color. */
export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#1a1918]"
      style={{ width: size, height: size, fontSize: size * 0.48, background: `oklch(0.86 0.08 ${hue})` }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
