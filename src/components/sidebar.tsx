"use client";

import { Brain, Library, MoreHorizontal, Palette, PanelLeftClose, Pencil, ScrollText, Search, Settings, SquarePen, Trash2 } from "lucide-react";
import { Bee } from "./brand/bee";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CampaignListItem } from "@/lib/client/types";

const STATE: Record<string, { label: string; dot: string }> = {
  new: { label: "Not started", dot: "bg-line-strong" },
  clarifying: { label: "Waiting for your answers", dot: "bg-warn" },
  plan_review: { label: "Plan ready to approve", dot: "bg-accent" },
  writing: { label: "Writing", dot: "bg-accent animate-pulse" },
  review: { label: "Assets ready", dot: "bg-ok" },
};

/** Campaign history, grouped by recency, searchable, with rename / delete. */
export function Sidebar({ campaigns, activeId, onOpen, onNew, onRename, onDelete, onClose, brandName, onBrand, onMemory, onInspector, inspectorEnabled, themeName, onThemes, onSettings, showMascot }: {
  campaigns: CampaignListItem[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  brandName: string;
  onBrand: () => void;
  onMemory: () => void;
  onInspector: () => void;
  inspectorEnabled: boolean;
  themeName: string;
  onThemes: () => void;
  onSettings: () => void;
  showMascot: boolean;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupByDate(campaigns.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))), [campaigns, query]);

  return (
    <nav aria-label="Campaigns" data-glass className="flex h-full w-full flex-col bg-sidebar">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="flex items-center gap-2 pl-1">
          {showMascot && <Bee size={22} />}
          <span className="font-serif text-[19px] font-semibold">Lloyd</span>
        </span>
        <button onClick={onClose} aria-label="Close sidebar" title="Close sidebar (Ctrl+B)" className="rounded-lg p-1.5 max-sm:p-2.5 text-muted hover:bg-ink/5 hover:text-ink">
          <PanelLeftClose size={18} />
        </button>
      </div>
      <button onClick={onNew} title="New campaign (Ctrl+Shift+O)" className="mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium hover:bg-ink/5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent"><SquarePen size={13} /></span>
        New campaign
      </button>
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted focus-within:bg-ink/5">
        <Search size={15} className="shrink-0" />
        <label htmlFor="campaign-search" className="sr-only">Search campaigns</label>
        <input id="campaign-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search campaigns" className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted" />
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.map(([label, items]) => (
          <section key={label} className="mt-3">
            <h3 className="px-2.5 pb-1 text-[12px] font-semibold text-muted">{label}</h3>
            <ul className="space-y-px">
              {items.map((c) => (
                <CampaignRow key={c.id} c={c} active={c.id === activeId} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="px-2.5 pt-4 text-[13px] text-muted">{query ? "No campaigns match." : "Your campaigns will appear here."}</p>}
      </div>

      <div className="space-y-px border-t border-line p-2">
        <SideLink icon={<Library size={16} />} label={`Brand · ${brandName}`} onClick={onBrand} />
        <SideLink icon={<Brain size={16} />} label="Memory" onClick={onMemory} />
        <SideLink icon={<ScrollText size={16} />} label="Inspector" onClick={onInspector} disabled={!inspectorEnabled} hint={inspectorEnabled ? "Every prompt sent and what it cost" : "Open a campaign to inspect its prompts"} />
        <SideLink icon={<Palette size={16} />} label={`Theme · ${themeName}`} onClick={onThemes} hint="Change the theme (or type /theme)" />
        <SideLink icon={<Settings size={16} />} label="Settings" onClick={onSettings} hint="Settings (Ctrl+,)" />
      </div>
    </nav>
  );
}

function CampaignRow({ c, active, onOpen, onRename, onDelete }: { c: CampaignListItem; active: boolean; onOpen: (id: string) => void; onRename: (id: string, t: string) => void; onDelete: (id: string) => void }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(c.title);
  const root = useRef<HTMLLIElement>(null);
  const st = STATE[c.state] ?? STATE.new;

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setMenu(false);
        setConfirm(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  if (editing)
    return (
      <li className="px-1 py-0.5">
        <label htmlFor={`rename-${c.id}`} className="sr-only">Campaign name</label>
        <input
          id={`rename-${c.id}`}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) {
              onRename(c.id, title.trim());
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[13.5px] outline-none"
        />
      </li>
    );

  return (
    <li ref={root} className="group relative">
      <button onClick={() => onOpen(c.id)} aria-current={active ? "page" : undefined} className={`flex w-full items-start gap-2.5 rounded-lg py-1.5 pl-2.5 pr-8 text-left ${active ? "bg-ink/[0.08]" : "hover:bg-ink/5"}`}>
        <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} aria-hidden />
        <span className="min-w-0">
          <span className={`block truncate text-[13.5px] ${active ? "font-medium" : ""}`}>{c.title}</span>
          <span className="block truncate text-[12px] text-muted">
            {st.label} · {timeLabel(c.updated_at)}
          </span>
        </span>
      </button>
      <button
        onClick={() => setMenu(!menu)}
        aria-label={`Options for ${c.title}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        className={`absolute right-1 top-1.5 rounded-md p-1 max-sm:p-2.5 max-sm:top-0.5 text-muted hover:bg-ink/10 hover:text-ink ${menu || active ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu && (
        <div role="menu" className="shadow-float absolute right-1 top-9 z-20 w-44 rounded-xl border border-line bg-surface p-1">
          <button role="menuitem" onClick={() => { setMenu(false); setEditing(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] hover:bg-ink/5">
            <Pencil size={14} /> Rename
          </button>
          <button
            role="menuitem"
            onClick={() => (confirm ? (onDelete(c.id), setMenu(false)) : setConfirm(true))}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] ${confirm ? "bg-bad-soft text-bad" : "text-bad hover:bg-bad-soft"}`}
          >
            <Trash2 size={14} /> {confirm ? "Click again to delete" : "Delete"}
          </button>
        </div>
      )}
    </li>
  );
}

function SideLink({ icon, label, onClick, disabled, hint }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={hint} className="flex w-full items-center gap-2.5 truncate rounded-lg px-2.5 py-2 text-[13.5px] text-ink/85 hover:bg-ink/5 disabled:opacity-40">
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function groupByDate(items: CampaignListItem[]): [string, CampaignListItem[]][] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const buckets: [string, (t: number) => boolean][] = [
    ["Today", (t) => t >= startOfToday.getTime()],
    ["Yesterday", (t) => t >= startOfToday.getTime() - day],
    ["Previous 7 days", (t) => t >= startOfToday.getTime() - 7 * day],
    ["Older", () => true],
  ];
  const out = new Map<string, CampaignListItem[]>();
  for (const c of items) {
    const t = new Date(c.updated_at).getTime();
    const label = buckets.find(([, test]) => test(t))![0];
    out.set(label, [...(out.get(label) ?? []), c]);
  }
  return buckets.map(([l]) => l).filter((l) => out.has(l)).map((l) => [l, out.get(l)!]);
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
