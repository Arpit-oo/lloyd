"use client";

import { ArrowDown, FileText, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getJSON, senderId, usd } from "@/lib/client/api";
import type { CampaignView } from "@/lib/client/types";
import type { ModelSettings } from "@/lib/llm/catalog";
import type { Appearance } from "@/lib/client/theme";
import { ThemePicker } from "../themes/theme-picker";
import { Bee } from "../brand/bee";
import { Composer } from "./composer";
import { MessageCard } from "./message-cards";
import { RunLog, RunSteps, type LiveRun } from "./run-steps";

/** senderId never changes while the page is open, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

const PLACEHOLDER: Record<string, string> = {
  new: "Paste a brief, attach a brief file, or describe the campaign…",
  clarifying: "Answer here, or say “use your defaults”",
  plan_review: "Approve the plan, or ask for changes",
  writing: "Writing assets… you can stop at any time",
  review: "Ask for an edit, e.g. “shorten the second LinkedIn post”",
};

interface SampleBrief {
  file: string;
  title: string;
  text: string;
  /** A repo test brief (vague, trap, reference) rather than one shipped with the brand. */
  mock?: boolean;
}

/** The conversation: a centered column, plain assistant replies, and the composer. */
export function Chat({ view, busy, run, notice, onSend, onStop, onOpenAsset, models, setModels, inputRef, themes, prefs }: {
  view: CampaignView | null;
  busy: boolean;
  /** The run being worked on (this tab's, or a coworker's in a shared chat). */
  run: LiveRun | null;
  /** A one-off problem to show above the message box, e.g. someone else's turn. */
  notice: string | null;
  onSend: (text: string, attachmentIds?: string[], assetTypes?: string[]) => void;
  onStop: () => void;
  onOpenAsset: (id: string, tab?: "changes") => void;
  models: ModelSettings;
  setModels: (m: ModelSettings) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  themes: { open: boolean; setOpen: (o: boolean) => void; appearance: Appearance; change: (a: Appearance, origin?: { x: number; y: number }) => void };
  prefs: { name: string; showMascot: boolean; enterToSend: boolean };
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const messages = view?.messages ?? [];
  // This browser's id; empty during the server render, so both renders agree.
  const meId = useSyncExternalStore(noSubscribe, senderId, () => "");
  const state = view?.campaign.state ?? "new";
  const turnCost = view?.turnCost ?? {};

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Follow new content only if the reader is already at the bottom; never yank them down.
  useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [messages.length, run?.steps.length, run?.live, atBottom, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(false);
  }, [view?.campaign.id, scrollToBottom]);

  const send = (text: string, ids: string[], types?: string[]) => {
    setAtBottom(true);
    onSend(text, ids, types);
  };

  const composer = (large: boolean) => (
    <>
      {themes.open && (
        <ThemePicker
          appearance={themes.appearance}
          onChange={themes.change}
          onClose={() => {
            themes.setOpen(false);
            inputRef.current?.focus();
          }}
        />
      )}
      <Composer
      onThemes={() => themes.setOpen(!themes.open)}
      draft={draft}
      setDraft={setDraft}
      onSend={send}
      onStop={onStop}
      busy={busy}
      disabled={state === "writing" && !busy}
      placeholder={PLACEHOLDER[state]}
      large={large}
      models={models}
      setModels={setModels}
      inputRef={inputRef}
      enterToSend={prefs.enterToSend}
      />
    </>
  );

  if (!messages.length && !busy) return <Welcome composer={composer(true)} name={prefs.name} showMascot={prefs.showMascot} magi={themes.appearance.style === "magi"} onPick={(b) => { setDraft(b.text); inputRef.current?.focus(); }} />;

  const lastInteractive = [...messages].reverse().find((m) => m.role === "assistant" && (m.kind === "questions" || m.kind === "plan"))?.id;
  const lastMessage = messages[messages.length - 1];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  // Shared chat: once anyone else has sent a message (or is here), every message shows who sent it.
  const myName = prefs.name.trim();
  const isMine = (c: { author?: string; authorId?: string }) => (c.authorId ? c.authorId === meId : !c.author || c.author === myName);
  const shared = (view?.viewers?.length ?? 0) > 1 || messages.some((m) => m.role === "user" && !isMine(m.content as { author?: string; authorId?: string }));
  const senderLabel = (m: (typeof messages)[number]) => {
    if (!shared || m.role !== "user") return undefined;
    const c = m.content as { author?: string; authorId?: string };
    return isMine(c) ? `${myName || "Guest"} (you)` : c.author?.trim() || "Guest";
  };
  const stalled = !busy && state === "new" && messages.some((m) => m.role === "assistant" && m.kind !== "text");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-[800px] space-y-6 rounded-3xl bg-scrim px-4 pb-10 pt-4 sm:px-8">
          {messages.map((m, i) => {
            const runId = (m.content as { runId?: string }).runId;
            const isLastOfRun = runId && m.role === "assistant" && messages.slice(i + 1).every((n) => (n.content as { runId?: string }).runId !== runId);
            const failed = m.kind === "text" && m.role === "assistant" && String((m.content as { text?: string }).text ?? "").startsWith("Something went wrong");
            return (
              <div key={m.id} className={i >= messages.length - 2 ? "settle" : undefined}>
                <MessageCard m={m} me={prefs.name} sender={senderLabel(m)} live={!busy && (m.kind === "confirm" ? m.id === lastMessage?.id : m.id === lastInteractive && (state === "clarifying" || state === "plan_review"))} onReply={(t) => send(t, [])} onOpenAsset={onOpenAsset} estimate={view?.estimate ?? null} />
                {(m.content as { runLog?: Parameters<typeof RunLog>[0]["log"] }).runLog && <RunLog log={(m.content as { runLog: Parameters<typeof RunLog>[0]["log"] }).runLog} />}
                <MessageFooter
                  text={m.role === "assistant" && m.kind === "text" ? String((m.content as { text?: string }).text ?? "") : null}
                  cost={isLastOfRun ? turnCost[runId!] : undefined}
                  onRetry={failed && lastUser && !busy ? () => send(String((lastUser.content as { text?: string }).text ?? ""), []) : undefined}
                />
              </div>
            );
          })}
          {stalled && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
              This run stopped before it finished, so nothing was planned yet.
              <button onClick={() => send(String((messages.find((m) => m.role === "user")?.content as { text?: string })?.text ?? ""), [])} className="ml-auto flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-on-ink">
                <RotateCcw size={14} /> Run the brief again
              </button>
            </div>
          )}
          {busy && <RunSteps run={run} bee={prefs.showMascot} fallback="Thinking" />}
        </div>
      </div>
      {!atBottom && (
        <button onClick={() => { setAtBottom(true); scrollToBottom(); }} aria-label="Jump to latest" className="shadow-float absolute bottom-36 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink">
          <ArrowDown size={17} />
        </button>
      )}
      <div className="shrink-0 bg-scrim px-3 pb-4 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          {notice && (
            <p role="alert" className="mb-2 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2 text-[13px] text-ink">{notice}</p>
          )}
          {composer(false)}
          <p className="mt-2 text-center text-[12px] text-muted">Every claim is checked against the brand&apos;s rules. Review before publishing.</p>
        </div>
      </div>
    </div>
  );
}

/** Under each agent turn: what it cost, plus copy / retry where it makes sense. */
function MessageFooter({ text, cost, onRetry }: { text: string | null; cost?: number; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!text && cost === undefined && !onRetry) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1 text-[12px] text-muted">
      {text && (
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-md px-1.5 py-0.5 hover:bg-ink/5 hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-ink/5 hover:text-ink">
          <RotateCcw size={12} /> Retry
        </button>
      )}
      {cost !== undefined && <span className="tabular px-1.5">{usd(cost)} for this reply</span>}
    </div>
  );
}

/** Time-of-day greeting, like a person would say it. */
function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name.trim() ? `${part}, ${name.trim()}` : part;
}

function Welcome({ composer, onPick, name, showMascot, magi }: { composer: React.ReactNode; onPick: (b: SampleBrief) => void; name: string; showMascot: boolean; magi: boolean }) {
  const [briefs, setBriefs] = useState<SampleBrief[]>([]);
  useEffect(() => {
    getJSON<SampleBrief[]>("/api/briefs").then(setBriefs).catch(() => setBriefs([]));
  }, []);
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-16 sm:px-6">
      {showMascot && <Bee size={64} mood="hover" className="mb-4" />}
      {magi ? (
        <h1 className="mb-8 text-balance text-center text-[30px] font-medium leading-[1.2] tracking-[-0.02em] text-ink sm:text-[36px]">
          {name.trim() ? `Hey there, ${name.trim()}.` : "Hey there."}
          <br />
          What are we launching?
        </h1>
      ) : (
        <>
          <p className="mb-1 text-center text-[15px] text-muted">{greeting(name)}</p>
          <h1 className="mb-7 text-balance text-center font-serif text-[30px] leading-tight text-ink sm:text-[36px]">What are we launching?</h1>
        </>
      )}
      <div className="w-full max-w-[700px]">
        {composer}
        {briefs.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-center text-[12px] text-muted">Or start from a sample brief (loads it into the box so you can read it first)</div>
            <div className="flex flex-wrap justify-center gap-2">
              {briefs.map((b) => (
                <button key={b.file} onClick={() => onPick(b)} title={b.mock ? "Test brief from the repo (fixtures/mock-briefs)" : undefined} className="flex max-w-[320px] items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink/85 hover:border-line-strong hover:text-ink">
                  <FileText size={14} className="shrink-0 text-muted" />
                  {b.mock && <span className="shrink-0 rounded bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-ink">Test</span>}
                  <span className="truncate">{b.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mx-auto mt-7 max-w-md text-balance text-center text-[13px] leading-relaxed text-muted">
          I check the brief against the brand&apos;s rules, ask only what I need, and propose a plan. Nothing is written until you approve it.
        </p>
      </div>
    </div>
  );
}
