"use client";

import { AlertTriangle, Loader2, Wand2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "../ui/modal";

const EXAMPLES = [
  "Dark, cinematic, like a premium hardware launch page: huge headline, lots of space",
  "Bold editorial magazine layout with a big serif headline and a two-column story",
  "Playful and colourful, rounded cards, friendly illustrations-style shapes",
];

/**
 * Asks before free-form design: it lets the AI write the page's own HTML and CSS, so the brand's
 * look is no longer guaranteed. Step 1 is the warning; step 2 asks what the design should be.
 */
export function FreeformDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: (direction: string) => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal size="fit" title="Free-form design" subtitle={title} onClose={onCancel}>
      {!agreed ? (
        <div className="max-w-3xl space-y-6">
          <div className="flex gap-4 rounded-xl border border-warn/40 bg-warn-soft p-5">
            <AlertTriangle size={26} className="mt-0.5 shrink-0 text-warn" />
            <div className="space-y-3 text-[14.5px] leading-relaxed text-ink">
              <p className="text-[16px] font-semibold">This may hurt your brand&apos;s image.</p>
              <p>
                Free-form design lets the AI write this page&apos;s own HTML and CSS from scratch. The brand&apos;s colours, fonts, spacing and layout rules are <strong>no longer enforced</strong>, so the result can look off-brand or inconsistent with your other assets.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>The copy is still checked against brand and legal rules.</li>
                <li>The page is shown in a sandbox, so it can&apos;t run code.</li>
                <li>You can go back to the brand template at any time, and earlier versions are kept.</li>
                <li>Costs more than a normal edit (about $0.05–0.15).</li>
              </ul>
            </div>
          </div>
          <p className="text-[15px] font-medium">Are you sure you want to continue?</p>
          <div className="flex flex-wrap justify-end gap-3">
            <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2.5 text-[14px] hover:border-line-strong">
              No, keep the brand template
            </button>
            <button onClick={() => setAgreed(true)} className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-on-ink">
              Yes, continue
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <div>
            <label htmlFor="freeform-direction" className="text-[15px] font-medium">What should it look like?</label>
            <p className="mt-1 text-[13px] text-muted">Describe the feel, layout, colours, or a site it should resemble. The words on the page stay the same.</p>
            <textarea
              id="freeform-direction"
              autoFocus
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              rows={4}
              placeholder="e.g. dark and cinematic, huge headline, product image full-bleed, minimal nav"
              className="mt-3 w-full resize-y rounded-xl border border-line bg-surface p-3.5 text-[14.5px] leading-relaxed outline-none focus:border-line-strong"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setDirection(ex)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[12.5px] text-muted hover:border-line-strong hover:text-ink">
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-ink">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {busy && <span className="mr-auto text-[13px] text-muted">Designing… this takes about a minute. You can close this; progress shows in the chat.</span>}
            <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2.5 text-[14px] hover:border-line-strong">
              {busy ? "Close" : "Cancel"}
            </button>
            <button
              disabled={!direction.trim() || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onConfirm(direction.trim());
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-accent disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Generate free-form design
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
