"use client";

import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, Download, FileText, Loader2, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ASSET_LABEL, assetToText, type AssetContent } from "@/lib/agent/asset-types";
import { diffWords } from "@/lib/text/diff";
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
type Tab = "preview" | "changes" | "checks" | "sources" | "prompt";

export function AssetPanel({ assets, drafts = {}, tokens, selected, onSelect, onChanged, onClose, closeLabel = "Close assets" }: {
  assets: Asset[];
  /** Live text of assets still being written, keyed by asset id. */
  drafts?: Record<string, string>;
  tokens: DesignTokens | null | undefined;
  selected: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onClose?: () => void;
  closeLabel?: string;
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
      <div className="flex shrink-0 items-end gap-1 border-b border-line bg-surface pl-2 pr-2 pt-2">
        {onClose && (
          <button onClick={onClose} aria-label={closeLabel} title={closeLabel} className="mb-1.5 flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-[13px] text-muted hover:bg-ink/5 hover:text-ink">
            {closeLabel === "Back to chat" ? <><ArrowLeft size={17} /> Chat</> : <X size={17} />}
          </button>
        )}
        <div role="tablist" aria-label="Assets" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {assets.map((a, i) => {
            const guard = a.current?.guard as GuardReport | null;
            const selectedTab = a.id === asset?.id;
            return (
              <button
                key={a.id}
                role="tab"
                aria-selected={selectedTab}
                onClick={() => onSelect(a.id)}
                className={`flex shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-[13px] ${selectedTab ? "border-line bg-panel font-semibold" : "border-transparent text-muted hover:text-ink"}`}
              >
                <StatusDot status={a.status} guard={guard?.status} />
                <span className="tabular text-muted">{i + 1}.</span>
                <span className="max-w-44 truncate">{a.title}</span>
              </button>
            );
          })}
        </div>
      </div>
      {asset && <AssetDetail key={asset.id} asset={asset} draft={drafts[asset.id]} vars={vars} onChanged={onChanged} />}
    </div>
  );
}

const TAB_LABEL: Record<Tab, string> = { preview: "Preview", changes: "Changes", checks: "Checks", sources: "Sources", prompt: "Prompt" };

function AssetDetail({ asset, draft, vars, onChanged }: { asset: Asset; draft?: string; vars: BrandVars; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);
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

  const copy = async () => {
    if (!current) return;
    await navigator.clipboard.writeText(assetToText(current.content));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!current) return;
    const md = `# ${asset.title}\n\n_${ASSET_LABEL[asset.type]}, version ${asset.current_version}_\n\n${assetToText(current.content)}\n`;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${asset.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = (["preview", "changes", "checks", "sources", "prompt"] as Tab[]).filter((t) => t !== "changes" || asset.current_version > 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <span className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-muted ring-1 ring-line">{ASSET_LABEL[asset.type]}</span>
        <GuardBadge guard={guard} status={asset.status} onClick={() => setTab("checks")} />
        {detail && detail.versions.length > 1 && (
          <>
            <label htmlFor={`ver-${asset.id}`} className="sr-only">Version</label>
            <select id={`ver-${asset.id}`} value={asset.current_version} onChange={(e) => pickVersion(Number(e.target.value))} className="max-w-[220px] rounded-md border border-line bg-surface px-2 py-1 text-[12px]">
              {detail.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  Version {v.version}: {v.instruction ? v.instruction.slice(0, 60) : "first draft"}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {current && (
            <>
              <button onClick={copy} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-ink/5 hover:text-ink" title="Copy the text">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={download} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-ink/5 hover:text-ink" title="Download as Markdown">
                <Download size={14} /> .md
              </button>
            </>
          )}
        </div>
        <div role="tablist" aria-label="Asset views" className="flex w-full gap-1 rounded-lg bg-surface p-0.5 ring-1 ring-line sm:w-auto">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-3 py-1 text-[12.5px] sm:flex-none ${tab === t ? "bg-ink text-on-ink" : "text-muted hover:text-ink"}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className={`min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 ${tab === "preview" ? "bg-canvas" : ""}`}>
        {!current && draft ? (
          <LiveDraft text={draft} label={ASSET_LABEL[asset.type]} />
        ) : !current ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            {asset.status === "error" ? <><AlertTriangle size={16} /> This asset was not written (stopped or failed). Ask in the chat to write it again.</> : draft ? null : <><Loader2 className="animate-spin" size={16} /> Gathering brand context…</>}
          </div>
        ) : tab === "preview" ? (
          <BrandTheme vars={vars}>
            <Preview content={current.content} vars={vars} />
          </BrandTheme>
        ) : tab === "changes" ? (
          <Changes assetId={asset.id} version={asset.current_version} current={current.content} />
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

/** The asset as it is being written: plain copy with a caret, replaced by the real preview when done. */
function LiveDraft({ text, label }: { text: string; label: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-6" aria-live="polite" aria-busy="true">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-muted">
        <Loader2 size={13} className="animate-spin" /> Writing the {label.toLowerCase()}. The finished preview appears when it is checked.
      </div>
      <div className="whitespace-pre-wrap font-serif text-[15.5px] leading-7 text-ink">
        {text}
        <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-accent" aria-hidden />
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

/** Word diff between the current version and the one before it. */
function Changes({ assetId, version, current }: { assetId: string; version: number; current: AssetContent }) {
  const [prev, setPrev] = useState<{ content: AssetContent; instruction: string | null } | null>(null);
  const [instruction, setInstruction] = useState<string | null>(null);
  useEffect(() => {
    getJSON<{ version: { content: AssetContent; instruction: string | null } | null }>(`/api/assets/${assetId}?version=${version - 1}`).then((r) => setPrev(r.version));
    getJSON<{ version: { instruction: string | null } | null }>(`/api/assets/${assetId}?version=${version}`).then((r) => setInstruction(r.version?.instruction ?? null));
  }, [assetId, version]);
  if (!prev) return <div className="text-sm text-muted">Loading…</div>;
  const parts = diffWords(assetToText(prev.content), assetToText(current));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm text-muted">
        v{version - 1} → v{version}{instruction ? <>: <span className="text-ink">{instruction}</span></> : null}
      </div>
      <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface p-6 text-[14.5px] leading-7">
        {parts.map((p, i) =>
          p.kind === "same" ? <span key={i}>{p.text}</span> : p.kind === "added" ? <ins key={i} className="rounded bg-ok-soft px-0.5 text-ok no-underline">{p.text}</ins> : <del key={i} className="rounded bg-bad-soft px-0.5 text-bad">{p.text}</del>,
        )}
      </div>
    </div>
  );
}

function Checks({ guard }: { guard: GuardReport | null }) {
  if (!guard) return <div className="text-sm text-muted">Not checked yet.</div>;
  if (!guard.issues.length)
    return (
      <div className="flex items-center gap-2 rounded-lg bg-ok-soft p-4 text-sm text-ok ring-1 ring-ok/25">
        <CheckCircle2 size={18} /> No issues: claims, names, proof, images and brief constraints all check out.
      </div>
    );
  return (
    <div className="space-y-3">
      {guard.issues.map((i, k) => (
        <div key={k} className={`rounded-lg p-4 text-sm ring-1 ${i.severity === "block" ? "bg-bad-soft ring-bad/25" : "bg-warn-soft ring-warn/25"}`}>
          <div className="flex items-center gap-2 font-semibold">
            {i.severity === "block" ? <ShieldAlert size={16} className="text-bad" /> : <AlertTriangle size={16} className="text-warn" />}
            {i.problem}
            <span className="ml-auto text-[12px] font-normal text-muted">{i.check === "rule" ? "Rule" : "AI review"}</span>
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
          {sources.docs.map((d) => <li key={d} className="truncate rounded bg-surface px-2 py-1 font-mono text-xs ring-1 ring-line">{d}</li>)}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Web research</h3>
        {sources.research.length ? (
          <ul className="space-y-2">
            {sources.research.map((r, i) => (
              <li key={i} className="rounded bg-surface p-3 ring-1 ring-line">
                <div>{r.claim}</div>
                <div className="mt-1 text-xs text-muted">{r.publisher} · {r.published ?? "undated"} · <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.url}</a> · <span className="text-ok">figure found on page</span></div>
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
          <button key={c.id} onClick={() => setOpen(c.id)} className={`rounded-md px-2.5 py-1 text-xs ring-1 ${c.id === shown ? "bg-ink text-on-ink ring-ink" : "bg-surface ring-line hover:ring-ink"}`}>
            {c.step} · {usd(c.cost_usd)}
          </button>
        ))}
      </div>
      {shown ? <CallView id={shown} /> : <div className="text-sm text-muted">No calls yet.</div>}
    </div>
  );
}

function StatusDot({ status, guard }: { status: string; guard?: string }) {
  const color = status === "writing" ? "bg-accent animate-pulse" : status === "error" ? "bg-bad" : guard === "block" ? "bg-bad" : guard === "warn" ? "bg-warn" : guard === "pass" ? "bg-ok" : "bg-line-strong";
  const label = status === "writing" ? "writing" : status === "error" ? "not written" : guard === "block" ? "needs a fix" : guard === "warn" ? "has notes" : guard === "pass" ? "passes the brand check" : "not checked yet";
  return (
    <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} role="img" aria-label={label} title={label} />
  );
}

function GuardBadge({ guard, status, onClick }: { guard: GuardReport | null; status: string; onClick: () => void }) {
  if (status === "writing") return <span className="flex items-center gap-1 text-xs text-muted"><Loader2 size={13} className="animate-spin" /> writing</span>;
  if (!guard) return <span className="text-xs text-muted">checking…</span>;
  const map = {
    pass: ["bg-ok-soft text-ok ring-ok/25", "Passes the brand check"],
    warn: ["bg-warn-soft text-warn ring-warn/25", `${guard.issues.length} note${guard.issues.length > 1 ? "s" : ""} to review`],
    block: ["bg-bad-soft text-bad ring-bad/25", `${guard.issues.filter((i) => i.severity === "block").length} to fix before publishing`],
  } as const;
  const [cls, text] = map[guard.status];
  return <button onClick={onClick} className={`rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ${cls}`}>{text}</button>;
}
