"use client";

import { Loader2, Menu, PanelLeftOpen, PanelRightOpen, Share2, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON, sendJSON, stopCampaign, streamMessage, tabId, usd } from "@/lib/client/api";
import { useSettings } from "@/lib/client/settings";
import { useAppearance } from "@/lib/client/theme";
import type { BrandView, CampaignListItem, CampaignView } from "@/lib/client/types";
import { DEFAULT_SETTINGS, type ModelSettings } from "@/lib/llm/catalog";
import { AssetPanel } from "./assets/asset-panel";
import { Chat } from "./chat/chat";
import { Avatar } from "./chat/message-cards";
import type { LiveRun } from "./chat/run-steps";
import { IngestScreen } from "./ingest-screen";
import { BrandPanel } from "./panels/brand-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { MemoryPanel } from "./panels/memory-panel";
import { SettingsPanel } from "./panels/settings-panel";
import { SharePanel } from "./panels/share-panel";
import { Bee } from "./brand/bee";
import { Sidebar } from "./sidebar";
import { Wallpaper } from "./themes/wallpaper";
import { ResizeHandle, useAssetWidth } from "./ui/resize-handle";

type Panel = "brand" | "memory" | "inspector" | "settings" | "share" | null;

const STATE_LABEL: Record<string, string> = { new: "New", clarifying: "Questions", plan_review: "Plan ready", writing: "Writing", review: "Assets ready" };

function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/**
 * Chat-first shell: campaigns on the left, the conversation in the middle, assets in a side
 * panel (a full-screen sheet on small screens). Shortcuts: Ctrl+Shift+O new, Ctrl+B sidebar,
 * "/" focuses the message box.
 */
export function Workspace() {
  const [brand, setBrand] = useState<BrandView | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<CampaignView | null>(null);
  const [busy, setBusy] = useState(false);
  // This tab's own run: steps collected from the stream as they arrive.
  const [ownRun, setOwnRun] = useState<LiveRun | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [assetsOpen, setAssetsOpen] = useState(false);
  // Closed by default on phones; open on larger screens.
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || !matchMedia("(max-width: 767px)").matches);
  const [panel, setPanel] = useState<Panel>(null);
  const [settings, updateSettings] = useSettings();
  const [models, setModels] = useState<ModelSettings>(() => settings.defaultModels ?? DEFAULT_SETTINGS);
  const { appearance, change: changeAppearance, scene } = useAppearance();
  const [themesOpen, setThemesOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The asset panel can grow until the chat column is down to 420px.
  const assetWidth = useAssetWidth(380, () => (mainEl.current?.offsetWidth ?? 0) + (assetAside.current?.offsetWidth ?? 0) - 420);
  const assetAside = useRef<HTMLElement>(null);
  const mainEl = useRef<HTMLElement>(null);
  const mobile = useMedia("(max-width: 767px)");
  const wide = useMedia("(min-width: 1600px)");
  const sheet = useMedia("(max-width: 1023px)");

  const loadBrand = useCallback(() => getJSON<BrandView>("/api/brand").then(setBrand), []);
  const loadCampaigns = useCallback(() => getJSON<CampaignListItem[]>("/api/campaigns").then(setCampaigns), []);
  // Every refresh doubles as a presence heartbeat, so others in a shared chat see who is here.
  const nameRef = useRef(settings.name);
  const activeRef = useRef<string | null>(null);
  useEffect(() => {
    nameRef.current = settings.name;
  }, [settings.name]);
  const loadView = useCallback(async (id: string) => {
    const v = await getJSON<CampaignView>(`/api/campaigns/${id}?viewer=${tabId()}&name=${encodeURIComponent(nameRef.current)}`);
    // Drop a late reply for a campaign that is no longer open.
    if (activeRef.current === id) setView(v);
    return v;
  }, []);

  useEffect(() => {
    loadBrand();
    loadCampaigns().catch(() => {});
  }, [loadBrand, loadCampaigns]);

  const openCampaign = useCallback(
    async (id: string | null) => {
      setActiveId(id);
      activeRef.current = id;
      setNotice(null);
      // Keep the open campaign in the address bar so the link can be shared or reloaded.
      history.replaceState(null, "", id ? `/?c=${id}` : "/");
      setSelectedAsset(null);
      if (mobile) setSidebarOpen(false);
      if (!id) {
        setView(null);
        setAssetsOpen(false);
        setModels(settings.defaultModels ?? DEFAULT_SETTINGS);
        return;
      }
      const v = await loadView(id);
      setModels(v.models);
      setAssetsOpen(v.assets.length > 0 && !sheet);
    },
    [loadView, mobile, sheet, settings.defaultModels],
  );

  // Open the campaign in the link (?c=...), e.g. one a coworker shared.
  const linked = useRef(false);
  useEffect(() => {
    if (!brand?.ready || linked.current) return;
    const t = setTimeout(() => {
      linked.current = true;
      const id = new URLSearchParams(location.search).get("c");
      if (id) openCampaign(id).catch(() => openCampaign(null));
    }, 0);
    return () => clearTimeout(t);
  }, [brand?.ready, openCampaign]);

  // Keep the open campaign live: messages and progress from a coworker in a shared chat, or a run
  // that continued on the server after a reload. Pauses while this tab streams its own run and
  // while the tab is hidden. The campaign list refreshes less often, and whenever a run ends.
  // Each tick is a cheap pulse (a change signature, the live run, who is here); the full
  // campaign is fetched only when the signature moves.
  const wasRunning = useRef(false);
  const lastSig = useRef<string | null>(null);
  useEffect(() => {
    if (busy || !activeId) return;
    lastSig.current = null;
    let tick = 0;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const pulse = await getJSON<{ sig: string; running: boolean; run: CampaignView["run"]; viewers: CampaignView["viewers"] }>(
        `/api/campaigns/${activeId}/pulse?viewer=${tabId()}&name=${encodeURIComponent(nameRef.current)}`,
      ).catch(() => null);
      if (!pulse || activeRef.current !== activeId) return;
      if (pulse.sig !== lastSig.current) {
        lastSig.current = pulse.sig;
        await loadView(activeId).catch(() => null);
      } else {
        // Same content: only the live parts can differ.
        setView((v) => (v && v.campaign.id === activeId ? { ...v, running: pulse.running, run: pulse.run, viewers: pulse.viewers } : v));
      }
      if ((wasRunning.current && !pulse.running) || ++tick % 4 === 0) loadCampaigns();
      wasRunning.current = pulse.running;
    }, 2500);
    return () => clearInterval(timer);
  }, [busy, activeId, loadView, loadCampaigns]);

  const showAssets = useCallback(() => {
    setAssetsOpen(true);
    if (!wide && !sheet) setSidebarOpen(false);
  }, [wide, sheet]);

  const send = async (text: string, attachmentIds: string[] = []) => {
    let id = activeId;
    if (!id) {
      const c = await sendJSON<CampaignListItem>("/api/campaigns", "POST");
      id = c.id;
      setActiveId(id);
      activeRef.current = id;
      history.replaceState(null, "", `/?c=${id}`);
      await loadView(id);
    }
    // During review an asset event means an edit: show that asset. While writing, keep the first.
    const editing = view?.campaign.state === "review";
    const author = settings.name.trim();
    setBusy(true);
    setNotice(null);
    setOwnRun({ steps: [], startedAt: Date.now(), author, mine: true });
    setView((v) => (v ? { ...v, messages: [...v.messages, { id: `local-${Date.now()}`, role: "user", kind: "text", content: { text, attachments: [], ...(author ? { author } : {}) }, created_at: "" }] } : v));
    try {
      await streamMessage(id, { text, attachmentIds, models, author }, (e) => {
        if (e.type === "status") setOwnRun((r) => (r && r.steps.at(-1)?.text !== e.text ? { ...r, steps: [...r.steps, { text: e.text, at: Date.now() }] } : r));
        if (e.type === "draft") setDrafts((d) => ({ ...d, [e.assetId]: e.text }));
        if (e.type === "message" || e.type === "asset" || e.type === "state") loadView(id!);
        if (e.type === "message" && e.message.kind === "brand_check") loadCampaigns();
        if (e.type === "asset") {
          if (!sheet) showAssets();
          setSelectedAsset((s) => (editing ? e.assetId : s ?? e.assetId));
        }
        if (e.type === "error") setNotice(e.text);
      });
    } finally {
      setBusy(false);
      setOwnRun(null);
      setDrafts({});
      await Promise.all([loadView(id), loadCampaigns()]);
    }
  };

  const stop = async () => {
    if (!activeId) return;
    setOwnRun((r) => (r ? { ...r, steps: [...r.steps, { text: "Stopping", at: Date.now() }] } : r));
    await stopCampaign(activeId);
    if (!busy) loadView(activeId);
  };

  const rename = async (id: string, title: string) => {
    await sendJSON(`/api/campaigns/${id}`, "PATCH", { title });
    await loadCampaigns();
    if (id === activeId) loadView(id);
  };

  const remove = async (id: string) => {
    await sendJSON(`/api/campaigns/${id}`, "DELETE");
    if (id === activeId) openCampaign(null);
    loadCampaigns();
  };

  const [focus, setFocus] = useState<{ id: string; tab: "changes"; n: number } | null>(null);
  const openAsset = (assetId: string, tab?: "changes") => {
    setSelectedAsset(assetId);
    if (tab) setFocus((f) => ({ id: assetId, tab, n: (f?.n ?? 0) + 1 }));
    showAssets();
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openCampaign(null);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setPanel("settings");
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      } else if (e.key === "/" && !typing && !panel) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCampaign, panel]);

  if (!brand) return <div className="flex h-full items-center justify-center text-muted"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  if (!brand.ready) return <IngestScreen onDone={loadBrand} />;

  const hasAssets = (view?.assets.length ?? 0) > 0;
  const working = busy || !!view?.running;
  // A run this tab is not streaming (a coworker's, or this tab's before a reload): follow it from the server.
  const watched: LiveRun | null = !busy && view?.run ? { ...view.run, mine: typeof window !== "undefined" && view.run.tab === tabId() } : null;
  const liveDrafts = busy ? drafts : (view?.run?.drafts ?? {});
  const me = typeof window === "undefined" ? "" : tabId();
  const others = (view?.viewers ?? []).filter((v) => v.id !== me);

  const sidebar = (
    <Sidebar
      campaigns={campaigns}
      activeId={activeId}
      onOpen={openCampaign}
      onNew={() => openCampaign(null)}
      onRename={rename}
      onDelete={remove}
      onClose={() => setSidebarOpen(false)}
      brandName={brand.tokens?.brand_name ?? "brand"}
      onBrand={() => setPanel("brand")}
      onMemory={() => setPanel("memory")}
      onInspector={() => setPanel("inspector")}
      inspectorEnabled={!!view}
      themeName={scene?.name ?? { light: "Paper", dark: "Night", system: "System" }[appearance.mode]}
      onThemes={() => {
        setThemesOpen(true);
        if (mobile) setSidebarOpen(false);
      }}
      onSettings={() => setPanel("settings")}
      showMascot={settings.showMascot}
    />
  );

  return (
    <div className="relative flex h-full min-h-0">
      {scene && <Wallpaper key={scene.id} scene={scene} className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />}
      {/* sidebar: a column on desktop, a drawer on phones */}
      {mobile ? (
        sidebarOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="h-full w-[86vw] max-w-[300px] shadow-2xl">{sidebar}</div>
            <button aria-label="Close sidebar" className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
          </div>
        )
      ) : sidebarOpen ? (
        <aside className="w-64 shrink-0 border-r border-line">{sidebar}</aside>
      ) : (
        <div data-glass className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-sidebar pt-3">
          <IconButton label="Open sidebar (Ctrl+B)" onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={18} /></IconButton>
          <IconButton label="New campaign (Ctrl+Shift+O)" onClick={() => openCampaign(null)}><SquarePen size={17} /></IconButton>
        </div>
      )}

      {/* conversation */}
      <main ref={mainEl} className="relative flex min-w-0 flex-1 flex-col bg-paper md:min-w-[420px]">
        <header data-glass className="flex h-12 shrink-0 items-center gap-2 bg-scrim px-3 sm:px-5">
          {mobile && (
            <IconButton label="Open sidebar" onClick={() => setSidebarOpen(true)}><Menu size={19} /></IconButton>
          )}
          {view && view.messages.length > 0 ? (
            <>
              <h1 className="min-w-0 truncate text-[14px] font-medium">{view.campaign.title}</h1>
              <span className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-[12px] text-muted">{STATE_LABEL[view.campaign.state] ?? view.campaign.state}</span>
              <span className="tabular ml-auto hidden shrink-0 text-[12px] text-muted sm:inline" title={`${Math.round(view.cost.cacheHitRate * 100)}% of input read from cache`}>
                {usd(view.cost.totalUSD)} so far
              </span>
              {others.length > 0 && (
                <span className="flex shrink-0 -space-x-1.5" title={`Also here: ${others.map((o) => o.name).join(", ")}`} aria-label={`Also here: ${others.map((o) => o.name).join(", ")}`}>
                  {others.slice(0, 4).map((o) => (
                    <span key={o.id} className="rounded-full ring-2 ring-[var(--c-surface)]"><Avatar name={o.name} size={24} /></span>
                  ))}
                </span>
              )}
              <button onClick={() => setPanel("share")} className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-ink/5 hover:text-ink max-sm:p-2.5 sm:ml-0" aria-label="Share or export this chat">
                <Share2 size={15} /> <span className="max-sm:hidden">Share</span>
              </button>
            </>
          ) : (
            <span className="flex-1" />
          )}
          {mobile && !view?.messages.length && (
            <IconButton label="New campaign" onClick={() => openCampaign(null)}><SquarePen size={18} /></IconButton>
          )}
          {hasAssets && !assetsOpen && (
            <button onClick={showAssets} className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] hover:border-line-strong sm:ml-2">
              <PanelRightOpen size={15} /> Assets ({view!.assets.length})
            </button>
          )}
        </header>
        <Chat
          view={view}
          busy={working}
          run={busy ? ownRun : watched}
          notice={notice}
          onSend={send}
          onStop={stop}
          onOpenAsset={openAsset}
          models={models}
          setModels={setModels}
          inputRef={inputRef}
          themes={{ open: themesOpen, setOpen: setThemesOpen, appearance, change: changeAppearance }}
          prefs={settings}
        />
        {/* On wallpaper themes Lloyd perches next to the message box. */}
        {scene && settings.showMascot && view && view.messages.length > 0 && !assetsOpen && (
          <div className="pointer-events-none absolute bottom-24 left-[calc(50%+396px)] hidden xl:block" aria-hidden>
            <Bee size={40} mood={working ? "fly" : "hover"} />
          </div>
        )}
      </main>

      {/* assets: side panel on large screens, a sheet over the chat on small ones */}
      {assetsOpen && hasAssets && !sheet && (
        <ResizeHandle width={assetWidth.width} onResize={assetWidth.set} min={assetWidth.min} max={assetWidth.max} fallback={() => assetAside.current?.offsetWidth ?? 600} />
      )}
      {assetsOpen && hasAssets && (
        <aside
          ref={assetAside}
          data-glass
          className={sheet ? "fixed inset-0 z-30 flex flex-col bg-panel" : `flex flex-col border-l border-line bg-panel ${assetWidth.width ? "min-w-[380px]" : "w-[54%] min-w-[460px] max-w-[1100px] shrink-0"}`}
          style={!sheet && assetWidth.width ? { width: assetWidth.width } : undefined}
          aria-label="Assets"
        >
          <AssetPanel
            assets={view!.assets}
            drafts={liveDrafts}
            tokens={brand.tokens}
            selected={selectedAsset}
            focus={focus}
            onSelect={(id) => {
              setSelectedAsset(id);
              setFocus(null);
            }}
            onClearFocus={() => setFocus(null)}
            onChanged={async () => { if (activeId) await loadView(activeId); }}
            onClose={() => setAssetsOpen(false)}
            closeLabel={sheet ? "Back to chat" : "Close assets"}
          />
        </aside>
      )}

      {panel === "brand" && <BrandPanel brand={brand} onClose={() => setPanel(null)} onChanged={loadBrand} />}
      {panel === "memory" && <MemoryPanel onClose={() => setPanel(null)} />}
      {panel === "inspector" && view && <InspectorPanel view={view} onClose={() => setPanel(null)} />}
      {panel === "share" && view && (
        <SharePanel
          campaignId={view.campaign.id}
          title={view.campaign.title}
          name={settings.name}
          setName={(n) => updateSettings({ name: n })}
          viewers={view.viewers}
          myTab={me}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "settings" && (
        <SettingsPanel settings={settings} update={updateSettings} appearance={appearance} changeAppearance={changeAppearance} brand={brand} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="rounded-lg p-1.5 max-sm:p-2.5 text-muted hover:bg-ink/5 hover:text-ink">
      {children}
    </button>
  );
}
