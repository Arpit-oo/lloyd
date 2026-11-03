"use client";

import { ArrowUp, FileUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/client/api";
import type { CampaignView } from "@/lib/client/types";
import { MessageCard } from "./message-cards";

const PLACEHOLDER: Record<string, string> = {
  new: "Paste a campaign brief, or drop a .md file here…",
  clarifying: "Answer the questions, or say “use your defaults”…",
  plan_review: "Approve the plan, or ask for changes (“drop the X post”, “add a customer email”)…",
  writing: "Writing assets…",
  review: "Ask for edits: “shorten the second LinkedIn post”, “make the email subject more direct”…",
};

/** Chat column: message history, live agent status, and the composer. */
export function Chat({ view, busy, status, turnCost, onSend, onOpenAsset }: {
  view: CampaignView | null;
  busy: boolean;
  status: string | null;
  turnCost: Record<string, number>;
  onSend: (text: string) => void;
  onOpenAsset: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const messages = view?.messages ?? [];
  const state = view?.campaign.state ?? "new";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, status]);

  const send = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) setText(await file.text());
  };

  // The last interactive card is the only one whose buttons are live.
  const lastInteractive = [...messages].reverse().find((m) => m.role === "assistant" && (m.kind === "questions" || m.kind === "plan"))?.id;

  return (
    <div className="flex h-full min-h-0 flex-col" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {!messages.length && <EmptyState />}
        {messages.map((m) => {
          const runId = (m.content as { runId?: string }).runId;
          const showCost = runId && turnCost[runId] !== undefined && m.role === "assistant" && isLastOfRun(messages, m.id, runId);
          return (
            <div key={m.id}>
              <MessageCard m={m} live={!busy && m.id === lastInteractive && (state === "clarifying" || state === "plan_review")} onReply={onSend} onOpenAsset={onOpenAsset} />
              {showCost && <div className="mt-1 pl-1 text-[10px] text-muted">this turn cost {usd(turnCost[runId!])}</div>}
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 pl-1 text-xs text-muted">
            <Loader2 size={13} className="animate-spin" /> {status ?? "Thinking"}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className={`shrink-0 border-t border-line bg-white p-3 ${drag ? "ring-2 ring-accent" : ""}`}>
        <div className="flex items-end gap-2 rounded-xl bg-panel p-2 ring-1 ring-line focus-within:ring-ink">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={state === "new" ? 5 : 2}
            placeholder={PLACEHOLDER[state]}
            disabled={busy || state === "writing"}
            className="min-h-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
          />
          <button onClick={send} disabled={busy || !text.trim()} className="rounded-lg bg-ink p-2 text-white disabled:opacity-30" aria-label="Send">
            <ArrowUp size={16} />
          </button>
        </div>
        {state === "new" && (
          <div className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-muted">
            <FileUp size={12} /> Drag a brief file onto the chat to load it
          </div>
        )}
      </div>
    </div>
  );
}

function isLastOfRun(messages: CampaignView["messages"], id: string, runId: string) {
  const ofRun = messages.filter((m) => (m.content as { runId?: string }).runId === runId);
  return ofRun[ofRun.length - 1]?.id === id;
}

function EmptyState() {
  return (
    <div className="mx-auto mt-10 max-w-sm text-center text-sm text-muted">
      <div className="text-base font-semibold text-ink">Start with a brief</div>
      <p className="mt-2 leading-relaxed">
        I&apos;ll check it against the brand&apos;s rules, ask only what I need, and propose a plan of social posts, emails, blogs and landing pages. Nothing gets written until you approve the plan.
      </p>
    </div>
  );
}
