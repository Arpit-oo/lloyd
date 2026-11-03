"use client";

import { Brain, Check, CheckCircle2, Pencil, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ASSET_LABEL } from "@/lib/agent/asset-types";
import type { BrandCheckItem, Plan, Questions } from "@/lib/agent/types";
import { getJSON, sendJSON } from "@/lib/client/api";
import type { MessageRow } from "@/lib/client/types";
import type { Memory } from "@/lib/memory/store";

/** One renderer per agent message kind. Cards that ask for input call `onReply` with chat text. */
export function MessageCard({ m, onReply, onOpenAsset, live }: { m: MessageRow; onReply: (text: string) => void; onOpenAsset: (id: string) => void; live: boolean }) {
  const c = m.content as Record<string, unknown>;
  if (m.role === "user") {
    const text = String(c.text ?? "");
    const isBrief = text.length > 600;
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-white">
          {isBrief ? <BriefPreview text={text} /> : <span className="whitespace-pre-wrap">{text}</span>}
        </div>
      </div>
    );
  }
  switch (m.kind) {
    case "brand_check":
      return <BrandCheckCard items={c.items as BrandCheckItem[]} />;
    case "questions":
      return <QuestionsCard q={c as unknown as Questions & { memoriesUsed?: number }} onReply={onReply} live={live} />;
    case "plan":
      return <PlanCard plan={c.plan as Plan} onReply={onReply} live={live} />;
    case "assets":
      return <AssetsCard c={c as { count: number; guard: { pass: number; warn: number; block: number }; failed: string[]; assetIds: string[] }} onOpenAsset={onOpenAsset} />;
    case "edit":
      return <EditCard results={c.results as { assetId: string; title: string; summary: string; version: number; guard: string | null }[]} onOpenAsset={onOpenAsset} />;
    case "memory":
      return <MemoryCard ids={c.proposedIds as string[]} />;
    default:
      return <AgentBubble>{String(c.text ?? "")}</AgentBubble>;
  }
}

function AgentBubble({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm ring-1 ring-line">{children}</div>;
}

function Card({ icon, title, children, tone = "default" }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "default" | "warn" }) {
  return (
    <div className={`overflow-hidden rounded-xl bg-white ring-1 ${tone === "warn" ? "ring-amber-300" : "ring-line"}`}>
      <div className={`flex items-center gap-2 border-b px-4 py-2.5 text-[13px] font-semibold ${tone === "warn" ? "border-amber-200 bg-amber-50" : "border-line bg-panel"}`}>
        {icon}
        {title}
      </div>
      <div className="p-4 text-sm">{children}</div>
    </div>
  );
}

function BriefPreview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const firstLine = text.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? "Brief";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-white/60">Brief</div>
      <div className="font-semibold">{firstLine}</div>
      {open && <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs text-white/80">{text}</div>}
      <button onClick={() => setOpen(!open)} className="mt-1 text-xs text-white/60 underline">{open ? "Hide" : `Show full brief (${text.split(/\s+/).length} words)`}</button>
    </div>
  );
}

function BrandCheckCard({ items }: { items: BrandCheckItem[] }) {
  const flagged = items.filter((i) => i.verdict !== "ok");
  return (
    <Card
      tone={flagged.length ? "warn" : "default"}
      icon={flagged.length ? <ShieldAlert size={16} className="text-amber-700" /> : <ShieldCheck size={16} className="text-emerald-700" />}
      title={flagged.length ? `Brand check: ${flagged.length} thing${flagged.length > 1 ? "s" : ""} in the brief I won't do as written` : "Brand check: the brief's claims are all allowed"}
    >
      <div className="space-y-3">
        {[...flagged, ...items.filter((i) => i.verdict === "ok")].map((i, k) => (
          <div key={k} className={i.verdict === "ok" ? "text-muted" : ""}>
            <div className="flex items-start gap-2">
              {i.verdict === "ok" ? <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-600" />}
              <div className="min-w-0">
                <div className="font-medium text-ink">{i.requested}</div>
                {i.verdict !== "ok" && (
                  <>
                    <div className="mt-1 text-xs">{i.rule}</div>
                    {i.source_quote && <blockquote className="mt-1.5 border-l-2 border-amber-300 pl-2 text-xs italic text-ink/70">“{i.source_quote}” <span className="not-italic text-muted">· {i.source_doc}</span></blockquote>}
                    {i.alternative && <div className="mt-1.5 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900"><span className="font-semibold">Instead:</span> {i.alternative}</div>}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QuestionsCard({ q, onReply, live }: { q: Questions & { memoriesUsed?: number }; onReply: (t: string) => void; live: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const done = q.questions.length > 0 && q.questions.every((x) => answers[x.id]);
  return (
    <Card icon={<Sparkles size={16} className="text-accent" />} title={q.questions.length ? `Before I plan: ${q.questions.length} question${q.questions.length > 1 ? "s" : ""}` : "No questions needed. Here is what I assumed"}>
      {q.memoriesUsed ? <div className="mb-3 flex items-center gap-1.5 text-xs text-accent"><Brain size={13} /> Using {q.memoriesUsed} thing{q.memoriesUsed > 1 ? "s" : ""} I remember from earlier campaigns</div> : null}
      <div className="space-y-4">
        {q.questions.map((x) => (
          <div key={x.id}>
            <div className="font-medium">{x.question}</div>
            <div className="mt-0.5 text-xs text-muted">{x.why}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {x.options.map((o) => (
                <button
                  key={o}
                  disabled={!live}
                  onClick={() => setAnswers({ ...answers, [x.id]: o })}
                  className={`rounded-full px-3 py-1 text-xs ring-1 ${answers[x.id] === o ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:ring-ink"} ${o === x.default ? "font-semibold" : ""}`}
                >
                  {o}{o === x.default ? " · default" : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {q.assumptions.length > 0 && (
        <details className="mt-4 text-xs text-muted" open={!q.questions.length}>
          <summary className="cursor-pointer font-semibold">Assumptions ({q.assumptions.length})</summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">{q.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
      {live && q.questions.length > 0 && (
        <div className="mt-4 flex gap-2">
          <button disabled={!done} onClick={() => onReply(q.questions.map((x) => `${x.question} ${answers[x.id]}`).join("\n"))} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            Send answers
          </button>
          <button onClick={() => onReply("Go with your defaults.")} className="rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:ring-ink">Use defaults</button>
        </div>
      )}
    </Card>
  );
}

function PlanCard({ plan, onReply, live }: { plan: Plan; onReply: (t: string) => void; live: boolean }) {
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setDrop((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  return (
    <Card icon={<Pencil size={16} className="text-accent" />} title={`Proposed plan · ${plan.items.length} assets`}>
      <p className="leading-relaxed">{plan.summary}</p>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer font-semibold">Why this mix</summary>
        <p className="mt-1 leading-relaxed">{plan.mix_rationale}</p>
      </details>
      <ol className="mt-3 divide-y divide-line rounded-lg ring-1 ring-line">
        {plan.items.map((i, n) => (
          <li key={i.id} className={`flex gap-3 px-3 py-2.5 ${drop.has(i.id) ? "opacity-40 line-through" : ""}`}>
            <span className="w-5 shrink-0 pt-0.5 text-xs text-muted">{n + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{ASSET_LABEL[i.type]}</span>
                <span className="font-medium">{i.title}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted">{i.audience}{i.publish_date ? ` · ${i.publish_date}` : ""}{i.sender_or_byline ? ` · ${i.sender_or_byline}` : ""}</div>
              <div className="mt-1 text-xs leading-relaxed">{i.angle}</div>
              {i.research_question && <div className="mt-1 text-[11px] text-sky-700">Web research: {i.research_question}</div>}
            </div>
            {live && (
              <button onClick={() => toggle(i.id)} title={drop.has(i.id) ? "Keep" : "Drop"} className="h-6 shrink-0 rounded p-1 text-muted hover:bg-panel hover:text-ink">
                <X size={14} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {live && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {drop.size > 0 ? (
            <button onClick={() => onReply(`Drop these from the plan: ${plan.items.filter((i) => drop.has(i.id)).map((i) => i.title).join("; ")}`)} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
              Update plan ({drop.size} dropped)
            </button>
          ) : (
            <button onClick={() => onReply("Looks good. Write it.")} className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
              <CheckCircle2 size={14} /> Approve and write
            </button>
          )}
          <span className="text-xs text-muted">or describe changes in the chat</span>
        </div>
      )}
    </Card>
  );
}

function AssetsCard({ c, onOpenAsset }: { c: { count: number; guard: { pass: number; warn: number; block: number }; failed: string[]; assetIds: string[] }; onOpenAsset: (id: string) => void }) {
  return (
    <Card icon={<CheckCircle2 size={16} className="text-emerald-600" />} title={`${c.count} asset${c.count > 1 ? "s" : ""} written`}>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800 ring-1 ring-emerald-200">{c.guard.pass} passed brand check</span>
        {c.guard.warn > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 ring-1 ring-amber-200">{c.guard.warn} with warnings</span>}
        {c.guard.block > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-800 ring-1 ring-rose-200">{c.guard.block} need attention</span>}
      </div>
      {c.failed.length > 0 && <div className="mt-2 text-xs text-rose-700">{c.failed.join("; ")}</div>}
      <div className="mt-3 text-xs text-muted">
        Open one on the right, or ask for changes, e.g. “shorten the second LinkedIn post”.{" "}
        {c.assetIds[0] && <button className="underline" onClick={() => onOpenAsset(c.assetIds[0])}>Open the first</button>}
      </div>
    </Card>
  );
}

function EditCard({ results, onOpenAsset }: { results: { assetId: string; title: string; summary: string; version: number; guard: string | null }[]; onOpenAsset: (id: string) => void }) {
  return (
    <Card icon={<Pencil size={16} className="text-accent" />} title={`Edited ${results.length} asset${results.length > 1 ? "s" : ""}. Nothing else changed.`}>
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.assetId}>
            <button onClick={() => onOpenAsset(r.assetId)} className="font-medium underline-offset-2 hover:underline">{r.title}</button>
            <span className="ml-2 text-xs text-muted">v{r.version} · check {r.guard ?? "–"}</span>
            <div className="text-xs leading-relaxed">{r.summary}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MemoryCard({ ids }: { ids: string[] }) {
  const [mems, setMems] = useState<Memory[]>([]);
  const load = () => getJSON<Memory[]>("/api/memories").then((all) => setMems(all.filter((m) => ids.includes(m.id))));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join()]);
  const set = async (id: string, status: "active" | "archived") => {
    await sendJSON(`/api/memories/${id}`, "PATCH", { status });
    load();
  };
  if (!ids.length) return <AgentBubble>Nothing from this campaign seems worth remembering beyond what the brand documents already say.</AgentBubble>;
  return (
    <Card icon={<Brain size={16} className="text-accent" />} title="Remember these for next time?">
      <ul className="space-y-2.5">
        {mems.map((m) => (
          <li key={m.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className={m.status === "archived" ? "text-muted line-through" : ""}>{m.text}</div>
              {m.evidence && <div className="mt-0.5 text-xs text-muted">Because: “{m.evidence}”</div>}
            </div>
            {m.status === "proposed" ? (
              <div className="flex shrink-0 gap-1">
                <button onClick={() => set(m.id, "active")} className="rounded-md bg-ink px-2 py-1 text-xs text-white">Keep</button>
                <button onClick={() => set(m.id, "archived")} className="rounded-md px-2 py-1 text-xs ring-1 ring-line">Forget</button>
              </div>
            ) : (
              <span className="shrink-0 text-xs text-muted">{m.status === "active" ? "kept" : "forgotten"}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
