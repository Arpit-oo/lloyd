"use client";

import { Pin, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "@/lib/client/api";
import type { Memory, MemoryType } from "@/lib/memory/store";
import { Modal } from "../ui/modal";

/** See and change what the agent remembers across campaigns. */
export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [mems, setMems] = useState<Memory[]>([]);
  const [draft, setDraft] = useState("");
  const [type, setType] = useState<MemoryType>("preference");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const load = () => getJSON<Memory[]>("/api/memories").then(setMems);
  useEffect(() => {
    load();
  }, []);

  const patch = async (id: string, body: Partial<Memory>) => {
    await sendJSON(`/api/memories/${id}`, "PATCH", body);
    load();
  };
  const remove = async (id: string) => {
    await sendJSON(`/api/memories/${id}`, "DELETE");
    load();
  };
  const add = async () => {
    if (!draft.trim()) return;
    await sendJSON("/api/memories", "POST", { text: draft.trim(), type });
    setDraft("");
    load();
  };

  const groups: [string, Memory[]][] = [
    ["Waiting for your OK", mems.filter((m) => m.status === "proposed")],
    ["Remembered (used in every new campaign)", mems.filter((m) => m.status === "active")],
    ["Forgotten", mems.filter((m) => m.status === "archived")],
  ];

  return (
    <Modal size="fit" title="Memory" subtitle="What carries over between campaigns. Campaign-specific details and brief overrides are never stored here." onClose={onClose}>
      <div className="mb-6 flex gap-2 rounded-xl bg-surface p-3 ring-1 ring-line">
        <select value={type} onChange={(e) => setType(e.target.value as MemoryType)} className="rounded-lg bg-panel px-2 text-sm ring-1 ring-line">
          <option value="preference">preference</option>
          <option value="decision">decision</option>
          <option value="correction">correction</option>
          <option value="fact">fact</option>
        </select>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Tell the agent something to remember, e.g. “Keep LinkedIn posts under 120 words”" className="flex-1 rounded-lg bg-panel px-3 py-2 text-sm outline-none ring-1 ring-line focus:ring-ink" />
        <button onClick={add} className="rounded-lg bg-ink px-4 text-sm font-semibold text-on-ink">Add</button>
      </div>
      <div className="space-y-6">
        {groups.map(([label, list]) =>
          list.length ? (
            <section key={label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
                {list.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                    <span className="mt-0.5 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">{m.type}</span>
                    <div className="min-w-0 flex-1">
                      {editing === m.id ? (
                        <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { patch(m.id, { text: editText }); setEditing(null); } }} onBlur={() => setEditing(null)} className="w-full rounded bg-panel px-2 py-1 outline-none ring-1 ring-ink" />
                      ) : (
                        <button className="text-left" onClick={() => { setEditing(m.id); setEditText(m.text); }} title="Click to edit">{m.text}</button>
                      )}
                      <div className="mt-0.5 text-xs text-muted">
                        {m.brand_hash ? "this brand" : "all brands"}
                        {m.evidence ? ` · because: “${m.evidence}”` : ""}
                        {m.use_count ? ` · used in ${m.use_count} campaign${m.use_count > 1 ? "s" : ""}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {m.status !== "active" && <button onClick={() => patch(m.id, { status: "active" })} className="rounded-md bg-ink px-2 py-1 text-xs text-on-ink">Keep</button>}
                      {m.status === "active" && <button onClick={() => patch(m.id, { status: "archived" })} className="rounded-md px-2 py-1 text-xs ring-1 ring-line">Forget</button>}
                      <button onClick={() => patch(m.id, { pinned: m.pinned ? 0 : 1 })} className={`rounded p-1 ${m.pinned ? "text-accent" : "text-muted"}`} title="Pin"><Pin size={14} /></button>
                      <button onClick={() => remove(m.id)} className="rounded p-1 text-muted hover:text-bad" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
        {!mems.length && <div className="text-sm text-muted">Nothing remembered yet. When you finish a campaign (“we&apos;re done”), I&apos;ll suggest what to keep.</div>}
      </div>
    </Modal>
  );
}
