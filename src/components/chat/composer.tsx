"use client";

import { ArrowUp, Check, ChevronDown, FileText, Loader2, Palette, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatBytes, getJSON, uploadFiles } from "@/lib/client/api";
import type { ModelCatalog } from "@/lib/client/types";
import type { ModelSettings } from "@/lib/llm/catalog";

/**
 * The message box, built like the composer in modern chat apps:
 * text that grows, files by button / drag / paste (text extracted on upload, errors shown before
 * sending), a model menu, and a Send button that becomes Stop while the agent works.
 */
export interface Attached {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  id?: string;
  error?: string;
  note?: string;
}

const ACCEPT = ".md,.markdown,.txt,.pdf,.docx,.html,.htm,.csv,.json";

export function Composer({ draft, setDraft, onSend, onStop, onThemes, busy, disabled, placeholder, large, models, setModels, inputRef, enterToSend = true }: {
  draft: string;
  setDraft: (t: string) => void;
  onSend: (text: string, attachmentIds: string[]) => void;
  onStop: () => void;
  /** Opens the theme picker (also typed as /theme). */
  onThemes: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  large?: boolean;
  models: ModelSettings;
  setModels: (m: ModelSettings) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Enter sends (default); when false, Ctrl/Cmd+Enter sends and Enter adds a line. */
  enterToSend?: boolean;
}) {
  const [files, setFiles] = useState<Attached[]>([]);
  const [drag, setDrag] = useState(false);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [draft, ref]);

  const addFiles = async (list: File[]) => {
    if (!list.length) return;
    const pending = list.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, name: f.name, size: f.size, status: "uploading" as const }));
    setFiles((cur) => [...cur, ...pending]);
    const results = await uploadFiles(list);
    setFiles((cur) =>
      cur.map((a) => {
        const i = pending.findIndex((p) => p.key === a.key);
        if (i < 0) return a;
        const r = results[i];
        return r?.ok
          ? { ...a, status: "ready", id: r.id, note: r.truncated ? "Long file: only the first part is used" : undefined }
          : { ...a, status: "error", error: r?.error ?? "Upload failed" };
      }),
    );
  };

  const uploading = files.some((f) => f.status === "uploading");
  const ready = files.filter((f) => f.status === "ready" && f.id);
  const canSend = !busy && !disabled && !uploading && (draft.trim().length > 0 || ready.length > 0);

  const send = () => {
    if (!canSend) return;
    onSend(draft.trim(), ready.map((f) => f.id!));
    setDraft("");
    setFiles([]);
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        addFiles([...e.dataTransfer.files]);
      }}
      data-glass
      className={`shadow-float rounded-[22px] border bg-surface px-3 pb-2.5 pt-3 transition-colors focus-within:border-line-strong ${drag ? "border-accent ring-2 ring-accent/25" : "border-line"}`}
    >
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2 px-1" aria-label="Attached files">
          {files.map((f) => (
            <li key={f.key} className={`flex max-w-[260px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${f.status === "error" ? "border-bad/40 bg-bad-soft text-bad" : "border-line bg-panel"}`}>
              {f.status === "uploading" ? <Loader2 size={14} className="shrink-0 animate-spin text-muted" /> : <FileText size={14} className="shrink-0 text-muted" />}
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="block truncate text-[11px] text-muted">{f.status === "error" ? f.error : f.status === "uploading" ? "Reading…" : f.note ?? formatBytes(f.size)}</span>
              </span>
              <button onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))} aria-label={`Remove ${f.name}`} className="shrink-0 rounded p-0.5 text-muted hover:bg-ink/10 hover:text-ink">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="sr-only" htmlFor="composer-input">Message</label>
      <textarea
        id="composer-input"
        ref={ref}
        value={draft}
        onChange={(e) => {
          if (e.target.value.trim().toLowerCase() === "/theme") {
            setDraft("");
            onThemes();
            return;
          }
          setDraft(e.target.value);
        }}
        onPaste={(e) => {
          const pasted = [...e.clipboardData.files];
          if (pasted.length) {
            e.preventDefault();
            addFiles(pasted);
          }
        }}
        onKeyDown={(e) => {
          const sendKey = enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey;
          if (e.key === "Enter" && sendKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={large ? 3 : 1}
        placeholder={placeholder}
        disabled={disabled}
        className="block w-full resize-none bg-transparent px-1.5 text-[15px] leading-6 text-ink outline-none placeholder:text-muted disabled:opacity-60"
      />
      <div className="mt-2 flex items-center gap-1.5">
        <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <button onClick={() => picker.current?.click()} aria-label="Attach files" title="Attach files (PDF, Word, Markdown, text)" className="flex h-8 w-8 max-sm:h-10 max-sm:w-10 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
          <Paperclip size={17} />
        </button>
        <ModelMenu models={models} setModels={setModels} />
        <button onClick={onThemes} aria-label="Themes" title="Themes (or type /theme)" className="flex h-8 w-8 max-sm:h-10 max-sm:w-10 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
          <Palette size={17} />
        </button>
        <div className="ml-auto">
          {busy ? (
            <button onClick={onStop} aria-label="Stop" title="Stop" className="flex h-8 w-8 max-sm:h-10 max-sm:w-10 items-center justify-center rounded-lg bg-ink text-on-ink hover:opacity-90">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button onClick={send} disabled={!canSend} aria-label="Send" title="Send (Enter)" className="flex h-8 w-8 max-sm:h-10 max-sm:w-10 items-center justify-center rounded-lg bg-accent text-on-accent transition hover:brightness-95 disabled:bg-ink/15 disabled:text-on-ink">
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Model picker: a quality preset, optionally with a specific writer model. */
function ModelMenu({ models, setModels }: { models: ModelSettings; setModels: (m: ModelSettings) => void }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || catalog) return;
    getJSON<ModelCatalog>("/api/models").then(setCatalog).catch(() => setCatalog(null));
  }, [open, catalog]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const presetLabel = { best: "Best", balanced: "Balanced", fast: "Fast" }[models.preset];
  return (
    <div ref={root} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} className="flex h-8 max-sm:h-10 items-center gap-1 rounded-lg px-2 text-[13px] text-muted hover:bg-ink/5 hover:text-ink">
        {presetLabel}
        {models.writer && <span className="text-muted">· {models.writer}</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="shadow-float absolute bottom-10 left-0 z-30 w-[320px] rounded-xl border border-line bg-surface p-1.5">
          <div className="px-2.5 pb-1 pt-1.5 text-[12px] font-semibold text-muted">Quality</div>
          {(catalog?.presets ?? []).map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={models.preset === p.id}
              onClick={() => setModels({ ...models, preset: p.id })}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-ink/5"
            >
              <span className="mt-0.5 w-4 shrink-0 text-accent">{models.preset === p.id && <Check size={15} />}</span>
              <span>
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-[12px] leading-snug text-muted">{p.description}</span>
              </span>
            </button>
          ))}
          <div className="mx-2 my-1.5 border-t border-line" />
          <div className="px-2.5 pb-1 text-[12px] font-semibold text-muted">Writing model</div>
          <button role="menuitemradio" aria-checked={!models.writer} onClick={() => setModels({ preset: models.preset })} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-ink/5">
            <span className="w-4 shrink-0 text-accent">{!models.writer && <Check size={15} />}</span>
            Preset default
          </button>
          {(catalog?.writers ?? []).map((w) => (
            <button key={w.id} role="menuitemradio" aria-checked={models.writer === w.id} onClick={() => setModels({ ...models, writer: w.id })} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-ink/5">
              <span className="w-4 shrink-0 text-accent">{models.writer === w.id && <Check size={15} />}</span>
              <span className="font-mono text-[13px]">{w.id}</span>
              {w.price && <span className="tabular ml-auto text-[12px] text-muted">${w.price.input} / ${w.price.output} per 1M</span>}
            </button>
          ))}
          {!catalog && <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading models</div>}
          <p className="px-2.5 pb-1 pt-2 text-[12px] leading-snug text-muted">Applies from your next message in this campaign. Claim checks always use a capable model.</p>
        </div>
      )}
    </div>
  );
}
