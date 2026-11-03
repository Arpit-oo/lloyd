"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { sendJSON } from "@/lib/client/api";
import type { BrandView } from "@/lib/client/types";
import { Modal } from "../ui/modal";

type Tab = "authority" | "conflicts" | "names" | "images" | "kernel";

/** Shows what the brand layer derived from the folder, with evidence, so a person can check it. */
export function BrandPanel({ brand, onClose, onChanged }: { brand: BrandView; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("authority");
  const s = brand.summary;
  return (
    <Modal
      title={`Brand layer · ${brand.tokens?.brand_name ?? "brand"}`}
      subtitle={s ? `${s.docs} documents → ${s.chunks} sections, ${s.facts} facts, ${brand.conflicts?.length ?? 0} settled conflicts, ${s.usableImages}/${s.images} images usable. One-time ingest cost $${s.costUSD.toFixed(2)}.` : undefined}
      onClose={onClose}
    >
      <div className="mb-5 flex gap-1 rounded-lg bg-surface p-1 ring-1 ring-line">
        {(
          [
            ["authority", "Which document wins"],
            ["conflicts", `Conflicts (${brand.conflicts?.length ?? 0})`],
            ["names", "Names"],
            ["images", "Images"],
            ["kernel", "Kernel"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-3 py-2 text-sm ${tab === t ? "bg-ink font-semibold text-on-ink" : "text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "authority" && <Authority brand={brand} onChanged={onChanged} />}
      {tab === "conflicts" && <Conflicts brand={brand} />}
      {tab === "names" && <Names brand={brand} />}
      {tab === "images" && <Images brand={brand} />}
      {tab === "kernel" && <p className="mb-3 text-sm text-muted">The short summary of the brand that goes into every prompt. Everything else is looked up per asset.</p>}
      {tab === "kernel" && <pre className="whitespace-pre-wrap rounded-xl bg-surface p-6 font-mono text-[12px] leading-relaxed ring-1 ring-line">{brand.kernel}</pre>}
    </Modal>
  );
}

function Authority({ brand, onChanged }: { brand: BrandView; onChanged: () => void }) {
  const g = brand.governance!;
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const ranks = [...g.tiers].sort((a, b) => a.rank - b.rank).map((t) => t.rank);

  const move = async (docId: string, tier: number) => {
    await sendJSON("/api/brand/docs", "PATCH", { docId, tier });
    setDirty(true);
    onChanged();
  };

  /** Re-runs conflict resolution, names and kernel against the edited order, streaming progress. */
  const reresolve = async () => {
    setProgress("Starting");
    const res = await fetch("/api/brand/redo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
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
        if (e.type === "progress") setProgress(`${e.step}${e.total ? ` ${e.done}/${e.total}` : ""}`);
      }
    }
    setProgress(null);
    setDirty(false);
    onChanged();
  };
  const byTier = new Map<number, NonNullable<BrandView["docs"]>>();
  for (const d of brand.docs ?? []) byTier.set(d.tier, [...(byTier.get(d.tier) ?? []), d]);
  return (
    <div className="space-y-6">
      {(dirty || progress) && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm">
          {progress ? (
            <><Loader2 size={16} className="animate-spin" /> Re-resolving: {progress}</>
          ) : (
            <>
              You changed the order. Conflicts were settled with the old one.
              <button onClick={reresolve} className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-on-ink">Re-resolve conflicts (about $0.50)</button>
            </>
          )}
        </div>
      )}
      <div className="rounded-xl bg-surface p-5 text-sm ring-1 ring-line">
        <div className="font-semibold">
          Order of authority: {g.source === "explicit" ? "taken from the brand's own governance rules" : g.source === "partly_explicit" ? "partly stated by the brand, partly inferred" : "inferred from document types (no explicit rule found)"} · confidence {g.confidence}
        </div>
        <ul className="mt-3 space-y-1.5 text-ink/80">
          {g.principles.map((p, i) => <li key={i}>• {p}</li>)}
        </ul>
        {g.supersessions.length > 0 && (
          <div className="mt-4 space-y-1 text-xs">
            {g.supersessions.map((x, i) => (
              <div key={i}><span className="font-mono">{x.newer_doc}</span> replaces <span className="font-mono line-through">{x.older_doc}</span>: “{x.evidence}”</div>
            ))}
          </div>
        )}
      </div>
      {[...g.tiers].sort((a, b) => a.rank - b.rank).map((t) => (
        <div key={t.rank} className="rounded-xl bg-surface ring-1 ring-line">
          <div className="flex items-baseline gap-3 border-b border-line px-5 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-on-ink">{t.rank}</span>
            <div>
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-muted">{t.evidence ? `“${t.evidence}”` : "inferred"}</div>
            </div>
          </div>
          <ul className="grid gap-x-6 gap-y-1 px-5 py-3 text-xs md:grid-cols-2">
            {(byTier.get(t.rank) ?? []).map((d) => (
              <li key={d.id} className="flex items-center gap-2" title={d.reason}>
                <select value={d.tier} onChange={(e) => move(d.id, Number(e.target.value))} className="shrink-0 rounded border border-line bg-surface px-1 py-0.5 text-[11px]" aria-label={`Tier for ${d.id}`}>
                  {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="truncate font-mono">{d.id}</span>
                {d.reason?.startsWith("Set by the user") && <span className="shrink-0 rounded bg-accent-soft px-1 text-[11px] text-accent">you</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Conflicts({ brand }: { brand: BrandView }) {
  return (
    <div className="space-y-4">
      {(brand.conflicts ?? []).map((c) => {
        const winners = new Set(c.resolution.winner_fact_ids);
        return (
          <div key={c.id} className="rounded-xl bg-surface p-5 ring-1 ring-line">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{c.topic}</span>
              <span className="rounded-full bg-panel px-2 py-0.5 text-[11px] uppercase text-muted ring-1 ring-line">{c.resolution.confidence}</span>
              {c.needsUser && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">needs a decision</span>}
            </div>
            <p className="mt-1 text-sm">{c.resolution.explanation}</p>
            <div className="mt-1 text-xs text-muted">Decided by: {c.resolution.rule_applied}</div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {c.facts.map((f) => (
                <div key={f.id} className={`rounded-lg p-3 text-xs ring-1 ${winners.has(f.id) ? "bg-ok-soft ring-ok/25" : "bg-bad-soft ring-bad/25"}`}>
                  <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-muted">
                    <span className={`font-sans font-semibold ${winners.has(f.id) ? "text-ok" : "text-bad"}`}>{winners.has(f.id) ? "USE" : "DON'T USE"}</span>
                    tier {f.tier} · {f.doc_id}
                  </div>
                  “{f.quote}”
                </div>
              ))}
            </div>
            {c.resolution.owner_note && <div className="mt-3 rounded-md bg-panel p-2 text-xs text-muted">Note for the document owner: {c.resolution.owner_note}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Names({ brand }: { brand: BrandView }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
      <table className="w-full text-sm">
        <thead className="bg-panel text-left text-xs text-muted">
          <tr><th className="px-4 py-2">Current name</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Former names (flagged in copy)</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {(brand.entities ?? []).map((e) => (
            <tr key={e.current_name}>
              <td className="px-4 py-2 font-semibold">{e.current_name}</td>
              <td className="px-4 py-2 text-xs">{e.status}</td>
              <td className="px-4 py-2 text-xs">{e.former_names.join(", ") || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Images({ brand }: { brand: BrandView }) {
  const [only, setOnly] = useState<"excluded" | "all">("excluded");
  const list = (brand.images ?? []).filter((i) => only === "all" || !i.usable);
  return (
    <div>
      <div className="mb-3 flex gap-2 text-xs">
        <button onClick={() => setOnly("excluded")} className={`rounded-full px-3 py-1 ring-1 ${only === "excluded" ? "bg-ink text-on-ink ring-ink" : "ring-line"}`}>Excluded ({(brand.images ?? []).filter((i) => !i.usable).length})</button>
        <button onClick={() => setOnly("all")} className={`rounded-full px-3 py-1 ring-1 ${only === "all" ? "bg-ink text-on-ink ring-ink" : "ring-line"}`}>All ({brand.images?.length ?? 0})</button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {list.map((i) => (
          <div key={i.id} className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/images/${i.id}`} alt={i.id} className={`aspect-video w-full object-cover ${i.usable ? "" : "opacity-60 grayscale"}`} />
            <div className="space-y-1 p-3 text-xs">
              <div className="font-semibold">{String(i.meta.title ?? i.id)}</div>
              <div className="text-muted">{i.vision?.caption}</div>
              {!i.usable && <div className="font-medium text-bad">Excluded: {i.rules?.caution ?? (i.rules?.deprecated ? "deprecated" : "restricted")}</div>}
              {i.usable && i.rules?.caution && <div className="text-warn">Caution: {i.rules.caution}</div>}
              {i.vision && !i.vision.matches_metadata && <div className="text-accent-ink">Metadata mismatch: {i.vision.mismatch_note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
