"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Appearance } from "@/lib/client/theme";
import { SCENES } from "@/lib/client/wallpapers";
import { Wallpaper } from "./wallpaper";

/**
 * The /theme strip above the composer: plain themes and live animated wallpapers.
 * Keyboard: ←/→ move, Enter applies, Esc closes. Clicking applies with a reveal from the click.
 */
const PLAIN: { id: Appearance["mode"]; name: string; icon: typeof Sun; swatch: string }[] = [
  { id: "light", name: "Paper", icon: Sun, swatch: "linear-gradient(135deg,#faf9f6,#ebe6dc)" },
  { id: "dark", name: "Night", icon: Moon, swatch: "linear-gradient(135deg,#30302e,#1f1e1c)" },
  { id: "system", name: "System", icon: Monitor, swatch: "linear-gradient(135deg,#faf9f6 50%,#262624 50%)" },
];

export function ThemePicker({ appearance, onChange, onClose }: {
  appearance: Appearance;
  onChange: (next: Appearance, origin?: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const tiles = [...(strip.current?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? [])];
    const i = tiles.indexOf(document.activeElement as HTMLButtonElement);
    tiles[(i + (e.key === "ArrowRight" ? 1 : -1) + tiles.length) % tiles.length]?.focus();
  };

  const origin = (e: React.MouseEvent | React.KeyboardEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  return (
    <div data-glass className="shadow-float mb-2 rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2.5 flex items-center gap-2 px-1 text-[12px]">
        <span className="rounded-md bg-ink/[0.07] px-1.5 py-0.5 font-mono text-ink">/theme</span>
        <span className="text-muted">Wallpapers, painted in characters and always moving</span>
        <span className="ml-auto hidden text-muted sm:inline">← → move · Enter apply · Esc close</span>
      </div>
      <div ref={strip} role="radiogroup" aria-label="Theme" onKeyDown={move} className="flex gap-2.5 overflow-x-auto pb-1">
        {PLAIN.map((p) => {
          const active = !appearance.wallpaper && appearance.mode === p.id;
          return (
            <Tile key={p.id} name={p.name} active={active} onPick={(e) => onChange({ mode: p.id, wallpaper: null }, origin(e))}>
              <div className="flex h-full w-full items-center justify-center" style={{ background: p.swatch }}>
                <p.icon size={18} className={p.id === "light" ? "text-[#615d55]" : "text-[#d8d4cc]"} />
              </div>
            </Tile>
          );
        })}
        <div className="mx-0.5 w-px shrink-0 self-stretch bg-line" aria-hidden />
        {SCENES.map((s) => (
          <Tile key={s.id} name={s.name} active={appearance.wallpaper === s.id} onPick={(e) => onChange({ ...appearance, wallpaper: s.id }, origin(e))}>
            <Wallpaper scene={s} cell={5.5} fps={12} className="h-full w-full" />
          </Tile>
        ))}
      </div>
    </div>
  );
}

function Tile({ name, active, onPick, children }: { name: string; active: boolean; onPick: (e: React.MouseEvent | React.KeyboardEvent) => void; children: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={onPick}
      className="group flex w-[104px] shrink-0 flex-col items-center gap-1.5 rounded-xl p-1 text-[12px] focus-visible:outline-offset-0"
    >
      <span className={`block h-[60px] w-full overflow-hidden rounded-lg ring-2 transition ${active ? "ring-accent" : "ring-transparent group-hover:ring-line-strong"}`}>{children}</span>
      <span className={`flex items-center gap-1 ${active ? "font-medium text-ink" : "text-muted group-hover:text-ink"}`}>
        {name}
        {active && <Check size={12} className="text-accent" />}
      </span>
    </button>
  );
}
