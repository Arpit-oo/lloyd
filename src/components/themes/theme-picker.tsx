"use client";

import { Check, Moon, Sparkles, Sun } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Appearance } from "@/lib/client/theme";
import { SCENES } from "@/lib/client/wallpapers";
import { Wallpaper } from "./wallpaper";

/**
 * The /theme strip above the composer: plain themes and live animated wallpapers.
 * Keyboard: ←/→ move, Enter applies, Esc closes. Clicking applies with a reveal from the click.
 */
const PLAIN: { id: string; mode: Appearance["mode"]; style: Appearance["style"]; name: string; icon: typeof Sun; swatch: string; iconColor: string }[] = [
  { id: "magi", mode: "light", style: "magi", name: "Magi", icon: Sparkles, swatch: "linear-gradient(135deg,#ffffff 55%,#fceaf9)", iconColor: "#d936c4" },
  { id: "magi-dark", mode: "dark", style: "magi", name: "Magi Dark", icon: Sparkles, swatch: "linear-gradient(135deg,#1b1b20 55%,#3a1435)", iconColor: "#f06be0" },
  { id: "paper", mode: "light", style: "classic", name: "Paper", icon: Sun, swatch: "linear-gradient(135deg,#faf9f6,#ebe6dc)", iconColor: "#615d55" },
  { id: "night", mode: "dark", style: "classic", name: "Night", icon: Moon, swatch: "linear-gradient(135deg,#30302e,#1f1e1c)", iconColor: "#d8d4cc" },
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
          const active = !appearance.wallpaper && appearance.mode === p.mode && appearance.style === p.style;
          return (
            <Tile key={p.id} name={p.name} active={active} onPick={(e) => onChange({ mode: p.mode, style: p.style, wallpaper: null }, origin(e))}>
              <div className="flex h-full w-full items-center justify-center" style={{ background: p.swatch }}>
                <p.icon size={18} style={{ color: p.iconColor }} />
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
