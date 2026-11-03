"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

/** Large modal for review panels (inspector, brand truths, memory, costs). Closes on Esc or backdrop. */
export function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-2xl bg-[#f5f5f4] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-panel hover:text-ink" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
