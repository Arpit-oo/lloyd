"use client";

import { Check, FolderOpen, FolderPlus, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/client/api";
import { switchBrand } from "@/lib/client/brands";
import { droppedFiles, pickedFiles, type PickedFile } from "@/lib/client/folder";

/** Documents the brand layer can index (images and the rest are kept too, for the image library). */
const DOC_EXT = /\.(md|markdown|txt|pdf|docx|pptx|html?)$/i;

/** Upload a brand folder to data/brands/<name>/ and return where it was saved. */
export async function uploadBrand(name: string, files: PickedFile[]): Promise<string> {
  const form = new FormData();
  form.append("name", name);
  for (const f of files) {
    form.append("files", f.file);
    form.append("paths", f.path);
  }
  const res = await fetch("/api/brands/upload", { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Upload failed (${res.status})`);
  return body.dir as string;
}

interface Option {
  dir: string;
  name: string;
  lastUsed: string;
  active: boolean;
}

/**
 * Switch the brand Lloyd works on: a brand used before, the default from BRAND_DIR, the repo's
 * mini test brand, or any folder path. Campaigns and memory are kept per brand. A folder that
 * was never indexed shows the indexing screen next (a few minutes, about $1-3, once).
 */
export function BrandSwitcher() {
  const [data, setData] = useState<{ current: { dir: string; name: string }; options: Option[] } | null>(null);
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJSON<typeof data>("/api/brands").then(setData).catch((e) => setError((e as Error).message));
  }, []);

  const use = async (target: string) => {
    setBusy(target);
    setError(null);
    try {
      await switchBrand(target);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <p className="text-[14px] leading-relaxed text-muted">
        Lloyd works on one brand at a time. Campaigns and memory are kept separately for each brand, so switching never mixes them. A brand folder that hasn&apos;t been indexed yet is indexed once (a few minutes, about $1–3 for a large folder).
      </p>

      <AddBrand busy={!!busy} onAdded={use} />

      <div>
        <div className="mb-2 text-[13.5px] font-medium">Brands</div>
        {!data ? (
          <div className="flex items-center gap-2 text-[13px] text-muted"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {data.options.map((o) => (
              <li key={o.dir} className="flex items-center gap-3 bg-surface px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{o.name}</span>
                  <span className="block truncate font-mono text-[12px] text-muted">{o.dir}</span>
                </span>
                {o.active ? (
                  <span className="flex items-center gap-1 text-[13px] font-medium text-ok"><Check size={14} /> In use</span>
                ) : (
                  <button onClick={() => use(o.dir)} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] hover:border-line-strong disabled:opacity-50">
                    {busy === o.dir && <Loader2 size={14} className="animate-spin" />} Switch to this brand
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="brand-dir" className="mb-2 block text-[13.5px] font-medium">Or use a folder already on this machine</label>
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
            <FolderOpen size={16} className="shrink-0 text-muted" />
            <input
              id="brand-dir"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && dir.trim() && use(dir)}
              placeholder="C:\path\to\brand-folder  or  ./relative/path"
              className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[13px] outline-none"
            />
          </div>
          <button onClick={() => use(dir)} disabled={!dir.trim() || !!busy} className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-on-ink disabled:opacity-40">
            {busy === dir && <Loader2 size={14} className="animate-spin" />} Use this folder
          </button>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          A folder of the brand&apos;s documents (Markdown, text, PDF, Word, PowerPoint), optionally with an <code className="font-mono">images/</code> folder and image metadata, and a <code className="font-mono">briefs/</code> folder for sample briefs. In Docker, the folder must be mounted into the container (set <code className="font-mono">BRAND_FOLDER</code>).
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-ink">{error}</p>}
    </div>
  );
}

/** Add a new brand: name it, drop or pick its folder, and Lloyd copies it in and switches to it. */
function AddBrand({ busy, onAdded }: { busy: boolean; onAdded: (dir: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const take = (list: PickedFile[]) => {
    setError(null);
    setFiles(list);
    // Name it after the folder unless a name was typed.
    const top = list[0]?.path.includes("/") ? list[0].path.split("/")[0] : "";
    if (!name.trim() && top) setName(top);
  };
  const docs = files.filter((f) => DOC_EXT.test(f.path)).length;
  const images = files.filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f.path)).length;
  const mb = files.reduce((s, f) => s + f.file.size, 0) / 1048576;

  const add = async () => {
    setUploading(true);
    setError(null);
    try {
      const dir = await uploadBrand(name.trim() || "brand", files);
      await onAdded(dir);
    } catch (e) {
      setError((e as Error).message);
      setUploading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-6">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold"><FolderPlus size={17} /> Add a new brand</h3>
        <p className="mt-1 text-[13px] text-muted">
          Drop the brand&apos;s folder here: guidelines, voice and legal docs, product sheets (Markdown, text, PDF, Word, PowerPoint, HTML). An <code className="font-mono">images/</code> folder and a <code className="font-mono">briefs/</code> folder of sample briefs are optional. Lloyd copies it into <code className="font-mono">data/brand-folders/</code>, indexes it once, and switches to it.
        </p>
      </div>

      <div>
        <label htmlFor="new-brand-name" className="mb-1.5 block text-[13px] font-medium">Brand name</label>
        <input id="new-brand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Robotics" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[14px] outline-none focus:border-line-strong" />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setOver(false);
          take(await droppedFiles(e.dataTransfer));
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center ${over ? "border-accent bg-accent-soft" : "border-line"}`}
      >
        <Upload size={22} className="text-muted" aria-hidden />
        {files.length ? (
          <p className="text-[13.5px]">
            <span className="font-medium">{files.length} file{files.length === 1 ? "" : "s"}</span> · {docs} document{docs === 1 ? "" : "s"} Lloyd can read · {images} image{images === 1 ? "" : "s"} · {mb.toFixed(1)} MB
          </p>
        ) : (
          <p className="text-[13.5px] text-muted">Drag the brand folder here, or</p>
        )}
        <button type="button" onClick={() => picker.current?.click()} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-[13px] hover:border-line-strong">
          {files.length ? "Choose a different folder" : "Choose folder"}
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            take(pickedFiles(e.target.files));
            e.target.value = "";
          }}
        />
        {files.length > 0 && !docs && <p className="text-[13px] text-bad">No documents Lloyd can read in this folder. Add Markdown, text, PDF, Word or PowerPoint files.</p>}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={add} disabled={!docs || uploading || busy} className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-on-ink disabled:opacity-40">
          {uploading && <Loader2 size={14} className="animate-spin" />} {uploading ? "Adding…" : "Add brand and switch to it"}
        </button>
        <span className="text-[12.5px] text-muted">Your current brand and its campaigns stay; switch back any time.</span>
      </div>
      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-ink">{error}</p>}
    </section>
  );
}
