"use client";

import { Check, Copy, Download, FileJson, FileText, ShieldAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { getJSON } from "@/lib/client/api";
import { Avatar } from "../chat/message-cards";
import { Modal } from "../ui/modal";

/**
 * Share a campaign with a coworker on the same network, and export it.
 * Lloyd runs on one computer; a shared chat is this computer's address plus the campaign id.
 * Everyone sees messages, progress and assets live, and takes turns sending.
 */
export function SharePanel({ campaignId, title, name, setName, viewers, myTab, onClose }: {
  campaignId: string;
  title: string;
  name: string;
  setName: (n: string) => void;
  viewers: { id: string; name: string }[];
  myTab: string;
  onClose: () => void;
}) {
  const [addrs, setAddrs] = useState<{ local: string; lan: string[] } | null>(null);
  useEffect(() => {
    getJSON<{ local: string; lan: string[] }>("/api/share").then(setAddrs).catch(() => setAddrs(null));
  }, []);

  const here = typeof window !== "undefined" && !/^(localhost|127\.)/.test(location.hostname) ? [location.origin] : [];
  const links = [...new Set([...here, ...(addrs?.lan ?? [])])].map((o) => `${o}/app?c=${campaignId}`);
  const exportUrl = (format: "md" | "json") => `/api/campaigns/${campaignId}/export?format=${format}`;

  return (
    <Modal size="fit" title="Share and export" subtitle={title} onClose={onClose}>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-6">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Users size={17} /> Work on this chat together</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              Anyone on the same network can open the link below. You both see every message, the live progress and the assets as they are written. You take turns: while Lloyd works on one person&apos;s message, the other waits for it to finish.
            </p>
          </div>

          <div>
            <label htmlFor="share-name" className="text-[13.5px] font-medium">Your name in shared chats</label>
            <input
              id="share-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="So others know who sent what"
              className="mt-2 w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-line-strong"
            />
          </div>

          <div>
            <div className="text-[13.5px] font-medium">Link for coworkers</div>
            {links.length ? (
              <ul className="mt-2 space-y-2">
                {links.map((l) => <CopyRow key={l} text={l} />)}
              </ul>
            ) : (
              <p className="mt-2 text-[13.5px] text-muted">{addrs ? "No network connection found. Connect to Wi-Fi or a LAN to share." : "Finding this computer's address…"}</p>
            )}
          </div>

          {viewers.length > 0 && (
            <div>
              <div className="text-[13.5px] font-medium">Here now</div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {viewers.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-[13px]">
                    <Avatar name={v.name} size={22} /> {v.id === myTab ? `${v.name} (you)` : v.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="flex gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-3 text-[13px] leading-relaxed text-ink">
            <ShieldAlert size={17} className="mt-0.5 shrink-0 text-warn" />
            There are no accounts: anyone who can reach this computer on the network can open every campaign and spend this computer&apos;s OpenAI credit. Share only on a network you trust, and stop the app to end sharing.
          </p>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Download size={17} /> Export</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">The conversation, the brand check, the plan and the latest version of every asset.</p>
          </div>
          <a href={exportUrl("md")} download className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-line-strong">
            <FileText size={20} className="text-muted" />
            <span>
              <span className="block text-[14px] font-medium">Markdown document</span>
              <span className="block text-[12.5px] text-muted">Readable anywhere; pastes into Docs, Notion or email.</span>
            </span>
          </a>
          <a href={exportUrl("json")} download className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-line-strong">
            <FileJson size={20} className="text-muted" />
            <span>
              <span className="block text-[14px] font-medium">JSON data</span>
              <span className="block text-[12.5px] text-muted">Everything, including asset versions and checks, for archiving or tools.</span>
            </span>
          </a>
          <CopyMarkdown url={exportUrl("md")} />
        </section>
      </div>
    </Modal>
  );
}

function CopyRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pl-3 pr-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{text}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-ink px-2.5 py-1.5 text-[12.5px] font-medium text-on-ink"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
      </button>
    </li>
  );
}

function CopyMarkdown({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  return (
    <button
      onClick={async () => {
        try {
          const res = await fetch(url, { cache: "no-store" });
          await navigator.clipboard.writeText(await res.text());
          setState("done");
        } catch {
          setState("error");
        }
        setTimeout(() => setState("idle"), 1800);
      }}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[13.5px] hover:border-line-strong"
    >
      {state === "done" ? <Check size={15} /> : <Copy size={15} />}
      {state === "done" ? "Copied to clipboard" : state === "error" ? "Couldn't copy" : "Copy as Markdown"}
    </button>
  );
}
