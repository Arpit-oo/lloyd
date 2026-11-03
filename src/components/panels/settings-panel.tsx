"use client";

import { Check, Keyboard, Monitor, Moon, Palette, Settings as Gear, Sparkles, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";
import { getJSON } from "@/lib/client/api";
import type { Settings } from "@/lib/client/settings";
import type { Appearance } from "@/lib/client/theme";
import type { BrandView, ModelCatalog } from "@/lib/client/types";
import { SCENES } from "@/lib/client/wallpapers";
import { Bee } from "../brand/bee";
import { Wallpaper } from "../themes/wallpaper";
import { Modal } from "../ui/modal";

type Section = "general" | "appearance" | "models" | "shortcuts" | "about";

const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: "general", label: "General", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "models", label: "Models", icon: Sparkles },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "about", label: "About Lloyd", icon: Gear },
];

/** Settings, saved in this browser. Changes apply immediately; there is nothing to "save". */
export function SettingsPanel({ settings, update, appearance, changeAppearance, brand, onClose }: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  appearance: Appearance;
  changeAppearance: (a: Appearance, origin?: { x: number; y: number }) => void;
  brand: BrandView;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("general");
  return (
    <Modal size="fit" title="Settings" subtitle="Saved in this browser. Changes apply right away." onClose={onClose}>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] ${section === s.id ? "bg-ink/[0.08] font-medium" : "text-muted hover:bg-ink/5 hover:text-ink"}`}
            >
              <s.icon size={16} /> {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 max-w-2xl flex-1">
          {section === "general" && <General settings={settings} update={update} />}
          {section === "appearance" && <AppearanceSection appearance={appearance} change={changeAppearance} />}
          {section === "models" && <Models settings={settings} update={update} />}
          {section === "shortcuts" && <Shortcuts enterToSend={settings.enterToSend} />}
          {section === "about" && <About brand={brand} />}
        </div>
      </div>
    </Modal>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-5 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[14.5px] font-medium">{title}</div>
        {hint && <div className="mt-0.5 text-[13px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-accent" : "bg-ink/20"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function General({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <section>
      <Row title="What should Lloyd call you?" hint="Used in the greeting on the start screen.">
        <label htmlFor="settings-name" className="sr-only">Your name</label>
        <input id="settings-name" value={settings.name} onChange={(e) => update({ name: e.target.value.slice(0, 40) })} placeholder="Your name" className="w-56 rounded-lg border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-line-strong" />
      </Row>
      <Row title="Show Lloyd the bee" hint="On the start screen, while Lloyd is thinking, and perched by the message box on wallpaper themes.">
        <Toggle on={settings.showMascot} onChange={(v) => update({ showMascot: v })} label="Show the bee" />
      </Row>
      <Row title="Send with Enter" hint={settings.enterToSend ? "Enter sends; Shift+Enter starts a new line." : "Ctrl+Enter (Cmd+Enter on Mac) sends; Enter starts a new line."}>
        <Toggle on={settings.enterToSend} onChange={(v) => update({ enterToSend: v })} label="Send with Enter" />
      </Row>
    </section>
  );
}

function AppearanceSection({ appearance, change }: { appearance: Appearance; change: (a: Appearance, o?: { x: number; y: number }) => void }) {
  const origin = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  return (
    <section>
      <Row title="Mode" hint={appearance.wallpaper ? "A wallpaper sets its own light or dark look. Pick a plain theme to use this." : "Light, dark, or follow your system."}>
        <div role="radiogroup" aria-label="Mode" className="flex gap-1 rounded-lg bg-ink/5 p-0.5">
          {(
            [
              ["light", Sun, "Light"],
              ["dark", Moon, "Dark"],
              ["system", Monitor, "System"],
            ] as const
          ).map(([m, Icon, label]) => (
            <button key={m} role="radio" aria-checked={!appearance.wallpaper && appearance.mode === m} onClick={(e) => change({ mode: m, wallpaper: null }, origin(e))} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] ${!appearance.wallpaper && appearance.mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </Row>
      <div className="py-5">
        <div className="text-[14.5px] font-medium">Wallpaper</div>
        <div className="mt-0.5 text-[13px] text-muted">Scenes painted in characters, always moving. Also available by typing /theme in the message box.</div>
        <div role="radiogroup" aria-label="Wallpaper" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SCENES.map((s) => {
            const active = appearance.wallpaper === s.id;
            return (
              <button key={s.id} role="radio" aria-checked={active} onClick={(e) => change({ ...appearance, wallpaper: s.id }, origin(e))} className="group text-left">
                <span className={`block h-20 overflow-hidden rounded-xl ring-2 ${active ? "ring-accent" : "ring-transparent group-hover:ring-line-strong"}`}>
                  <Wallpaper scene={s} cell={6} fps={10} className="h-full w-full" />
                </span>
                <span className={`mt-1.5 flex items-center gap-1 text-[13px] ${active ? "font-medium" : "text-muted"}`}>
                  {s.name} {active && <Check size={13} className="text-accent" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Models({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  useEffect(() => {
    getJSON<ModelCatalog>("/api/models").then(setCatalog).catch(() => setCatalog(null));
  }, []);
  const m = settings.defaultModels;
  return (
    <section>
      <p className="mb-4 text-[13px] text-muted">Defaults for new campaigns. Any campaign can change its own from the menu in the message box.</p>
      <div className="text-[14.5px] font-medium">Quality</div>
      <div role="radiogroup" aria-label="Default quality" className="mt-3 grid gap-2 sm:grid-cols-3">
        {(catalog?.presets ?? []).map((p) => (
          <button key={p.id} role="radio" aria-checked={m.preset === p.id} onClick={() => update({ defaultModels: { ...m, preset: p.id } })} className={`rounded-xl border p-3.5 text-left ${m.preset === p.id ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong"}`}>
            <div className="flex items-center gap-1.5 text-[14px] font-medium">{p.label} {m.preset === p.id && <Check size={14} className="text-accent" />}</div>
            <div className="mt-1 text-[12.5px] leading-snug text-muted">{p.description}</div>
          </button>
        ))}
      </div>
      <div className="mt-6 text-[14.5px] font-medium">Writing model</div>
      <div role="radiogroup" aria-label="Default writing model" className="mt-3 overflow-hidden rounded-xl border border-line">
        {[{ id: "", price: null }, ...(catalog?.writers ?? [])].map((w) => {
          const active = (m.writer ?? "") === w.id;
          return (
            <button key={w.id || "default"} role="radio" aria-checked={active} onClick={() => update({ defaultModels: { preset: m.preset, ...(w.id ? { writer: w.id } : {}) } })} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0 hover:bg-ink/[0.03]">
              <span className="w-4 text-accent">{active && <Check size={15} />}</span>
              <span className={w.id ? "font-mono text-[13.5px]" : "text-[14px]"}>{w.id || "Use the preset's model"}</span>
              {w.price && <span className="tabular ml-auto text-[12.5px] text-muted">${w.price.input} in · ${w.price.output} out per 1M tokens</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Shortcuts({ enterToSend }: { enterToSend: boolean }) {
  const rows: [string, string][] = [
    ["New campaign", "Ctrl  Shift  O"],
    ["Show or hide the sidebar", "Ctrl  B"],
    ["Focus the message box", "/"],
    ["Settings", "Ctrl  ,"],
    ["Send", enterToSend ? "Enter" : "Ctrl  Enter"],
    ["New line", enterToSend ? "Shift  Enter" : "Enter"],
    ["Themes", "type /theme"],
    ["Close a panel or menu", "Esc"],
  ];
  return (
    <section>
      <p className="mb-4 text-[13px] text-muted">On a Mac, use Cmd instead of Ctrl.</p>
      <dl className="overflow-hidden rounded-xl border border-line">
        {rows.map(([what, keys]) => (
          <div key={what} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-b-0">
            <dt className="text-[14px]">{what}</dt>
            <dd className="flex gap-1">
              {keys.split("  ").map((k) => (
                <kbd key={k} className="rounded-md border border-line-strong bg-surface px-2 py-0.5 font-mono text-[12px]">{k}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function About({ brand }: { brand: BrandView }) {
  const s = brand.summary;
  return (
    <section className="flex flex-col items-start gap-5">
      <div className="flex items-center gap-4">
        <Bee size={56} mood="hover" />
        <div>
          <div className="font-serif text-[24px] font-semibold">Lloyd</div>
          <div className="text-[13.5px] text-muted">Plans and writes campaigns that follow your brand&apos;s rules.</div>
        </div>
      </div>
      <dl className="grid w-full grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
        <dt className="text-muted">Brand</dt>
        <dd>{brand.tokens?.brand_name ?? "Unknown"}</dd>
        {s && (
          <>
            <dt className="text-muted">Brand index</dt>
            <dd className="tabular">{s.docs} documents, {s.facts} facts, {s.conflicts} settled conflicts, {s.usableImages} of {s.images} images usable</dd>
          </>
        )}
        <dt className="text-muted">Runs on</dt>
        <dd>Your machine. Campaigns and memory are stored locally; model calls go to OpenAI.</dd>
      </dl>
    </section>
  );
}
