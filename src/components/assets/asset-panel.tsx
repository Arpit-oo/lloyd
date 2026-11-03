"use client";

import { AlertTriangle, CheckCircle2, FileText, Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ASSET_LABEL, type AssetContent } from "@/lib/agent/asset-types";
import type { GuardReport } from "@/lib/agent/steps/guard";
import type { ResearchFinding } from "@/lib/agent/steps/research";
import { getJSON, sendJSON, usd } from "@/lib/client/api";
import type { CallSummary, CampaignView } from "@/lib/client/types";
import type { DesignTokens } from "@/lib/brand/design-tokens";
import { CallView } from "../inspector/call-view";
import { BrandTheme, brandVars, type BrandVars } from "./brand-theme";
import { EmailView } from "./renderers/email";
import { LinkedInPost, XPost } from "./renderers/social";
import { BlogView, LandingView } from "./renderers/web";

type Asset = CampaignView["assets"][number];
type Tab = "preview" | "checks" | "sources" | "prompt";

export function AssetPanel({ assets, tokens, selected, onSelect, onChanged }: {
  assets: Asset[];
  tokens: DesignTokens | null | undefined;
  selected: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const vars = brandVars(tokens);
  const asset = assets.find((a) => a.id === selected) ?? assets[0];

  if (!assets.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
        <FileText size={36} strokeWidth={1.4} />
        <div className="max-w-xs text-sm">Assets appear here once you approve a plan. Each one renders the way it will look when published.</div>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-white px-3 pt-2">
        {assets.map((a, i) => {
          const guard = a.current?.guard as GuardReport | null;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`flex shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-xs ${a.id === asset?.id ? "border-line bg-[#f5f5f4] font-semibold" : "border-transparent text-muted hover:text-ink"}`}
            >
              <StatusDot status={a.status} guard={guard?.status} />
              <span className="text-muted">{i + 1}.</span>
              <span className="max-w-44 truncate">{a.title}</span>
            </button>
          );
        })}
      </div>
      {asset && <AssetDetail key={asset.id} asset={asset} vars={vars} onChanged={onChanged} />}
    </div>
  );
}

function AssetDetail({ asset, vars, onChanged }: { asset: Asset; vars: BrandVars; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("preview");
  const [detail, setDetail] = useState<{ versions: { version: number; instruction: string | null; created_at: string }[]; calls: CallSummary[] } | null>(null);
  const current = asset.current;
  const guard = current?.guard as GuardReport | null;

  useEffect(() => {
    getJSON<typeof detail>(`/api/assets/${asset.id}`).then(setDetail);
  }, [asset.id, asset.current_version]);

  const pickVersion = async (v: number) => {
    await sendJSON(`/api/assets/${asset.id}`, "PATCH", { version: v });
    onChanged();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-[#f5f5f4] px-4 py-2">
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-line">{ASSET_LABEL[asset.type]}</span>
        <GuardBadge guard={guard} status={asset.status} onClick={() => setTab("checks")} />
        {detail && detail.versions.length > 1 && (
          <select value={asset.current_version} onChange={(e) => pickVersion(Number(e.target.value))} className="rounded-md border border-line bg-white px-2 py-1 text-xs">
            {detail.versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} {v.instruction ? `· ${v.instruction.slice(0, 50)}` : "· first draft"}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex gap-1 rounded-lg bg-white p-0.5 ring-1 ring-line">
          {(["preview", "checks", "sources", "prompt"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-xs capitalize ${tab === t ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!current ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            {asset.status === "error" ? <><AlertTriangle size={16} /> Writing failed. Ask the agent to try again.</> : <><Loader2 className="animate-spin" size={16} /> Writing…</>}
          </div>
        ) : tab === "preview" ? (
          <BrandTheme vars={vars}>
            <Preview content={current.content} vars={vars} />
          </BrandTheme>
        ) : tab === "checks" ? (
          <Checks guard={guard} />
        ) : tab === "sources" ? (
          <Sources sources={current.sources as Sources | null} />
        ) : (
          <PromptTab calls={detail?.calls ?? []} />
        )}
      </div>
    </div>
  );
}

function Preview({ content, vars }: { content: AssetContent; vars: BrandVars }) {
  switch (content.type) {
    case "linkedin_post":
      return <LinkedInPost data={content.data} vars={vars} />;
    case "x_post":
      return <XPost data={content.data} vars={vars} />;
    case "email":
      return <EmailView data={content.data} vars={vars} />;
    case "blog_post":
      return <BlogView data={content.data} vars={vars} />;
    case "landing_page":
      return <LandingView data={content.data} vars={vars} />;
  }
}

function Checks({ guard }: { guard: GuardReport | null }) {
  if (!guard) return <div className="text-sm text-muted">Not checked yet.</div>;
  if (!guard.issues.length)
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <CheckCircle2 size={18} /> No issues: claims, names, proof, images and brief constraints all check out.
      </div>
    );
  return (
    <div className="space-y-3">
      {guard.issues.map((i, k) => (
        <div key={k} className={`rounded-lg p-4 text-sm ring-1 ${i.severity === "block" ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200"}`}>
          <div className="flex items-center gap-2 font-semibold">
            {i.severity === "block" ? <ShieldAlert size={16} className="text-rose-700" /> : <AlertTriangle size={16} className="text-amber-700" />}
            {i.problem}
            <span className="ml-auto text-[10px] font-normal uppercase tracking-wide text-muted">{i.check === "rule" ? "rule check" : "model check"}</span>
          </div>
          <blockquote className="mt-2 border-l-2 border-black/20 pl-3 italic text-ink/80">“{i.quote}”</blockquote>
          <div className="mt-2 text-xs text-muted">Rule: {i.rule}{i.source_doc ? ` (${i.source_doc})` : ""}</div>
          <div className="mt-1 text-xs"><span className="font-semibold">Fix:</span> {i.fix}</div>
        </div>
      ))}
    </div>
  );
}

interface Sources {
  docs: string[];
  research: ResearchFinding[];
  researchRejected: string[];
  imageCandidates: string[];
}

function Sources({ sources }: { sources: Sources | null }) {
  if (!sources) return <div className="text-sm text-muted">No sources recorded.</div>;
  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Brand documents used ({sources.docs.length})</h3>
        <ul className="grid gap-1 md:grid-cols-2">
          {sources.docs.map((d) => <li key={d} className="truncate rounded bg-white px-2 py-1 font-mono text-xs ring-1 ring-line">{d}</li>)}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Web research</h3>
        {sources.research.length ? (
          <ul className="space-y-2">
            {sources.research.map((r, i) => (
              <li key={i} className="rounded bg-white p-3 ring-1 ring-line">
                <div>{r.claim}</div>
                <div className="mt-1 text-xs text-muted">{r.publisher} · {r.published ?? "undated"} · <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.url}</a> · <span className="text-emerald-700">figure found on page</span></div>
              </li>
            ))}
          </ul>
        ) : <div className="text-muted">None used.</div>}
        {sources.researchRejected.length > 0 && (
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">Rejected findings ({sources.researchRejected.length})</summary>
            <ul className="mt-1 list-disc pl-5">{sources.researchRejected.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </details>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Image shortlist (after usage-rule filters)</h3>
        <div className="flex flex-wrap gap-2">
          {sources.imageCandidates.map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={id} src={`/api/images/${id}`} alt={id} title={id} className="h-16 w-24 rounded object-cover ring-1 ring-line" />
          ))}
        </div>
      </section>
    </div>
  );
}

function PromptTab({ calls }: { calls: CallSummary[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const writeCall = calls.find((c) => c.step.startsWith("write:") && !c.step.endsWith("prewarm"));
  const shown = open ?? writeCall?.id ?? null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {calls.map((c) => (
          <button key={c.id} onClick={() => setOpen(c.id)} className={`rounded-md px-2.5 py-1 text-xs ring-1 ${c.id === shown ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:ring-ink"}`}>
            {c.step} · {usd(c.cost_usd)}
          </button>
        ))}
      </div>
      {shown ? <CallView id={shown} /> : <div className="text-sm text-muted">No calls yet.</div>}
    </div>
  );
}

function StatusDot({ status, guard }: { status: string; guard?: string }) {
  const color = status === "writing" ? "bg-sky-400 animate-pulse" : status === "error" ? "bg-rose-500" : guard === "block" ? "bg-rose-500" : guard === "warn" ? "bg-amber-400" : guard === "pass" ? "bg-emerald-500" : "bg-stone-300";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function GuardBadge({ guard, status, onClick }: { guard: GuardReport | null; status: string; onClick: () => void }) {
  if (status === "writing") return <span className="flex items-center gap-1 text-xs text-muted"><Loader2 size={13} className="animate-spin" /> writing</span>;
  if (!guard) return <span className="text-xs text-muted">checking…</span>;
  const map = {
    pass: ["bg-emerald-50 text-emerald-800 ring-emerald-200", "Brand check passed"],
    warn: ["bg-amber-50 text-amber-800 ring-amber-200", `${guard.issues.length} warning${guard.issues.length > 1 ? "s" : ""}`],
    block: ["bg-rose-50 text-rose-800 ring-rose-200", `${guard.issues.filter((i) => i.severity === "block").length} blocking issue(s)`],
  } as const;
  const [cls, text] = map[guard.status];
  return <button onClick={onClick} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${cls}`}>{text}</button>;
}
