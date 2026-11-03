"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const KEY = "lloyd-asset-width";

/**
 * Width of the asset panel, adjustable by dragging the handle on its left edge (or with the
 * arrow keys when the handle is focused; Home/End for min/max; double-click resets).
 * Saved in this browser. Clamped so the chat column always keeps a usable width.
 */
// Read through useSyncExternalStore so the server render (no saved width) and the first
// client render agree, and the saved width applies right after hydration.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const readSaved = () => {
  const n = Number(localStorage.getItem(KEY));
  return n > 0 ? n : null;
};

export function useAssetWidth(min: number, room: () => number) {
  const width = useSyncExternalStore(subscribe, readSaved, () => null);
  const max = useCallback(() => Math.max(min, room()), [min, room]);
  const set = useCallback(
    (w: number | null) => {
      if (w === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(Math.round(Math.min(max(), Math.max(min, w)))));
      listeners.forEach((fn) => fn());
    },
    [max, min],
  );
  return { width, set, min, max };
}

export function ResizeHandle({ width, onResize, min, max, fallback }: {
  width: number | null;
  onResize: (w: number | null) => void;
  min: number;
  max: () => number;
  /** Current rendered width, used when no width has been chosen yet. */
  fallback: () => number;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (start.current) onResize(start.current.w + (start.current.x - e.clientX));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, onResize]);

  const current = typeof window === "undefined" ? (width ?? 0) : fallback();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the asset panel"
      aria-valuemin={min}
      aria-valuemax={typeof window === "undefined" ? undefined : max()}
      aria-valuenow={Math.round(current)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(e) => {
        e.preventDefault();
        // Start from the rendered width: a saved width can be wider than the space allows.
        start.current = { x: e.clientX, w: fallback() };
        setDragging(true);
      }}
      onDoubleClick={() => onResize(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 96 : 32;
        if (e.key === "ArrowLeft") onResize(current + step);
        else if (e.key === "ArrowRight") onResize(current - step);
        else if (e.key === "Home") onResize(max());
        else if (e.key === "End") onResize(min);
        else return;
        e.preventDefault();
      }}
      className="group relative z-10 -mr-1.5 w-3 shrink-0 cursor-col-resize outline-none"
    >
      <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${dragging ? "bg-accent" : "bg-line group-hover:bg-line-strong group-focus-visible:bg-accent"}`} />
      <span className={`absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${dragging ? "bg-accent" : "bg-line-strong/70 group-hover:bg-ink/40 group-focus-visible:bg-accent"}`} />
    </div>
  );
}
