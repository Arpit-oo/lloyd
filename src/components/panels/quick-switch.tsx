"use client";

import { Check, FolderPlus, Library, Loader2, MessageSquare, Search, SquarePen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { listBrands, switchBrand, type BrandList } from "@/lib/client/brands";
import type { CampaignListItem } from "@/lib/client/types";
import { Modal } from "../ui/modal";

type Item =
  | { kind: "new"; label: string }
  | { kind: "campaign"; id: string; label: string; sub: string; active: boolean }
  | { kind: "brand"; dir: string; label: string; sub: string; active: boolean }
  | { kind: "add-brand"; label: string };

/**
 * Ctrl+K: jump to any campaign or switch brand from one search box. Arrow keys move, Enter opens.
 * Campaigns are this brand's; switching brand reloads into the other brand's campaigns.
 */
export function QuickSwitch({ campaigns, activeId, onOpen, onNew, onAddBrand, onClose }: {
  campaigns: CampaignListItem[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onAddBrand: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [brands, setBrands] = useState<BrandList | null>(null);
  const [sel, setSel] = useState(0);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listBrands().then(setBrands).catch(() => null);
  }, []);

  const items = useMemo<Item[]>(() => {
    const m = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
    return [
      ...(m("new campaign") ? [{ kind: "new", label: "New campaign" } as Item] : []),
      ...campaigns.filter((c) => m(c.title)).map((c) => ({ kind: "campaign", id: c.id, label: c.title, sub: new Date(c.updated_at).toLocaleDateString([], { month: "short", day: "numeric" }), active: c.id === activeId }) as Item),
      ...(brands?.options ?? []).filter((b) => m(b.name) || m(b.dir)).map((b) => ({ kind: "brand", dir: b.dir, label: b.name, sub: b.dir, active: b.active }) as Item),
      ...(m("add a new brand") ? [{ kind: "add-brand", label: "Add a new brand…" } as Item] : []),
    ];
  }, [q, campaigns, brands, activeId]);

  const pick = async (it: Item | undefined) => {
    if (!it) return;
    if (it.kind === "new" || it.kind === "campaign") {
      if (it.kind === "new") onNew();
      else onOpen(it.id);
      onClose();
    } else if (it.kind === "add-brand") onAddBrand();
    else if (!it.active) {
      setSwitching(it.dir);
      setError(null);
      try {
        await switchBrand(it.dir);
      } catch (e) {
        setError((e as Error).message);
        setSwitching(null);
      }
    }
  };

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const firstBrand = items.findIndex((i) => i.kind === "brand" || i.kind === "add-brand");

  return (
    <Modal title="Switch campaign or brand" subtitle="Type to search. ↑ ↓ to move, Enter to open. Ctrl+K opens this anywhere." onClose={onClose} size="fit">
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <Search size={17} className="shrink-0 text-muted" aria-hidden />
          <label htmlFor="quick-switch" className="sr-only">Search campaigns and brands</label>
          <input
            id="quick-switch"
            data-autofocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setSel((s) => Math.min(items.length - 1, s + 1));
              else if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1));
              else if (e.key === "Enter") pick(items[sel]);
              else return;
              e.preventDefault();
            }}
            placeholder="Search campaigns and brands"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-switch-list"
            aria-activedescendant={`qs-${sel}`}
            className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none"
          />
        </div>

        <ul id="quick-switch-list" ref={list} role="listbox" className="max-h-[60vh] space-y-px overflow-y-auto">
          {items.map((it, i) => (
            <li key={`${it.kind}-${"id" in it ? it.id : "dir" in it ? it.dir : it.label}`}>
              {i === 0 && it.kind !== "brand" && it.kind !== "add-brand" && <h3 className="px-3 pb-1 pt-1 text-[12px] font-semibold text-muted">Campaigns · {brands?.current.name ?? "this brand"}</h3>}
              {i === firstBrand && <h3 className="px-3 pb-1 pt-4 text-[12px] font-semibold text-muted">Brands</h3>}
              <button
                id={`qs-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                onMouseMove={() => setSel(i)}
                onClick={() => pick(it)}
                disabled={!!switching}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === sel ? "bg-ink/[0.07]" : ""}`}
              >
                <span className="shrink-0 text-muted">
                  {it.kind === "new" ? <SquarePen size={16} /> : it.kind === "campaign" ? <MessageSquare size={16} /> : it.kind === "brand" ? <Library size={16} /> : <FolderPlus size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{it.label}</span>
                  {"sub" in it && <span className={`block truncate text-[12px] text-muted ${it.kind === "brand" ? "font-mono" : ""}`}>{it.sub}</span>}
                </span>
                {"active" in it && it.active && (
                  <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-ok"><Check size={13} /> {it.kind === "brand" ? "In use" : "Open"}</span>
                )}
                {it.kind === "brand" && !it.active && i === sel && (
                  <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-muted">{switching === it.dir && <Loader2 size={13} className="animate-spin" />} Switch brand ↵</span>
                )}
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-[13.5px] text-muted">Nothing matches “{q}”.</li>}
        </ul>
        {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-ink">{error}</p>}
      </div>
    </Modal>
  );
}
